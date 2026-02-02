---
name: vercel-blob
description: Add Vercel Blob storage to your bot for persistent state, conversations, and logs. Uses JSON files stored in Vercel's object storage. Perfect for bots that need to remember state across sandbox restarts.
metadata:
  author: b-open-io
  version: "0.0.1"
  supports: [agent, bot]
---

# Vercel Blob Storage

This skill adds Vercel Blob storage to your bot for persistent data across sandbox restarts.

## Storage Strategy

Data is organized by bot name:

```
bots/{bot-name}/
├── state.json              # Bot state (counters, config, etc.)
├── config.json             # Bot configuration
├── conversations/
│   ├── {session-id}.json   # Individual conversation sessions
│   └── ...
└── logs/
    └── {YYYY-MM-DD}.json   # Daily log files
```

## Setup

Run the setup script:
```bash
./skills/vercel-blob/scripts/setup.sh
```

This creates a Vercel Blob store for your bot.

## API Endpoints

Once added, your bot gets these endpoints:

### State Management
- `GET /api/storage/state` - Load current state
- `POST /api/storage/state` - Save state

### Conversations
- `GET /api/storage/conversations` - List all conversations
- `GET /api/storage/conversations/:id` - Load specific conversation
- `POST /api/storage/conversations/:id` - Save conversation

### Logs
- `POST /api/storage/log` - Append log entry
- `GET /api/storage/logs` - Get recent logs

## Usage from Bot Code

```typescript
// Save bot state
await fetch('/api/storage/state', {
  method: 'POST',
  body: JSON.stringify({ 
    lastRun: Date.now(),
    counter: 42,
    config: { theme: 'dark' }
  })
});

// Load state
const state = await fetch('/api/storage/state').then(r => r.json());

// Log activity
await fetch('/api/storage/log', {
  method: 'POST',
  body: JSON.stringify({
    level: 'info',
    message: 'Bot started',
    metadata: { version: '1.0.0' }
  })
});

// Save conversation
await fetch('/api/storage/conversations/session-123', {
  method: 'POST',
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello!' },
      { role: 'bot', content: 'Hi there!' }
    ]
  })
});
```

## Environment Variables

Add to `.env.local`:
```
BLOB_READ_WRITE_TOKEN=your_token_here
```

## How It Works

1. **Bot starts** → Automatically loads state from Blob
2. **During operation** → State saved periodically + on changes
3. **Bot stops** → Final state flush to Blob
4. **Next deployment** → State restored from Blob

## File Structure

- `state.json` - Small, frequently updated (bot state)
- `conversations/*.json` - Session-based (conversation history)
- `logs/*.json` - Append-only (daily log files)

## Limitations

- Max file size: 500MB
- No SQL queries (file-based only)
- List operations can be slow with many files
- Best for: State, logs, config, small conversation histories

## Pricing

- Free tier: 250MB storage, 1000 operations/month
- See: https://vercel.com/pricing
