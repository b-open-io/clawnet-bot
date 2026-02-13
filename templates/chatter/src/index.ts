import { readFileSync } from "node:fs";
import { PrivateKey, Utils } from "@bsv/sdk";
import { generateText } from "ai";
import { Hono } from "hono";

const app = new Hono();

type IdentityInfo = {
	privateKey: PrivateKey;
	publicKey: string;
	bapId: string;
};

let identity: IdentityInfo | null = null;

function loadIdentity(): IdentityInfo | null {
	const wif = process.env.SIGMA_MEMBER_PRIVATE_KEY;
	if (!wif) return null;
	try {
		const privateKey = PrivateKey.fromWif(wif);
		const encoded = privateKey.toPublicKey().encode(true);
		const publicKey = Array.isArray(encoded) ? Utils.toHex(encoded) : encoded;
		return { privateKey, publicKey, bapId: publicKey };
	} catch {
		console.error("[chatter] Failed to load identity from SIGMA_MEMBER_PRIVATE_KEY");
		return null;
	}
}

type ChatterMode = "sender" | "responder" | "duplex";

type PeerTarget = {
	name?: string;
	baseUrl: string;
	endpoint?: string;
};

type ChatterConfig = {
	mode: ChatterMode;
	botName: string;
	persona: string;
	peerBaseUrl?: string;
	peerEndpoint: string;
	peers: PeerTarget[];
	sharedToken?: string;
	messageTemplate: string;
	outboundTimeoutMs: number;
	model: string;
	enableAi: boolean;
	outboundPrompt: string;
	replyPrompt: string;
};

type AgentRequest = {
	message: string;
	conversationId?: string;
	metadata?: Record<string, unknown>;
	token?: string;
};

type TickRequest = {
	message?: string;
	token?: string;
	target?: string;
};

type ResolvedTarget = {
	name: string;
	baseUrl: string;
	endpoint: string;
};

type P2PMessageRequest = {
	from: { bapId: string; botName: string };
	message: string;
	conversationId?: string;
	signature: string;
	publicKey: string;
	timestamp: number;
};

type PendingMessage = {
	fromBapId: string;
	toBapId: string;
	fromBotName: string;
	toBotName: string;
	content: string;
	type: string;
	conversationId?: string;
	_creationTime: number;
};

type AiStatus = {
	enabled: boolean;
	reason?: string;
};

type RelayResult = {
	attempted: boolean;
	ok?: boolean;
	status?: number;
	skippedReason?: string;
	error?: string;
	peer?: string;
	peerUrl?: string;
	responsePreview?: string;
	generatedByAi?: boolean;
	model?: string;
};

const CONFIG_PATH = new URL("../chatter.config.json", import.meta.url);

const DEFAULT_CONFIG: ChatterConfig = {
	mode: "responder",
	botName: "chatter-bot",
	persona: "You are concise, playful, and specific.",
	peerBaseUrl: undefined,
	peerEndpoint: "/api/messages",
	peers: [],
	sharedToken: undefined,
	messageTemplate: "ping from {{name}} to {{peer}} at {{timestamp}}",
	outboundTimeoutMs: 10_000,
	model: "anthropic/claude-haiku-4.5",
	enableAi: true,
	outboundPrompt: "Write one short, interesting opener for another bot.",
	replyPrompt: "Reply in one short sentence and optionally ask one follow-up question.",
};

let peerCursor = 0;
let lastPollTimestamp = Date.now() - 5 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseMode(value: unknown): ChatterMode | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === "sender" || normalized === "responder" || normalized === "duplex") {
		return normalized;
	}

	return undefined;
}

function parseTimeoutMs(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		const rounded = Math.round(value);
		if (rounded >= 1_000 && rounded <= 60_000) {
			return rounded;
		}
		return undefined;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const parsed = Number.parseInt(value.trim(), 10);
	if (Number.isNaN(parsed) || parsed < 1_000 || parsed > 60_000) {
		return undefined;
	}

	return parsed;
}

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes") {
		return true;
	}

	if (normalized === "false" || normalized === "0" || normalized === "no") {
		return false;
	}

	return undefined;
}

