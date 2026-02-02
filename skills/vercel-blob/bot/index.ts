import { del, list, put } from "@vercel/blob";
import type { Hono } from "hono";

/**
 * Vercel Blob Storage Skill
 *
 * Provides persistent storage for bots using Vercel Blob:
 * - State management (load/save)
 * - Conversation storage
 * - Logging
 */

export default function vercelBlobSkill(app: Hono) {
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const botName = process.env.BOT_NAME || "unnamed-bot";

	if (!token) {
		console.warn("[vercel-blob] BLOB_READ_WRITE_TOKEN not set.");
		console.warn("[vercel-blob] Run: ./skills/vercel-blob/scripts/setup.sh");

		// Return error endpoints
		app.get("/api/storage/*", (c) => {
			return c.json(
				{
					error: "Vercel Blob not configured",
					setup: "Run: ./skills/vercel-blob/scripts/setup.sh",
				},
				500,
			);
		});
		app.post("/api/storage/*", (c) => {
			return c.json(
				{
					error: "Vercel Blob not configured",
					setup: "Run: ./skills/vercel-blob/scripts/setup.sh",
				},
				500,
			);
		});
		return;
	}

	const basePath = `bots/${botName}`;

	// Health check
	app.get("/api/storage", async (c) => {
		try {
			const { blobs } = await list({ prefix: basePath, limit: 1 });
			return c.json({
				skill: "vercel-blob",
				status: "ready",
				bot: botName,
				basePath,
				hasData: blobs.length > 0,
			});
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	// State Management
	app.get("/api/storage/state", async (c) => {
		try {
			const pathname = `${basePath}/state.json`;
			const { blobs } = await list({ prefix: pathname, limit: 1 });

			if (blobs.length === 0) {
				return c.json({
					state: null,
					message: "No state found",
				});
			}

			// Fetch the blob content
			const response = await fetch(blobs[0].url);
			const state = await response.json();

			return c.json({ state, pathname });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	app.post("/api/storage/state", async (c) => {
		try {
			const body = await c.req.json();
			const pathname = `${basePath}/state.json`;

			await put(pathname, JSON.stringify(body), {
				access: "private",
				contentType: "application/json",
				allowOverwrite: true,
			});

			return c.json({ success: true, pathname });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	// Conversations
	app.get("/api/storage/conversations", async (c) => {
		try {
			const prefix = `${basePath}/conversations/`;
			const { blobs } = await list({ prefix });

			const conversations = blobs.map((b) => ({
				id: b.pathname.replace(prefix, "").replace(".json", ""),
				uploadedAt: b.uploadedAt,
				size: b.size,
				url: b.url,
			}));

			return c.json({ conversations, count: conversations.length });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	app.get("/api/storage/conversations/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const pathname = `${basePath}/conversations/${id}.json`;

			const { blobs } = await list({ prefix: pathname, limit: 1 });
			if (blobs.length === 0) {
				return c.json({ error: "Conversation not found" }, 404);
			}

			const response = await fetch(blobs[0].url);
			const conversation = await response.json();

			return c.json({ id, conversation });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	app.post("/api/storage/conversations/:id", async (c) => {
		try {
			const id = c.req.param("id");
			const body = await c.req.json();
			const pathname = `${basePath}/conversations/${id}.json`;

			await put(pathname, JSON.stringify(body), {
				access: "private",
				contentType: "application/json",
				allowOverwrite: true,
			});

			return c.json({ success: true, id, pathname });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	// Logging
	app.post("/api/storage/log", async (c) => {
		try {
			const { level, message, metadata } = await c.req.json();
			const date = new Date().toISOString().split("T")[0];
			const pathname = `${basePath}/logs/${date}.json`;

			// Read existing logs
			let logs: any[] = [];
			const { blobs } = await list({ prefix: pathname, limit: 1 });
			if (blobs.length > 0) {
				const response = await fetch(blobs[0].url);
				logs = await response.json();
			}

			// Append new log
			logs.push({
				timestamp: new Date().toISOString(),
				level: level || "info",
				message,
				metadata: metadata || {},
			});

			// Save back
			await put(pathname, JSON.stringify(logs), {
				access: "private",
				contentType: "application/json",
				allowOverwrite: true,
			});

			return c.json({ success: true, pathname });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	app.get("/api/storage/logs", async (c) => {
		try {
			const prefix = `${basePath}/logs/`;
			const { blobs } = await list({ prefix });

			const logs = blobs.map((b) => ({
				date: b.pathname.replace(prefix, "").replace(".json", ""),
				uploadedAt: b.uploadedAt,
				size: b.size,
				url: b.url,
			}));

			return c.json({ logs, count: logs.length });
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}
	});

	console.log("[vercel-blob] Skill registered with endpoints:");
	console.log("  - GET  /api/storage");
	console.log("  - GET  /api/storage/state");
	console.log("  - POST /api/storage/state");
	console.log("  - GET  /api/storage/conversations");
	console.log("  - GET  /api/storage/conversations/:id");
	console.log("  - POST /api/storage/conversations/:id");
	console.log("  - POST /api/storage/log");
	console.log("  - GET  /api/storage/logs");
}
