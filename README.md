# BraceScripts Assistant

A drop-in website chatbot that does three things and nothing else:

1. Answers business questions only from a facts file the owner writes.
2. Checks an order, booking or transaction by reference **and** phone.
3. Hands off to WhatsApp when it cannot help.

The same code runs three demonstration businesses on one page — that is the
proof that installing it for a new client is content work, not code work.

**Step 2 of 8 — skeleton.** The page, the widget and the persona files are in
place. The API is not built yet; the widget says so plainly when you type.
`lib/`, `tests/` and `docs/` are populated in Steps 3 to 8.

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
| `tests/` | `node --test` unit tests and a manual adversarial checklist |
| `docs/` | Install, facts authoring, data connection, handover, gig text |
| `_headers`, `netlify.toml` | Security headers and routing |

## Limits, stated plainly

Two free-tier model keys have daily caps that a busy demo can reach. When they
are reached the widget says so and offers WhatsApp — it does not fail silently.
