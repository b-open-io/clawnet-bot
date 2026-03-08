# Johnny (ClawNet Mechanic) - Ecosystem Inventory & Operational Analysis

## Agent Ecosystem Inventory

### bopen-tools Plugin (~/code/prompts) - 24 Agents

| Agent | Display Name | Role | ClawNet? |
|-------|-------------|------|----------|
| agent-builder | **Satchmo** | Agent architecture, AI SDKs, multi-agent systems | Yes |
| architecture-reviewer | **Kayle** | System design, large-scale refactoring | No |
| audio-specialist | **Juniper** | ElevenLabs audio, voice cloning | No |
| code-auditor | **Nyx** | Security audits, vulnerability scanning | No |
| consolidator | **Steve** | File cleanup, deduplication | No |
| data | **Mr. Data Accumulator** | Data pipelines, ETL, analytics | No |
| database | **Idris** | PostgreSQL, Redis, MongoDB, schema design | No |
| designer | **Mira** | UI components, Tailwind, shadcn | No |
| devops | **Zoro** | Vercel, Railway, CI/CD, ClawNet deployment | Yes |
| documentation-writer | **Flow** | READMEs, API docs, PRDs | No |
| account-manager | **Kurt** | Public website chat, lead qualification | Yes |
| executive-assistant | **Tina** | Google Workspace, calendar, email | No |
| front-desk | **Martha** | Org directory, routing, contacts | Yes |
| integration-expert | **Maxim** | API integrations, webhooks | No |
| mcp | **Orbit** | MCP server setup, diagnostics | No |
| mobile | **Kira** | React Native, Swift, Kotlin, Flutter | No |
| nextjs | **Theo** | Next.js, React, Turbopack | No |
| optimizer | **Torque** | Performance, bundle size, Core Web Vitals | No |
| payments | **Mina** | Stripe, payment integrations | No |
| project-manager | **Sage** | Linear planning, ticket management | No |
| prompt-engineer | **Zack** | Skills, agents, commands, plugin dev | No |
| researcher | **Parker** | Web research, X/Twitter data | No |
| tester | **Iris** | Unit/integration/e2e tests | No |
| **clawnet-mechanic** | **Johnny** | Bot maintenance, diagnostics, repair | **Yes** |

### Other Plugin Agents (7 Agents)

| Plugin | Agent | Display Name | Role |
|--------|-------|-------------|------|
| bsv-skills | bitcoin | **Sato** | BSV transactions, @bsv/sdk (model: opus) |
| 1sat-skills | ordinals | **Glyph** | 1Sat Ordinals, NFTs, marketplace (model: sonnet) |
| product-skills | legal | **Anthony** | Legal compliance, privacy (model: opus) |
| product-skills | marketer | **Caal** | Growth, SEO, launch strategy (model: sonnet) |
| sigma-auth | sigma-auth-guide | **Siggy** | Bitcoin auth, OAuth, Better Auth (model: opus) |
| gemskills | content | **Lisa** | Image/video generation via Gemini (model: sonnet) |
| gemskills | designer | **Ridd** | UI with AI design review (model: sonnet) |

### clawnet-bot Plugin (1 Agent)

| Agent | Display Name | Role |
|-------|-------------|------|
| clark | **Clark** | ClawNet/ClawBook network observer, X outreach operator |

**Total: 32 agents across 8 plugins**

### Agents with ClawNet Access

Only 5 agents have `Skill(clawnet:clawnet-cli)` or `Skill(clawnet:clawnet)`:

1. **Zoro** (devops) - Deployment, CI/CD, initial setup
2. **Satchmo** (agent-builder) - Agent architecture, deploys agent teams
3. **Martha** (front-desk) - Directory, routing
4. **Kurt** (account-manager) - Public chat
5. **Johnny** (clawnet-mechanic) - **Maintenance and repair** (NEW)

### Where Johnny Fits

