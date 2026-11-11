"use client";

import { useCallback, useEffect, useState } from "react";
import { agentStatus } from "@/lib/hub/agent";
import { earEngine, neuralState, warmVoice } from "@/lib/hub/jvoice";
import { llmSupported } from "@/lib/llm/onDevice";
import h from "./Hub.module.css";
import s from "./Setup.module.css";

type Status = {
  canWrite: boolean;
  brains: string[];
  ollama: { up: boolean; model: string };
  keys: { gemini: boolean; groq: boolean; openrouter: boolean; telegram: boolean; gmail: boolean };
  telegram: { bot: string | null; linked: boolean; link: string | null };
  daemon: { running: boolean; lastSeen: number };
};
type Layer = { name: string; on: boolean | null; note?: string };

/** Connections: every fail-proof chain with live status, and one-time key setup (tested before saving). */
export default function Setup() {
  const [st, setSt] = useState<Status | null>(null);
  const [agent, setAgent] = useState(false);
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch("/api/hub/setup", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setSt((await r.json()) as Status);
    setAgent(!!(await agentStatus()));
  }, []);
  useEffect(() => {
    warmVoice();
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const submit = async (kind: string, extra: Record<string, string> = {}) => {
    setBusy(kind);
    const r = await fetch("/api/hub/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value: vals[kind], ...extra }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string } | null;
    setMsg((m) => ({ ...m, [kind]: { ok: !!j?.ok, text: j?.error ?? j?.detail ?? "Couldn't reach the server." } }));
    if (j?.ok) setVals((v) => ({ ...v, [kind]: "" }));
    setBusy(null);
    void load();
  };

  const k = st?.keys;
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const chains: { title: string; layers: Layer[] }[] = [
    {
      title: "Brain (who answers)",
      layers: [
        { name: "Ollama on your Mac", on: st ? st.ollama.up : null, note: "free forever · private" },
        { name: "Gemini (free key)", on: k ? k.gemini : null, note: "works on Vercel" },
        { name: "Groq (free key)", on: k ? k.groq : null },
        { name: "OpenRouter (free models)", on: k ? k.openrouter : null },
        { name: "Public free model", on: true, note: "public questions only" },
        { name: "Model inside the browser", on: llmSupported(), note: "WebGPU" },
      ],
    },
    {
      title: "Alerts (how JARVIS reaches you)",
      layers: [
        { name: "Telegram on your phone", on: k ? k.telegram && !!st?.telegram.linked : null },
        { name: "Email", on: k ? k.gmail : null },
        { name: "Mac notification + spoken alert", on: st ? st.daemon.running : null, note: "daemon" },
        { name: "Browser notification", on: typeof Notification !== "undefined" && Notification.permission === "granted", note: "while the hub is open" },
      ],
    },
    {
      title: "Sending mail",
      layers: [
        { name: "One-tap send (Gmail app password)", on: k ? k.gmail : null },
        { name: "Pre-filled Gmail compose", on: true },
        { name: "Copy to clipboard", on: true },
      ],
    },
    {
      title: "Voice",
      layers: [
        { name: "Neural JARVIS voice (on-device)", on: gpu ? (neuralState() === "ready" ? true : neuralState() === "failed" ? false : null) : false },
        { name: "Browser voice", on: typeof speechSynthesis !== "undefined" },
        { name: "Ears: browser speech recognition", on: earEngine() === "browser" },
        { name: "Ears: Whisper on-device", on: earEngine() !== "none" },
      ],
    },
    {
      title: "Computer access",
      layers: [{ name: "Mac agent (screen, docs, apps)", on: agent, note: "npm run jarvis:agent" }],
    },
  ];

  return (
    <div className={h.page}>
      <div className={h.head}>
        <div>
          <p className={h.eyebrow}>Setup · everything free, every layer has a fallback</p>
          <h1 className={h.h1}>Connections</h1>
          <p className={h.sub}>If a layer is down, the next one takes over automatically. Keys are tested live, saved only on this server and never shown again.</p>
        </div>
        <button type="button" className={h.btn} onClick={() => void load()}>
          ↻ Refresh
        </button>
      </div>

      <section className={s.chains}>
        {chains.map((c) => (
          <div key={c.title} className={`${h.card} ${s.chain}`}>
            <h2>{c.title}</h2>
            <ol>
              {c.layers.map((l, i) => (
                <li key={l.name}>
                  <span className={s.n}>{i + 1}</span>
                  <span className={s.dot} data-ok={l.on === null ? undefined : l.on} />
                  <span className={s.lname}>{l.name}</span>
                  {l.note && <small>{l.note}</small>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {st && !st.canWrite && <p className={h.error}>This server is read-only (Vercel). Keys you test here work, but must be added in Vercel → Settings → Environment Variables.</p>}

      <h2 className={s.h2}>Connect once</h2>
      <div className={s.conns}>
        <Conn
          value={vals}
          setValue={(id, v) => setVals((x) => ({ ...x, [id]: v }))}
          busy={busy}
          msg={msg}
          onSubmit={(id) => void submit(id)}
          id="telegram"
          title="Telegram bot"
          unlocks="Texts and alerts on your phone, and chat with JARVIS from anywhere."
          ok={k?.telegram}
          steps={["Open @BotFather in Telegram and send /newbot.", "Pick a name (e.g. Sanjeev JARVIS) and a username ending in “bot”.", "Copy the token BotFather sends and paste it here."]}
          placeholder="123456789:AA…"
          link="https://t.me/BotFather"
          linkLabel="Open BotFather"
        />
        {k?.telegram && (
          <article className={`${h.card} ${s.conn}`} data-ok={!!st?.telegram.linked}>
            <header>
              <span className={s.dot} data-ok={!!st?.telegram.linked} />
              <div>
                <h3>Link your Telegram {st?.telegram.bot ? `(@${st.telegram.bot})` : ""}</h3>
                <p>Only your chat will be accepted by the bot.</p>
              </div>
              <span className={h.badge} data-tone={st?.telegram.linked ? "ok" : undefined}>
                {st?.telegram.linked ? "linked" : "not linked"}
              </span>
            </header>
            {!st?.telegram.linked && (
              <div className={s.form}>
                {st?.telegram.link && (
                  <a className={h.btnPrimary} href={st.telegram.link} target="_blank" rel="noreferrer">
                    1 · Open bot & press Start ↗
                  </a>
                )}
                <button type="button" className={h.btn} disabled={busy === "telegram-link"} onClick={() => void submit("telegram-link")}>
                  {busy === "telegram-link" ? "Checking…" : "2 · Link my Telegram"}
                </button>
              </div>
            )}
            {msg["telegram-link"] && <p className={msg["telegram-link"].ok ? s.good : s.bad}>{msg["telegram-link"].text}</p>}
          </article>
        )}
        <Conn
          value={vals}
          setValue={(id, v) => setVals((x) => ({ ...x, [id]: v }))}
          busy={busy}
          msg={msg}
          onSubmit={(id) => void submit(id)}
          id="gmail"
          title="Gmail app password"
          unlocks="One-tap sending of mail you approve, inbox triage, and the nightly report by email."
          ok={k?.gmail}
          steps={["Make sure 2-Step Verification is on for sanjeevsudarsanam@gmail.com.", "Open App passwords, type “JARVIS”, press Create.", "Paste the 16-letter password here (spaces are fine)."]}
          placeholder="abcd efgh ijkl mnop"
          link="https://myaccount.google.com/apppasswords"
          linkLabel="Open App passwords"
        />
        <Conn
          value={vals}
          setValue={(id, v) => setVals((x) => ({ ...x, [id]: v }))}
          busy={busy}
          msg={msg}
          onSubmit={(id) => void submit(id)}
          id="gemini"
          title="Gemini API key (free)"
          unlocks="A fast private brain that also works when the site runs on Vercel. No card needed."
          ok={k?.gemini}
          steps={["Sign in to Google AI Studio.", "Press “Create API key”.", "Paste it here."]}
          placeholder="AIza…"
          link="https://aistudio.google.com/apikey"
          linkLabel="Open AI Studio"
        />
        <Conn
          value={vals}
          setValue={(id, v) => setVals((x) => ({ ...x, [id]: v }))}
          busy={busy}
          msg={msg}
          onSubmit={(id) => void submit(id)}
          id="groq"
          title="Groq API key (free)"
          unlocks="A very fast backup brain (Llama). No card needed."
          ok={k?.groq}
          steps={["Sign in to GroqCloud (Google login works).", "API Keys → Create API Key.", "Paste it here."]}
          placeholder="gsk_…"
          link="https://console.groq.com/keys"
          linkLabel="Open GroqCloud"
        />
      </div>

      <section className={`${h.card} ${s.daemon}`}>
        <h2>JARVIS daemon {st?.daemon.running ? <span className={h.badge} data-tone="ok">running</span> : <span className={h.badge}>not running</span>}</h2>
        <p>The part that works while you&apos;re away: morning brief, nightly report, reminders, inbox triage, Telegram chat and spoken alerts on the Mac.</p>
        <pre className={s.code}>npm run jarvis</pre>
        <p className={h.sub}>Preview today&apos;s brief and report without sending anything: <code>npm run jarvis:preview</code></p>
      </section>
    </div>
  );
}

type ConnProps = {
  id: string;
  title: string;
  unlocks: string;
  ok: boolean | undefined;
  steps: string[];
  placeholder: string;
  link: string;
  linkLabel: string;
  value: Record<string, string>;
  setValue: (id: string, v: string) => void;
  busy: string | null;
  msg: Record<string, { ok: boolean; text: string }>;
  onSubmit: (id: string) => void;
};
function Conn({ id, title, unlocks, ok, steps, placeholder, link, linkLabel, value, setValue, busy, msg, onSubmit }: ConnProps) {
  return (
    <article className={`${h.card} ${s.conn}`} data-ok={!!ok}>
      <header>
        <span className={s.dot} data-ok={ok === undefined ? undefined : ok} />
        <div>
          <h3>{title}</h3>
          <p>{unlocks}</p>
        </div>
        <span className={h.badge} data-tone={ok ? "ok" : undefined}>
          {ok ? "connected" : "not set"}
        </span>
      </header>
      <ol className={s.steps}>
        {steps.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <div className={s.form}>
        <a className={h.btn} href={link} target="_blank" rel="noreferrer">
          {linkLabel} ↗
        </a>
        <input className={h.input} type="password" autoComplete="off" spellCheck={false} placeholder={placeholder} value={value[id] ?? ""} onChange={(e) => setValue(id, e.target.value)} aria-label={title} />
        <button type="button" className={h.btnPrimary} disabled={!value[id]?.trim() || busy === id} onClick={() => onSubmit(id)}>
          {busy === id ? "Testing…" : ok ? "Replace" : "Test & save"}
        </button>
      </div>
      {msg[id] && <p className={msg[id].ok ? s.good : s.bad}>{msg[id].text}</p>}
    </article>
  );
}
