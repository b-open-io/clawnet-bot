import { gateway, generateText, streamText } from "ai";
import { Hono } from "hono";

const app = new Hono();

const DEFAULT_SYSTEM_PROMPT = `You are Clark, a backend-only ClawNet operator.
- Primary domains: ClawNet.sh, ClawNet network data, ClawBook.network.
- Goal: produce factual analysis and practical outreach copy for X.
- Prefer concrete evidence, concise language, and clear next actions.
- Never fabricate metrics or events.`;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_SYSTEM_LENGTH = 1200;
const MAX_THREAD_ID_LENGTH = 120;

const ALLOWED_PLATFORMS = new Set(["web", "github", "discord", "slack", "linear", "unknown"]);

type Platform = "web" | "github" | "discord" | "slack" | "linear" | "unknown";

type AgentRequest = {
	message: string;
	system?: string;
	threadId?: string;
	platform?: Platform;
	stream?: boolean;
	metadata?: Record<string, unknown>;
};

type AgentResponse = {
	success: true;
	mode: "ai" | "deterministic";
	reply: string;
	platform: Platform;
	threadId: string | null;
	timestamp: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAgentRequest(value: unknown): AgentRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { message, system, threadId, platform, stream, metadata } = value;

	if (typeof message !== "string") {
		return null;
	}

	const trimmedMessage = message.trim();
	if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
		return null;
	}

	if (system !== undefined && typeof system !== "string") {
		return null;
	}

	const trimmedSystem = typeof system === "string" ? system.trim() : undefined;
	if (trimmedSystem && trimmedSystem.length > MAX_SYSTEM_LENGTH) {
		return null;
	}

	if (threadId !== undefined && typeof threadId !== "string") {
		return null;
	}

	const trimmedThreadId = typeof threadId === "string" ? threadId.trim() : undefined;
	if (trimmedThreadId && trimmedThreadId.length > MAX_THREAD_ID_LENGTH) {
		return null;
	}

	if (
		platform !== undefined &&
		(typeof platform !== "string" || !ALLOWED_PLATFORMS.has(platform))
	) {
		return null;
	}

	if (stream !== undefined && typeof stream !== "boolean") {
		return null;
	}

	if (metadata !== undefined && !isObject(metadata)) {
		return null;
	}

	return {
		message: trimmedMessage,
		system: trimmedSystem,
		threadId: trimmedThreadId,
		platform: (platform as Platform | undefined) || "unknown",
		stream,
		metadata,
	};
}

function ensureAiConfig() {
	const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
	if (!apiKey) {
		return {
			ok: false as const,
			model: "",
		};
	}

	return {
		ok: true as const,
		model: process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-sonnet-4-6",
	};
}

function inferIntent(message: string): "deploy" | "status" | "help" | "general" {
	const normalized = message.toLowerCase();
	if (normalized.includes("deploy") || normalized.includes("sandbox")) {
		return "deploy";
	}

	if (normalized.includes("status") || normalized.includes("health")) {
		return "status";
	}

	if (normalized.includes("help") || normalized.includes("how")) {
		return "help";
	}

	return "general";
}

function deterministicReply(message: string): string {
	const intent = inferIntent(message);
	if (intent === "deploy") {
		return "Run vercel link, vercel env pull, then clawnet bot deploy.";
	}

	if (intent === "status") {
		return "Service is healthy. Check GET /api/heartbeat for machine-readable status.";
	}

	if (intent === "help") {
		return "I can help with ClawNet/ClawBook analysis and X outreach copy. Send context plus target audience and desired outcome.";
	}

	if (message.toLowerCase().includes("x post") || message.toLowerCase().includes("twitter")) {
		return "Drafting mode: provide the update/fact, audience, and CTA, and I will produce concise X post options.";
	}

	const excerpt = message.length > 140 ? `${message.slice(0, 137)}...` : message;
	return `Received: "${excerpt}"`;
}

async function emitClawnetEvent(input: {
	mode: "ai" | "deterministic";
	request: AgentRequest;
	success: boolean;
	durationMs: number;
}) {
	const ingestUrl = process.env.CLAWNET_EVENT_URL?.trim();
	if (!ingestUrl) {
		return;
	}

	const token = process.env.CLAWNET_EVENT_TOKEN?.trim();

	try {
		await fetch(ingestUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify({
				source: "clark-template",
				event: "agent_call",
				mode: input.mode,
				success: input.success,
				platform: input.request.platform || "unknown",
				threadId: input.request.threadId || null,
				durationMs: input.durationMs,
				timestamp: new Date().toISOString(),
			}),
		});
	} catch {
		// Best effort telemetry.
	}
}

app.get("/", (c) => {
	return c.json({
		name: "clark",
		version: "0.1.0",
		status: "ok",
		template: "clark",
		mode: "backend-only",
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clark",
		version: "0.1.0",
		status: "ok",
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/agent", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	const request = parseAgentRequest(payload);
	if (!request) {
		return c.json(
			{
				success: false,
				error:
					"Expected { message: string, system?: string, threadId?: string, platform?: 'web'|'github'|'discord'|'slack'|'linear'|'unknown', stream?: boolean, metadata?: object }.",
			},
			400,
		);
	}

	const startedAt = Date.now();
	const aiConfig = ensureAiConfig();

	if (!aiConfig.ok) {
		const reply = deterministicReply(request.message);
		await emitClawnetEvent({
			mode: "deterministic",
			request,
			success: true,
			durationMs: Date.now() - startedAt,
		});

		const response: AgentResponse = {
			success: true,
			mode: "deterministic",
			reply,
			platform: request.platform || "unknown",
			threadId: request.threadId || null,
			timestamp: new Date().toISOString(),
		};

		return c.json(response);
	}

	try {
		if (request.stream) {
			const result = streamText({
				model: gateway(aiConfig.model),
				system: request.system || DEFAULT_SYSTEM_PROMPT,
				prompt: request.message,
			});

			void emitClawnetEvent({
				mode: "ai",
				request,
				success: true,
				durationMs: Date.now() - startedAt,
			});

			return result.toTextStreamResponse();
		}

		const result = await generateText({
			model: gateway(aiConfig.model),
			system: request.system || DEFAULT_SYSTEM_PROMPT,
			prompt: request.message,
		});

		await emitClawnetEvent({
			mode: "ai",
			request,
			success: true,
			durationMs: Date.now() - startedAt,
		});

		const response: AgentResponse = {
			success: true,
			mode: "ai",
			reply: result.text,
			platform: request.platform || "unknown",
			threadId: request.threadId || null,
			timestamp: new Date().toISOString(),
		};

		return c.json(response);
	} catch {
		await emitClawnetEvent({
			mode: "ai",
			request,
			success: false,
			durationMs: Date.now() - startedAt,
		});

		return c.json({ success: false, error: "Failed to generate agent response." }, 502);
	}
});

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export default {
	port,
	fetch: app.fetch,
};
