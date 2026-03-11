import { Sandbox } from "@vercel/sandbox";
import { Hono } from "hono";

const app = new Hono();
app.get("/*", (c) => c.json({ name: "johnny", status: "ok", sandbox: typeof Sandbox }));

export default {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request);
	},
};