```
                    DEPLOYMENT                    MAINTENANCE
                    (Zoro's job)                  (Johnny's job)
                         |                              |
   clawnet bot init -----+                              |
   clawnet bot identity --+                              |
   clawnet bot deploy ----+                              |
                          |                              |
                    Bot goes live                   Bot breaks
                          |                              |
                          +------> clawnet bot list <----+
                                   clawnet bot logs <----+
                                   clawnet bot restart <-+
                                   clawnet bot exec <----+
                                   clawnet bot env <-----+
                                   clawnet bot connect <-+
                                   clawnet bot stop <----+
                                   clawnet bot remove <--+
```

---

## Complete Skills Inventory (103 Skills)

### bopen-tools (~/code/prompts) - 40 Skills

**Development & Quality:**
| Skill | Purpose |
|-------|---------|
| agent-auditor | Audit agents/skills across plugin ecosystem |
| benchmark-skills | Benchmark skill performance |
| check-version | Check package versions |
| cli-demo-gif | Generate CLI demo GIFs |
| code-audit-scripts | Security audit scripts |
| confess | Reveal mistakes/concerns before ending session |
| create-next-project | Scaffold Next.js projects (v2.0) |
| critique | Show visual diffs before asking questions |
| deploy-agent-team | Deploy agent teams to ClawNet |
| devops-scripts | DevOps automation scripts |
| frontend-performance | Frontend perf analysis |
| generative-ui | Dynamic/generative UI patterns |
| hook-manager | Manage Claude Code hooks |
| hunter-skeptic-referee | Three-perspective analysis |
| nextjs-upgrade | Next.js version upgrades |
| npm-publish | npm package publishing |
| perf-audit | Performance audit |
| process-cleanup | Clean up stale processes |
| reinforce-skills | Reinforce skill patterns |
| runtime-context | Runtime context gathering |
| saas-launch-audit | Pre-launch SaaS audit |
| skill-publish | Publish skills to registry |
| statusline-setup | Configure Claude Code statusline |
| simplify | Review changed code for quality |
| wait-for-ci | Wait for CI/CD completion |
| webapp-testing | Web application testing |

**Research & Content:**
| Skill | Purpose |
|-------|---------|
| humanize | Make text sound natural |
| notebooklm | Query NotebookLM notebooks |
| prd-creator | Create PRDs |
| linear-planning | Plan work in Linear |
| remind | Set reminders |
| front-desk | Martha's routing skill |
| voice-clone | ElevenLabs voice cloning |

**X/Twitter:**
| Skill | Purpose |
|-------|---------|
| x-research | X/Twitter research |
| x-tweet-fetch | Fetch specific tweets |
| x-tweet-search | Search tweets |
| x-user-lookup | Look up X users |
| x-user-timeline | Read user timelines |

**Other:**
| Skill | Purpose |
|-------|---------|
| charting | Data visualization |
| geo-optimizer | Geographic optimization |
| plaid-integration | Plaid financial API |
| ui-audio-theme | Audio themes for UI |
| agent-browser | Browser automation for agents |

### bsv-skills (~/code/bsv-skills) - 25 Skills

| Skill | Purpose |
|-------|---------|
| wallet-send-bsv | Send BSV via WIF |
| wallet-brc100 | BRC-100 wallet (TypeScript) |
| wallet-brc100-go | BRC-100 wallet (Go) |
| wallet-encrypt-decrypt | Encrypt/decrypt wallet data |
| create-bap-identity | Create BAP identities |
| manage-bap-backup | Manage BAP backups |
| message-signing | BSM, BRC-77, Sigma signing |
| key-derivation | Type42/BIP32 key derivation |
| create-script-template | Create Bitcoin scripts |
| review-script-template | Review Bitcoin scripts |
| validate-bsv-script | Validate scripts |
| decode-bsv-transaction | Decode transactions |
| estimate-transaction-fee | Fee estimation |
| lookup-bsv-address | Address lookup |
| lookup-block-info | Block info lookup |
| check-bsv-price | BSV price check |
| broadcast-arc | Broadcast via ARC |
| ordfs | ORDFS content access |
| junglebus | JungleBus indexing |
| bsv-standards | BSV protocol standards |
| bsocial | Social via MAP protocol |
| encrypt-decrypt-backup | bitcoin-backup CLI |
| stratum-v1 | Stratum V1 mining |
| stratum-v2 | Stratum V2 mining |
| calculate-mining-difficulty | Mining difficulty |

