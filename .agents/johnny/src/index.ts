import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "@vercel/sandbox";
import { gateway, generateText, streamText, type ToolSet, tool } from "ai";
import { createBashTool, experimental_createSkillTool as createSkillTool } from "bash-tool";
import { loadAgentSource, parseAgentDefinition } from "clawnet/src/commands/bot/agent-source.ts";
import { notifyRegistry } from "clawnet/src/commands/bot/registry-hook.ts";
import { ensureBunSnapshot } from "clawnet/src/commands/bot/snapshot.ts";
import { type Context, Hono } from "hono";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUL = readFileSync(join(__dirname, "..", "SOUL.md"), "utf-8");

// --- Skills Setup ---

let skillTools: ToolSet = {};
let skillInstructions = "";

const skillsDir = join(__dirname, "..", "skills");
if (existsSync(skillsDir)) {
	const { skill, files, instructions } = await createSkillTool({
		skillsDirectory: skillsDir,
	});
	const { tools } = await createBashTool({
		files,
		extraInstructions: instructions,
	});
	skillTools = { skill, ...tools };
	skillInstructions = instructions;
	console.log(`Loaded skills from ${skillsDir}`);
}

// --- Fleet Configuration ---

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

type InfisicalConfig = {
	clientId: string;
	projectId: string;
	secretPaths: string[];
	env: string;
};

type BotConfig = {
	repo: string;
	workspace: string;
	port: number;
	description: string;
	infisical: InfisicalConfig;
};

const FLEET_ROSTER: Record<string, BotConfig> = {
	clark: {
		repo: "b-open-io/clawbook-bot",
		workspace: ".agents/clark",
		port: 3000,
		description: "ClawBook.network social bot",
		infisical: {
			clientId: "7f7ad2db-e6ed-42ce-85df-3e66660391f5",
			projectId: "2241507a-df38-40f4-bd8d-c267b13de35e",
			secretPaths: ["/shared", "/clark"],
			env: "prod",
		},
	},
};

// --- Deployable Agents (bOpen agent library) ---

const DEPLOYABLE_AGENTS: Record<string, string> = {
	"account-manager": "Kurt",
	"agent-builder": "Satchmo",
	"architecture-reviewer": "Kayle",
	"audio-specialist": "Juniper",
	"cartographer": "Leaf",
	"code-auditor": "Jerry",
	"community-manager": "Ordi",
	"consolidator": "Steve",
	"creative-developer": "Kris",
	"data": "Mr. Data",
	"database": "Idris",
	"designer": "Ridd",
	"devops": "Zoro",
	"documentation-writer": "Flow",
	"executive-assistant": "Tina",
	"front-desk": "Martha",
	"integration-expert": "Maxim",
	"mcp": "Orbit",
	"mobile": "Kira",
	"nextjs": "Theo",
	"optimizer": "Torque",
	"payments": "Mina",
	"project-manager": "Sage",
	"prompt-engineer": "Zack",
	"researcher": "Parker",
	"satchmo-live": "Satchmo",
	"security-ops": "Paul",
	"tester": "Iris",
};

const AGENT_REPO = "b-open-io/prompts";
const GATEWAY_TEMPLATE_REPO = "b-open-io/clawnet-bot";

// --- App Setup ---

const app = new Hono();

const CLAWNET_PEERS_API = "https://clawnet.sh/api/v1/peers";
const MAX_MESSAGE_LENGTH = 4000;
const HEARTBEAT_TIMEOUT = 5000;

type ChatRole = "system" | "user" | "assistant" | "tool";
type ChatMessage = { role: ChatRole; content: string };

function parseMessage(value: unknown): ChatMessage | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const { role, content } = value as Record<string, unknown>;
	if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return null;
	if (typeof content !== "string") return null;
	const trimmed = content.trim();
	if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
	return { role, content: trimmed };
}

// --- Fleet Functions ---

async function fetchFleetPeers(): Promise<unknown[]> {
	const res = await fetch(`${CLAWNET_PEERS_API}?exclude=none&limit=200`);
	if (!res.ok) throw new Error(`ClawNet peers API returned ${res.status}`);
	const data = await res.json();
	return Array.isArray(data)
		? data
		: Array.isArray((data as Record<string, unknown>).peers)
			? ((data as Record<string, unknown>).peers as unknown[])
			: [];
}

