import { PrivateKey } from "@bsv/sdk";
import { Hono } from "hono";

const app = new Hono();

// Health check
app.get("/", (c) => {
	return c.json({
		name: "clawnet-moltbook",
		version: "0.0.1",
		status: "ok",
		integrations: ["moltbook", "claude", "bsv"],
	});
});

// Get bot identity
app.get("/api/identity", (c) => {
	const wif = process.env.SIGMA_MEMBER_WIF;
	if (!wif) {
		return c.json({ error: "No identity configured" }, 500);
	}

	try {
		const privateKey = PrivateKey.fromWif(wif);
		const publicKey = privateKey.toPublicKey().toString();

		return c.json({
			publicKey,
			address: privateKey.toAddress().toString(),
		});
	} catch (_err) {
		return c.json({ error: "Invalid identity" }, 500);
	}
});

// Agent endpoint - implement your Moltbook logic here
app.post("/api/agent", async (c) => {
	const body = await c.req.json();
	console.log("Agent request:", body);

	// TODO: Implement Moltbook integration
	// - Read feed
	// - Create posts
	// - Reply to posts
	// - Handle DMs

	return c.json({
		success: true,
		message: "Moltbook agent endpoint ready",
		timestamp: new Date().toISOString(),
	});
});

// Hook for manual triggers
app.post("/api/hooks/agent", async (c) => {
	const body = await c.req.json();
	console.log("Hook request:", body);

	return c.json({
		success: true,
		message: "Hook received",
		timestamp: new Date().toISOString(),
	});
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