### gemskills (~/code/gemskills) - 17 Skills

| Skill | Purpose |
|-------|---------|
| generate-image | Text-to-image (Gemini) |
| generate-svg | SVG graphics/logos |
| generate-icon | App icons (multi-size) |
| generate-video | Video from text/images (Veo 3.1) |
| edit-image | Inpaint/outpaint editing |
| optimize-images | Image optimization |
| upscale-image | 2x/4x upscaling |
| segment-image | Image segmentation |
| pixel-avatar | Pixel art avatars |
| avatar-portrait | Avatar portraits |
| team-group-photo | Team group portraits |
| deck-creator | Presentation decks |
| visual-planner | Visual planning |
| section-dividers | Visual section dividers |
| browsing-styles | 100+ artistic styles |
| style-creator | Custom style creation |
| ask-gemini | Gemini analysis/feedback |

### 1sat-skills (~/code/1sat-skills) - 11 Skills

| Skill | Purpose |
|-------|---------|
| wallet-setup | BRC-100 wallet creation/sync |
| wallet-create-ordinals | Mint ordinals/NFTs |
| ordinals-marketplace | List/buy/cancel ordinals |
| token-operations | BSV21 token ops |
| transaction-building | Action-based tx building |
| sweep-import | Import from external wallets |
| timelock | Lock BSV until block height |
| opns-names | OpNS name registration |
| dapp-connect | dApp wallet connection |
| extract-blockchain-media | Extract inscribed media |
| 1sat-stack | Unified BSV indexing API |

### sigma-auth (~/code/sigma-auth-better-auth-plugin) - 5 Skills

| Skill | Purpose |
|-------|---------|
| setup-nextjs | Sigma Auth in Next.js |
| setup-convex | Sigma Auth with Convex |
| tokenpass | TokenPass OAuth provider |
| device-authorization | Device flow auth |
| bitcoin-auth-diagnostics | Debug auth failures |

### product-skills (~/code/product-skills) - 2 Skills

| Skill | Purpose |
|-------|---------|
| ai-seo-optimization | Modern SEO for AI search |
| legal-compliance | Privacy policy, ToS, compliance |

### clawnet-bot (~/code/clawnet-bot) - 3 Skills

| Skill | Purpose |
|-------|---------|
| moltbook-example | Moltbook social network for bots |
| convex | Convex database persistence for bots |
| vercel-blob | Vercel Blob storage for bots |

---

## ClawNet CLI Reference (v1.5.0)

### Bot Lifecycle Commands

| Command | Purpose |
|---------|---------|
| `clawnet bot init --template <t> --name <slug>` | Initialize bot workspace |
| `clawnet bot identity create --name "Bot" --password "pw"` | Create BAP identity |
| `clawnet bot deploy --name <slug> --yes` | Deploy to Vercel Sandbox |
| `clawnet bot list` | List bots (local CLI cache, NOT authoritative) |
| `clawnet bot logs <name>` | View bot logs |
| `clawnet bot stop <name>` | Stop bot |
| `clawnet bot restart <name>` | Restart bot process |
| `clawnet bot remove <name>` | Remove bot |
| `clawnet bot exec <name> '<cmd>'` | Execute command in sandbox |
| `clawnet bot call <name> --message "text"` | Call bot HTTP endpoint |
| `clawnet bot connect <name>` | Interactive shell in sandbox |
| `clawnet bot env list <name>` | List sandbox env vars |
| `clawnet bot env set <name> <KEY> <VALUE>` | Set sandbox env var |
| `clawnet bot env remove <name> <KEY>` | Remove sandbox env var |

### Reachability Model

- **Local CLI status**: whatever this machine last launched/stopped
- **Warm**: sandbox currently alive and answering heartbeat
- **Reachable**: ClawNet registry sees a fresh healthy heartbeat
- **Dashboard**: authoritative live status (source of truth)

### Bot Templates (8)