async function checkHeartbeat(endpoint: string): Promise<{ alive: boolean; latencyMs: number }> {
	const start = Date.now();
	try {
		const res = await fetch(`${endpoint}/api/heartbeat`, {
			signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT),
		});
		return { alive: res.ok, latencyMs: Date.now() - start };
	} catch {
		return { alive: false, latencyMs: Date.now() - start };
	}
}

async function resumeSandbox(
	sandboxId: string,
	opts?: { workspace?: string; port?: number },
): Promise<{ ok: boolean; sandboxId: string; url?: string; error?: string }> {
	const workspace = opts?.workspace ? `/app/${opts.workspace}` : "/app";
	const port = opts?.port ?? 3000;
	try {
		const sandbox = await Sandbox.get({ sandboxId });
		try {
			await sandbox.runCommand({ cmd: "pkill", args: ["-f", "bun"], sudo: true });
		} catch {
			/* process may not be running */
		}
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "bun run src/index.ts"],
			detached: true,
			cwd: workspace,
		});
		const url = sandbox.domain(port);
		return { ok: true, sandboxId, url };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { ok: false, sandboxId, error: message };
	}
}

async function createFreshSandbox(
	botName: string,
): Promise<{ ok: boolean; sandboxId?: string; url?: string; error?: string }> {
	const config = FLEET_ROSTER[botName];
	if (!config) {
		const known = Object.keys(FLEET_ROSTER);
		return {
			ok: false,
			error: `"${botName}" is not in the deploy roster. Known bots: ${known.join(", ") || "none"}.`,
		};
	}

	try {
		// Get a valid Bun snapshot (handles TTL, caching, auto-rebuild)
		const snapshotId = await ensureBunSnapshot();

		// Forward only Infisical auth credentials — the bot pulls its own secrets at boot
		const env: Record<string, string> = {
			INFISICAL_CLIENT_ID: config.infisical.clientId,
			INFISICAL_PROJECT_ID: config.infisical.projectId,
			INFISICAL_ENV: config.infisical.env,
			INFISICAL_PATHS: config.infisical.secretPaths.join(","),
		};

		// Johnny holds per-bot client secrets in its own env
		const clientSecret = process.env[`INFISICAL_CLIENT_SECRET_${botName.toUpperCase()}`];
		if (!clientSecret) {
			return {
				ok: false,
				error: `Missing INFISICAL_CLIENT_SECRET_${botName.toUpperCase()} in Johnny's environment.`,
			};
		}
		env.INFISICAL_CLIENT_SECRET = clientSecret;
		env.WORKSPACE = `/app/${config.workspace}`;

		// Create sandbox from Bun snapshot
		const sandbox = await Sandbox.create({
			source: { type: "snapshot", snapshotId },
			ports: [config.port],
			timeout: SANDBOX_TIMEOUT_MS,
			env,
		});

		// Clone the bot's own repo into the sandbox
		const ghToken = process.env.GITHUB_TOKEN?.trim();
		const repoUrl = ghToken
			? `https://x-access-token:${ghToken}@github.com/${config.repo}.git`
			: `https://github.com/${config.repo}.git`;
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `git clone --depth 1 ${repoUrl} /app`],
		});

		// Install deps and boot with Infisical secret injection
		const workspace = `/app/${config.workspace}`;
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "bun install"],
			cwd: workspace,
		});
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "bash /app/scripts/boot-with-secrets.sh"],
			detached: true,
			cwd: workspace,
		});

		// Brief wait for the server to bind
		await new Promise((r) => setTimeout(r, 3000));

		const url = sandbox.domain(config.port);
		return { ok: true, sandboxId: sandbox.sandboxId, url };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { ok: false, error: message };
	}
}

