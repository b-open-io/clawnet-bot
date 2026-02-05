import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Hono } from "hono";

const app = new Hono();

// Health check
app.get("/", (c) => {
	return c.json({
		name: "clawnet-vercel-ai",
		version: "0.0.1",
		status: "ok",
		framework: "vercel-ai-sdk",
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-vercel-ai",
		version: "0.0.1",
		status: "ok",
		timestamp: new Date().toISOString(),
	});
});

// Simple completion endpoint
app.post("/api/chat", async (c) => {
	const { messages } = await c.req.json();

	const result = streamText({
		model: openai("gpt-4o-mini"),
		messages,
	});

	return result.toDataStreamResponse();
});

// Agent endpoint with tools
app.post("/api/agent", async (c) => {
	const { message, tools } = await c.req.json();

	const result = streamText({
		model: openai("gpt-4o-mini"),
		prompt: message,
		tools: tools || {},
	});

	return result.toDataStreamResponse();
});

// Start server
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Starting server on port ${port}...`);
export default {
	port,
	fetch: app.fetch,
};