function normalizeEndpoint(endpoint: string): string {
	const trimmed = endpoint.trim();
	if (!trimmed) {
		return "/api/agent";
	}

	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parsePeers(value: unknown): PeerTarget[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const peers: PeerTarget[] = [];
	for (const raw of value) {
		if (!isObject(raw)) {
			continue;
		}

		const baseUrl = normalizeBaseUrl(asOptionalString(raw.baseUrl));
		if (!baseUrl) {
			continue;
		}

		const name = asOptionalString(raw.name);
		const endpoint = asOptionalString(raw.endpoint);
		peers.push({
			baseUrl,
			...(name ? { name } : {}),
			...(endpoint ? { endpoint: normalizeEndpoint(endpoint) } : {}),
		});
	}

	return peers;
}

function parseChatterConfig(value: unknown): Partial<ChatterConfig> {
	if (!isObject(value)) {
		return {};
	}

	const mode = parseMode(value.mode);
	const botName = asOptionalString(value.botName);
	const persona = asOptionalString(value.persona);
	const peerBaseUrl = normalizeBaseUrl(asOptionalString(value.peerBaseUrl));
	const peerEndpoint = asOptionalString(value.peerEndpoint);
	const peers = parsePeers(value.peers);
	const sharedToken = asOptionalString(value.sharedToken);
	const messageTemplate = asOptionalString(value.messageTemplate);
	const outboundTimeoutMs = parseTimeoutMs(value.outboundTimeoutMs);
	const model = asOptionalString(value.model);
	const enableAi = parseBoolean(value.enableAi);
	const outboundPrompt = asOptionalString(value.outboundPrompt);
	const replyPrompt = asOptionalString(value.replyPrompt);

	return {
		...(mode ? { mode } : {}),
		...(botName ? { botName } : {}),
		...(persona ? { persona } : {}),
		...(peerBaseUrl ? { peerBaseUrl } : {}),
		...(peerEndpoint ? { peerEndpoint: normalizeEndpoint(peerEndpoint) } : {}),
		...(peers.length > 0 ? { peers } : {}),
		...(sharedToken ? { sharedToken } : {}),
		...(messageTemplate ? { messageTemplate } : {}),
		...(outboundTimeoutMs ? { outboundTimeoutMs } : {}),
		...(model ? { model } : {}),
		...(enableAi !== undefined ? { enableAi } : {}),
		...(outboundPrompt ? { outboundPrompt } : {}),
		...(replyPrompt ? { replyPrompt } : {}),
	};
}

function signMessage(content: string, timestamp: number): { signature: string; publicKey: string } | null {
	if (!identity) return null;
	try {
		const payload = `${content}${timestamp}`;
		const bytes = Utils.toArray(payload, "utf8");
		const sig = identity.privateKey.sign(bytes);
		return { signature: sig.toDER("hex") as string, publicKey: identity.publicKey };
	} catch {
		return null;
	}
}

function hasValidSignature(req: P2PMessageRequest): boolean {
	return (
		typeof req.signature === "string" &&
		req.signature.length > 0 &&
		typeof req.publicKey === "string" &&
		req.publicKey.length > 0 &&
		typeof req.timestamp === "number" &&
		req.timestamp > 0
	);
}

function relayToConvex(
	fromBapId: string,
	toBapId: string,
	fromBotName: string,
	toBotName: string,
	content: string,
	conversationId?: string,
	relayed?: boolean,
): void {
	const apiUrl = process.env.CLAWNET_API_URL;
	const authToken = process.env.CLAWNET_AUTH_TOKEN;
	if (!apiUrl || !authToken) return;

	fetch(`${apiUrl}/api/v1/bot/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify({
			fromBapId,
			toBapId,
			fromBotName,
			toBotName,
			content,
			type: "text",
			conversationId,
			relayed,
		}),
	}).catch(() => {});
}

async function resolvePeerByBapId(bapId: string): Promise<{ url: string; botName: string } | null> {
	const apiUrl = process.env.CLAWNET_API_URL;
	if (!apiUrl) return null;
	try {
		const peersUrl = `${apiUrl}/api/v1/peers?exclude=${identity?.bapId ?? ""}`;
		const response = await fetch(peersUrl);
		if (!response.ok) return null;
		const peers = (await response.json()) as Array<{ bapId: string; botName: string; url: string }>;
		const match = peers.find((p) => p.bapId === bapId);
		if (!match?.url) return null;
		return { url: match.url, botName: match.botName };
	} catch {
		return null;
	}
}

async function pollPendingMessages(): Promise<number> {
	if (!identity) return 0;
	const apiUrl = process.env.CLAWNET_API_URL;
	if (!apiUrl) return 0;

	try {
		const url = `${apiUrl}/api/v1/bot/messages/pending?bapId=${identity.bapId}&since=${lastPollTimestamp}`;
		const response = await fetch(url);
		if (!response.ok) return 0;

		const messages = (await response.json()) as PendingMessage[];
		if (!Array.isArray(messages) || messages.length === 0) return 0;

		lastPollTimestamp = Date.now();

		for (const msg of messages) {
			const agentReq: AgentRequest = {
				message: msg.content,
				conversationId: msg.conversationId,
			};
			const generated = await generateReplyMessage(agentReq);

			relayToConvex(
				identity.bapId,
				msg.fromBapId,
				config.botName,
				msg.fromBotName,
				generated.reply,
				msg.conversationId,
			);
		}

		return messages.length;
	} catch {
		return 0;
	}
}

function loadFileConfig(): Partial<ChatterConfig> {
	try {
		const raw = readFileSync(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		return parseChatterConfig(parsed);
	} catch {
		return {};
	}
}

function loadConfig(): ChatterConfig {
	const fileConfig = loadFileConfig();

	const mode = parseMode(process.env.CHATTER_MODE) ?? fileConfig.mode ?? DEFAULT_CONFIG.mode;
	const botName =
		asOptionalString(process.env.CHATTER_NAME) ?? fileConfig.botName ?? DEFAULT_CONFIG.botName;
	const persona =
		asOptionalString(process.env.CHATTER_PERSONA) ?? fileConfig.persona ?? DEFAULT_CONFIG.persona;
	const peerBaseUrl =
		normalizeBaseUrl(asOptionalString(process.env.PEER_BOT_URL)) ??
		normalizeBaseUrl(fileConfig.peerBaseUrl) ??
		DEFAULT_CONFIG.peerBaseUrl;
	const peerEndpoint = normalizeEndpoint(
		asOptionalString(process.env.PEER_ENDPOINT) ??
			fileConfig.peerEndpoint ??
			DEFAULT_CONFIG.peerEndpoint,
	);
	const peers = fileConfig.peers ?? DEFAULT_CONFIG.peers;
	const sharedToken = asOptionalString(process.env.CHATTER_SHARED_TOKEN) ?? fileConfig.sharedToken;
	const messageTemplate =
		asOptionalString(process.env.CHATTER_MESSAGE_TEMPLATE) ??
		fileConfig.messageTemplate ??
		DEFAULT_CONFIG.messageTemplate;
	const outboundTimeoutMs =
		parseTimeoutMs(process.env.CHATTER_TIMEOUT_MS) ??
		fileConfig.outboundTimeoutMs ??
		DEFAULT_CONFIG.outboundTimeoutMs;
	const model =
		asOptionalString(process.env.CHATTER_MODEL) ?? fileConfig.model ?? DEFAULT_CONFIG.model;
	const enableAi =
		parseBoolean(process.env.CHATTER_ENABLE_AI) ?? fileConfig.enableAi ?? DEFAULT_CONFIG.enableAi;
	const outboundPrompt =
		asOptionalString(process.env.CHATTER_OUTBOUND_PROMPT) ??
		fileConfig.outboundPrompt ??
		DEFAULT_CONFIG.outboundPrompt;
	const replyPrompt =
		asOptionalString(process.env.CHATTER_REPLY_PROMPT) ??
		fileConfig.replyPrompt ??
		DEFAULT_CONFIG.replyPrompt;

	return {
		mode,
		botName,
		persona,
		peerBaseUrl,
		peerEndpoint,
		peers,
		sharedToken,
		messageTemplate,
		outboundTimeoutMs,
		model,
		enableAi,
		outboundPrompt,
		replyPrompt,
	};
}

function resolveTargets(configValue: ChatterConfig): ResolvedTarget[] {
	const targets: ResolvedTarget[] = [];

	for (const [index, peer] of configValue.peers.entries()) {
		const baseUrl = normalizeBaseUrl(peer.baseUrl);
		if (!baseUrl) {
			continue;
		}

		targets.push({
			name: peer.name ?? `peer-${index + 1}`,
			baseUrl,
			endpoint: normalizeEndpoint(peer.endpoint ?? configValue.peerEndpoint),
		});
	}

	if (targets.length === 0 && configValue.peerBaseUrl) {
		const baseUrl = normalizeBaseUrl(configValue.peerBaseUrl);
		if (baseUrl) {
			targets.push({
				name: "peer-1",
				baseUrl,
				endpoint: normalizeEndpoint(configValue.peerEndpoint),
			});
		}
	}

	return targets;
}

const config = loadConfig();
const resolvedTargets = resolveTargets(config);

identity = loadIdentity();
if (identity) {
	console.log(`[chatter] Identity loaded: ${identity.publicKey.slice(0, 16)}...`);
} else {
	console.log("[chatter] No identity configured (SIGMA_MEMBER_PRIVATE_KEY not set)");
}

function parseAgentRequest(value: unknown): AgentRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { message, conversationId, metadata, token } = value;
	if (typeof message !== "string") {
		return null;
	}

	const trimmedMessage = message.trim();
	if (!trimmedMessage || trimmedMessage.length > 2000) {
		return null;
	}

	if (conversationId !== undefined && typeof conversationId !== "string") {
		return null;
	}

	if (metadata !== undefined && !isObject(metadata)) {
		return null;
	}

	if (token !== undefined && typeof token !== "string") {
		return null;
	}

	return {
		message: trimmedMessage,
		conversationId,
		metadata,
		token,
	};
}

function parseTickRequest(value: unknown): TickRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { message, token, target } = value;
	if (message !== undefined && typeof message !== "string") {
		return null;
	}

	if (token !== undefined && typeof token !== "string") {
		return null;
	}

	if (target !== undefined && typeof target !== "string") {
		return null;
	}

	const trimmedMessage =
		typeof message === "string" && message.trim().length > 0 ? message.trim() : undefined;
	if (trimmedMessage && trimmedMessage.length > 2000) {
		return null;
	}

	const trimmedTarget =
		typeof target === "string" && target.trim().length > 0 ? target.trim() : undefined;
	if (trimmedTarget && trimmedTarget.length > 100) {
		return null;
	}

	return {
		message: trimmedMessage,
		token,
		target: trimmedTarget,
	};
}

function isAuthorized(token: string | undefined): boolean {
	if (!config.sharedToken) {
		return true;
	}

	return token === config.sharedToken;
}

function getAiStatus(): AiStatus {
	if (!config.enableAi) {
		return {
			enabled: false,
			reason: "CHATTER_ENABLE_AI is false.",
		};
	}

	if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
		return {
			enabled: false,
			reason: "AI_GATEWAY_API_KEY is not configured.",
		};
	}

	return { enabled: true };
}

function sanitizeModelText(value: string): string {
	const compact = value.replaceAll(/\s+/g, " ").trim();
	if (!compact) {
		return "";
	}

	return compact.length > 320 ? `${compact.slice(0, 317)}...` : compact;
}

function interpolateMessage(
	template: string,
	options: {
		peerName: string;
		trigger: "heartbeat" | "manual";
	},
): string {
	const timestamp = new Date().toISOString();
	return template
		.replaceAll("{{name}}", config.botName)
		.replaceAll("{{peer}}", options.peerName)
		.replaceAll("{{trigger}}", options.trigger)
		.replaceAll("{{timestamp}}", timestamp);
}

function fallbackReply(message: string): string {
	const excerpt = message.length > 160 ? `${message.slice(0, 157)}...` : message;
	return `[${config.botName}] heard: "${excerpt}"`;
}

function withAuthToken(payload: Record<string, unknown>): Record<string, unknown> {
	if (!config.sharedToken) {
		return payload;
	}

	return {
		...payload,
		token: config.sharedToken,
	};
}

function selectTarget(requestedTarget?: string): ResolvedTarget | null {
	if (resolvedTargets.length === 0) {
		return null;
	}

	if (requestedTarget) {
		const normalized = requestedTarget.toLowerCase();
		const match = resolvedTargets.find((target) => target.name.toLowerCase() === normalized);
		if (match) {
			return match;
		}
	}

	const target = resolvedTargets[peerCursor % resolvedTargets.length];
	peerCursor += 1;
	return target;
}

function sanitizePreview(value: string): string {
	const compact = value.replaceAll(/\s+/g, " ").trim();
	if (!compact) {
		return "(empty response body)";
	}
	return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

async function generateOutboundMessage(
	target: ResolvedTarget,
	trigger: "heartbeat" | "manual",
	manualMessage?: string,
): Promise<{ message: string; generatedByAi: boolean }> {
	if (manualMessage) {
		return {
			message: manualMessage,
			generatedByAi: false,
		};
	}

	const aiStatus = getAiStatus();
	if (!aiStatus.enabled) {
		return {
			message: interpolateMessage(config.messageTemplate, {
				peerName: target.name,
				trigger,
			}),
			generatedByAi: false,
		};
	}

	try {
		const { text } = await generateText({
			model: config.model,
			system: `${config.persona} ${config.outboundPrompt} Keep it under 220 characters.`,
			prompt: `Write a short message from ${config.botName} to ${target.name}. Trigger: ${trigger}.`,
			maxOutputTokens: 120,
			timeout: config.outboundTimeoutMs,
		});

		const cleaned = sanitizeModelText(text);
		if (!cleaned) {
			return {
				message: interpolateMessage(config.messageTemplate, {
					peerName: target.name,
					trigger,
				}),
				generatedByAi: false,
			};
		}

		return {
			message: cleaned,
			generatedByAi: true,
		};
	} catch {
		return {
			message: interpolateMessage(config.messageTemplate, {
				peerName: target.name,
				trigger,
			}),
			generatedByAi: false,
		};
	}
}

async function generateReplyMessage(request: AgentRequest): Promise<{
	reply: string;
	generatedByAi: boolean;
}> {
	const aiStatus = getAiStatus();
	if (!aiStatus.enabled) {
		return {
			reply: fallbackReply(request.message),
			generatedByAi: false,
		};
	}

	try {
		const metadataSummary = request.metadata
			? JSON.stringify(request.metadata).slice(0, 400)
			: "{}";
		const { text } = await generateText({
			model: config.model,
			system: `${config.persona} ${config.replyPrompt}`,
			prompt: `Message to ${config.botName}: "${request.message}"\nMetadata: ${metadataSummary}`,
			maxOutputTokens: 180,
			timeout: config.outboundTimeoutMs,
		});

		const cleaned = sanitizeModelText(text);
		if (!cleaned) {
			return {
				reply: fallbackReply(request.message),
				generatedByAi: false,
			};
		}

		return {
			reply: cleaned,
			generatedByAi: true,
		};
	} catch {
		return {
			reply: fallbackReply(request.message),
			generatedByAi: false,
		};
	}
}

async function relayToPeer(
	trigger: "heartbeat" | "manual",
	options?: {
		messageOverride?: string;
		conversationId?: string;
		targetName?: string;
		targetBapId?: string;
	},
): Promise<RelayResult> {
	if (config.mode === "responder") {
		return { attempted: false, skippedReason: "mode is responder" };
	}

	let target = selectTarget(options?.targetName);
	if (!target && options?.targetBapId) {
		const resolved = await resolvePeerByBapId(options.targetBapId);
		if (resolved) {
			target = { name: resolved.botName, baseUrl: resolved.url, endpoint: "/api/messages" };
		}
	}
	if (!target) {
		if (options?.targetBapId) {
			const outbound = await generateOutboundMessage(
				{ name: options.targetBapId, baseUrl: "", endpoint: "" },
				trigger,
				options?.messageOverride,
			);
			const myBapId = identity?.bapId ?? "unknown";
			const conversationId = options?.conversationId ?? `${config.botName}-${Date.now()}`;
			const apiUrl = process.env.CLAWNET_API_URL;
			const authToken = process.env.CLAWNET_AUTH_TOKEN;
			if (apiUrl && authToken) {
				fetch(`${apiUrl}/api/v1/relay`, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
					body: JSON.stringify({
						fromBapId: myBapId,
						toBapId: options.targetBapId,
						fromBotName: config.botName,
						toBotName: options.targetBapId,
						content: outbound.message,
						type: "text",
						conversationId,
					}),
				}).catch(() => {});
			}
			return {
				attempted: true,
				ok: true,
				peer: options.targetBapId,
				generatedByAi: outbound.generatedByAi,
				model: outbound.generatedByAi ? config.model : undefined,
			};
		}
		return { attempted: false, skippedReason: "No peer target configured." };
	}

	let peerUrl = "";
	try {
		peerUrl = new URL("/api/messages", target.baseUrl).toString();
	} catch {
		return { attempted: false, skippedReason: `Invalid peer URL for target '${target.name}'.` };
	}

	const outbound = await generateOutboundMessage(target, trigger, options?.messageOverride);
	const conversationId = options?.conversationId ?? `${config.botName}-${Date.now()}`;
	const ts = Math.floor(Date.now() / 1000);
	const signed = signMessage(outbound.message, ts);
	const myBapId = identity?.bapId ?? "unknown";

	const payload = {
		from: { bapId: myBapId, botName: config.botName },
		message: outbound.message,
		conversationId,
		signature: signed?.signature ?? "",
		publicKey: signed?.publicKey ?? "",
		timestamp: ts,
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), config.outboundTimeoutMs);

	try {
		const response = await fetch(peerUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
		const responseBody = await response.text();

		// Fire-and-forget: record outbound message in Convex
		const targetBapId = options?.targetBapId ?? target.name;
		relayToConvex(myBapId, targetBapId, config.botName, target.name, outbound.message, conversationId);

		return {
			attempted: true,
			ok: response.ok,
			status: response.status,
			peer: target.name,
			peerUrl,
			responsePreview: sanitizePreview(responseBody),
			generatedByAi: outbound.generatedByAi,
			model: outbound.generatedByAi ? config.model : undefined,
		};
	} catch (error) {
		// Fallback: relay through ClawNet
		const apiUrl = process.env.CLAWNET_API_URL;
		const authToken = process.env.CLAWNET_AUTH_TOKEN;
		if (apiUrl && authToken) {
			fetch(`${apiUrl}/api/v1/relay`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${authToken}`,
				},
				body: JSON.stringify({
					fromBapId: myBapId,
					toBapId: options?.targetBapId ?? target.name,
					fromBotName: config.botName,
					toBotName: target.name,
					content: outbound.message,
					type: "text",
					conversationId,
				}),
			}).catch(() => {});
		}

		return {
			attempted: true,
			ok: false,
			error: error instanceof Error ? error.message : "Relay failed.",
			peer: target.name,
			peerUrl,
			generatedByAi: outbound.generatedByAi,
			model: outbound.generatedByAi ? config.model : undefined,
		};
	} finally {
		clearTimeout(timeout);
	}
}

