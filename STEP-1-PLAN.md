# Step 1 — Plan. No code.

BraceScripts Assistant. Verified 2026-11-09. Nothing is built, nothing deployed.

---

## FINAL SCOPE (settled 2026-11-09)

**Website-first. The bot lives on a site and hands to WhatsApp. No Cloud API.**

Client type: a business that takes orders manually in WhatsApp today and wants
a front desk on its website. Not a WhatsApp migration — a website that qualifies
the visitor and passes them into the WhatsApp thread the owner already works in.

What this restores: no paid messaging service, no WhatsApp Business Account, no
message templates, no 24-hour window, no idempotency store, no business
verification. `wa.me` is free. The original constraints hold.

Three tiers, one codebase, declared per business in `config.json`:

| Tier | Capability | Ships when |
|---|---|---|
| T1 | Answer only from the facts file | Every install. This is the wedge |
| T2 | Qualify an order, draft it, hand to WhatsApp with the itemised context pre-filled | Client wants more |
| T3 | Track a reference | Only when the client has structured order data — see below |

The order of T1 → T2 → T3 is correct, with one practical caveat: **a business
that takes orders by hand in WhatsApp has no order data to track.** T3 is
blocked by the client's records, not by our code. For most of these clients T2
is the ceiling until they adopt a real order system.

WhatsApp button appears when: the bot cannot help, the visitor asks for a
human, or (T2) an order draft is ready and the visitor wants to send it.

`ARCHITECTURE-V2-WHATSAPP.md` is **superseded**. Kept only as a record of the
WhatsApp Cloud API pricing research, in case a client later wants a native
WhatsApp channel as a separate paid project.

**Verdict up front:** your spec is buildable on the fixed decisions. Four claims
in it check out against provider docs today. **Two numbers in it fail
arithmetic**, and both matter — see §2. Those are two of the four decisions at
the end.

---

## 0. Verification log

Checked today, not recalled. Anything I could not check is marked unverified.

