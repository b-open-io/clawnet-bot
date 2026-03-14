import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "@vercel/sandbox";
import { gateway, generateText, streamText, type ToolSet, tool } from "ai";
import { createBashTool, experimental_createSkillTool as createSkillTool } from "bash-tool";
import {
	loadAgentSource,
	loadBotDefinition,
	parseAgentDefinition,
	resolveAgentSkillInstalls,
} from "clawnet/src/commands/bot/agent-source.js";
import { notifyRegistry } from "clawnet/src/commands/bot/registry-hook.js";
import { ensureBunSnapshot } from "clawnet/src/commands/bot/snapshot.js";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { installSkillsInSandbox, resolveTemplateSource } from "./deploy-utils.js";

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

const fleetConfigPath = join(__dirname, "..", "config", "fleet.json");
const fleetRoster: Record<string, BotConfig> = existsSync(fleetConfigPath)
	? JSON.parse(readFileSync(fleetConfigPath, "utf-8"))
	: {};

// --- Dynamic Agent Discovery (marketplace-driven, no hard-coded lists) ---

const MARKETPLACE_URL =
	"https://raw.githubusercontent.com/b-open-io/claude-plugins/master/.claude-plugin/marketplace.json";
const GATEWAY_TEMPLATE_REPO = process.env.GATEWAY_TEMPLATE_REPO ?? "b-open-io/clawnet-bot";

type MarketplacePlugin = { name?: string; source?: { url?: string } };
type DiscoveredAgent = { name: string; plugin: string; ref: string };

async function fetchPluginRepoMap(): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	try {
		const res = await fetch(MARKETPLACE_URL, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return map;
		const json = (await res.json()) as { plugins?: MarketplacePlugin[] };
		for (const plugin of json.plugins ?? []) {
			const name = plugin.name?.trim();
			const url = plugin.source?.url?.trim();
			if (!name || !url) continue;
			const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
			if (match) map.set(name, `${match[1]}/${match[2]}`);
		}
	} catch {
		/* marketplace unavailable */
	}
	return map;
}

