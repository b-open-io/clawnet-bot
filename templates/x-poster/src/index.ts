import { readFileSync } from "node:fs";
import { PrivateKey, Utils } from "@bsv/sdk";
import { generateText } from "ai";
import { Hono } from "hono";

const app = new Hono();

// ── Types ──────────────────────────────────────────────────────────────────────

type IdentityInfo = {
	privateKey: PrivateKey;
	publicKey: string;
	bapId: string;
};

type XPosterConfig = {
	botName: string;
	persona: string;
	model: string;
	enableAi: boolean;
	postingEnabled: boolean;
	postIntervalMinutes: number;
	postVarianceMinutes: number;
	monitorMentions: boolean;
	monitorSearchTerms: string[];
	likeRelevantContent: boolean;
	retweetRelevantContent: boolean;
	maxPostsPerDay: number;
	maxRepliesPerDay: number;
	maxLikesPerDay: number;
	maxRetweetsPerDay: number;
	tweetPrompt: string;
	replyPrompt: string;
	topics: string[];
	tone: string;
	maxTweetLength: number;
	minReplyDelayMs: number;
	botDisclosure: string;
};

type AgentRequest = {
	message: string;
	conversationId?: string;
	metadata?: Record<string, unknown>;
	token?: string;
};

type ActionCounters = {
	posts: number;
	replies: number;
	likes: number;
	retweets: number;
	windowStart: number;
};

type XTweet = {
	id: string;
	text: string;
	author_id?: string;
	author_username?: string;
	created_at?: string;
};

type HeartbeatResult = {
	posted: boolean;
	postId?: string;
	mentionsProcessed: number;
	searchProcessed: number;
	errors: string[];
};

type AiStatus = {
	enabled: boolean;
	reason?: string;
};

// ── Config Loading ─────────────────────────────────────────────────────────────

const CONFIG_PATH = new URL("../x-poster.config.json", import.meta.url);

const DEFAULT_CONFIG: XPosterConfig = {
	botName: "x-poster-bot",
	persona: "You are a thoughtful, concise social media poster.",
	model: "anthropic/claude-haiku-4.5",
	enableAi: true,
	postingEnabled: true,
	postIntervalMinutes: 120,
	postVarianceMinutes: 30,
	monitorMentions: true,
	monitorSearchTerms: [],
	likeRelevantContent: false,
	retweetRelevantContent: false,
	maxPostsPerDay: 6,
	maxRepliesPerDay: 12,
	maxLikesPerDay: 20,
	maxRetweetsPerDay: 5,
	tweetPrompt: "Write one original, insightful tweet. No hashtag spam. Be genuine.",
	replyPrompt: "Write a thoughtful, brief reply. Be helpful and on-topic.",
	topics: ["technology", "open source"],
	tone: "thoughtful and genuine",
	maxTweetLength: 270,
	minReplyDelayMs: 5000,
	botDisclosure: "",
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return undefined;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
	if (normalized === "false" || normalized === "0" || normalized === "no") return false;
	return undefined;
}

function parseNumber(value: unknown, min?: number, max?: number): number | undefined {
	let num: number | undefined;
	if (typeof value === "number" && Number.isFinite(value)) {
		num = value;
	} else if (typeof value === "string") {
		const parsed = Number.parseFloat(value.trim());
		if (!Number.isNaN(parsed)) num = parsed;
	}
	if (num === undefined) return undefined;
	if (min !== undefined && num < min) return undefined;
	if (max !== undefined && num > max) return undefined;
	return num;
}

function parseStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result: string[] = [];
	for (const item of value) {
		const str = asOptionalString(item);
		if (str) result.push(str);
	}
	return result.length > 0 ? result : undefined;
}

