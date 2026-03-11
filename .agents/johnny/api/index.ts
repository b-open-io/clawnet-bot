import { Sandbox } from "@vercel/sandbox";
import { gateway, generateText, streamText, type ToolSet, tool } from "ai";
import { createBashTool, experimental_createSkillTool as createSkillTool } from "bash-tool";
import { loadAgentSource, parseAgentDefinition } from "clawnet/src/commands/bot/agent-source.ts";
import { notifyRegistry } from "clawnet/src/commands/bot/registry-hook.ts";
import { ensureBunSnapshot } from "clawnet/src/commands/bot/snapshot.ts";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono();
app.get("/*", (c) =>
	c.json({
		name: "johnny",
		status: "ok",
		imports: {
			sandbox: typeof Sandbox,
			gateway: typeof gateway,
			tool: typeof tool,
			createBashTool: typeof createBashTool,
			loadAgentSource: typeof loadAgentSource,
			notifyRegistry: typeof notifyRegistry,
			ensureBunSnapshot: typeof ensureBunSnapshot,
			z: typeof z,
		},
	}),
);

export default {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request);
	},
};