| Template | Type | Key Feature | Heartbeat |
|----------|------|-------------|-----------|
| gateway | AI Gateway + ai@6 | SOUL.md system prompt, bash-tool | Every 5 min |
| minimal | Bare Hono HTTP | No dependencies | Every 5 min |
| moltbook | Social routing | Event validation, action decisions | Every 5 min |
| blockchain | BSV identity | Signing, public key endpoints | Every 5 min |
| vercel-ai | Streaming AI | Vercel AI SDK, OpenAI + Anthropic | Every 5 min |
| chatter | Cross-bot P2P | Sender/responder/duplex, Convex relay | Every 5 min |
| x-poster | Twitter bot | OAuth 2.0 PKCE, scheduled tweets | Every 5 min |
| clark | Chat adapter | Backend-only, ClawNet event emission | Every 5 min |

### Key Environment Variables by Template

| Variable | Templates | Purpose |
|----------|-----------|---------|
| `AI_GATEWAY_API_KEY` | gateway | Required for AI calls |
| `AI_GATEWAY_MODEL` | gateway | Model selection (default: claude-sonnet-4.6) |
| `ANTHROPIC_API_KEY` | vercel-ai | Anthropic provider |
| `OPENAI_API_KEY` | vercel-ai, clark | OpenAI provider |
| `SIGMA_MEMBER_PRIVATE_KEY` | blockchain, moltbook, chatter, x-poster | BSV identity (WIF) |
| `CLAWNET_EVENT_URL` | clark | Event telemetry endpoint |
| `CLAWNET_API_URL` | chatter | Message relay API |
| `MOLTBOOK_API_KEY` | moltbook | Social network access |
| `BLOB_READ_WRITE_TOKEN` | vercel-blob | Storage access |
| `CONVEX_URL`, `CONVEX_ADMIN_KEY` | convex | Database |
| `VERCEL_OIDC_TOKEN` | all (sandbox auth) | Required for all sandbox operations |
| `BOT_IDENTITY_PASSWORD` | all | Decrypt identity.bep |

### Bun Snapshots

- Cached in `~/.clawnet/config.json`
- 6-day TTL (Vercel expires at ~7 days)
- Auto-recreate when expired
- Shared across all bot deploys

---

## Failure Modes (from NotebookLM Research)

### 1. Sandbox Sleep & Timeout (Ephemeral by Design)

- **Auto-shutdown**: Default 5 min timeout, configurable up to hours
- **Total destruction**: Firecracker MicroVM + filesystem completely destroyed on timeout
- **Plan-based limits**: Hard max runtime dictated by Vercel plan
- **Session loss**: State not persisted unless saved to external DB (Vercel KV, Postgres) or snapshot
- **Snapshot recovery**: Filesystem snapshots save exact state; required for session resumption

### 2. Process & Shell Disconnects

- **Foreground process dies**: Must use `nohup <cmd> &` to survive shell exit
- **Network drops**: Shell connection lost, reconnect with `sandbox connect $SANDBOX_ID`
- **Interactive shell dependency**: Processes started in shell die when shell disconnects

### 3. State Loss & Crash Recovery

- **No internal persistence**: Memory, conversation history, task progress all lost on crash
- **Orchestration interruptions**: Without durable execution (Temporal, Inngest, Vercel Workflows), multi-step tasks require complete restart
- **External state required**: Bot must save to Vercel KV, Postgres, Convex, or Vercel Blob before shutdown

### 4. Infrastructure & Resource Limits

- **CPU/memory/disk caps**: Strict resource limits; exceeding crashes the sandbox
- **Egress/firewall blocking**: External APIs blocked unless explicitly allowlisted in sandbox config
- **Network policies**: Strict outbound controls per Vercel Sandbox security model

### 5. External Dependency Failures

- **LLM API failures**: Rate limits, outages, "model hiccups"
- **Database timeouts**: External DB connectivity (Snowflake, Postgres, etc.)
- **Expired API keys**: Credentials rotate, causing 401/403 errors
- **Upstream provider outages**: Third-party services go down

### 6. Bun Snapshot Expiry

- **6-day TTL**: Snapshots expire, CLI auto-recreates but may cause deploy failures during recreation window
- **Detection**: By TTL check or sandbox creation failure

---

## Automated Remediation Patterns (from NotebookLM Research)

### Self-Healing Agents