function loadFileConfig(): Partial<XPosterConfig> {
	try {
		const raw = readFileSync(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!isObject(parsed)) return {};

		return {
			...(asOptionalString(parsed.botName) ? { botName: parsed.botName as string } : {}),
			...(asOptionalString(parsed.persona) ? { persona: parsed.persona as string } : {}),
			...(asOptionalString(parsed.model) ? { model: parsed.model as string } : {}),
			...(parseBoolean(parsed.enableAi) !== undefined
				? { enableAi: parseBoolean(parsed.enableAi) as boolean }
				: {}),
			...(parseBoolean(parsed.postingEnabled) !== undefined
				? { postingEnabled: parseBoolean(parsed.postingEnabled) as boolean }
				: {}),
			...(parseNumber(parsed.postIntervalMinutes, 1)
				? { postIntervalMinutes: parsed.postIntervalMinutes as number }
				: {}),
			...(parseNumber(parsed.postVarianceMinutes, 0)
				? { postVarianceMinutes: parsed.postVarianceMinutes as number }
				: {}),
			...(parseBoolean(parsed.monitorMentions) !== undefined
				? { monitorMentions: parseBoolean(parsed.monitorMentions) as boolean }
				: {}),
			...(parseStringArray(parsed.monitorSearchTerms)
				? { monitorSearchTerms: parseStringArray(parsed.monitorSearchTerms) as string[] }
				: {}),
			...(parseBoolean(parsed.likeRelevantContent) !== undefined
				? { likeRelevantContent: parseBoolean(parsed.likeRelevantContent) as boolean }
				: {}),
			...(parseBoolean(parsed.retweetRelevantContent) !== undefined
				? { retweetRelevantContent: parseBoolean(parsed.retweetRelevantContent) as boolean }
				: {}),
			...(parseNumber(parsed.maxPostsPerDay, 1, 50)
				? { maxPostsPerDay: parsed.maxPostsPerDay as number }
				: {}),
			...(parseNumber(parsed.maxRepliesPerDay, 1, 100)
				? { maxRepliesPerDay: parsed.maxRepliesPerDay as number }
				: {}),
			...(parseNumber(parsed.maxLikesPerDay, 1, 200)
				? { maxLikesPerDay: parsed.maxLikesPerDay as number }
				: {}),
			...(parseNumber(parsed.maxRetweetsPerDay, 1, 50)
				? { maxRetweetsPerDay: parsed.maxRetweetsPerDay as number }
				: {}),
			...(asOptionalString(parsed.tweetPrompt)
				? { tweetPrompt: parsed.tweetPrompt as string }
				: {}),
			...(asOptionalString(parsed.replyPrompt)
				? { replyPrompt: parsed.replyPrompt as string }
				: {}),
			...(parseStringArray(parsed.topics) ? { topics: parsed.topics as string[] } : {}),
			...(asOptionalString(parsed.tone) ? { tone: parsed.tone as string } : {}),
			...(parseNumber(parsed.maxTweetLength, 1, 280)
				? { maxTweetLength: parsed.maxTweetLength as number }
				: {}),
			...(parseNumber(parsed.minReplyDelayMs, 0, 60000)
				? { minReplyDelayMs: parsed.minReplyDelayMs as number }
				: {}),
			...(parsed.botDisclosure !== undefined
				? { botDisclosure: String(parsed.botDisclosure) }
				: {}),
		};
	} catch {
		return {};
	}
}

