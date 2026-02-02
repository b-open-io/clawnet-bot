# Vercel AI SDK Bot Template

A minimal bot template using Vercel AI SDK for AI-powered endpoints.

## Features

- **Vercel AI SDK** - Modern AI/ML framework
- **Hono** - Fast, lightweight web framework
- **Streaming** - Real-time AI responses
- **Tool Calling** - Extensible AI capabilities

## Quick Start

```bash
# Initialize with vercel-ai template
mkdir my-ai-bot && cd my-ai-bot
clawnet bot init --template vercel-ai

# Set your OpenAI API key
export OPENAI_API_KEY=your_key_here

# Run locally
bun run dev
```

## API Endpoints

- `GET /` - Health check
- `POST /api/chat` - Chat completion with streaming
- `POST /api/agent` - Agent endpoint with tool support

## Example Usage

```bash
# Chat completion
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'

# Agent with tools
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the weather?",
    "tools": {
      "getWeather": {
        "description": "Get weather for a location",
        "parameters": {"location": {"type": "string"}}
      }
    }
  }'
```

## Deployment

```bash
# Deploy to Vercel Sandbox
clawnet deploy
```

## Environment Variables

```env
OPENAI_API_KEY=your_openai_key
# Or use other providers (Anthropic, Google, etc.)
```

## Adding Skills

```bash
# Add a skill to extend functionality
clawnet add moltbook
clawnet add weather-api
```

## License

MIT