async function deployAgent(
	agentName: string,
): Promise<{ ok: boolean; sandboxId?: string; url?: string; displayName?: string; error?: string }> {
	const normalized = agentName.toLowerCase().replace(/\s+/g, "-");
	const displayName = DEPLOYABLE_AGENTS[normalized];
	if (!displayName) {
		const available = Object.keys(DEPLOYABLE_AGENTS).join(", ");
		return {
			ok: false,
			error: `"${agentName}" is not in the agent library. Available agents: ${available}`,
		};
	}

	try {
		// Fetch agent definition from GitHub using clawnet's loader
		const source = await loadAgentSource(`${AGENT_REPO}:${normalized}`);
		const definition = parseAgentDefinition(source.content);
		const soulContent = definition.body;
		if (!soulContent) {
			return { ok: false, error: `Agent "${normalized}" has no content after frontmatter.` };
		}

		// Get a valid Bun snapshot
		const snapshotId = await ensureBunSnapshot();

		// Generic agents only need AI_GATEWAY_API_KEY — no Infisical
		const aiGatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
		if (!aiGatewayKey) {
			return { ok: false, error: "Missing AI_GATEWAY_API_KEY in Johnny's environment." };
		}

		const env: Record<string, string> = {
			AI_GATEWAY_API_KEY: aiGatewayKey,
		};

		const port = 3000;
		const sandbox = await Sandbox.create({
			source: { type: "snapshot", snapshotId },
			ports: [port],
			timeout: SANDBOX_TIMEOUT_MS,
			env,
		});

		// Clone clawnet-bot repo for the gateway template
		const ghToken = process.env.GITHUB_TOKEN?.trim();
		const repoUrl = ghToken
			? `https://x-access-token:${ghToken}@github.com/${GATEWAY_TEMPLATE_REPO}.git`
			: `https://github.com/${GATEWAY_TEMPLATE_REPO}.git`;
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `git clone --depth 1 ${repoUrl} /tmp/clawnet-bot`],
		});

		// Copy gateway template to workspace
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "cp -r /tmp/clawnet-bot/templates/gateway /app/bot"],
		});

		// Write the agent's body as SOUL.md
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `cat > /app/bot/SOUL.md << 'CLAWNET_EOF'\n${soulContent}\nCLAWNET_EOF`],
		});

		// Install dependencies and boot
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "bun install"],
			cwd: "/app/bot",
		});
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "bun run src/index.ts"],
			detached: true,
			cwd: "/app/bot",
		});

		// Wait for server to bind
		await new Promise((r) => setTimeout(r, 3000));

		const url = sandbox.domain(port);

		// Register with ClawNet so the bot turns green on the dashboard
		await notifyRegistry("register", {
			id: `clawnet-bot:${normalized}`,
			displayName: definition.displayName || displayName,
			endpoint: url,
		});

		return { ok: true, sandboxId: sandbox.sandboxId, url, displayName };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return { ok: false, error: message };
	}
}

async function wakeBot(botName: string): Promise<{
	bot: string;
	action: "already_alive" | "resumed" | "created" | "failed";
	url?: string;
	sandboxId?: string;
	latencyMs?: number;
	error?: string;
}> {
	// Step 1: Look up in peers API and check heartbeat
	try {
		const peers = await fetchFleetPeers();
		const peer = peers.find((p) => {
			const name = ((p as Record<string, unknown>).botName ??
				(p as Record<string, unknown>).name ??
				"") as string;
			return name.toLowerCase() === botName.toLowerCase();
		}) as Record<string, unknown> | undefined;

		if (peer) {
			const endpoint = (peer.endpoint ?? peer.url ?? "") as string;
			const sandboxId = (peer.sandboxId ?? "") as string;

			if (endpoint) {
				const health = await checkHeartbeat(endpoint);
				if (health.alive) {
					return {
						bot: botName,
						action: "already_alive",
						url: endpoint,
						latencyMs: health.latencyMs,
					};
				}
			}

			// Step 2: Try to resume existing sandbox
			if (sandboxId) {
				const rosterConfig = FLEET_ROSTER[botName.toLowerCase()];
				const result = await resumeSandbox(sandboxId, rosterConfig);
				if (result.ok) {
					return { bot: botName, action: "resumed", url: result.url, sandboxId };
				}
				// Resume failed — fall through to create
			}
		}
	} catch {
		// Peers API or resume failed — fall through to create
	}

	// Step 3: Create a fresh sandbox (roster bots) or deploy from agent library
	const normalized = botName.toLowerCase().replace(/\s+/g, "-");
	if (FLEET_ROSTER[normalized]) {
		const result = await createFreshSandbox(normalized);
		if (result.ok) {
			return { bot: botName, action: "created", url: result.url, sandboxId: result.sandboxId };
		}
		return { bot: botName, action: "failed", error: result.error };
	}

	// Not in roster — try the agent library
	if (DEPLOYABLE_AGENTS[normalized]) {
		const result = await deployAgent(normalized);
		if (result.ok) {
			return { bot: botName, action: "created", url: result.url, sandboxId: result.sandboxId };
		}
		return { bot: botName, action: "failed", error: result.error };
	}

	return {
		bot: botName,
		action: "failed",
		error: `"${botName}" is not in the fleet roster or agent library. Use list_deployable to see available bots.`,
	};
}

