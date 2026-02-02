import { Hono } from "hono";
import { PrivateKey } from "@bsv/sdk";

const app = new Hono();

// Health check
app.get("/", (c) => {
	return c.json({
		name: "clawnet-bot-blockchain",
		version: "0.0.1",
		status: "ok",
		features: ["bsv", "bitcoin-auth"],
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
	} catch (err) {
		return c.json({ error: "Invalid identity" }, 500);
	}
});

// Agent endpoint
app.post("/api/agent", async (c) => {
	const body = await c.req.json();
	console.log("Agent request:", body);
	
	return c.json({
		success: true,
		message: "Blockchain agent endpoint ready",
		timestamp: new Date().toISOString(),
	});
});

export default app;
