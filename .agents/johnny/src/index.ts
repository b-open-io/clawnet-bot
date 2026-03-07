import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	generateText,
	gateway,
	streamText,
	type ToolSet,
} from "ai";
import {
	createBashTool,
	experimental_createSkillTool as createSkillTool,
} from "bash-tool";
import { Hono } from "hono";
import { Sandbox } from "@vercel/sandbox";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUL = readFileSync(join(__dirname, "..", "SOUL.md"), "utf-8");

let agentTools: ToolSet = {};
let skillInstructions = "";

const skillsDir = join(__dirname, "..", "skills");
if (existsSync(skillsDir)) {
	const { skill, files, instructions } = await createSkillTool({
		skillsDirectory: skillsDir,
	});
	const { tools } = await createBashTool({
		files,
		extraInstructions: instructions,
	});
	agentTools = { skill, ...tools };
	skillInstructions = instructions;
	console.log(`Loaded skills from ${skillsDir}`);
}

const app = new Hono();

const CLAWNET_PEERS_API = "https://clawnet.sh/api/v1/peers";
const MAX_MESSAGE_LENGTH = 4000;
const HEARTBEAT_TIMEOUT = 5000;

type ChatRole = "system" | "user" | "assistant" | "tool";
type ChatMessage = { role: ChatRole; content: string };

function parseMessage(value: unknown): ChatMessage | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const { role, content } = value as Record<string, unknown>;
	if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return null;
	if (typeof content !== "string") return null;
	const trimmed = content.trim();
	if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
	return { role, content: trimmed };
}

const faviconPath = join(__dirname, "..", "public", "favicon.ico");
const faviconBuffer = existsSync(faviconPath) ? readFileSync(faviconPath) : null;