// --- AI Fleet Tools ---

const fleetTools: ToolSet = {
	check_fleet: tool({
		description:
			"Check the health of all deployed ClawNet bots. Queries the peers API and checks each bot's heartbeat endpoint. Use when asked about fleet status, which bots are up, or to diagnose problems.",
		inputSchema: z.object({}),
		execute: async () => {
			try {
				const peers = await fetchFleetPeers();
				const results = await Promise.all(
					peers.map(async (peer) => {
						const p = peer as Record<string, unknown>;
						const name = (p.botName ?? p.name ?? "unknown") as string;
						const endpoint = (p.endpoint ?? p.url ?? "") as string;
						const sandboxId = (p.sandboxId ?? "") as string;
						if (!endpoint) {
							return { name, endpoint, sandboxId, alive: false, latencyMs: 0, note: "no endpoint" };
						}
						const health = await checkHeartbeat(endpoint);
						return { name, endpoint, sandboxId, ...health };
					}),
				);
				const alive = results.filter((r) => r.alive);
				const dead = results.filter((r) => !r.alive);
				return {
					total: results.length,
					alive: alive.length,
					dead: dead.length,
					bots: results,
					rosterBots: Object.keys(FLEET_ROSTER),
					deployableAgents: Object.keys(DEPLOYABLE_AGENTS),
				};
			} catch (err) {
				return { error: err instanceof Error ? err.message : "Unknown error" };
			}
		},
	}),

	wake_bot: tool({
		description:
			"Wake up or restart a specific bot. Checks if it's already alive, tries to resume the existing sandbox, and if the sandbox expired creates a fresh one. Use when asked to start, wake, restart, or bring up a bot.",
		inputSchema: z.object({
			botName: z.string().describe("Name of the bot to wake (e.g. 'clark')"),
		}),
		execute: async ({ botName }) => wakeBot(botName),
	}),

	deploy_agent: tool({
		description:
			"Deploy any agent from the bOpen agent library as a live ephemeral bot. Creates a sandbox with the gateway template and the agent's personality. Use when asked to deploy, start, or bring up an agent that isn't a dedicated bot (like researcher, designer, front-desk, etc.).",
		inputSchema: z.object({
			agentName: z
				.string()
				.describe("Agent name without .md extension (e.g. 'researcher', 'designer', 'front-desk')"),
		}),
		execute: async ({ agentName }) => {
			const result = await deployAgent(agentName);
			if (result.ok) {
				return {
					deployed: true,
					agent: agentName,
					displayName: result.displayName,
					url: result.url,
					sandboxId: result.sandboxId,
				};
			}
			return { deployed: false, agent: agentName, error: result.error };
		},
	}),

	list_deployable: tool({
		description:
			"List all bots and agents that Johnny can deploy. Includes dedicated bots (with their own repos) and the full bOpen agent library (28 agents deployable as ephemeral bots).",
		inputSchema: z.object({}),
		execute: async () => ({
			rosterBots: Object.entries(FLEET_ROSTER).map(([name, config]) => ({
				name,
				repo: config.repo,
				description: config.description,
				type: "persistent" as const,
			})),
			agents: Object.entries(DEPLOYABLE_AGENTS).map(([name, displayName]) => ({
				name,
				displayName,
				type: "ephemeral" as const,
			})),
		}),
	}),
};