- AI agents can automatically spot threats and restore affected services
- Agents like OpenClaw can write code and automatically open PRs
- Vercel Agent reviews PRs, analyzes incidents, recommends actions
- **Human-in-the-loop gating**: Fully automated PR creation is often paused for developer approval before merging

### Alerting Humans

- **Human fallback**: Agents handle routine tasks autonomously, route exceptions with reasoning chains to human reviewers
- **Alert fatigue reduction**: AI-powered monitoring connects related issues into single manageable alerts
- **CI/CD integration**: Event subscriptions trigger serverless functions to send notifications via Slack, Discord, SMS webhooks

### Durable Execution for Repair Sequences

Repair workflows should use **durable execution** to prevent progress loss:

| Tool | Model | Best For |
|------|-------|----------|
| **Vercel Workflows** | Built-in durable execution | Multi-step sandbox operations, auto-retry |
| **Inngest** | Serverless event-driven choreography | Reactive repairs, human approval gates, event replay |
| **Temporal** | Stateful cluster-and-worker | Enterprise-scale batch processing, multi-day repairs |

Key pattern: Break repairs into atomic steps -> persist each step's result -> auto-retry from checkpoint on failure -> gate destructive actions behind human approval.

---

## What Johnny Needs to Become a Deployed Bot

### Current State: Agent-Only (Claude Code subagent)

Johnny currently runs as a Claude Code agent -- invoked manually when someone asks for bot diagnostics. He runs ClawNet CLI commands via Bash tool.

### Target State: Deployed Mechanic Bot

To run as a persistent bot that proactively monitors and repairs the fleet:

#### 1. Vercel Credentials

```
VERCEL_OIDC_TOKEN=<from vercel env pull>
```

Lets him use `clawnet bot list`, `clawnet bot logs`, `clawnet bot restart`, etc.

#### 2. GitHub Token (for PRs)

```
GITHUB_TOKEN=<personal access token or GitHub App token>
```

Pattern: detect issue -> analyze with LLM -> create branch -> write fix -> open PR -> pause for human review.

#### 3. Notification Channel

To alert admins when a bot is down and can't be auto-repaired:
- **Slack webhook** (`SLACK_WEBHOOK_URL`) - immediate alerting
- **Resend email** via `Skill(resend)` through Martha - formal notifications
- **ClawNet P2P** via `clawnet message <target> <text>` - inter-bot alerting
- **Moltbook** via moltbook skill - post status to agent social network

#### 4. Heartbeat Monitoring Loop

```json
{
  "crons": [{
    "path": "/api/heartbeat-check",
    "schedule": "*/5 * * * *"
  }]
}
```

Every 5 minutes:
1. Run `clawnet bot list` to get fleet status
2. Hit each bot's `/api/heartbeat` endpoint
3. For any that fail, pull logs and diagnose
4. Auto-restart if possible
5. Create PR or notify admin if code fix needed

#### 5. Durable Execution

Use **Inngest** (event-driven, serverless) for repair orchestration:
- Multi-step repairs don't lose progress on crash
- Failed steps auto-retry from checkpoint
- Human approval gates for destructive actions
- Event replay for debugging failed repairs

#### 6. Template Choice

Johnny should use the **gateway** template:
- Has SOUL.md for personality/constraints
- Has bash-tool for running CLI commands in sandbox
- Has ai@6 for LLM-powered log analysis
- Has heartbeat cron built-in

#### 7. State Persistence

Use **vercel-blob** skill (already in clawnet-bot):
- `bots/{bot-name}/state.json` - health history per bot
- `bots/johnny/logs/{YYYY-MM-DD}.json` - daily diagnostic logs
- `bots/johnny/fleet-status.json` - latest fleet snapshot

### Diagnostic Workflow as a Bot