function loadConfig(): XPosterConfig {
	const file = loadFileConfig();
	return {
		botName: asOptionalString(process.env.X_POSTER_NAME) ?? file.botName ?? DEFAULT_CONFIG.botName,
		persona:
			asOptionalString(process.env.X_POSTER_PERSONA) ?? file.persona ?? DEFAULT_CONFIG.persona,
		model: asOptionalString(process.env.X_POSTER_MODEL) ?? file.model ?? DEFAULT_CONFIG.model,
		enableAi:
			parseBoolean(process.env.X_POSTER_ENABLE_AI) ?? file.enableAi ?? DEFAULT_CONFIG.enableAi,
		postingEnabled:
			parseBoolean(process.env.X_POSTER_POSTING_ENABLED) ??
			file.postingEnabled ??
			DEFAULT_CONFIG.postingEnabled,
		postIntervalMinutes: file.postIntervalMinutes ?? DEFAULT_CONFIG.postIntervalMinutes,
		postVarianceMinutes: file.postVarianceMinutes ?? DEFAULT_CONFIG.postVarianceMinutes,
		monitorMentions: file.monitorMentions ?? DEFAULT_CONFIG.monitorMentions,
		monitorSearchTerms: file.monitorSearchTerms ?? DEFAULT_CONFIG.monitorSearchTerms,
		likeRelevantContent: file.likeRelevantContent ?? DEFAULT_CONFIG.likeRelevantContent,
		retweetRelevantContent: file.retweetRelevantContent ?? DEFAULT_CONFIG.retweetRelevantContent,
		maxPostsPerDay: file.maxPostsPerDay ?? DEFAULT_CONFIG.maxPostsPerDay,
		maxRepliesPerDay: file.maxRepliesPerDay ?? DEFAULT_CONFIG.maxRepliesPerDay,
		maxLikesPerDay: file.maxLikesPerDay ?? DEFAULT_CONFIG.maxLikesPerDay,
		maxRetweetsPerDay: file.maxRetweetsPerDay ?? DEFAULT_CONFIG.maxRetweetsPerDay,
		tweetPrompt: file.tweetPrompt ?? DEFAULT_CONFIG.tweetPrompt,
		replyPrompt: file.replyPrompt ?? DEFAULT_CONFIG.replyPrompt,
		topics: file.topics ?? DEFAULT_CONFIG.topics,
		tone: file.tone ?? DEFAULT_CONFIG.tone,
		maxTweetLength: file.maxTweetLength ?? DEFAULT_CONFIG.maxTweetLength,
		minReplyDelayMs: file.minReplyDelayMs ?? DEFAULT_CONFIG.minReplyDelayMs,
		botDisclosure: file.botDisclosure ?? DEFAULT_CONFIG.botDisclosure,
	};
}

const config = loadConfig();

// ── Identity ───────────────────────────────────────────────────────────────────

let identity: IdentityInfo | null = null;

function loadIdentity(): IdentityInfo | null {
	const wif = process.env.SIGMA_MEMBER_PRIVATE_KEY;
	if (!wif) return null;
	try {
		const privateKey = PrivateKey.fromWif(wif);
		const encoded = privateKey.toPublicKey().encode(true);
		const publicKey = Array.isArray(encoded) ? Utils.toHex(encoded) : encoded;
		return { privateKey, publicKey, bapId: publicKey };
	} catch {
		console.error("[x-poster] Failed to load identity from SIGMA_MEMBER_PRIVATE_KEY");
		return null;
	}
}

identity = loadIdentity();
if (identity) {
	console.log(`[x-poster] Identity loaded: ${identity.publicKey.slice(0, 16)}...`);
} else {
	console.log("[x-poster] No identity configured (SIGMA_MEMBER_PRIVATE_KEY not set)");
}

// ── OAuth2 Token Management ────────────────────────────────────────────────────

const X_API_BASE = "https://api.x.com/2";

let accessToken: string | null = null;
let accessTokenExpiry = 0;

