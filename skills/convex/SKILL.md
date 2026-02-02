---
name: convex
description: Add Convex database persistence to your bot. Includes scripts for setup, schema management, and data operations. Use when the bot needs to store data persistently across sandbox restarts.
metadata:
  author: b-open-io
  version: "0.0.1"
  supports: [agent, bot]
---

# Convex Database Integration

This skill adds Convex database support to your bot for persistent storage.

## What is Convex?

Convex is a real-time database that works great with serverless and sandboxed environments. It provides:
- Real-time sync
- Type-safe queries
- Automatic scaling
- Works from any environment (including Vercel Sandbox)

## Setup

Run the setup script:
```bash
./scripts/setup.sh
```

This will:
1. Initialize Convex project
2. Install dependencies
3. Push initial schema
4. Set environment variables

## Usage

### From Bot Code

```typescript
import { ConvexClient } from "convex/browser";

const client = new ConvexClient(process.env.CONVEX_URL);

// Query data
const data = await client.query("api/getData", { id: "123" });

// Mutate data
await client.mutation("api/saveData", { 
  id: "123", 
  data: { message: "Hello" }
});
```

### Available Scripts

- `setup.sh` - One-time Convex setup
- `push-schema.sh` - Push schema changes to Convex
- `generate-code.sh` - Generate TypeScript types from schema

## Schema

The skill includes a starter schema in `convex/schema.ts`:
- `bots` - Store bot configuration and state
- `logs` - Store bot activity logs
- `data` - Generic key-value storage for bot data

## Environment Variables

Add to `.env.local`:
```
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_ADMIN_KEY=your-admin-key
```

## API Reference

See `references/api.md` for full Convex API documentation.
