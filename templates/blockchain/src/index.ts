import { PrivateKey } from "@bsv/sdk";
import { Hono } from "hono";

const app = new Hono();

// Health check
app.get("/", (c) => {
	return c.json({
		name: "clawnet-blockchain",
		version: "0.0.1",
		status: "ok",
		features: ["bsv", "bitcoin-auth"],
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-blockchain",
		version: "0.0.1",
		status: "ok",
		timestamp: new Date().toISOString(),
	});
});

// Get bot identity
app.get("/api/identity", (c) => {
	const wif = process.env.SIGMA_MEMBER_PRIVATE_KEY;
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

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Server starting on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
