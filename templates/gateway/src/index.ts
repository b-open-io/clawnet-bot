import { gateway, streamText, type CoreTool } from "ai";
import {
	experimental_createSkillTool as createSkillTool,
	createBashTool,
} from "bash-tool";
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUL = readFileSync(join(__dirname, "..", "SOUL.md"), "utf-8");

// Discover skills and create tools if skills/ directory exists
let agentTools: Record<string, CoreTool> = {};
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

const MAX_MESSAGE_LENGTH = 4000;

type ChatRole = "system" | "user" | "assistant" | "tool";

type ChatMessage = {
	role: ChatRole;
	content: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessage(value: unknown): ChatMessage | null {
	if (!isObject(value)) return null;

	const { role, content } = value;
	if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
		return null;
	}

	if (typeof content !== "string") return null;

	const trimmed = content.trim();
	if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;

	return { role, content: trimmed };
}

// Model configuration via AI Gateway
const MODEL_ID = process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-4.6";

function ensureGateway(): string | null {
	const key = process.env.AI_GATEWAY_API_KEY?.trim();
	if (!key) return null;
	return key;
}

// --- Health ---

app.get("/", (c) =>
	c.json({
		name: "clawnet-bot",
		version: "0.1.0",
		status: "ok",
		framework: "vercel-ai-gateway",
	}),
);

app.get("/api/heartbeat", (c) =>
	c.json({
		name: "clawnet-bot",
		version: "0.1.0",
		status: "ok",
		timestamp: new Date().toISOString(),
	}),
);

// --- Chat (Vercel AI SDK compatible) ---

app.post("/api/chat", async (c) => {
	if (!ensureGateway()) {
		return c.json({ success: false, error: "AI_GATEWAY_API_KEY is not set." }, 503);
	}

	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	if (!isObject(payload) || !Array.isArray(payload.messages) || payload.messages.length === 0) {
		return c.json(
			{
				success: false,
				error: "Expected { messages: Array<{ role, content }> }.",
			},
			400,
		);
	}

	const messages: ChatMessage[] = [];
	for (const raw of payload.messages as unknown[]) {
		const msg = parseMessage(raw);
		if (!msg) {
			return c.json({ success: false, error: "Invalid message format." }, 400);
		}
		messages.push(msg);
	}

	try {
		const result = streamText({
			model: gateway(MODEL_ID),
			system: SOUL + (skillInstructions ? `\n\n${skillInstructions}` : ""),
			tools: agentTools,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
		});

		return result.toUIMessageStreamResponse();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error("Chat error:", message);
		return c.json({ success: false, error: message }, 502);
	}
});

// --- Agent (single prompt) ---

app.post("/api/agent", async (c) => {
	if (!ensureGateway()) {
		return c.json({ success: false, error: "AI_GATEWAY_API_KEY is not set." }, 503);
	}

	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	if (!isObject(payload) || typeof payload.message !== "string") {
		return c.json(
			{ success: false, error: "Expected { message: string, system?: string }." },
			400,
		);
	}

	const message = (payload.message as string).trim();
	if (!message || message.length > MAX_MESSAGE_LENGTH) {
		return c.json({ success: false, error: "Message is empty or too long." }, 400);
	}

	const customSystem = typeof payload.system === "string" ? payload.system.trim() : undefined;

	try {
		const system = customSystem ?? SOUL;
		const result = streamText({
			model: gateway(MODEL_ID),
			system: system + (skillInstructions ? `\n\n${skillInstructions}` : ""),
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

// --- Start ---

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export default {
	port,
	fetch: app.fetch,
};