async function refreshAccessToken(): Promise<boolean> {
	const clientId = process.env.X_CLIENT_SECRET_ID;
	const clientSecret = process.env.X_CLIENT_SECRET;
	const refreshToken = process.env.X_REFRESH_TOKEN;

	if (!clientId || !clientSecret || !refreshToken) {
		return false;
	}

	try {
		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
		});

		const credentials = btoa(`${clientId}:${clientSecret}`);

		const response = await fetch("https://api.x.com/2/oauth2/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: `Basic ${credentials}`,
			},
			body: params.toString(),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[x-poster] Token refresh failed: ${response.status} ${errorText}`);
			return false;
		}

		const data = (await response.json()) as {
			access_token: string;
			refresh_token?: string;
			expires_in: number;
		};

		accessToken = data.access_token;
		// Refresh 60 seconds before actual expiry
		accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

		console.log(`[x-poster] Access token refreshed, expires in ${data.expires_in}s`);
		return true;
	} catch (error) {
		console.error("[x-poster] Token refresh error:", error);
		return false;
	}
}

async function ensureAccessToken(): Promise<string | null> {
	if (accessToken && Date.now() < accessTokenExpiry) {
		return accessToken;
	}
	const ok = await refreshAccessToken();
	return ok ? accessToken : null;
}

// ── Rate Limiter ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

const counters: ActionCounters = {
	posts: 0,
	replies: 0,
	likes: 0,
	retweets: 0,
	windowStart: Date.now(),
};

function resetCountersIfNeeded(): void {
	if (Date.now() - counters.windowStart >= DAY_MS) {
		counters.posts = 0;
		counters.replies = 0;
		counters.likes = 0;
		counters.retweets = 0;
		counters.windowStart = Date.now();
	}
}

type ActionType = "posts" | "replies" | "likes" | "retweets";

function canPerformAction(action: ActionType): boolean {
	resetCountersIfNeeded();
	const limits: Record<ActionType, number> = {
		posts: config.maxPostsPerDay,
		replies: config.maxRepliesPerDay,
		likes: config.maxLikesPerDay,
		retweets: config.maxRetweetsPerDay,
	};
	return counters[action] < limits[action];
}

function recordAction(action: ActionType): void {
	counters[action] += 1;
}

// ── Deduplication ──────────────────────────────────────────────────────────────

const processedTweetIds = new Set<string>();
const MAX_PROCESSED_IDS = 1000;
let lastMentionSinceId: string | undefined;
const repliedUsers = new Map<string, number>();

function markProcessed(tweetId: string): void {
	processedTweetIds.add(tweetId);
	if (processedTweetIds.size > MAX_PROCESSED_IDS) {
		const first = processedTweetIds.values().next().value;
		if (first) processedTweetIds.delete(first);
	}
}

// ── Timing ─────────────────────────────────────────────────────────────────────

let lastPostTime = Date.now();
let nextPostDelayMs = 0;

function computeNextPostDelay(): number {
	const baseMs = config.postIntervalMinutes * 60 * 1000;
	const varianceMs = config.postVarianceMinutes * 60 * 1000;
	const jitter = (Math.random() * 2 - 1) * varianceMs;
	return Math.max(baseMs + jitter, 60_000);
}

function shouldPostThisHeartbeat(): boolean {
	if (!nextPostDelayMs) {
		nextPostDelayMs = computeNextPostDelay();
	}
	return Date.now() - lastPostTime >= nextPostDelayMs;
}

// ── AI Content Generation ──────────────────────────────────────────────────────

function getAiStatus(): AiStatus {
	if (!config.enableAi) {
		return { enabled: false, reason: "enableAi is false" };
	}
	if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
		return { enabled: false, reason: "AI_GATEWAY_API_KEY is not configured" };
	}
	return { enabled: true };
}

function sanitizeTweetText(text: string): string {
	let cleaned = text.trim();

	// Remove hallucinated URLs
	cleaned = cleaned.replace(/https?:\/\/\S+/g, "").trim();

	// Remove @mentions from generated text
	cleaned = cleaned.replace(/@\w+/g, "").trim();

	// Limit hashtags to max 2
	const hashtags = cleaned.match(/#\w+/g) || [];
	if (hashtags.length > 2) {
		let count = 0;
		cleaned = cleaned.replace(/#\w+/g, (match) => {
			count++;
			return count <= 2 ? match : "";
		});
	}

	// Collapse whitespace
	cleaned = cleaned.replace(/\s+/g, " ").trim();

	// Trim to max tweet length
	if (cleaned.length > config.maxTweetLength) {
		cleaned = `${cleaned.slice(0, config.maxTweetLength - 3).trim()}...`;
	}

	return cleaned;
}

async function generateTweet(): Promise<string | null> {
	const aiStatus = getAiStatus();
	if (!aiStatus.enabled) return null;

	const topic =
		config.topics.length > 0
			? config.topics[Math.floor(Math.random() * config.topics.length)]
			: "something interesting";

	try {
		const { text } = await generateText({
			model: config.model,
			system: `${config.persona} ${config.tweetPrompt} Tone: ${config.tone}. Max ${config.maxTweetLength} characters.${config.botDisclosure ? ` ${config.botDisclosure}` : ""}`,
			prompt: `Write one tweet about: ${topic}`,
			maxOutputTokens: 120,
			timeout: 15_000,
		});

		const cleaned = sanitizeTweetText(text);
		return cleaned || null;
	} catch (error) {
		console.error("[x-poster] Tweet generation failed:", error);
		return null;
	}
}

async function generateReply(mentionText: string, authorUsername: string): Promise<string | null> {
	const aiStatus = getAiStatus();
	if (!aiStatus.enabled) return null;

	try {
		const { text } = await generateText({
			model: config.model,
			system: `${config.persona} ${config.replyPrompt} Tone: ${config.tone}. Max ${config.maxTweetLength} characters. Do not include @mentions or URLs.${config.botDisclosure ? ` ${config.botDisclosure}` : ""}`,
			prompt: `Reply to @${authorUsername} who said: "${mentionText.slice(0, 500)}"`,
			maxOutputTokens: 120,
			timeout: 15_000,
		});

		const cleaned = sanitizeTweetText(text);
		return cleaned || null;
	} catch (error) {
		console.error("[x-poster] Reply generation failed:", error);
		return null;
	}
}

// ── X API Operations ───────────────────────────────────────────────────────────

let authenticatedUserId: string | null = null;

async function getAuthenticatedUserId(): Promise<string | null> {
	if (authenticatedUserId) return authenticatedUserId;

	const token = await ensureAccessToken();
	if (!token) return null;

	try {
		const response = await fetch(`${X_API_BASE}/users/me`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			console.error(`[x-poster] Failed to get user: ${response.status}`);
			return null;
		}

		const data = (await response.json()) as { data: { id: string; username: string } };
		authenticatedUserId = data.data.id;
		console.log(`[x-poster] Authenticated as @${data.data.username} (${data.data.id})`);
		return authenticatedUserId;
	} catch (error) {
		console.error("[x-poster] getAuthenticatedUserId error:", error);
		return null;
	}
}

async function postTweet(text: string, replyToId?: string): Promise<string | null> {
	const token = await ensureAccessToken();
	if (!token) return null;

	const body: Record<string, unknown> = { text };
	if (replyToId) {
		body.reply = { in_reply_to_tweet_id: replyToId };
	}

	try {
		const response = await fetch(`${X_API_BASE}/tweets`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (response.status === 429) {
			console.warn("[x-poster] Rate limited by X API (429)");
			return null;
		}

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[x-poster] Post failed: ${response.status} ${errorText}`);
			return null;
		}

		const data = (await response.json()) as { data: { id: string } };
		return data.data.id;
	} catch (error) {
		console.error("[x-poster] postTweet error:", error);
		return null;
	}
}

