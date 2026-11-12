> **SUPERSEDED 2026-11-09.** See FINAL SCOPE at the top of `STEP-1-PLAN.md`. The product is website-first with a wa.me handoff, not a WhatsApp Cloud API integration. Kept for the verified Meta pricing research only.

# Architecture v2 — WhatsApp-first

Written 2026-11-09, after you chose WhatsApp-only clients. Nothing built. This
supersedes §1 (scope on the website) of `STEP-1-PLAN.md`. Everything else —
the security rules, the contracts, `lib/` modules, the test plan — survives.

## 1. What changed on Meta's side, verified today

Source: Meta's own pricing page, "Updated: Sep 30, 2026", effective 1 Oct 2026.

| Fact | Consequence for us |
|---|---|
| **Service messages are now billed.** Free-form replies inside the 24-hour window used to be free. From 1 Oct 2026 they are a paid category with a **monthly free tier** ("free tier of monthly service messages", reported elsewhere as 1,000 per business number per month) | Every bot reply can now cost the client money. Message count matters more than token count |
| **A business can only send free-form replies inside an open 24-hour window**, which opens and resets each time the customer messages | The bot can only answer. It can never initiate. No reminders, no follow-ups, without approved templates |
| **Business-initiated messages need approved templates** (utility for order updates, marketing for promotions), and marketing is the expensive category | Anything proactive becomes: template + approval + cost + opt-in |
| **Charges apply only to delivered business→user messages.** User→business is free | Inbound is free. Good: reading is free, replying costs |

**Nigeria rates — do not trust a single blog.** Sources published this month
give **$0.0067** and **$0.0101** per service/utility message for Nigeria
(≈₦10–₦16). Marketing is ~$0.05. Meta's authoritative figure is on the rate
card for the client's market, and it must be read there per client. I will not
hardcode a naira figure into anything.

## 2. What this does to the product

Three things collapse, one thing gets much better, one gets worse.

**Collapses:**
- The **website widget is no longer the product.** It becomes a secondary channel.
- **Handoff-to-WhatsApp disappears as a concept.** The customer is *already* in
  WhatsApp. "Handoff" now means: stop replying, and let the owner answer in the
  same thread. That is Meta's own human-agent flow, not a `wa.me` link.
- **CORS, the demo page, `index.html`, `demo.js`, `demo.css`, the widget CSS** —
  either deleted or demoted to a small landing/privacy page.

**Gets much better — and this is the real win:**
- **Identity is free and verified.** Meta sends `wa_id`, the customer's own
  number, signed by Meta. So "where is my order" no longer needs a phone-number
  form, and no customer can look up somebody else's order by typing a different
  number. The identity rule gets *stronger*, not weaker.
- **The first genuine webhook arrives**, which finally exercises rule 3 of your
  prompt properly: Meta signs every webhook with `X-Hub-Signature-256`, an HMAC
  of the **raw body** using the app secret. Constant-time compare, reject on
  mismatch, idempotent on `message.id`.

**Gets worse:**
- **A paid service is now unavoidable.** Meta charges per delivered message.
  Your brief says "no paid services of any kind". That line is now impossible to
  honour, and the client pays it, not you. This needs your explicit decision.
- **Duplicate replies are a real risk.** Meta retries a webhook if you are slow.
  Stopping a retry from becoming a second reply needs idempotency on a message
  id — which needs somewhere to remember. In-memory does not survive serverless.
  Without a store, a retried message can produce two replies and two charges.

## 3. Revised architecture — one core, two doors

```
lib/core/          ← unchanged by the channel decision
  facts.mjs          load + validate the owner's facts file
  personas.mjs       allowlist, cache
  validate.mjs       input + output validation, allowlists, caps
  phone.mjs          normalisePhone(), isValidNgPhone()
  redact.mjs         redactDigits() before any model call
  status-text.mjs    deterministic reply, Africa/Lagos
  providers.mjs      Gemini → Groq failover
  adapters/demo.mjs  findRecord(persona, reference, phone)

channels/whatsapp/
  webhook.mjs        GET verify, POST receive, X-Hub-Signature-256, idempotency
  send.mjs           one place that calls the Graph API
  format.mjs         WhatsApp-safe text: no markdown, length caps, no HTML
  templates/         utility templates for order updates (approval required)

channels/webchat/    ← keep it; it costs nothing and sells to site owners
  reuse of the existing widget, rebuilt in Step 6 if you want it
```

