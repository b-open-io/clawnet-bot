import { ConvexClient } from "convex/browser";
import type { Hono } from "hono";

/**
 * Convex Skill Integration
 *
 * This adds Convex database endpoints to your bot:
 * - POST /api/convex/save - Save data to Convex
 * - GET /api/convex/load - Load data from Convex
 * - POST /api/convex/log - Log activity to Convex
 */

export default function convexSkill(app: Hono) {
	const convexUrl = process.env.CONVEX_URL;

	if (!convexUrl) {
		console.warn("[convex] CONVEX_URL not set. Convex endpoints will return errors.");
		console.warn("[convex] Run ./skills/convex/scripts/setup.sh to set up Convex.");

		// Return error endpoints
		app.post("/api/convex/save", (c) => {
			return c.json({ error: "Convex not configured. Run: ./skills/convex/scripts/setup.sh" }, 500);
		});
		app.get("/api/convex/load", (c) => {
			return c.json({ error: "Convex not configured. Run: ./skills/convex/scripts/setup.sh" }, 500);
		});
		app.post("/api/convex/log", (c) => {
			return c.json({ error: "Convex not configured. Run: ./skills/convex/scripts/setup.sh" }, 500);
		});
		return;
	}

	const client = new ConvexClient(convexUrl);

	// Health check
	app.get("/api/convex", (c) => {
		return c.json({
			skill: "convex",
			status: "ready",
			url: convexUrl,
		});
	});

	// Save data
	app.post("/api/convex/save", async (c) => {
		try {
			const { key, value, botId } = await c.req.json();

			await client.mutation("api/saveData", {
				key,
				value,
				botId,
				timestamp: Date.now(),
			});

			return c.json({ success: true, key });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	// Load data
	app.get("/api/convex/load", async (c) => {
		try {
			const key = c.req.query("key");
			const botId = c.req.query("botId");

			if (!key) {
				return c.json({ error: "Missing key parameter" }, 400);
			}

			const data = await client.query("api/loadData", { key, botId });

			return c.json({ success: true, data });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	// Log activity
	app.post("/api/convex/log", async (c) => {
		try {
			const { level, message, metadata, botId } = await c.req.json();

			await client.mutation("api/logActivity", {
				level: level || "info",
				message,
				metadata: metadata || {},
				botId,
				timestamp: Date.now(),
			});

			return c.json({ success: true });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	console.log("[convex] Skill registered with endpoints:");
	console.log("  - GET /api/convex");
	console.log("  - POST /api/convex/save");
	console.log("  - GET /api/convex/load");
	console.log("  - POST /api/convex/log");
}