| Claim in your brief | Result | Where |
|---|---|---|
| Gemini model id `gemini-3.5-flash-lite` | **CONFIRMED**, listed as an endpoint | [models page](https://ai.google.dev/gemini-api/docs/models) |
| Groq `openai/gpt-oss-20b` supports `strict: true` | **CONFIRMED**, in the strict-mode table | [structured outputs](https://console.groq.com/docs/structured-outputs) |
| Groq limits: 30 RPM · 1,000 RPD · 8K TPM · 200K TPD | **CONFIRMED, all four** | [rate limits](https://console.groq.com/docs/rate-limits) |
| Netlify code-based rate limits in the function `config` | **CONFIRMED**; requires `path`; cannot go in `netlify.toml` | [rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/) |
| Netlify Free = exactly 2 code-based rules per project | **CONFIRMED** — Free/Starter/Personal = 2 | same page, availability table |
| `included_files = ["business/**"]` | **NOT VERIFIED** — no page found back to it. Will confirm on the Step 2 probe before relying on it | — |
| Gemini free tier "roughly 500 requests/day for Flash-Lite" | **UNVERIFIED and stale.** Google's page says limits are viewable per account in AI Studio and are not guaranteed. Treat as unknown until measured on the real key | [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| Netlify "15 credits" for a production deploy | **NOT VERIFIED** — pricing changes; I will not quote your credit balance back at you | — |
| Groq strict mode supports primitive `null` union (`"string" \| null`) | **UNVERIFIED.** Their docs warn that strict requirements are strict. Avoided by making `reference` a plain string — see §3.3 | — |
| Groq strict mode and `anyOf`/`oneOf` | **Not relied on.** Schema kept flat and fully `required` | — |

### Two findings you should know before Step 2

1. **Netlify enforcement lags up to 10 seconds.** Their docs: "Once a client
   crosses the threshold, it can take up to 10 seconds before Netlify starts
   blocking… Requests sent during that interval may still reach your project."
   At 10 requests/60 s, one IP can land ~20+ model calls in the gap. The project
   has no in-function limiter by design. Mitigation is decision D1.

2. **Groq 8K TPM makes FALLBACK the budget, not the exception.** Arithmetic in
   §2. Short version: after one fallback request, the next visitor waits up to
   60 s of window, and a third cannot be served at all.

---

## 1. File tree

Exactly as specified. Every file present, none added.

```
/
├─ index.html                       demo page + persona switch
├─ demo.css                         ≤ 20 KB
├─ demo.js                          persona switch, sample buttons, provider chip
├─ widget/
│  ├─ chat-widget.js                ≤ 25 KB unminified, reads data-* attributes
│  └─ chat-widget.css               CSS variables for accent
├─ business/
│  ├─ exchange/{config.json, facts.md, demo-data.json}
│  ├─ food/    {config.json, facts.md, demo-data.json}
│  └─ cleaning/{config.json, facts.md, demo-data.json}
├─ Netlify/functions/
│  ├─ chat.mjs                      POST /api/chat
│  └─ order-status.mjs              POST /api/status — never calls a model
├─ lib/
│  ├─ providers.mjs                 Gemini → Groq failover
│  ├─ personas.mjs                  load + cache an allowlisted persona
│  ├─ validate.mjs                  input + output validation, allowlists, caps
│  ├─ phone.mjs                     normalisePhone(), isValidNgPhone()
│  ├─ redact.mjs                    redactDigits()
│  ├─ status-text.mjs               deterministic reply, Africa/Lagos
│  ├─ http.mjs                      json(), cors(), originAllowed(), readJson()
│  └─ adapters/demo.mjs             findRecord(persona, reference, phoneCanonical)
├─ tests/
│  ├─ phone.test.mjs  validate.test.mjs  redact.test.mjs
│  ├─ status-text.test.mjs  personas.test.mjs
│  └─ adversarial.md                manual checklist, ≤ 25 real calls
├─ docs/
│  ├─ INSTALL.md  WRITING-FACTS.md  CONNECT-DATA.md
│  ├─ HANDOVER-TEMPLATE.md  GIG.md
├─ _headers
├─ netlify.toml
├─ package.json                     type: module, no dependencies
├─ .gitignore
└─ README.md
```

**Two import-path points, decided now to avoid a Step 2 correction.** Your tree
has `Netlify/functions/` (capital N) and `lib/` at the root, so a function
reaches the shared code by `../../lib/`. Nothing else needs to move.

---

## 2. Two numbers that don't work as written

### 2.1 Facts budget vs system prompt

| Item | Tokens (est.) |
|---|---|
| Prompt rules + schema instructions | ~250 |
| Persona config (statuses, refusals, greeting) | ~150 |
| **facts.md at your 6,000-char cap** | **~1,600** |
| 6 history turns × 400 chars | ~600 |
| User message, 500 chars | ~125 |
| Output cap 600 chars | ~150 |
| **Total** | **~2,875** |

Your brief caps the whole prompt at **~1,800 tokens**. A 6,000-character
`facts.md` alone is ~1,600 of it. The two caps cannot both hold. And the *food*
persona's menu plus the *exchange* persona's fee and KYC tables will genuinely
want 4–5 KB.

### 2.2 Groq 8K TPM, worked through

| Step | Requests | Tokens that minute | Groq verdict |
|---|---|---|---|
| Request 1 | 1 | ~2,900 | OK, ~5,100 TPM left |
| Request 2 | 2 | ~5,800 | OK, ~2,200 left |
| Request 3 | 3 | ~8,700 | **TPM exceeded** |
| Request 3 after two failures | 4 | — | **TPM exceeded. Fallback chain has no third provider** |

So: when Gemini is down, **two visitors are served and the third gets
`502 {"error":"unavailable"}`** — and only after the 8 s Gemini timeout has also
burned. Requests 4 and 5 of your Step 4 probe would see that.

That is not a reason to change providers. It is a reason to state the fallback
capacity honestly in `HANDOVER-TEMPLATE.md` and the gig, because a client who
believes failover is unlimited will be surprised on their busiest day.

Two cheap mitigations, both inside your fixed decisions: trim the prompt
(§2.1 numbers), and remember Groq counts cached tokens at zero — a cacheable
system prefix is a free win on repeat traffic.

### 2.3 Does this ceiling apply when the client pays? (added 2026-11-09)

Four ceilings are being conflated. Only one is about tokens, and only one is
lifted by paying.

| Ceiling | Owned by | Free | Client pays | Applies to a paying client? |
|---|---|---|---|---|
| Per-visitor limit, 10 req/60 s | **us**, `config` | 10/min | 10/min | **Yes, unchanged.** It is our code, not a provider policy |
| RPM / TPM / RPD | Google, Groq | tight | higher, per tier | Yes, with far more headroom |
| Money | client's card | hard stop at quota | **no cap — meter runs** | Risk inverts from "bot stops" to "bill climbs" |
| Netlify invocations/bandwidth | Netlify plan | Free allowance | unchanged **if they stay on Free** | Yes — a Google key does not lift Netlify's allowance |

**The 8K TPM bottleneck (§2.2) is a free-tier Groq problem.** Paid Groq removes
it. At ~1,825 in + 150 out tokens per call (verified 2026-11-09, Gemini 3.5
Flash-Lite paid rates of $0.30 in / $2.50 out per 1M):

| TPM ceiling | Calls/min for one client | | Volume | Cost/month |
|---|---|---|---|---|
| 8,000 (Groq free) | 4.1 | | 1,000 calls | $0.92 |
| 250,000 | 127 | | 3,000 calls | $2.77 |
| 1,000,000 | 506 | | 10,000 calls | $9.22 |

Under 0.1 US cent per conversation. **Volume is not a paying client's risk.**
Abuse is, and rate limits alone do not bound it — a scraper on many IPs gets the
rate limit once per IP. What bounds a paying client's worst day is an
owner-set **spend ceiling**, not a rate limit.

### 2.4 One paid provider or two? (added 2026-11-09)

**One paid provider is enough. Two is an upgrade, not a baseline.** The
two-provider design in the brief exists to survive *free-tier quota*, and paying
removes most of that problem.

The second provider was doing two different jobs. Paying only fixes the first:

| Job | What it protects against | Does paying fix it? | Does a 2nd provider help? |
|---|---|---|---|
| **Quota relief** | "Gemini's free daily cap ran out at 2 pm" | **Yes** — Tier 1 removes it at our volume | Only until Groq's own cap |
| **Availability** | Provider 5xx, hang, regional outage | **No** — paid is not always-up | Yes, but the WhatsApp handoff already covers this |

Dropping the second provider costs less than it looks, and buys three things:

1. **Consistency.** Gemini and GPT-OSS are different models with different
   manners. Two providers means the bot's answers and refusals can differ
   depending on who answered — a client will notice that before you do.
2. **Half the maintenance.** One prompt, one schema dialect, one adversarial
   run. Today it is the Interactions API on Gemini and OpenAI-compatible
   `json_schema` strict on Groq; `providers.mjs` hides the difference but does
   not remove the second surface.
3. **Fewer accounts to hand over.** One key to rotate, one billing
   relationship, one set of data terms to disclose. Gemini paid does not use
   your content to improve their products; Groq does not retain by default.
   Two providers means two disclosures in `HANDOVER-TEMPLATE.md`.

What we give up: the demo chip "answered by Gemini / Groq" stops being true as a
*failover* claim and must be removed or reworded — the truthful-words rule
forbids implying a capability we do not ship. And the Step 4 forced-Groq probe
becomes moot.

**What becomes MORE important, not less:** the spend ceiling (D2b). With two
providers you had a second quota pool to fall into; with one, the only brake is
ours. Note that Google's own Tier 1 has a spend-based rate limit of **$10 per
10 minutes** and a **$250 billing tier cap** (verified 2026-11-09, rate-limits
page) — a real brake, but blunt: it stops a runaway *after* the money moves.

**Recommendation:** ship **one active provider** (`PRIMARY_PROVIDER=gemini`),
keep `lib/providers.mjs` as the adapter so adding Groq later is one key plus one
environment variable and **zero code change**. That also makes a clean
commercial split for the gig: single-provider is the base package; failover is
the paid upgrade. You sell the same code twice.

**Consequence for D2:** the caps become environment variables —
`FACTS_MAX_CHARS`, `HISTORY_TURNS`, `RATE_LIMIT_WINDOW_LIMIT`. Shipped defaults
stay lean (4,000 / 4) so the free demo works; a paying client raises them in the
dashboard with no code change and no review. See revised D2 below.

---

## 3. Contracts

### 3.1 `POST /api/chat`

Request, validated before anything else runs:

```json
{
  "persona": "exchange",
  "message": "string, 1..500 after trim",
  "history": [ { "role": "user|assistant", "content": "string ≤ 400" } ]
}
```

`history` optional, max 6 items, dropped (not rejected) beyond 6. Unknown persona
→ 400. Unknown keys ignored, never forwarded.

Response 200:

```json
{
  "reply": "string ≤ 600",
  "intent": "answer",
  "reference": "SPG-1001",
  "handoff": { "url": "https://wa.me/234…?text=…" },
  "meta": { "provider": "gemini", "ms": 812 }
}
```

`reference` is never `null` — see §3.3. `handoff` is `null` when not offered.
`meta` never carries the model id, token counts or key status.

### 3.2 `POST /api/status`

```json
{ "persona": "food", "reference": "SPG-1001", "phone": "08031234567" }
```

200:

```json
{
  "found": true,
  "text": "deterministic reply",
  "record": {
    "reference": "SPG-1001", "summary": "…", "status": "preparing",
    "statusLabel": "Preparing", "explanation": "…",
    "eta": "2026-11-09T14:20:00+01:00",
    "updatedAt": "2026-11-09T13:05:00+01:00"
  }
}
```

404, byte-identical for unknown reference and wrong phone:

```json
{ "found": false, "text": "We couldn't find a order with that reference and phone number. Please check both and try again, or message us on WhatsApp." }
```

**Grammar bug in the fixed copy:** "a order", "a transaction". The noun must be
injected as `a ${noun}` with the article chosen per noun — `an order`,
`a booking`, `a transaction`. Same wording otherwise, same status code. Not a
re-open of the decision; a fix to one string.

Statuses: `400` · `403` · `405` · `429` (Netlify, empty body) · `404`.
This endpoint never calls a model and never returns a stack trace.

### 3.3 Model output schema (strict, both providers)

```json
{
  "type": "object",
  "properties": {
    "reply":     { "type": "string", "description": "Plain text answer, no markdown, ≤ 600 characters." },
    "intent":    { "type": "string", "enum": ["answer", "track", "handoff", "refuse"] },
    "reference": { "type": "string", "description": "Reference the customer mentioned, or an empty string." }
  },
  "required": ["reply", "intent", "reference"],
  "additionalProperties": false
}
```

**Deviation from your brief, and why:** your schema allows `string | null`.
Groq strict mode requires every field `required` and `additionalProperties:
false`; a nullable union is the kind of thing their validator may reject with
400, and I could not verify it either way. An empty string is a plain `string`,
works on both providers, and the server treats `""` as "no reference". Server
rule: keep the reference only if it matches `referencePattern`, else `""`.

### 3.4 Server rules after the model answers

Applied in this order, every one deterministic:

1. `intent` not in the enum → `answer`.
2. `reply`: strip HTML tags, strip markdown markers, collapse whitespace, trim, cap 600.
3. `reference`: empty or non-matching `referencePattern` → `""`.
4. Deterministic handoff, independent of the model: message matches
   `human|agent|person|call me|speak to someone` → `handoff` set, even if the
   model said `answer`.
5. `handoff.url` built server-side only: `config.whatsapp`, persona name, last
   message first 150 chars **with digit runs redacted**, reference if any.
   The client can never supply the URL.

### 3.5 `config.json` schema

```json
{
  "key": "food",
  "name": "Fatima Spagogo",
  "label": "Food delivery",
  "demo": true,
  "trackingNoun": "order",
  "referencePattern": "^SPG-\\d{1,6}$",
  "whatsapp": "234XXXXXXXXXX",
  "timezone": "Africa/Lagos",
  "greeting": "…",
  "statuses": { "preparing": { "label": "Preparing", "explanation": "…" } },
  "refusals": ["…"]
}
```

Validated at load: `key` must equal the folder name; `referencePattern` must
compile and be anchored; `whatsapp` must be digits only, 10–15; every status key
used in `demo-data.json` must exist in `statuses`; `trackingNoun` must be one of
`order|booking|transaction`.

### 3.6 `facts.md` template

Sections in fixed order: `About · Services & prices · Hours · Areas · How to
order/book · Payments · Policies · Tone · Never do`. Parsed as plain text into
the prompt, not markdown-rendered. Cap per D2. An absent section means the bot
says it does not have that information — absence is a feature, not a gap.

### 3.7 `demo-data.json` record schema

```json
{
  "reference": "SPG-1001",
  "phone": "0999000001",
  "summary": "Chicken spaghetti, medium",
  "status": "preparing",
  "etaOffsetMinutes": 35,
  "updatedAtOffsetMinutes": -12
}
```

`eta` may be `etaOffsetMinutes` (demo only, resolved at request time so the demo
never looks stale) or an absolute `eta` (real adapters). A record with neither
gets an explanation sentence instead of a time — never a guess.

### 3.8 Environment variables

| Name | Value | When you set it |
|---|---|---|
| `GEMINI_API_KEY` | secret | Step 4 |
| `GROQ_API_KEY` | secret | Step 4 |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Step 4 |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Step 4 |
| `PRIMARY_PROVIDER` | `gemini` | Step 2 |
| `FALLBACK_PROVIDER` | `groq` | Step 2 |
| `ALLOWED_ORIGINS` | production URL + `dev--` URL, comma-separated | Step 2 |
| `CHAT_ENABLED` | `true` | Step 2 |
| `DATA_SOURCE` | `demo` | Step 2 |
| `FACTS_MAX_CHARS` | `4000` (raise for a paying client) | Step 3 |
| `HISTORY_TURNS` | `4` | Step 3 |
| `RATE_LIMIT_WINDOW_LIMIT` | `10` | Step 4 |
| `SPEND_CEILING_PER_DAY` | off unless D2b = A | Step 6 |

One at a time, named one at a time, and I never ask for a value.

### 3.9 Function `config` exports — the 2-rule budget

```js
// Netlify/functions/chat.mjs
export const config = { path: "/api/chat",   rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] } };

// Netlify/functions/order-status.mjs
export const config = { path: "/api/status", rateLimit: { windowLimit: 6,  windowSize: 60, aggregateBy: ["ip", "domain"] } };
```

Exactly 2 rules, which is the Free plan maximum. Both paths are `config.path`,
so no redirects are needed. If we ever need a third protected path, one of these
has to go — that is the whole budget.

---

## 4. Risks and mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Quota burn** — public demo, 2 free keys, no per-user identity | High | Netlify limits + Gemini to Groq failover + `CHAT_ENABLED=false`. Plus D1. |
| R2 | **Prompt injection** — visitor tries to make it promise a price, reveal the prompt, become admin | High | Facts are the only source; no tools, no writes, no DB access from the model; strict schema re-validated server-side; deterministic handoff triggers the model cannot suppress; adversarial.md run after every prompt change. |
| R3 | **Reference enumeration** — script walks `SPG-1000…SPG-999999` to learn order statuses | High | Reference **and** phone must match; identical 404 body and code for both failure modes, so a hit cannot be told from a miss; 6 req/60 s on `/api/status`. Phone canonicalised before compare. |
| R4 | **CORS misuse** — someone embeds the widget on a site you did not authorise | Medium | Exact `ALLOWED_ORIGINS` match, 403 otherwise, `Access-Control-Allow-Origin` echoes only an allowed origin. Honest limit: a non-browser script can forge `Origin`; R1 and R3 are what address that. |
| R5 | **Stale facts** — owner changes prices, facts.md not updated, bot quotes old ones | Medium | `facts.md` in git, reviewable diff; `WRITING-FACTS.md` says plainly that the bot's answer is only as current as the file; handover gives the exact edit-and-deploy steps. |
| R6 | **Groq TPM ceiling** — failover serves 2 requests then degrades | High | Stated in handover and gig; prompt trimmed (§2.1); failure copy is honest (`429 busy` / `502 unavailable`), never silence. |
| R7 | **Netlify 10 s rate-limit lag** | Medium | D1. |
| R8 | **Phone numbers reaching a model** | High | `/api/status` never calls a model; `redact.mjs` strips 7+ digit runs before every `/api/chat` call; logs carry no phone. Unit-tested. |
| R9 | **Invented ETA** | High | ETA comes only from stored data via `status-text.mjs`; if no ETA exists the reply says so. The model never sees order data at all. |
| R10 | **Provider silently changes model behaviour** | Medium | Model ids pinned in env, not hardcoded; adversarial.md catches drift; `GEMINI_MODEL` is an env var precisely so a swap is a field, not a code change. |
| R11 | **Netlify Free credits** — a busy demo could burn the monthly allowance | Medium | Demo page is the only traffic source; both functions rate-limited; handover states the plan limit and the upgrade path. |

---

## 5. Four decisions I need from you

Each with a recommendation. Say only the numbers you want; no other answer
needed.

### D1 — In-function rate limiter, or not? **(my recommendation: yes, small)**

Your brief says limits are Netlify's job. Netlify's own docs say enforcement
can lag up to 10 seconds, which at 10/60 s means ~20 model calls can slip
through per IP per lapse — on two free-tier keys. A ~40-line in-memory
token-bucket in `lib/http.mjs` (fixed-window per IP, per instance) closes most
of the gap. It is not distributed and resets on cold start, and I will say so in
the handover. Zero dependencies, one file, one test.

- **A.** Add it (recommended) · **B.** Netlify only, as specified

### D2 — Facts cap and history size **(revised: lean defaults, read from env)**

`facts.md` 6,000 → **4,000 characters**; history 6 turns × 400 → **4 turns ×
300**. Keeps the total prompt near ~1,800 tokens as your brief intends, keeps
Groq's 8K TPM serving 3 fallback requests per minute instead of 2, and still
fits all three personas' real content.

**Revised after your paid-key question (§2.3):** the caps become environment
variables, not constants — `FACTS_MAX_CHARS`, `HISTORY_TURNS`,
`HISTORY_TURN_CHARS`, `RATE_LIMIT_WINDOW_LIMIT`. Shipped defaults stay lean so
the free demo survives; a paying client raises them in the dashboard.

- **A.** Lean defaults in env (recommended) · **B.** Hard-code 6,000 / 6 · **C.** You give me a different pair

### D5 — How many providers ship active? **(my recommendation: one)**

Per §2.4. The adapter stays either way, so this is a config decision, not an
architecture decision, and it is reversible in one dashboard field.

- **A.** One active (Gemini), failover available as an upgrade (recommended)
- **B.** Two active, as originally specified
- **C.** One active (Groq) — Gemini's free tier trains on your data, so if the client may ever stay free-tier, Groq is the safer default

### D2b — Owner-set spend ceiling? **(my recommendation: yes)**

A per-visitor rate limit does not bound the bill: a scraper on many IPs gets the
limit once per IP. An owner-set daily/monthly ceiling (a counter that returns
`429 busy` and the WhatsApp button once hit) is what actually bounds a paying
client's worst day. ~30 lines, in memory per instance, resets on cold start —
same honest limitation as D1. Without it, a paying client's only cost control
lives in the Google and Groq dashboards, not in your product.

- **A.** Add it (recommended) · **B.** Out of scope — owners use the provider dashboards

### D3 — WhatsApp number and persona facts gaps **(blocking Step 2)**

`whatsapp` is `234XXXXXXXXXX` in all three configs until you give me the real
number. It is public through `wa.me` either way, but I need it to build the
handoff. Also two content gaps: cleaning pricing is `[I will confirm or
replace]`, and the exchange name is `[EXCHANGIFY]`. I will use those placeholders
verbatim and label them as placeholders in the demo unless you say otherwise.

- **A.** You will paste the number and the two gaps now
- **B.** Build Step 2 with a clearly-marked placeholder number, swap it in Step 6
- **C.** Something else

### D4 — Where the demo persona switch lives **(my recommendation: a free path)**

A `?persona=food` query on the demo page, read only by `demo.js`, plus buttons.
Server-side, `persona` stays an allowlist of exactly three keys. This matters
because the exchange persona is fictional: if its demo data shows up on the food
or cleaning persona, your demo is making a false claim. Options:

- **A.** Query param + buttons, allowlist of 3 (recommended) · **B.** Separate URL per persona (`/food/`, `/cleaning/`) · **C.** Dropdown only, no URL

---

## What I have not done

No code. No repo, no Netlify site, no keys, no deploy. I have not touched
Spagogo or any existing project. The two unverified items in §0 —
`included_files` and the Gemini free-tier number — are marked unverified, and
the `included_files` probe is the first thing Step 2 will prove.

Say **go** with D1–D4, and I will deliver Step 2 as one message: the whole
skeleton, the terminal block, and the 10-second checks.