**Everything we already planned in `lib/` survives the channel change.** Step 3
does not change at all — `phone.mjs`, `validate.mjs`, `redact.mjs`,
`status-text.mjs`, `personas.mjs` are pure functions and stay. That is the
strongest argument for this shape: we change the door, not the house.

**Dependencies: still zero.** The Cloud API is plain HTTPS in and out. No SDK.
Netlify functions can host the webhook.

## 4. What the product actually becomes

Not "a chatbot". For a WhatsApp-only business the product is:

> **The customer who messages at 11pm gets an answer in four seconds, from the
> owner's own approved facts, and a human takes over the moment it matters.**

Three capabilities, in order of what a Lagos business will pay for:

1. **Never miss a customer.** Answers the same ten questions at any hour, in the
   same thread the customer already uses. Sells itself: the owner can see the
   messages the bot handled overnight.
2. **Tell me about my order.** Identity-verified by `wa_id`. No form, no number
   to type, nobody else's order visible.
3. **Know when to stop talking.** Escalates to the owner with context. A bot that
   refuses well is more valuable than one that answers everything.

**The competitive truth:** WhatsApp bot platforms in Nigeria are crowded — BSPs,
no-code builders, template packs. Yours is different in exactly two ways worth
charging for: it goes **direct to Meta's Cloud API with no BSP markup**, and it
is **bounded to approved facts** rather than a general assistant that improvises.
Do not sell it as "AI". Sell the reliability.

## 5. Cost model — the client pays per message, so say so

Per client, per month, roughly:

| Item | Who pays | Note |
|---|---|---|
| Meta service messages | client's card | free tier ~1,000/month per number, then ~₦10–16 each. Confirm on the rate card |
| Model tokens | client's card | negligible at this volume (~₦1,000–3,000/month) |
| Netlify | client's account | Free tier is enough for a small business |
| WABA / phone number | client owns | Must be theirs, not yours — see D10 |

**This changes the gig.** You can no longer say "free forever". The honest line
is: "Meta charges per message after a free monthly allowance; your bill will be
a few thousand naira a month at your volume, and I will show you the count."

## 6. Decisions to conclude before any code

**D7 — WhatsApp as the only channel?**
- **A.** WhatsApp-first, keep web chat as a second door reusing the same core *(recommended — the core is already written and works on both)*
- **B.** WhatsApp only, delete the web pieces

**D8 — the paid-service rule.**
Your brief bans paid services. Meta's per-message charge is unavoidable.
- **A.** Approve it explicitly, name it in the handover, pass Meta's charge to the client *(recommended)*
- **B.** Absorb Meta's cost into a monthly retainer of your own
- **C.** Stop — this is a dealbreaker

**D9 — idempotency store.**
Meta retries webhooks; a retry without a store can mean two replies and two charges.
- **A.** Netlify Blobs — built in, free tier, no external database *(recommended)*
- **B.** Accept occasional duplicate replies, write it in the handover
- **C.** A real database, which breaks your no-database rule

**D10 — who owns the WhatsApp Business Account.**
- **A.** The client owns the WABA and phone number, you are added as a developer *(recommended — matches your own handover rule)*
- **B.** You own one WABA for all clients and bill them *(simpler for you, worse for them, and hard to unwind)*

**D11 — is "order taking" still in scope?**
Bot 2 from your last message. In WhatsApp this means: split the order, draft it,
and hand to the client's checkout link — no payment inside chat.
- **A.** Draft + hand off *(recommended, as before)*
- **B.** Not in v1 — answer and track only

## 7. What I need from you to actually start

Not keys — never keys. Just:

1. **Which client, first?** One real business you can install for. WhatsApp-only
   means I need to know if they already have a WhatsApp Business number they are
   willing to move onto the Cloud API, or a spare number.
2. **D7–D11**, or "all recommendations".
3. **Business verification:** Meta requires a verified business for higher
   messaging tiers. Ask the client whether they have a CAC-registered business
   name — approval is far easier with one, and this blocks a launch more often
   than code does.

Step 3 (pure modules + tests) can start the moment D7–D11 are answered, because
`lib/core/` is identical either way.