```
Cron fires /api/heartbeat-check (every 5 min)
    |
    v
[List all bots] -- clawnet bot list
    |
    v
[For each bot: hit /api/heartbeat]
    |
    +-- Healthy: log timestamp, continue
    |
    +-- No response:
        |
        v
    [Pull logs] -- clawnet bot logs <name>
        |
        v
    [Analyze logs with LLM]
        |
        +-- Transient (OOM, timeout): auto-restart
        |     clawnet bot restart <name>
        |     verify heartbeat
        |     report: "Restarted <name>, running smooth now"
        |
        +-- Env issue (expired key, missing var):
        |     clawnet bot env set <name> <KEY> <VALUE>
        |     clawnet bot restart <name>
        |     notify admin to rotate upstream key
        |
        +-- Code issue (import error, crash loop):
        |     gh pr create with fix
        |     notify admin: "Found a code issue, PR ready for review"
        |
        +-- Sandbox destroyed (timeout/plan limit):
        |     clawnet bot deploy --name <name> --yes (redeploy from snapshot)
        |     restore state from vercel-blob
        |     verify heartbeat
        |
        +-- Unknown:
              notify admin with full log dump
              "Can't figure this one out, sending you the logs"
```

---

## Gap Analysis: What Needs Building

### Existing Skills Johnny Can Use Today

| Skill | Plugin | How Johnny Uses It |
|-------|--------|--------------------|
| clawnet-cli | clawnet-bot | Core bot management commands |
| clawnet | clawnet-bot | Architecture understanding |
| vercel-blob | clawnet-bot | Persist health history and diagnostic logs |
| convex | clawnet-bot | Real-time fleet metrics dashboard |
| moltbook-example | clawnet-bot | Post status updates to agent network |
| confess | bopen-tools | Reveal concerns before ending session |
| critique | bopen-tools | Show diffs before code changes |
| deploy-agent-team | bopen-tools | Deploy multiple bots at once |
| agent-browser | bopen-tools | Browser-based health checks |
| humanize | bopen-tools | Make reports readable |
| wait-for-ci | bopen-tools | Wait for CI after PR creation |
| saas-launch-audit | bopen-tools | Pre-deploy audit checklist |

### Skills That Need Building

| Skill | Priority | Purpose |
|-------|----------|---------|
| **bot-health-monitor** | HIGH | Heartbeat check loop, fleet status aggregation, health history tracking. The core cron-triggered diagnostic logic. |
| **bot-repair** | HIGH | Auto-restart patterns, env var fixes, snapshot recovery, redeploy-from-template. Codified repair playbooks. |
| **bot-alert** | MEDIUM | Notification patterns: Slack webhook, Resend email, ClawNet P2P message. Severity-based routing (critical = Slack + email, degraded = Slack only). |
| **bot-pr-fix** | LOW | GitHub PR creation for code-level fixes. Branch creation, commit, PR with diagnostic context. Human-in-the-loop approval gate. |

### Skills That Exist But Should Be Wired to Johnny

Johnny's agent file currently has: `Skill(clawnet:clawnet-cli), Skill(clawnet:clawnet), Skill(confess), Skill(critique)`

**Recommended additions to Johnny's tools:**
- `Skill(bopen-tools:deploy-agent-team)` - redeploy teams after fleet-wide fixes
- `Skill(bopen-tools:wait-for-ci)` - wait for CI after creating PRs
- `Skill(bopen-tools:agent-browser)` - browser-based endpoint testing
- `Skill(bopen-tools:humanize)` - make diagnostic reports readable

### Open Questions

1. **Bot vs. Cron Function?** A persistent bot costs more but responds to ad-hoc requests. A cron function is cheaper but only runs on schedule. Recommendation: **Gateway bot with cron** -- handles both scheduled checks and ad-hoc "fix my bot" requests.

2. **Auth model?** Johnny needs to manage other bots' sandboxes. All bots share the same `.vercel/project.json` and OIDC token, so Johnny gets sandbox access by being in the same project. No elevated access needed.

3. **PR scope?** Start with **diagnose and report only**. Auto-fix PRs are Phase 2 after Johnny proves reliable at diagnosis.

4. **Fleet registry source?** `clawnet bot list` is local cache. The dashboard heartbeat is authoritative. Johnny should use **both**: `clawnet bot list` for the roster, then hit each bot's `/api/heartbeat` directly for live status.

5. **Who watches the watchman?** A lightweight **Vercel Cron Job** (outside the sandbox) hitting Johnny's own `/api/heartbeat` endpoint. If Johnny goes down, the cron failure shows up in Vercel's built-in cron monitoring. Alternatively, a second bot (Clark is already deployed) could monitor Johnny.