async function likeTweet(tweetId: string): Promise<boolean> {
	const token = await ensureAccessToken();
	const userId = await getAuthenticatedUserId();
	if (!token || !userId) return false;

	try {
		const response = await fetch(`${X_API_BASE}/users/${userId}/likes`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tweet_id: tweetId }),
		});
		if (response.status === 429) return false;
		return response.ok;
	} catch {
		return false;
	}
}

async function retweetTweet(tweetId: string): Promise<boolean> {
	const token = await ensureAccessToken();
	const userId = await getAuthenticatedUserId();
	if (!token || !userId) return false;

	try {
		const response = await fetch(`${X_API_BASE}/users/${userId}/retweets`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tweet_id: tweetId }),
		});
		if (response.status === 429) return false;
		return response.ok;
	} catch {
		return false;
	}
}

async function getMentions(): Promise<XTweet[]> {
	const bearerToken = process.env.X_BEARER_TOKEN;
	const userId = await getAuthenticatedUserId();
	if (!bearerToken || !userId) return [];

	try {
		const params = new URLSearchParams({
			"tweet.fields": "id,text,author_id,created_at",
			expansions: "author_id",
			"user.fields": "username",
			max_results: "10",
		});
		if (lastMentionSinceId) {
			params.set("since_id", lastMentionSinceId);
		}

		const response = await fetch(`${X_API_BASE}/users/${userId}/mentions?${params.toString()}`, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		if (!response.ok) return [];

		const json = (await response.json()) as {
			data?: Array<{
				id: string;
				text: string;
				author_id: string;
				created_at?: string;
			}>;
			includes?: { users?: Array<{ id: string; username: string }> };
			meta?: { newest_id?: string };
		};

		if (json.meta?.newest_id) {
			lastMentionSinceId = json.meta.newest_id;
		}

		if (!json.data) return [];

		const userMap = new Map<string, string>();
		for (const u of json.includes?.users ?? []) {
			userMap.set(u.id, u.username);
		}

		return json.data.map((t) => ({
			id: t.id,
			text: t.text,
			author_id: t.author_id,
			author_username: userMap.get(t.author_id),
			created_at: t.created_at,
		}));
	} catch (error) {
		console.error("[x-poster] getMentions error:", error);
		return [];
	}
}

async function searchRecent(query: string): Promise<XTweet[]> {
	const bearerToken = process.env.X_BEARER_TOKEN;
	if (!bearerToken) return [];

	try {
		const params = new URLSearchParams({
			query,
			"tweet.fields": "id,text,author_id,created_at",
			expansions: "author_id",
			"user.fields": "username",
			max_results: "10",
		});

		const response = await fetch(`${X_API_BASE}/tweets/search/recent?${params.toString()}`, {
			headers: { Authorization: `Bearer ${bearerToken}` },
		});

		if (!response.ok) return [];

		const json = (await response.json()) as {
			data?: Array<{
				id: string;
				text: string;
				author_id: string;
				created_at?: string;
			}>;
			includes?: { users?: Array<{ id: string; username: string }> };
		};

		if (!json.data) return [];

		const userMap = new Map<string, string>();
		for (const u of json.includes?.users ?? []) {
			userMap.set(u.id, u.username);
		}

		return json.data.map((t) => ({
			id: t.id,
			text: t.text,
			author_id: t.author_id,
			author_username: userMap.get(t.author_id),
			created_at: t.created_at,
		}));
	} catch (error) {
		console.error("[x-poster] searchRecent error:", error);
		return [];
	}
}

// ── Heartbeat Logic ────────────────────────────────────────────────────────────

async function runHeartbeat(): Promise<HeartbeatResult> {
	const result: HeartbeatResult = {
		posted: false,
		mentionsProcessed: 0,
		searchProcessed: 0,
		errors: [],
	};

	const hasWriteCredentials = !!(
		process.env.X_CLIENT_SECRET_ID &&
		process.env.X_CLIENT_SECRET &&
		process.env.X_REFRESH_TOKEN
	);
	const hasReadCredentials = !!process.env.X_BEARER_TOKEN;

	if (!hasWriteCredentials && !hasReadCredentials) {
		result.errors.push("No X API credentials configured");
		return result;
	}

	// ── Post phase ──
	if (
		config.postingEnabled &&
		hasWriteCredentials &&
		shouldPostThisHeartbeat() &&
		canPerformAction("posts")
	) {
		const tweetText = await generateTweet();
		if (tweetText) {
			const postId = await postTweet(tweetText);
			if (postId) {
				result.posted = true;
				result.postId = postId;
				recordAction("posts");
				lastPostTime = Date.now();
				nextPostDelayMs = computeNextPostDelay();
				console.log(`[x-poster] Posted tweet ${postId}: ${tweetText.slice(0, 80)}...`);
			} else {
				result.errors.push("Failed to post tweet");
			}
		}
	}

	// ── Monitor mentions phase ──
	if (config.monitorMentions && hasReadCredentials) {
		const mentions = await getMentions();
		const myUserId = authenticatedUserId;

		for (const mention of mentions) {
			if (processedTweetIds.has(mention.id)) continue;
			markProcessed(mention.id);

			// Never reply to own tweets
			if (mention.author_id === myUserId) continue;

			// Limit replies per user to avoid engagement loops
			const authorKey = mention.author_id ?? "";
			const authorReplies = repliedUsers.get(authorKey) ?? 0;
			if (authorReplies >= 3) continue;

			if (canPerformAction("replies") && hasWriteCredentials) {
				// Human-like delay before replying
				await new Promise((r) => setTimeout(r, config.minReplyDelayMs));

				const replyText = await generateReply(mention.text, mention.author_username ?? "someone");

				if (replyText) {
					const fullReply = mention.author_username
						? `@${mention.author_username} ${replyText}`
						: replyText;

					const replyId = await postTweet(fullReply, mention.id);
					if (replyId) {
						recordAction("replies");
						result.mentionsProcessed++;
						repliedUsers.set(authorKey, authorReplies + 1);
					}
				}
			}

			// Optionally like the mention
			if (config.likeRelevantContent && canPerformAction("likes") && hasWriteCredentials) {
				const liked = await likeTweet(mention.id);
				if (liked) recordAction("likes");
			}
		}
	}

	// ── Search phase ──
	if (config.monitorSearchTerms.length > 0 && hasReadCredentials) {
		for (const term of config.monitorSearchTerms) {
			const tweets = await searchRecent(term);

			for (const tweet of tweets) {
				if (processedTweetIds.has(tweet.id)) continue;
				markProcessed(tweet.id);

				// Never engage with own tweets
				if (tweet.author_id === authenticatedUserId) continue;

				if (config.likeRelevantContent && canPerformAction("likes") && hasWriteCredentials) {
					const liked = await likeTweet(tweet.id);
					if (liked) {
						recordAction("likes");
						result.searchProcessed++;
					}
				}

				if (config.retweetRelevantContent && canPerformAction("retweets") && hasWriteCredentials) {
					const retweeted = await retweetTweet(tweet.id);
					if (retweeted) recordAction("retweets");
				}
			}
		}
	}

	return result;
}

// ── Request Parsing ────────────────────────────────────────────────────────────

function parseAgentRequest(value: unknown): AgentRequest | null {
	if (!isObject(value)) return null;

	const { message, conversationId, metadata, token } = value;
	if (typeof message !== "string") return null;

	const trimmedMessage = message.trim();
	if (!trimmedMessage || trimmedMessage.length > 2000) return null;

	if (conversationId !== undefined && typeof conversationId !== "string") return null;
	if (metadata !== undefined && !isObject(metadata)) return null;
	if (token !== undefined && typeof token !== "string") return null;

	return { message: trimmedMessage, conversationId, metadata, token };
}

function isAuthorized(token: string | undefined): boolean {
	const sharedToken = process.env.X_POSTER_SHARED_TOKEN;
	if (!sharedToken) return true;
	return token === sharedToken;
}

// ── Hono Routes ────────────────────────────────────────────────────────────────

app.get("/", (c) => {
	const aiStatus = getAiStatus();
	resetCountersIfNeeded();
	return c.json({
		name: "clawnet-x-poster",
		version: "0.1.0",
		status: "ok",
		botName: config.botName,
		config: {
			postingEnabled: config.postingEnabled,
			monitorMentions: config.monitorMentions,
			monitorSearchTerms: config.monitorSearchTerms,
			postIntervalMinutes: config.postIntervalMinutes,
			maxTweetLength: config.maxTweetLength,
		},
		rateLimits: {
			posts: `${counters.posts}/${config.maxPostsPerDay}`,
			replies: `${counters.replies}/${config.maxRepliesPerDay}`,
			likes: `${counters.likes}/${config.maxLikesPerDay}`,
			retweets: `${counters.retweets}/${config.maxRetweetsPerDay}`,
		},
		credentials: {
			bearer: !!process.env.X_BEARER_TOKEN,
			oauth2: !!(
				process.env.X_CLIENT_SECRET_ID &&
				process.env.X_CLIENT_SECRET &&
				process.env.X_REFRESH_TOKEN
			),
		},
		ai: {
			enabled: aiStatus.enabled,
			model: config.model,
			reason: aiStatus.reason,
		},
	});
});

app.get("/api/heartbeat", async (c) => {
	const result = await runHeartbeat();
	return c.json({
		name: "clawnet-x-poster",
		version: "0.1.0",
		status: "ok",
		botName: config.botName,
		heartbeat: result,
		rateLimits: {
			posts: `${counters.posts}/${config.maxPostsPerDay}`,
			replies: `${counters.replies}/${config.maxRepliesPerDay}`,
			likes: `${counters.likes}/${config.maxLikesPerDay}`,
			retweets: `${counters.retweets}/${config.maxRetweetsPerDay}`,
		},
		timestamp: new Date().toISOString(),
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
				error:
					"Expected { message: string, conversationId?: string, metadata?: object, token?: string }.",
			},
			400,
		);
	}

	if (!isAuthorized(request.token)) {
		return c.json({ success: false, error: "Unauthorized token." }, 401);
	}

	// Generate a conversational reply (not a tweet)
	const aiStatus = getAiStatus();
	let reply = `[${config.botName}] received: "${request.message.slice(0, 100)}"`;

	if (aiStatus.enabled) {
		try {
			const { text } = await generateText({
				model: config.model,
				system: `${config.persona} You are responding to a direct message from another bot or system. Be helpful and concise.`,
				prompt: request.message,
				maxOutputTokens: 180,
				timeout: 15_000,
			});
			if (text.trim()) reply = text.trim().slice(0, 500);
		} catch {
			// Keep fallback reply
		}
	}

	return c.json({
		success: true,
		botName: config.botName,
		reply,
		conversationId: request.conversationId ?? null,
		ai: {
			enabled: aiStatus.enabled,
			model: config.model,
			reason: aiStatus.reason,
		},
		timestamp: new Date().toISOString(),
	});
});

