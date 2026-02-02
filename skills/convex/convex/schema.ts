import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	// Bot configuration and state
	bots: defineTable({
		name: v.string(),
		publicKey: v.string(),
		status: v.string(), // 'running', 'stopped', 'error'
		config: v.optional(v.record(v.string(), v.any())),
		lastHeartbeat: v.optional(v.number()),
	})
		.index("by_name", ["name"])
		.index("by_publicKey", ["publicKey"]),

	// Bot activity logs
	logs: defineTable({
		botId: v.id("bots"),
		level: v.string(), // 'info', 'warn', 'error'
		message: v.string(),
		metadata: v.optional(v.record(v.string(), v.any())),
		timestamp: v.number(),
	})
		.index("by_botId", ["botId"])
		.index("by_timestamp", ["timestamp"]),

	// Generic key-value storage for bot data
	data: defineTable({
		key: v.string(),
		value: v.any(),
		botId: v.optional(v.id("bots")),
		expiresAt: v.optional(v.number()),
	})
		.index("by_key", ["key"])
		.index("by_botId", ["botId"]),
});
