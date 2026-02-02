import { Hono } from "hono";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

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

export default app;
