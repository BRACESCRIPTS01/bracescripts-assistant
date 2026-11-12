# BraceScripts Assistant

A drop-in website chatbot that does three things and nothing else:

1. Answers business questions only from a facts file the owner writes.
2. Checks an order, booking or transaction by reference **and** phone.
3. Hands off to WhatsApp when it cannot help.

The same code runs three demonstration businesses on one page — that is the
proof that installing it for a new client is content work, not code work.

**Status: working, deployed.** Three demo businesses, live model answers, order
lookup, and WhatsApp handoff. 99 tests, no dependencies.

Docs: [`docs/HANDOVER.md`](docs/HANDOVER.md) for the owner,
[`docs/ADVERSARIAL.md`](docs/ADVERSARIAL.md) for the pre-launch checklist.

## Run it

```bash
npm test
```

Node 20 or newer. No dependencies, no build step.

## Wiring the widget into another site

```html
<script src="https://YOUR-KIT-SITE/widget/chat-widget.js"
        data-endpoint="https://YOUR-KIT-SITE/api"
        data-persona="food"
        data-accent="#62110c"
        defer></script>
```

## What this never does

No payments. No accounts. No owner dashboard. No notifications. No database. No
RAG. No file uploads. No streaming. No analytics scripts. No frameworks, no
build step, no npm dependencies. Node built-ins only.

## Honest statements

- The bot answers only from `business/<persona>/facts.md`. If a fact is absent it
  says so and hands over. It never invents a price, a time or a policy.
- Model output is JSON, validated server-side. The model proposes; the server
  decides. The model never reads the data store.
- Phone numbers never reach a model: digit runs of 7 or more are removed before
  any model call, and status lookups call no model at all.
- Free model tiers have daily caps. The handover document lists them.
- The demo persons are marked as demos on the page.

## Files

| Path | What it is |
|---|---|
| `index.html`, `demo.css`, `demo.js` | The demo page and its persona switch |
| `widget/` | The drop-in widget |
| `business/<persona>/` | `config.json`, `facts.md`, `demo-data.json` per business |
| `Netlify/functions/` | `chat.mjs`, `order-status.mjs` |
| `lib/` | Shared modules |
| `tests/` | `node --test` unit tests |
| `docs/` | `HANDOVER.md` (owner-facing) and `ADVERSARIAL.md` (pre-launch checks) |
| `_headers`, `netlify.toml` | Security headers and routing |

## Adding a client

A client is a folder: `business/<name>/` with `config.json`, `facts.md` and
`demo-data.json`. Nothing else changes — no code edit, no redeploy of the logic.
The folder name is the `data-persona` the widget sends, and the server only
accepts names that exist on disk, so a request can never name a path.

## Limits, stated plainly

- Free-tier model keys have daily caps that a busy demo can reach. When they are
  reached the widget says so and offers WhatsApp — it does not fail silently.
- The rate limiter is in memory, per server instance. It stops a casual script,
  not a determined attacker.
- Groq failover is configured but never exercised, because no `GROQ_API_KEY` is
  set. Without it, an exhausted Gemini quota means "I cannot answer right now"
  rather than a fallback answer.
- Order statuses come from a static JSON file. Nothing polls a real system.
