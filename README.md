# JARVIS

Sanjeev's personal agent. Three parts, all free:

| Part | Where it runs | What it does |
| --- | --- | --- |
| **JARVIS panel** | `/jobai` (any device) | Chat + voice. Plans the day, adds tasks and reminders, drafts mail, teaches DSA, preps interviews. Anything major shows an approval card first. |
| **Daemon** `npm run jarvis` | your Mac | Works while you're away: 08:00 morning brief, 21:30 nightly report, reminders, urgent-mail and job alerts, Telegram chat, inbox triage. Never sends anything without your tap. |
| **Mac agent** `npm run jarvis:agent` | your Mac | Screen (with on-device OCR), documents, apps, links, Reminders, Calendar, clipboard, Shortcuts. Every action pops a native "Allow?" dialog. |

## Set up in one place

Open **/jobai → Setup**. It shows every fail-proof chain with live status lights. Paste a key there and it is tested against the real service, saved to `.env.local` and used straight away. No restart needed, even by the daemon.

## Talk to it

Press **📞** in the JARVIS panel. It's a hands-free voice call:
- **Voice:** it greets you, listens, answers out loud and listens again.
- **Interrupt:** tap the reactor; say "goodbye" to end.
- **Speaking:** a neural British voice that runs on your GPU, with the browser's voice as fallback.
- **Listening:** the browser's speech recognition, with on-device Whisper as fallback (works in any browser).

## Keep it running

`npm run jarvis:autostart` starts the daemon and the Mac agent at login and restarts them if they stop.
`npm run jarvis:autostart -- remove` removes them.

## Brain: free forever

JARVIS only uses free models, in this order:

1. **Ollama on your Mac** (installed, runs as a background service): free forever, no key, private (nothing leaves the Mac).
   The `jarvis` model is qwen3:8b with a 16k context window built in (`ollama create jarvis` from a Modelfile with `PARAMETER num_ctx 16384`).
2. **Gemini** (`GEMINI_API_KEY`, free tier, no card: https://aistudio.google.com/apikey). Needed when the site runs on Vercel, where your Mac isn't reachable.
3. **Groq** (`GROQ_API_KEY`, free tier, no card: https://console.groq.com/keys).
4. **Pollinations** (no key). Public questions only: your tasks, mail, documents and resume are never sent to it.
5. **A model inside the browser** (WebLLM on WebGPU), if every server brain is unreachable.

Alerts go to Telegram first, then email, then a Mac notification. Urgent alerts are also spoken aloud on the Mac, except between 23:00 and 07:00.
Mail goes through one-tap Gmail send first, then a pre-filled Gmail compose window, then the clipboard.

## Telegram (free texts + alerts on your phone)

1. In Telegram, open **@BotFather** → `/newbot` → copy the token.
2. Add `TELEGRAM_BOT_TOKEN=…` to `.env.local` and run `npm run jarvis`.
3. The terminal shows a pairing code. Send `/start <code>` to your bot. Only that chat is accepted from then on.

Commands: `/brief` `/report` `/tasks` `/jobs` `/mail`. Or just talk: "remind me at 8 pm to apply to Salesforce".

## Gmail (send mail + inbox triage)

Google Account → Security → 2-Step Verification → **App passwords** → create one for "JARVIS".
Add `GMAIL_USER=sanjeevsudarsanam@gmail.com` and `GMAIL_APP_PASSWORD=…` to `.env.local`.
JARVIS reads new mail without marking it read, flags interviews/offers/recruiters, and drafts replies you approve with a tap.

## Settings (`.env.local`)

```
JARVIS_BRIEF_AT=08:00
JARVIS_REPORT_AT=21:30
OLLAMA_MODEL=qwen3:8b
JARVIS_ORIGINS=http://localhost:3000,https://<your-site>.vercel.app   # Mac agent: sites allowed to talk to it
JARVIS_FOLDERS=Documents,Desktop,Downloads                             # Mac agent: readable folders
```

`npm run jarvis:preview` prints today's brief and report without sending anything.