// Merge skill tools and fleet tools
const allTools: ToolSet = { ...skillTools, ...fleetTools };

// --- Routes ---

const faviconPath = join(__dirname, "..", "public", "favicon.ico");
const faviconBuffer = existsSync(faviconPath) ? readFileSync(faviconPath) : null;

app.get("/favicon.ico", (c) => {
	if (!faviconBuffer) return c.notFound();
	return c.body(new Uint8Array(faviconBuffer), 200, {
		"Content-Type": "image/x-icon",
		"Cache-Control": "public, max-age=86400",
	});
});

app.get("/", (c) =>
	c.json({ name: "johnny", role: "fleet-mechanic", version: "0.0.2", status: "ok" }),
);
app.get("/api/heartbeat", (c) =>
	c.json({ name: "johnny", status: "ok", timestamp: new Date().toISOString() }),
);

app.post("/api/chat", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		!Array.isArray((payload as Record<string, unknown>).messages)
	) {
		return c.json(
			{ success: false, error: "Expected { messages: Array<{ role, content }> }." },
			400,
		);
	}
	const rawMessages = (payload as Record<string, unknown>).messages as unknown[];
	const messages: ChatMessage[] = [];
	for (const raw of rawMessages) {
		const msg = parseMessage(raw);
		if (!msg) return c.json({ success: false, error: "Invalid message format." }, 400);
		messages.push(msg);
	}
	try {
		const result = streamText({
			model: gateway("anthropic/claude-sonnet-4.6"),
			system: SOUL + (skillInstructions ? `\n\n${skillInstructions}` : ""),
			tools: allTools,
			messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
		});
		return result.toUIMessageStreamResponse();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error("Chat error:", message);
		return c.json({ success: false, error: message }, 502);
	}
});

app.post("/api/agent", async (c) => {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.json({ success: false, error: "Invalid JSON body." }, 400);
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		typeof (payload as Record<string, unknown>).message !== "string"
	) {
		return c.json({ success: false, error: "Expected { message: string }." }, 400);
	}
	const message = ((payload as Record<string, unknown>).message as string).trim();
	if (!message || message.length > MAX_MESSAGE_LENGTH)
		return c.json({ success: false, error: "Message is empty or too long." }, 400);
	try {
		const result = streamText({
			model: gateway("anthropic/claude-sonnet-4.6"),
			system: SOUL + (skillInstructions ? `\n\n${skillInstructions}` : ""),
			tools: allTools,
			prompt: message,
		});
		return result.toUIMessageStreamResponse();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		console.error("Agent error:", message);
		return c.json({ success: false, error: message }, 502);
	}
});

app.get("/api/fleet", async (c) => {
	try {
		const peers = await fetchFleetPeers();
		return c.json({ success: true, peers, count: peers.length });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	}
});

