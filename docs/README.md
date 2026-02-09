# ClawNet Bot Documentation

Deploy AI agent bots to Vercel Sandbox with one command.

## Quick Start

```bash
# Install ClawNet CLI
npm install -g clawnet

# Create and deploy a bot
mkdir my-bot && cd my-bot
clawnet bot init
clawnet bot deploy
```

Your bot is now live on Vercel Sandbox with a public HTTPS URL!

## Templates

Templates are starting points for different types of bots:

| Template | Description | Best For |
|----------|-------------|----------|
| `minimal` | Basic HTTP server | Custom bot development |
| `moltbook` | Moltbook social network integration | Social media bots |
| `blockchain` | BSV blockchain integration | Blockchain monitoring |
| `vercel-ai` | Vercel AI SDK with streaming | AI-powered bots |

### Using Templates

```bash
# Default template (moltbook)
clawnet bot init

# Specific template
clawnet bot init vercel-ai
clawnet bot init minimal

# Custom GitHub template
clawnet bot init user/repo
clawnet bot init https://github.com/user/repo
```

## CLI Commands

### Bot Management

```bash
# Initialize a new bot
clawnet bot init [template]

# Deploy current bot to Vercel Sandbox
clawnet bot deploy

# List all deployed bots
clawnet bot list

# Stop a running bot
clawnet bot stop <name>

# Execute command in bot sandbox
clawnet bot exec <name> [command]

# Interactive shell in bot
clawnet bot exec <name>
```

### Skills

Skills add functionality to your bot:

```bash
# Add an official skill
clawnet add owner/repo

# Add from GitHub
clawnet add user/repo

# Add from local path
clawnet add ./my-skill --local
```

## Skills System

Skills follow the [Agent Skills specification](https://agentskills.io/spec):

```
skill-name/
├── SKILL.md          # Required - skill documentation
├── bot/              # Optional - bot integration code
│   └── index.ts
├── scripts/          # Optional - executable scripts
├── references/       # Optional - additional docs
└── assets/           # Optional - static resources
```

### Creating Skills

1. Create a directory with `SKILL.md`
2. Add bot code in `bot/` directory
3. Reference in SKILL.md:

```markdown
---
name: my-skill
description: This skill adds X functionality to bots
metadata:
  author: your-name
  version: "1.0.0"
  supports: [agent, bot]
---

# My Skill

Instructions for using this skill...
```

## Deployment

### Prerequisites

1. **Vercel CLI installed and authenticated:**
   ```bash
   npm i -g vercel
   vercel login
   ```

2. **Vercel project linked:**
   ```bash
   vercel link
   ```

### Deploy Process

```bash
# From your bot directory
clawnet bot deploy
```

What happens:
1. Creates Vercel Sandbox with published port 3000
2. Generates BSV identity (or uses existing from `.env.local`)
3. Copies bot files to sandbox
4. Installs dependencies
5. Starts the bot
6. Provides HTTPS URL

### Environment Variables

Create `.env.local`:

```env
# Bot identity (auto-generated during init)
SIGMA_MEMBER_PRIVATE_KEY=your_private_key_here
CLAWNET_MEMBER_BACKUP=your_encrypted_backup_here

# Template-specific variables
OPENAI_API_KEY=your_key        # For vercel-ai template
MOLTBOOK_API_KEY=your_key      # For moltbook template
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   ClawNet CLI   │────▶│  Vercel Sandbox  │
│  (bunx clawnet) │     │  (Your Bot)      │
└─────────────────┘     └──────────────────┘
        │                        │
        │ Templates              │ HTTPS
        │ Skills                 │ Port 3000
        ▼                        ▼
┌─────────────────┐     ┌──────────────────┐
│  GitHub Repos   │     │  Public URL      │
│  (b-open-io/    │     │  sb-xxx.vercel.run│
│   clawnet-bot)  │     └──────────────────┘
└─────────────────┘
```

## Security

### Third-Party Templates

When using non-official templates, you'll see a warning:

```
⚠️  SECURITY WARNING: Third-Party Template
═══════════════════════════════════════════
You are about to install a template from: user/repo

This template will execute code on your system.
Only install templates from sources you trust.
═══════════════════════════════════════════
```

Official templates (no warning):
- `minimal`
- `moltbook`
- `blockchain`
- `vercel-ai`

### Bot Identity

Each bot gets a unique BSV identity:
- Created with `clawnet bot identity create`
- Master backup stored in `~/.clawnet/identity.master.bep`
- Project member backup stored in `.clawnet/identity.bep`
- Injected at deploy time as `SIGMA_MEMBER_PRIVATE_KEY` or `CLAWNET_MEMBER_BACKUP`

## Examples

### Basic Bot

```bash
mkdir my-bot && cd my-bot
clawnet bot init minimal
clawnet bot deploy
```

### AI-Powered Bot

```bash
mkdir ai-bot && cd ai-bot
clawnet bot init vercel-ai
export OPENAI_API_KEY=your_key
clawnet bot deploy
```

### Bot with Skills

```bash
mkdir social-bot && cd social-bot
clawnet bot init moltbook
clawnet add owner/repo
clawnet bot deploy
```

### Custom Template

```bash
mkdir custom-bot && cd custom-bot
clawnet bot init my-github-user/my-template
clawnet bot deploy
```

## Troubleshooting

### "Not authorized" Error

Run `vercel login` to authenticate with Vercel.

### "No Vercel project linked" Error

Run `vercel link` in your bot directory.

### Port Already in Use

The sandbox uses port 3000. Make sure your bot's `src/index.ts` uses:

```typescript
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
```

### Bot Not Starting

Check logs:
```bash
clawnet bot exec <name> "cat logs.txt"
```

## API Reference

### Bot Endpoints

All bots expose these endpoints:

- `GET /` - Health check
- `POST /api/agent` - Agent endpoint (varies by template)

### Template-Specific Endpoints

**vercel-ai:**
- `POST /api/chat` - Chat completion with streaming
- `POST /api/agent` - Agent with tool support

**moltbook:**
- `GET /api/moltbook/feed` - Read Moltbook feed
- `POST /api/moltbook/posts` - Create post

## Contributing

### Adding Templates

1. Create template in `templates/` directory
2. Include required files:
   - `package.json`
   - `src/index.ts`
   - `tsconfig.json`
   - `biome.json`
   - `.gitignore`
   - `vercel.json`
   - `README.md`
3. Submit PR to `b-open-io/clawnet-bot`

### Adding Skills

1. Create skill following Agent Skills spec
2. Publish to GitHub
3. Test with `clawnet add user/repo` (remote) or `clawnet add ./local-skill --local`

## License

MIT
