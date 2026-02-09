import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Hono } from "hono";

const app = new Hono();

const MAX_MESSAGE_LENGTH = 4000;

type ChatRole = "system" | "user" | "assistant" | "tool";

type ChatMessage = {
	role: ChatRole;
	content: string;
};

type ChatRequest = {
	messages: ChatMessage[];
};

type AgentRequest = {
	message: string;
	system?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessage(value: unknown): ChatMessage | null {
	if (!isObject(value)) {
		return null;
	}

	const { role, content } = value;
	if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
		return null;
	}

	if (typeof content !== "string") {
		return null;
	}

	const trimmedContent = content.trim();
	if (!trimmedContent || trimmedContent.length > MAX_MESSAGE_LENGTH) {
		return null;
	}

	return {
		role,
		content: trimmedContent,
	};
}

function parseChatRequest(value: unknown): ChatRequest | null {
	if (!isObject(value) || !Array.isArray(value.messages) || value.messages.length === 0) {
		return null;
	}

	const messages: ChatMessage[] = [];
	for (const rawMessage of value.messages) {
		const message = parseMessage(rawMessage);
		if (!message) {
			return null;
		}
		messages.push(message);
	}

	return { messages };
}

function parseAgentRequest(value: unknown): AgentRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { message, system } = value;
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
	if (trimmedSystem !== undefined && trimmedSystem.length > MAX_MESSAGE_LENGTH) {
		return null;
	}

	return {
		message: trimmedMessage,
		system: trimmedSystem,
	};
}

function ensureOpenAiConfig() {
	const apiKey = process.env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		return {
			ok: false as const,
			error: "OPENAI_API_KEY is required for vercel-ai template endpoints.",
		};
	}

	const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
	return {
		ok: true as const,
		model,
	};
}

app.get("/", (c) => {
	return c.json({
		name: "clawnet-vercel-ai",
		version: "0.1.0",
		status: "ok",
		framework: "vercel-ai-sdk",
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-vercel-ai",
		version: "0.1.0",
		status: "ok",
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/chat", async (c) => {
	const openAiConfig = ensureOpenAiConfig();
	if (!openAiConfig.ok) {
		return c.json({ success: false, error: openAiConfig.error }, 503);
	}

	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	const request = parseChatRequest(payload);
	if (!request) {
		return c.json(
			{
				success: false,
				error:
					"Expected { messages: Array<{ role: 'system'|'user'|'assistant'|'tool', content: string }> }.",
			},
			400,
		);
	}

	try {
		const prompt = request.messages
			.map((message) => `${message.role}: ${message.content}`)
			.join("\n");

		const result = streamText({
			model: openai(openAiConfig.model),
			prompt,
		});
		return result.toDataStreamResponse();
	} catch {
		return c.json({ success: false, error: "Failed to stream chat response." }, 502);
	}
});

app.post("/api/agent", async (c) => {
	const openAiConfig = ensureOpenAiConfig();
	if (!openAiConfig.ok) {
		return c.json({ success: false, error: openAiConfig.error }, 503);
	}

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
				error: "Expected { message: string, system?: string }.",
			},
			400,
		);
	}

	try {
		const prompt = request.system
			? `System: ${request.system}\nUser: ${request.message}`
			: request.message;

		const result = streamText({
			model: openai(openAiConfig.model),
			prompt,
		});

		return result.toDataStreamResponse();
	} catch {
		return c.json({ success: false, error: "Failed to stream agent response." }, 502);
	}
});

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export default {
	port,
	fetch: app.fetch,
};
