# Handover

What you have, what it costs, what breaks, and how to change things without me.

Written for the business owner, not for a developer. Where a step needs a
developer, it says so.

---

## 1. What this is

A chat box on a website that does three things:

1. **Answers questions** from a facts file you write yourself.
2. **Checks an order** when a customer gives a reference number *and* the phone
   number used to order.
3. **Hands over to WhatsApp** when it cannot help, with the customer's question
   already typed into the message.

The same code runs all three demo businesses on the page. That is the point: a
new client is a new folder, not new code.

---

## 2. What it costs to run

| Thing | Free tier | What happens at the limit |
|---|---|---|
| Netlify hosting | 100 GB bandwidth, 125k function calls/month on Free | Site keeps serving; functions stop |
| Model — Gemini | Free tier, daily cap | Bot says it cannot answer and offers WhatsApp |
| Model — Groq | Free tier, fallback only | Same |
| WhatsApp | **Free.** Plain `wa.me` link, no Business API, no per-message fee | — |

**Nothing here bills by the message.** The `wa.me` link opens the customer's own
WhatsApp app with a prefilled message. You are not paying Meta for that, and you
do not need a WhatsApp Business account, templates, or business verification.

The cost that does exist is attention: every customer who reaches WhatsApp is a
message you answer by hand.

### If usage outgrows the free tiers

The model keys are the first thing to outgrow. Paid tiers are cheap at low
volume — a food business answering a few hundred questions a day is well under
the price of one staff lunch per month. **Do not buy anything until you see the
bot returning `502 unavailable` during normal business hours.** That is the
signal, not a guess.

---

## 3. What it will not do

Say these out loud to a client before they expect them:

- **It cannot see your order system.** It reads one JSON file you update. If you
  do not update it, the customer gets an out-of-date status that looks confident.
- **It will not remember the conversation** beyond the last few messages.
- **It cannot take payment, book a table, or send a message on its own.**
- **It cannot answer a question that is not in your facts file.** It says so and
  hands over. That is deliberate — a bot that guesses a price is worse than one
  that admits it does not know.

---

## 4. Changing things yourself

### Prices, hours, delivery areas — one file

`business/<client>/facts.md`. Plain text, plain language. It is the only place
the bot gets answers from.

Rules that matter:

- Write prices exactly how you want them spoken. If the file says `N2,000` the
  bot says "N2,000", not "₦2,000".
- One fact per line. The bot quotes lines.
- Delete the line when something stops being true. Do not append a correction —
  a bot reading two contradictory lines will pick either one.
- **After editing, run the adversarial checklist (`docs/ADVERSARIAL.md`),
  section 1 at least.** A typo in a price is quoted to customers verbatim.

### The WhatsApp number — one line

`business/<client>/config.json`, line 8:

```json
"whatsapp": "2348183981160",
```

Digits only. Country code, **no leading zero**. 10 to 15 digits. This file
exists once per client, so change it in each one.

Check it without deploying:

```bash
node -e "const c=require('./business/food/config.json');if(!/^[1-9]\d{9,14}$/.test(c.whatsapp))throw new Error('bad number: '+c.whatsapp);console.log('ok',c.whatsapp)"
```

### Order statuses — one file

`business/<client>/demo-data.json`. Each record needs `reference`, `phone`,
`summary`, `status`, and a time offset in minutes. `status` must be one of the
keys in that client's `config.json` under `statuses`, or the lookup refuses to
show it.

### Who you can see the work

Everything above is a text file in a git repository. Every change is visible and
reversible. Nothing lives only inside my head or inside a dashboard.

---

## 5. Connecting a real order system (needs a developer)

One file: `lib/adapters/demo.mjs`. Its only job is to take a reference and a
phone and return either `{ found: false }` or a record.

Two rules that must survive the swap:

1. **A wrong phone must return exactly what a wrong reference returns.** Same
   status code, same words. Otherwise the endpoint becomes a free tool for
   finding out whether an order number exists.
2. **A real adapter must run the phone through `normalisePhone()`.** The demo
   data uses numbers like `0999000001` that are deliberately not allocated
   Nigerian mobile ranges, so the demo adapter compares digits only. Real
   customer numbers need the real check.

Never return the phone number, address, email or customer name in the response.
The customer already knows their own details; the response only has to confirm
the status.

---

## 6. When something looks wrong

| What the customer sees | What it usually means | What to do |
|---|---|---|
| "I cannot answer right now" | Daily model quota finished | Nothing. It recovers the next day. Offer WhatsApp in the meantime |
| "Something went wrong on our side" | The `business/` folder was not bundled | Check `included_files` in `netlify.toml`. Needs a developer |
| WhatsApp button opens an empty chat | The number in `config.json` is wrong | Run the check in §4. It fails silently on a phone |
| A price is wrong | `facts.md` is stale | Edit the file. This is the most likely problem, always |
| No reply at all | `CHAT_ENABLED` is set to `false` | Site configuration → Environment variables |
| It answers a question it should refuse | `facts.md` contains the answer, so it gave it | Remove the line, or add a refusal |

---

## 7. Handing it to another developer

They need, in this order:

1. The repository, and the Netlify site linked to it.
2. `GEMINI_API_KEY` in Netlify → Site configuration → Environment variables,
   **scope: Builds and Functions, deploy context: Production only.** A key added
   only to "Deploy previews" behaves exactly like no key at all.
3. `docs/ADVERSARIAL.md`, run once before touching anything, so they know what
   "working" looks like on day one.
4. `npm test` — 99 assertions, no dependencies, no network.

Everything else is in the repository's `README.md`.

---

## 8. Honest limits of this build

Written down so nobody discovers them in front of a client.

- **The rate limiter is in memory.** Each server instance counts separately, so
  the real limit under load is looser than the number in the config. It stops a
  casual script, not a determined attacker. Fixing it properly needs a shared
  store, which this build deliberately does not have.
- **Groq failover is configured but untested in production**, because no
  `GROQ_API_KEY` has been set. If Gemini's quota runs out, the bot says it
  cannot answer rather than failing over. Adding the key makes the fallback
  live; it has not been proven to work end to end.
- **`wa.me` has been verified from a phone once**, on 12 November 2026. A number
  with the wrong digit count fails silently inside WhatsApp — it opens the app,
  then shows an invalid-contact error. Re-check it whenever the number changes.
- **The demo order data is static.** Statuses only move because someone edits
  `demo-data.json`. Nothing updates itself.
- **One model call per message.** No caching, no reuse. Repeated identical
  questions cost the same as new ones.