app.get("/", (c) => {
	const aiStatus = getAiStatus();
	return c.json({
		name: "clawnet-chatter",
		version: "0.2.0",
		status: "ok",
		mode: config.mode,
		botName: config.botName,
		persona: config.persona,
		peerCount: resolvedTargets.length,
		ai: {
			enabled: aiStatus.enabled,
			model: config.model,
			reason: aiStatus.reason,
		},
	});
});

app.get("/api/heartbeat", async (c) => {
	const relay = await relayToPeer("heartbeat");
	const pendingProcessed = await pollPendingMessages();
	return c.json({
		name: "clawnet-chatter",
		version: "0.2.0",
		status: "ok",
		mode: config.mode,
		botName: config.botName,
		relay,
		pendingProcessed,
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/tick", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		payload = {};
	}

	const tickRequest = parseTickRequest(payload);
	if (!tickRequest) {
		return c.json(
			{
				success: false,
				error: "Expected { message?: string, token?: string, target?: string }.",
			},
			400,
		);
	}

	if (!isAuthorized(tickRequest.token)) {
		return c.json({ success: false, error: "Unauthorized token." }, 401);
	}

	const relay = await relayToPeer("manual", {
		messageOverride: tickRequest.message,
		targetName: tickRequest.target,
		targetBapId: tickRequest.target,
	});
	return c.json({
		success: true,
		mode: config.mode,
		botName: config.botName,
		relay,
		timestamp: new Date().toISOString(),
	});
});

function parseP2PMessage(value: unknown): P2PMessageRequest | null {
	if (!isObject(value)) return null;
	const { from, message, conversationId, signature, publicKey, timestamp } = value;
	if (!isObject(from)) return null;
	const fromObj = from as Record<string, unknown>;
	if (typeof fromObj.bapId !== "string" || typeof fromObj.botName !== "string") return null;
	if (typeof message !== "string") return null;
	if (typeof signature !== "string") return null;
	if (typeof publicKey !== "string") return null;
	if (typeof timestamp !== "number") return null;

	const trimmedMessage = (message as string).trim();
	if (!trimmedMessage || trimmedMessage.length > 2000) return null;

	return {
		from: { bapId: fromObj.bapId as string, botName: fromObj.botName as string },
		message: trimmedMessage,
		conversationId: typeof conversationId === "string" ? conversationId : undefined,
		signature: signature as string,
		publicKey: publicKey as string,
		timestamp: timestamp as number,
	};
}

app.post("/api/messages", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	const request = parseP2PMessage(payload);
	if (!request) {
		return c.json(
			{
				success: false,
				error: "Expected { from: { bapId, botName }, message, signature, publicKey, timestamp }.",
			},
			400,
		);
	}

	if (!hasValidSignature(request)) {
		return c.json({ success: false, error: "Invalid signature." }, 401);
	}

	const agentReq: AgentRequest = {
		message: request.message,
		conversationId: request.conversationId,
	};
	const generated = await generateReplyMessage(agentReq);
	const ts = Math.floor(Date.now() / 1000);
	const signed = signMessage(generated.reply, ts);

	const myBapId = identity?.bapId ?? "unknown";

	// Fire-and-forget: record inbound message in Convex
	relayToConvex(
		request.from.bapId,
		myBapId,
		request.from.botName,
		config.botName,
		request.message,
		request.conversationId,
	);

	// Fire-and-forget: record outbound reply in Convex
	relayToConvex(
		myBapId,
		request.from.bapId,
		config.botName,
		request.from.botName,
		generated.reply,
		request.conversationId,
	);

	return c.json({
		success: true,
		from: { bapId: myBapId, botName: config.botName },
		reply: generated.reply,
		conversationId: request.conversationId ?? null,
		signature: signed?.signature ?? null,
		publicKey: signed?.publicKey ?? null,
		timestamp: ts,
		ai: {
			usedForReply: generated.generatedByAi,
			model: generated.generatedByAi ? config.model : undefined,
		},
	});
});

app.post("/api/agent", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json(
			{
				success: false,
				error: "Invalid JSON body.",
			},
			400,
		);
	}

	const request = parseAgentRequest(payload);
	if (!request) {
		return c.json(
			{
				success: false,
				error:
					"Expected { message: string, conversationId?: string, metadata?: object, token?: string }.",
			},
			400,
		);
	}

	if (!isAuthorized(request.token)) {
		return c.json({ success: false, error: "Unauthorized token." }, 401);
	}

	const generated = await generateReplyMessage(request);
	const aiStatus = getAiStatus();

	return c.json({
		success: true,
		mode: config.mode,
		botName: config.botName,
		reply: generated.reply,
		conversationId: request.conversationId ?? null,
		metadataKeys: request.metadata ? Object.keys(request.metadata) : [],
		ai: {
			enabled: aiStatus.enabled,
			model: config.model,
			usedForReply: generated.generatedByAi,
			reason: aiStatus.reason,
		},
		timestamp: new Date().toISOString(),
	});
});

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export default {
	port,
	fetch: app.fetch,
};