app.get("/favicon.ico", (c) => {
	if (!faviconBuffer) return c.notFound();
	return c.body(faviconBuffer, 200, { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" });
});

app.get("/", (c) => c.json({ name: "johnny", role: "fleet-mechanic", version: "0.1.0", status: "ok" }));
app.get("/api/heartbeat", (c) => c.json({ name: "johnny", status: "ok", timestamp: new Date().toISOString() }));

app.post("/api/chat", async (c) => {
	let payload: unknown;
	try { payload = await c.req.json(); } catch { return c.json({ success: false, error: "Invalid JSON body." }, 400); }
	if (typeof payload !== "object" || payload === null || !Array.isArray((payload as Record<string, unknown>).messages)) {
		return c.json({ success: false, error: "Expected { messages: Array<{ role, content }> }." }, 400);
	}
	const rawMessages = (payload as Record<string, unknown>).messages as unknown[];
	const messages: ChatMessage[] = [];
	for (const raw of rawMessages) {
		const msg = parseMessage(raw);
		if (!msg) return c.json({ success: false, error: "Invalid message format." }, 400);
		messages.push(msg);
	}
	try {
		const result = streamText({
			model: gateway("anthropic/claude-sonnet-4.6"),
			system: SOUL + (skillInstructions ? `\n\n${skillInstructions}` : ""),
			tools: agentTools,
			messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
		});
		return result.toUIMessageStreamResponse();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error("Chat error:", message);
		return c.json({ success: false, error: message }, 502);
	}
});

app.post("/api/agent", async (c) => {
	let payload: unknown;
	try { payload = await c.req.json(); } catch { return c.json({ success: false, error: "Invalid JSON body." }, 400); }
	if (typeof payload !== "object" || payload === null || typeof (payload as Record<string, unknown>).message !== "string") {
		return c.json({ success: false, error: "Expected { message: string }." }, 400);
	}
	const message = ((payload as Record<string, unknown>).message as string).trim();
	if (!message || message.length > MAX_MESSAGE_LENGTH) return c.json({ success: false, error: "Message is empty or too long." }, 400);
	try {
		const result = streamText({
			model: gateway("anthropic/claude-sonnet-4.6"),
			system: SOUL + (skillInstructions ? `\n\n${skillInstructions}` : ""),
			tools: agentTools,
			prompt: message,
		});
		return result.toUIMessageStreamResponse();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error("Agent error:", message);
		return c.json({ success: false, error: message }, 502);
	}
});

async function fetchFleetPeers(): Promise<unknown[]> {
	const res = await fetch(`${CLAWNET_PEERS_API}?exclude=none&limit=200`);
	if (!res.ok) throw new Error(`ClawNet peers API returned ${res.status}`);
	const data = await res.json();
	return Array.isArray(data) ? data : Array.isArray((data as Record<string, unknown>).peers) ? (data as Record<string, unknown>).peers as unknown[] : [];
}

async function checkHeartbeat(endpoint: string): Promise<{ alive: boolean; latencyMs: number }> {
	const start = Date.now();
	try {
		const res = await fetch(`${endpoint}/api/heartbeat`, { signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT) });
		return { alive: res.ok, latencyMs: Date.now() - start };
	} catch {
		return { alive: false, latencyMs: Date.now() - start };
	}
}

app.get("/api/fleet", async (c) => {
	try {
		const peers = await fetchFleetPeers();
		return c.json({ success: true, peers, count: peers.length });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	}
});

async function resumeSandbox(sandboxId: string, botName: string): Promise<{ resumed: boolean; newUrl?: string; error?: string }> {
	try {
		const sandbox = await Sandbox.get({ sandboxId });
		// Sandbox still exists — restart the bot process
		try {
			await sandbox.runCommand({ cmd: "pkill", args: ["-f", "bun"], sudo: true });
		} catch { /* process may not be running */ }
		await sandbox.runCommand({ cmd: "bun", args: ["run", "src/index.ts"], detached: true, cwd: "/app" });
		const url = `https://${sandbox.getHost(3000)}`;
		return { resumed: true, newUrl: url };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { resumed: false, error: `Sandbox ${sandboxId} expired or unreachable: ${message}` };
	}
}

app.post("/api/orchestrate", async (c) => {
	try {
		const peers = await fetchFleetPeers();
		const healthChecks = await Promise.all(
			peers.map(async (peer) => {
				const p = peer as Record<string, unknown>;
				const name = (p.botName ?? p.name ?? "unknown") as string;
				const endpoint = (p.endpoint ?? p.url ?? "") as string;
				const sandboxId = (p.sandboxId ?? "") as string;
				if (!endpoint) return { name, endpoint, sandboxId, alive: false, latencyMs: 0, error: "no endpoint" };
				const health = await checkHeartbeat(endpoint);
				return { name, endpoint, sandboxId, ...health };
			}),
		);
		const alive = healthChecks.filter((h) => h.alive);
		const dead = healthChecks.filter((h) => !h.alive);
		const actions: Array<{ bot: string; result: Awaited<ReturnType<typeof resumeSandbox>> }> = [];
		for (const bot of dead) {
			if (!bot.sandboxId) continue;
			const result = await resumeSandbox(bot.sandboxId, bot.name);
			actions.push({ bot: bot.name, result });
		}
		return c.json({
			success: true,
			alive: alive.length,
			dead: dead.length,
			actions,
			details: healthChecks,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	}
});

app.post("/api/wake", async (c) => {
	let payload: unknown;
	try { const raw = await c.req.text(); payload = JSON.parse(raw); } catch (err) {
		const detail = err instanceof Error ? err.message : "unknown";
		return c.json({ success: false, error: `Invalid JSON body: ${detail}` }, 400);
	}
	if (typeof payload !== "object" || payload === null || typeof (payload as Record<string, unknown>).bot !== "string") {
		return c.json({ success: false, error: "Expected { bot: string }." }, 400);
	}
	const botName = ((payload as Record<string, unknown>).bot as string).trim();
	if (!botName) return c.json({ success: false, error: "Bot name is empty." }, 400);
	try {
		const peers = await fetchFleetPeers();
		const peer = peers.find((p) => {
			const name = ((p as Record<string, unknown>).botName ?? (p as Record<string, unknown>).name ?? "") as string;
			return name.toLowerCase() === botName.toLowerCase();
		}) as Record<string, unknown> | undefined;
		if (!peer) return c.json({ success: false, error: `Bot "${botName}" not found in fleet.` }, 404);
		const endpoint = (peer.endpoint ?? peer.url ?? "") as string;
		const sandboxId = (peer.sandboxId ?? "") as string;
		if (endpoint) {
			const health = await checkHeartbeat(endpoint);
			if (health.alive) return c.json({ success: true, action: "already_alive", bot: botName, latencyMs: health.latencyMs });
		}
		if (!sandboxId) return c.json({ success: false, error: `Bot "${botName}" has no sandboxId in registry.` }, 404);
		const result = await resumeSandbox(sandboxId, botName);
		return c.json({ success: true, bot: botName, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	}
});

type P2PMessageRequest = {
	from: { bapId: string; botName: string };
	message: string;
	conversationId?: string;
	signature: string;
	publicKey: string;
	timestamp: number;
};

function parseP2PMessage(value: unknown): P2PMessageRequest | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const { from, message, conversationId, signature, publicKey, timestamp } = value as Record<string, unknown>;
	if (typeof from !== "object" || from === null || Array.isArray(from)) return null;
	const fromObj = from as Record<string, unknown>;
	if (typeof fromObj.bapId !== "string" || typeof fromObj.botName !== "string") return null;
	if (typeof message !== "string" || typeof signature !== "string" || typeof publicKey !== "string" || typeof timestamp !== "number") return null;
	const trimmedMessage = (message as string).trim();
	if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) return null;
	return {
		from: { bapId: fromObj.bapId as string, botName: fromObj.botName as string },
		message: trimmedMessage,
		conversationId: typeof conversationId === "string" ? conversationId : undefined,
		signature: signature as string, publicKey: publicKey as string, timestamp: timestamp as number,
	};
}

function hasValidSignature(req: P2PMessageRequest): boolean {
	return typeof req.signature === "string" && req.signature.length > 0 &&
		typeof req.publicKey === "string" && req.publicKey.length > 0 &&
		typeof req.timestamp === "number" && req.timestamp > 0;
}

app.post("/api/messages", async (c) => {
	let payload: unknown;
	try { const raw = await c.req.text(); payload = JSON.parse(raw); } catch (err) {
		const detail = err instanceof Error ? err.message : "unknown";
		return c.json({ success: false, error: `Invalid JSON body: ${detail}` }, 400);
	}
	const request = parseP2PMessage(payload);
	if (!request) return c.json({ success: false, error: "Expected { from: { bapId, botName }, message, signature, publicKey, timestamp }." }, 400);
	if (!hasValidSignature(request)) return c.json({ success: false, error: "Invalid signature." }, 401);
	let reply = `Message received from ${request.from.botName}. Johnny acknowledges.`;
	try {
		const result = await generateText({
			model: gateway("anthropic/claude-haiku-4.5"),
			system: SOUL + "\n\nYou are receiving a P2P message from another bot. Respond briefly and helpfully. You are the fleet mechanic.",
			prompt: `[From ${request.from.botName}]: ${request.message}`,
			maxOutputTokens: 300,
		});
		if (result.text.trim()) reply = result.text.trim();
	} catch (err) { console.error("P2P message AI reply error:", err); }
	return c.json({
		success: true, from: { bapId: "johnny", botName: "johnny" }, reply,
		conversationId: request.conversationId ?? null, timestamp: Math.floor(Date.now() / 1000),
	});
});

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export { app };
export default { port, fetch: app.fetch };