async function discoverAgents(): Promise<DiscoveredAgent[]> {
	const pluginMap = await fetchPluginRepoMap();
	const agents: DiscoveredAgent[] = [];
	const ghToken = process.env.GITHUB_TOKEN?.trim();
	const headers: Record<string, string> = ghToken
		? { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" }
		: { Accept: "application/vnd.github.v3+json" };

	const fetches = [...pluginMap.entries()].map(async ([pluginName, repoRef]) => {
		const [owner, repo] = repoRef.split("/");
		if (!owner || !repo) return;
		try {
			const url = `https://api.github.com/repos/${owner}/${repo}/contents/agents`;
			const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
			if (!res.ok) return;
			const entries = (await res.json()) as Array<{ name: string; type: string }>;
			for (const entry of entries) {
				if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
				const agentName = entry.name.replace(/\.md$/, "");
				agents.push({ name: agentName, plugin: pluginName, ref: `${repoRef}:${agentName}` });
			}
		} catch {
			/* skip unreachable repos */
		}
	});

	await Promise.all(fetches);
	return agents;
}

async function resolveAgentRef(name: string): Promise<{ ref: string; plugin: string } | null> {
	const normalized = name.toLowerCase().replace(/\s+/g, "-");
	if (normalized.includes("/") && normalized.includes(":")) {
		return { ref: normalized, plugin: "direct" };
	}
	const agents = await discoverAgents();
	const match = agents.find((a) => a.name === normalized);
	return match ? { ref: match.ref, plugin: match.plugin } : null;
}

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
	const config = fleetRoster[botName];
	if (!config) {
		const known = Object.keys(fleetRoster);
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

async function deployAgent(agentName: string): Promise<{
	ok: boolean;
	sandboxId?: string;
	url?: string;
	displayName?: string;
	error?: string;
}> {
	const normalized = agentName.toLowerCase().replace(/\s+/g, "-");

	// Resolve dynamically from marketplace — searches all plugin repos
	const resolved = await resolveAgentRef(normalized);
	if (!resolved) {
		return {
			ok: false,
			error: `Could not find agent "${agentName}" in any plugin repo. Use list_agents to see available agents.`,
		};
	}

	try {
		// Fetch agent definition from GitHub using clawnet's loader
		const source = await loadAgentSource(resolved.ref);
		const definition = parseAgentDefinition(source.content);
		const soulContent = definition.body;
		if (!soulContent) {
			return { ok: false, error: `Agent "${normalized}" has no content after frontmatter.` };
		}

		// Load bot definition for template preferences (optional — most agents don't have one)
		const botDef = await loadBotDefinition(source, definition.name);

		// Resolve skills from agent frontmatter tools field
		const { installs: skillInstalls, unresolved: unresolvedSkills } =
			await resolveAgentSkillInstalls(source, definition.skillRefs);

		if (unresolvedSkills.length > 0) {
			console.warn(
				`[deployAgent] Unresolved skills for ${normalized}: ${unresolvedSkills.join(", ")}`,
			);
		}

		// Determine which template to use
		const defaultPath = "templates/gateway";
		const template = resolveTemplateSource(botDef, GATEWAY_TEMPLATE_REPO, defaultPath);

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

		// Clone template repo
		const ghToken = process.env.GITHUB_TOKEN?.trim();
		const templateRepoUrl = ghToken
			? `https://x-access-token:${ghToken}@github.com/${template.repo}.git`
			: `https://github.com/${template.repo}.git`;
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `git clone --depth 1 ${templateRepoUrl} /tmp/template-repo`],
		});

		// Copy template to workspace
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `cp -r /tmp/template-repo/${template.path} /app/bot`],
		});

		// Write the agent's body as SOUL.md
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", `cat > /app/bot/SOUL.md << 'CLAWNET_EOF'\n${soulContent}\nCLAWNET_EOF`],
		});

		// Install resolved skills into /app/bot/skills/
		if (skillInstalls.length > 0) {
			const { installed, skipped } = await installSkillsInSandbox(
				sandbox,
				skillInstalls,
				"/app/bot",
				ghToken,
			);
			if (installed.length > 0) {
				console.log(`[deployAgent] Installed ${installed.length} skills: ${installed.join(", ")}`);
			}
			if (skipped.length > 0) {
				console.warn(`[deployAgent] Skipped ${skipped.length} skills: ${skipped.join(", ")}`);
			}
		}

		// Cleanup template repo
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", "rm -rf /tmp/template-repo"],
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
		const displayName = definition.displayName || definition.name || normalized;
		await notifyRegistry("register", {
			id: `clawnet-bot:${normalized}`,
			displayName,
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
				const rosterConfig = fleetRoster[botName.toLowerCase()];
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

	// Step 3: Create a fresh sandbox (fleet bots with dedicated config) or deploy from marketplace
	const normalized = botName.toLowerCase().replace(/\s+/g, "-");
	if (fleetRoster[normalized]) {
		const result = await createFreshSandbox(normalized);
		if (result.ok) {
			return { bot: botName, action: "created", url: result.url, sandboxId: result.sandboxId };
		}
		return { bot: botName, action: "failed", error: result.error };
	}

	// Not in fleet config — try to deploy dynamically from any plugin repo
	const agentResult = await deployAgent(normalized);
	if (agentResult.ok) {
		return {
			bot: botName,
			action: "created",
			url: agentResult.url,
			sandboxId: agentResult.sandboxId,
		};
	}

	return { bot: botName, action: "failed", error: agentResult.error };
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
					fleetBots: Object.keys(fleetRoster),
				};
			} catch (err) {
				return { error: err instanceof Error ? err.message : "Unknown error" };
			}
		},
	}),

	wake_bot: tool({
		description:
			"Wake up, deploy, or restart any bot or agent. Checks peers API first (already alive?), tries resuming an existing sandbox, then creates fresh — either from fleet config (persistent bots like clark) or by fetching from any plugin repo in the marketplace (agents like researcher, designer, ordinals, bitcoin, etc). Use for ANY request to start, wake, deploy, or bring up a bot or agent.",
		inputSchema: z.object({
			botName: z
				.string()
				.describe(
					"Name of the bot or agent (e.g. 'clark', 'researcher', 'ordinals'). Also accepts owner/repo:name format for direct refs.",
				),
		}),
		execute: async ({ botName }) => wakeBot(botName),
	}),

	list_agents: tool({
		description:
			"Dynamically discover all agents available across the plugin marketplace. Searches every plugin repo's agents/ directory on GitHub. Also lists fleet bots from config. Use when asked what bots/agents can be deployed, or to look up an agent name.",
		inputSchema: z.object({}),
		execute: async () => {
			try {
				const agents = await discoverAgents();
				return {
					fleetBots: Object.entries(fleetRoster).map(([name, config]) => ({
						name,
						repo: config.repo,
						description: config.description,
						type: "persistent" as const,
					})),
					agents: agents.map((a) => ({
						name: a.name,
						plugin: a.plugin,
						ref: a.ref,
						type: "ephemeral" as const,
					})),
					total: Object.keys(fleetRoster).length + agents.length,
				};
			} catch (err) {
				return { error: err instanceof Error ? err.message : "Unknown error" };
			}
		},
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
