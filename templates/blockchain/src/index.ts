import { PrivateKey, Utils } from "@bsv/sdk";
import { Hono } from "hono";

const app = new Hono();

type BlockchainAction = "identity" | "signMessage";

type BlockchainAgentRequest = {
	action?: BlockchainAction;
	message?: string;
};

type IdentityResult =
	| {
			ok: true;
			privateKey: PrivateKey;
			publicKey: string;
			address: string;
	  }
	| {
			ok: false;
			error: string;
	  };

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadIdentity(): IdentityResult {
	const wif = process.env.SIGMA_MEMBER_PRIVATE_KEY;
	if (!wif) {
		return {
			ok: false,
			error: "SIGMA_MEMBER_PRIVATE_KEY is not configured.",
		};
	}

	try {
		const privateKey = PrivateKey.fromWif(wif);
		const encodedPublicKey = privateKey.toPublicKey().encode(true);
		const publicKey = Array.isArray(encodedPublicKey)
			? Utils.toHex(encodedPublicKey)
			: encodedPublicKey;
		if (publicKey === "00") {
			return {
				ok: false,
				error: "Unable to derive a valid public key from SIGMA_MEMBER_PRIVATE_KEY.",
			};
		}

		return {
			ok: true,
			privateKey,
			publicKey,
			address: privateKey.toAddress().toString(),
		};
	} catch {
		return {
			ok: false,
			error: "SIGMA_MEMBER_PRIVATE_KEY is invalid.",
		};
	}
}

function parseAgentRequest(value: unknown): BlockchainAgentRequest | null {
	if (!isObject(value)) {
		return null;
	}

	const { action, message } = value;
	if (action !== undefined && action !== "identity" && action !== "signMessage") {
		return null;
	}

	if (message !== undefined) {
		if (typeof message !== "string") {
			return null;
		}

		const trimmed = message.trim();
		if (!trimmed || trimmed.length > 4096) {
			return null;
		}
	}

	return {
		action,
		message: typeof message === "string" ? message.trim() : undefined,
	};
}

app.get("/", (c) => {
	return c.json({
		name: "clawnet-blockchain",
		version: "0.1.0",
		status: "ok",
		features: ["bsv-identity", "message-signing"],
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-blockchain",
		version: "0.1.0",
		status: "ok",
		timestamp: new Date().toISOString(),
	});
});

app.get("/api/identity", (c) => {
	const identity = loadIdentity();
	if (!identity.ok) {
		return c.json({ success: false, error: identity.error }, 500);
	}

	return c.json({
		success: true,
		publicKey: identity.publicKey,
		address: identity.address,
	});
});

app.post("/api/agent", async (c) => {
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
				error: "Expected { action?: 'identity'|'signMessage', message?: string }.",
			},
			400,
		);
	}

	const identity = loadIdentity();
	if (!identity.ok) {
		return c.json({ success: false, error: identity.error }, 500);
	}

	const action = request.action ?? "identity";
	if (action === "identity") {
		return c.json({
			success: true,
			action,
			publicKey: identity.publicKey,
			address: identity.address,
			timestamp: new Date().toISOString(),
		});
	}

	if (!request.message) {
		return c.json(
			{
				success: false,
				error: "message is required when action is 'signMessage'.",
			},
			400,
		);
	}

	try {
		const messageBytes = Utils.toArray(request.message);
		const signature = identity.privateKey.sign(messageBytes);

		return c.json({
			success: true,
			action,
			message: request.message,
			signature: signature.toDER("hex"),
			publicKey: identity.publicKey,
			address: identity.address,
			timestamp: new Date().toISOString(),
		});
	} catch {
		return c.json({ success: false, error: "Failed to sign message." }, 500);
	}
});

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export default {
	port,
	fetch: app.fetch,
};