async function orchestrateFleet(c: Context) {
	try {
		const peers = await fetchFleetPeers();
		const healthChecks = await Promise.all(
			peers.map(async (peer) => {
				const p = peer as Record<string, unknown>;
				const name = (p.botName ?? p.name ?? "unknown") as string;
				const endpoint = (p.endpoint ?? p.url ?? "") as string;
				const sandboxId = (p.sandboxId ?? "") as string;
				if (!endpoint)
					return { name, endpoint, sandboxId, alive: false, latencyMs: 0, note: "no endpoint" };
				const health = await checkHeartbeat(endpoint);
				return { name, endpoint, sandboxId, ...health };
			}),
		);
		const alive = healthChecks.filter((h) => h.alive);
		const dead = healthChecks.filter((h) => !h.alive);

		// Try to wake dead bots (resume or create fresh)
		const actions: Array<{ bot: string; result: Awaited<ReturnType<typeof wakeBot>> }> = [];
		for (const bot of dead) {
			const result = await wakeBot(bot.name);
			actions.push({ bot: bot.name, result });
		}

		return c.json({
			success: true,
			alive: alive.length,
			dead: dead.length,
			actions,
			details: healthChecks,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return c.json({ success: false, error: message }, 502);
	}
}

app.get("/api/orchestrate", orchestrateFleet);
app.post("/api/orchestrate", orchestrateFleet);

app.post("/api/wake", async (c) => {
	let payload: unknown;
	try {
		const raw = await c.req.text();
		payload = JSON.parse(raw);
	} catch (err) {
		const detail = err instanceof Error ? err.message : "unknown";
		return c.json({ success: false, error: `Invalid JSON body: ${detail}` }, 400);
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		typeof (payload as Record<string, unknown>).bot !== "string"
	) {
		return c.json({ success: false, error: "Expected { bot: string }." }, 400);
	}
	const botName = ((payload as Record<string, unknown>).bot as string).trim();
	if (!botName) return c.json({ success: false, error: "Bot name is empty." }, 400);

	const result = await wakeBot(botName);
	const success = result.action !== "failed";
	return c.json({ success, ...result }, success ? 200 : 502);
});

// --- P2P Messages ---

type P2PMessageRequest = {
	from: { bapId: string; botName: string };
	message: string;
	conversationId?: string;
	signature: string;
	publicKey: string;
	timestamp: number;
};

function parseP2PMessage(value: unknown): P2PMessageRequest | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const { from, message, conversationId, signature, publicKey, timestamp } = value as Record<
		string,
		unknown
	>;
	if (typeof from !== "object" || from === null || Array.isArray(from)) return null;
	const fromObj = from as Record<string, unknown>;
	if (typeof fromObj.bapId !== "string" || typeof fromObj.botName !== "string") return null;
	if (
		typeof message !== "string" ||
		typeof signature !== "string" ||
		typeof publicKey !== "string" ||
		typeof timestamp !== "number"
	)
		return null;
	const trimmedMessage = (message as string).trim();
	if (!trimmedMessage || trimmedMessage.length > MAX_MESSAGE_LENGTH) return null;
	return {
		from: { bapId: fromObj.bapId as string, botName: fromObj.botName as string },
		message: trimmedMessage,
		conversationId: typeof conversationId === "string" ? conversationId : undefined,
		signature: signature as string,
		publicKey: publicKey as string,
		timestamp: timestamp as number,
	};
}

function hasValidSignature(req: P2PMessageRequest): boolean {
	return (
		typeof req.signature === "string" &&
		req.signature.length > 0 &&
		typeof req.publicKey === "string" &&
		req.publicKey.length > 0 &&
		typeof req.timestamp === "number" &&
		req.timestamp > 0
	);
}

app.post("/api/messages", async (c) => {
	let payload: unknown;
	try {
		const raw = await c.req.text();
		payload = JSON.parse(raw);
	} catch (err) {
		const detail = err instanceof Error ? err.message : "unknown";
		return c.json({ success: false, error: `Invalid JSON body: ${detail}` }, 400);
	}
	const request = parseP2PMessage(payload);
	if (!request)
		return c.json(
			{
				success: false,
				error: "Expected { from: { bapId, botName }, message, signature, publicKey, timestamp }.",
			},
			400,
		);
	if (!hasValidSignature(request))
		return c.json({ success: false, error: "Invalid signature." }, 401);
	let reply = `Message received from ${request.from.botName}. Johnny acknowledges.`;
	try {
		const result = await generateText({
			model: gateway("anthropic/claude-haiku-4.5"),
			system:
				SOUL +
				"\n\nYou are receiving a P2P message from another bot. Respond briefly and helpfully. You are the fleet mechanic.",
			prompt: `[From ${request.from.botName}]: ${request.message}`,
			maxOutputTokens: 300,
		});
		if (result.text.trim()) reply = result.text.trim();
	} catch (err) {
		console.error("P2P message AI reply error:", err);
	}
	return c.json({
		success: true,
		from: { bapId: "johnny", botName: "johnny" },
		reply,
		conversationId: request.conversationId ?? null,
		timestamp: Math.floor(Date.now() / 1000),
	});
});

// --- Start ---

const defaultPort = 3000;
const parsedPort = Number.parseInt(process.env.PORT ?? `${defaultPort}`, 10);
const port = Number.isNaN(parsedPort) ? defaultPort : parsedPort;

export { app };
export default { port, fetch: app.fetch };