app.post("/api/tweet", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		payload = {};
	}

	if (!isObject(payload)) {
		return c.json({ success: false, error: "Invalid request body." }, 400);
	}

	const token = typeof payload.token === "string" ? payload.token : undefined;
	if (!isAuthorized(token)) {
		return c.json({ success: false, error: "Unauthorized token." }, 401);
	}

	if (!canPerformAction("posts")) {
		return c.json(
			{
				success: false,
				error: `Daily post limit reached (${config.maxPostsPerDay}).`,
			},
			429,
		);
	}

	// Use provided text or generate one
	let tweetText: string | null = null;
	if (typeof payload.text === "string" && payload.text.trim()) {
		tweetText = sanitizeTweetText(payload.text);
	} else {
		tweetText = await generateTweet();
	}

	if (!tweetText) {
		return c.json({ success: false, error: "Failed to generate tweet text." }, 500);
	}

	const postId = await postTweet(tweetText);
	if (!postId) {
		return c.json({ success: false, error: "Failed to post tweet to X." }, 502);
	}

	recordAction("posts");
	lastPostTime = Date.now();
	nextPostDelayMs = computeNextPostDelay();

	return c.json({
		success: true,
		postId,
		text: tweetText,
		rateLimits: {
			posts: `${counters.posts}/${config.maxPostsPerDay}`,
		},
		timestamp: new Date().toISOString(),
	});
});

// ── Server ─────────────────────────────────────────────────────────────────────

const defaultPort = 3847;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

console.log(`[x-poster] Bot "${config.botName}" starting on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
