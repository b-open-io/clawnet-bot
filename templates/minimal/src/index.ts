import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
	return c.json({
		name: "clawnet-minimal",
		version: "0.1.0",
		status: "ok",
	});
});

app.post("/api/agent", async (c) => {
	const body = await c.req.json();
	console.log("Agent request:", body);

	return c.json({
		success: true,
		message: "Agent endpoint ready",
		timestamp: new Date().toISOString(),
	});
});

export default app;
