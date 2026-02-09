import { PrivateKey, Utils } from "@bsv/sdk";
import { Hono } from "hono";

const app = new Hono();

type MoltbookEventType = "mention" | "dm" | "reply" | "post";

type MoltbookEvent = {
	eventType: MoltbookEventType;
	author: string;
	text: string;
	postId?: string;
};

type EventDecision = {
	action: "reply" | "ignore" | "review";
	reason: string;
	reply?: string;
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

const SPAM_PATTERNS = ["buy now", "free money", "http://", "https://"];

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

function parseEvent(value: unknown): MoltbookEvent | null {
	if (!isObject(value)) {
		return null;
	}

	const { eventType, author, text, postId } = value;
	if (
		eventType !== "mention" &&
		eventType !== "dm" &&
		eventType !== "reply" &&
		eventType !== "post"
	) {
		return null;
	}

	if (typeof author !== "string" || typeof text !== "string") {
		return null;
	}

	const normalizedAuthor = author.trim();
	const normalizedText = text.trim();
	if (!normalizedAuthor || normalizedAuthor.length > 80) {
		return null;
	}

	if (!normalizedText || normalizedText.length > 2000) {
		return null;
	}

	if (postId !== undefined && typeof postId !== "string") {
		return null;
	}

	return {
		eventType,
		author: normalizedAuthor,
		text: normalizedText,
		postId,
	};
}

function excerpt(text: string, maxLength = 80): string {
	return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildReply(event: MoltbookEvent): string {
	const author = event.author.startsWith("@") ? event.author : `@${event.author}`;
	const normalized = event.text.toLowerCase();

	if (normalized.includes("help") || normalized.includes("how")) {
		return `Hi ${author}, tell me the exact issue and I will help step-by-step.`;
	}

	if (normalized.includes("thanks")) {
		return `You're welcome, ${author}.`;
	}

	if (event.eventType === "dm") {
		return `Hi ${author}, I got your DM: "${excerpt(event.text)}".`;
	}

	return `Hi ${author}, thanks for the mention: "${excerpt(event.text)}".`;
}

function decideEvent(event: MoltbookEvent): EventDecision {
	const normalizedText = event.text.toLowerCase();
	if (SPAM_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
		return {
			action: "ignore",
			reason: "Detected likely promotional or spam content.",
		};
	}

	if (
		normalizedText.includes("bug") ||
		normalizedText.includes("broken") ||
		normalizedText.includes("error")
	) {
		return {
			action: "review",
			reason: "Potential support issue should be reviewed by an operator.",
		};
	}

	if (event.eventType === "post") {
		return {
			action: "ignore",
			reason: "No direct response needed for passive post events.",
		};
	}

	return {
		action: "reply",
		reason: "Direct interaction event.",
		reply: buildReply(event),
	};
}

app.get("/", (c) => {
	return c.json({
		name: "clawnet-moltbook",
		version: "0.1.0",
		status: "ok",
		integrations: ["moltbook-event-router"],
	});
});

app.get("/api/heartbeat", (c) => {
	return c.json({
		name: "clawnet-moltbook",
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

	const event = parseEvent(payload);
	if (!event) {
		return c.json(
			{
				success: false,
				error:
					"Expected { eventType: 'mention'|'dm'|'reply'|'post', author: string, text: string, postId?: string }.",
			},
			400,
		);
	}

	return c.json({
		success: true,
		event,
		decision: decideEvent(event),
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/hooks/agent", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}

	if (!isObject(payload) || !Array.isArray(payload.events)) {
		return c.json(
			{
				success: false,
				error: "Expected { events: MoltbookEvent[] }.",
			},
			400,
		);
	}

	const decisions: Array<{ event: MoltbookEvent; decision: EventDecision }> = [];
	let dropped = 0;
	for (const rawEvent of payload.events) {
		const event = parseEvent(rawEvent);
		if (!event) {
			dropped += 1;
			continue;
		}

		decisions.push({
			event,
			decision: decideEvent(event),
		});
	}

	return c.json({
		success: true,
		received: payload.events.length,
		processed: decisions.length,
		dropped,
		decisions,
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
