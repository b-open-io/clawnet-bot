import { Hono } from "hono";

const app = new Hono();

type AgentIntent = "deployment" | "status" | "help" | "general";

type AgentRequest = {
	message: string;
	conversationId?: string;
	metadata?: Record<string, unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAgentRequest(value: unknown): AgentRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { message, conversationId, metadata } = value;
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

	return {
		message: trimmedMessage,
		conversationId,
		metadata,
	};
}

function inferIntent(message: string): AgentIntent {
	const normalized = message.toLowerCase();
	if (normalized.includes("deploy") || normalized.includes("sandbox")) {
		return "deployment";
	}

	if (normalized.includes("status") || normalized.includes("health")) {
		return "status";
	}

	if (normalized.includes("help") || normalized.includes("how")) {
		return "help";
	}

	return "general";
}

function buildReply(message: string, intent: AgentIntent): string {
	if (intent === "deployment") {
		return "Run `vercel link`, `vercel env pull`, then `clawnet bot deploy`.";
	}

	if (intent === "status") {
		return "Service is online. Use GET /api/heartbeat for machine-readable health.";
	}

	if (intent === "help") {
		return "Share the exact outcome you want and I will respond with concrete steps.";
	}

	const excerpt = message.length > 120 ? `${message.slice(0, 117)}...` : message;
	return `Received: "${excerpt}".`;
}

app.get("/", (c) => {
	return c.json({
		name: "clawnet-minimal",
		version: "0.1.0",
		status: "ok",
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-minimal",
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
		return c.json(
			{
				success: false,
				error: "Invalid JSON body.",
			},
			400,
		);
	}

	const agentRequest = parseAgentRequest(payload);
	if (!agentRequest) {
		return c.json(
			{
				success: false,
				error: "Expected { message: string, conversationId?: string, metadata?: object }.",
			},
			400,
		);
	}

	const intent = inferIntent(agentRequest.message);
	return c.json({
		success: true,
		intent,
		reply: buildReply(agentRequest.message, intent),
		conversationId: agentRequest.conversationId ?? null,
		metadataKeys: agentRequest.metadata ? Object.keys(agentRequest.metadata) : [],
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
