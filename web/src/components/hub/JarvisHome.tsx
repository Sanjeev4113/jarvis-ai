"use client";

import { useEffect, useState } from "react";
import { emit, uid, update, useHub } from "@/lib/hub/store";
import { agentStatus } from "@/lib/hub/agent";
import { localBrainUp } from "@/lib/hub/localBrain";
import { llmSupported } from "@/lib/llm/onDevice";
import h from "./Hub.module.css";
import s from "./JarvisHome.module.css";

type Status = { brains: string[]; keys: Record<string, boolean>; telegram: { linked: boolean; bot: string | null }; daemon: { running: boolean }; ollama: { up: boolean } };
type QA = { origin: string; pages: number; deep: boolean; seconds: number; findings: { severity: string; kind: string; where: string; detail: string; count: number }[]; plan: { summary: string; steps: { title: string; why: string; priority: string }[] } };

const BRAINS = [
  { id: "auto", name: "Auto", note: "Best available, private first" },
  { id: "ollama", name: "Ollama on your Mac", note: "Free forever · private" },
  { id: "gemini", name: "Gemini", note: "Free key · fast · works everywhere" },
  { id: "groq", name: "Groq (Llama)", note: "Free key · very fast" },
  { id: "openrouter", name: "OpenRouter", note: "Free models" },
  { id: "pollinations", name: "Public free model", note: "No key · public questions only" },
  { id: "browser", name: "In your browser", note: "WebGPU · works offline" },
];
const gmail = (to: string, su: string, body: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;

/** The JARVIS section: talk, brain, memory, inbox autopilot, calls and the Site Doctor QA agent. */
export default function JarvisHome() {
  const hub = useHub((x) => x);
  const [st, setSt] = useState<Status | null>(null);
  const [mac, setMac] = useState(false);
  const [local, setLocal] = useState(false);
  const [fact, setFact] = useState("");
  const [url, setUrl] = useState("");
  const [deep, setDeep] = useState(true);
  const [qa, setQa] = useState<QA | null>(null);
  const [qaBusy, setQaBusy] = useState(false);
  const [qaErr, setQaErr] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/hub/setup")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setSt(d));
    void agentStatus().then((a) => live && setMac(!!a));
    void localBrainUp().then((x) => live && setLocal(x));
    const t = setTimeout(() => live && setUrl(location.origin), 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);

  const available = (id: string) => {
    if (id === "auto" || id === "pollinations") return true;
    if (id === "ollama") return !!st?.ollama.up || local;
    if (id === "browser") return llmSupported();
    return !!st?.keys?.[id];
  };
  const brain = hub.settings.brain ?? "auto";
  const ap = hub.autopilot;
  const pending = ap?.drafts.filter((d) => d.status === "pending") ?? [];

  const runQa = async () => {
    setQaBusy(true);
    setQaErr("");
    setQa(null);
    const r = await fetch("/api/jarvis/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, deep }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as (QA & { error?: string }) | null;
    if (r?.ok && j) setQa(j);
    else setQaErr(j?.error ?? "The check couldn't run.");
    setQaBusy(false);
  };
  const sendDraft = async (id: string) => {
    const d = ap?.drafts.find((x) => x.id === id);
    if (!d) return;
    setSending(id);
    const r = await fetch("/api/jarvis/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: [d.to], subject: d.subject, body: d.body, approved: true }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean } | null;
    if (j?.ok) update((x) => x.autopilot?.drafts.forEach((y) => y.id === id && (y.status = "sent")));
    else window.open(gmail(d.to, d.subject, d.body), "_blank");
    setSending(null);
  };

  return (
    <div className={h.page}>
      <section className={`${h.card} ${s.hero}`}>
        <span className={s.reactor} aria-hidden />
        <div className={s.heroText}>
          <p className={h.eyebrow}>JARVIS · personal agent</p>
          <h1 className={h.h1}>At your service, {hub.settings.name}.</h1>
          <div className={s.lights}>
            <Light on={!!st?.brains.length || local} label={st?.brains.length ? `Private brain: ${st.brains[0]}` : local ? "Private brain: Ollama (direct)" : "Public brain only"} />
            <Light on={mac} label="Mac agent" />
            <Light on={!!st?.daemon.running} label="Daemon (briefs, alerts)" />
            <Light on={!!st?.telegram.linked} label="Telegram" />
            <Light on={!!st?.keys?.gmail} label="Gmail" />
          </div>
        </div>
        <div className={s.heroBtns}>
          <button type="button" className={h.btnPrimary} onClick={() => emit({ type: "jarvis", prompt: "", talk: true })}>
            📞 Talk to JARVIS
          </button>
          <button type="button" className={h.btn} onClick={() => emit({ type: "jarvis", prompt: "" })}>
            💬 Chat
          </button>
        </div>
      </section>

      <div className={s.grid}>
        {/* ---------- brain ---------- */}
        <section className={h.card}>
          <h2 className={s.h2}>Brain</h2>
          <p className={h.sub}>Switch the model in one click. Memory and everything JARVIS knows about you come along.</p>
          <div className={s.brains}>
            {BRAINS.map((b) => (
              <button key={b.id} type="button" className={s.brain} aria-pressed={brain === b.id} data-off={!available(b.id)} onClick={() => update((d) => void (d.settings.brain = b.id))}>
                <b>{b.name}</b>
                <span>{available(b.id) ? b.note : `${b.note} · not set up`}</span>
              </button>
            ))}
          </div>
          {!available(brain) && <p className={s.warn}>That brain isn&apos;t available here, so JARVIS falls back to the next one automatically. Set it up in the Setup tab.</p>}
        </section>

        {/* ---------- memory ---------- */}
        <section className={h.card}>
          <h2 className={s.h2}>Memory · {hub.memory.length}</h2>
          <p className={h.sub}>What JARVIS knows about you and how you work. It learns when you tell it things (“remember I prefer Java”), and you can edit it here.</p>
          <form
            className={s.row}
            onSubmit={(e) => {
              e.preventDefault();
              if (!fact.trim()) return;
              update((d) => void d.memory.push({ id: uid(), text: fact.trim().slice(0, 300), at: Date.now() }));
              setFact("");
            }}
          >
            <input className={h.input} value={fact} onChange={(e) => setFact(e.target.value)} placeholder="e.g. I'm targeting backend roles in Bengaluru" aria-label="New memory" />
            <button type="submit" className={h.btn} disabled={!fact.trim()}>
              Remember
            </button>
          </form>
          <ul className={s.memory}>
            {[...hub.memory].reverse().map((m) => (
              <li key={m.id}>
                <span>{m.text}</span>
                <button type="button" onClick={() => update((d) => void (d.memory = d.memory.filter((x) => x.id !== m.id)))} aria-label="Forget">
                  ×
                </button>
              </li>
            ))}
            {!hub.memory.length && <li className={h.sub}>Nothing yet.</li>}
          </ul>
        </section>

        {/* ---------- autopilot ---------- */}
        <section className={h.card}>
          <h2 className={s.h2}>Inbox autopilot {pending.length ? <span className={h.badge} data-tone="warn">{pending.length} to approve</span> : null}</h2>
          <p className={h.sub}>While you sleep, JARVIS reads new mail, flags what matters and drafts replies. Nothing is sent until you approve it here or on Telegram.</p>
          {ap ? (
            <>
              <p className={s.meta}>Last run {new Date(ap.at).toLocaleString()} · {ap.mails.length} new mail · {ap.mails.filter((m) => m.urgent).length} important</p>
              {pending.map((d) => (
                <div key={d.id} className={s.draft}>
                  <p className={s.about}>Re: {d.about}</p>
                  <p>
                    <b>To:</b> {d.to} · <b>{d.subject}</b>
                  </p>
                  <pre>{d.body}</pre>
                  <div className={s.row}>
                    <button type="button" className={h.btnPrimary} disabled={sending === d.id} onClick={() => void sendDraft(d.id)}>
                      {sending === d.id ? "Sending…" : "Approve & send"}
                    </button>
                    <a className={h.btn} href={gmail(d.to, d.subject, d.body)} target="_blank" rel="noreferrer">
                      Edit in Gmail ↗
                    </a>
                    <button type="button" className={h.btnGhost} onClick={() => update((x) => x.autopilot?.drafts.forEach((y) => y.id === d.id && (y.status = "discarded")))}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
              <ul className={s.mails}>
                {ap.mails.slice(0, 8).map((m, i) => (
                  <li key={i} data-urgent={m.urgent}>
                    <b>{m.subject}</b>
                    <span>
                      {m.from} · {m.summary}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={s.meta}>{st?.keys?.gmail ? "Starts when the JARVIS daemon runs on your Mac (npm run jarvis, or autostart)." : "Connect Gmail in Setup, then run the daemon."}</p>
          )}
        </section>

        {/* ---------- calls ---------- */}
        <Calls telegram={!!st?.telegram.linked} />

        {/* ---------- email updates ---------- */}
        <EmailUpdates />
      </div>

      {/* ---------- site doctor ---------- */}
      <section className={`${h.card} ${s.doctor}`}>
        <h2 className={s.h2}>Site Doctor · QA agent</h2>
        <p className={h.sub}>JARVIS hands your site to a QA agent that walks through it like a visitor (every page, desktop and phone, clicking buttons), finds bugs, and gives you an action plan. Nothing is changed until you say yes.</p>
        <div className={s.row}>
          <input className={h.input} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Site address" style={{ flex: "1 1 260px" }} />
          <label className={s.check}>
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Deep (real Chrome, on your Mac)
          </label>
          <button type="button" className={h.btnPrimary} onClick={() => void runQa()} disabled={qaBusy || !/^https?:\/\//.test(url)}>
            {qaBusy ? "Checking… (up to 2 min)" : "🩺 Run check"}
          </button>
        </div>
        {qaErr && <p className={h.error}>{qaErr}</p>}
        {qa && (
          <div className={s.qa}>
            <p className={s.meta}>
              {qa.pages} pages · {qa.deep ? "browser + HTTP" : "HTTP only (deep runs on your Mac)"} · {qa.seconds}s · {qa.findings.length} issue type(s)
            </p>
            <p className={s.summary}>{qa.plan.summary}</p>
            {qa.findings.length > 0 && (
              <ul className={s.findings}>
                {qa.findings.map((f, i) => (
                  <li key={i} data-sev={f.severity}>
                    <span className={h.badge} data-tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : undefined}>
                      {f.severity}
                    </span>
                    <b>
                      {f.kind}
                      {f.count > 1 ? ` ×${f.count}` : ""}
                    </b>
                    <span>{f.detail}</span>
                    <small>{f.where}</small>
                  </li>
                ))}
              </ul>
            )}
            {qa.plan.steps.length > 0 && (
              <>
                <h3>Action plan</h3>
                <ol className={s.plan}>
                  {qa.plan.steps.map((x, i) => (
                    <li key={i}>
                      <b>
                        [{x.priority}] {x.title}
                      </b>
                      <span>{x.why}</span>
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  className={h.btn}
                  onClick={() => {
                    if (!confirm(`Add ${qa.plan.steps.length} fix(es) to your tasks?`)) return;
                    update((d) => {
                      for (const x of qa.plan.steps) d.tasks.unshift({ id: uid(), title: `Site: ${x.title}`.slice(0, 200), done: false, priority: x.priority === "now" ? "high" : x.priority === "soon" ? "medium" : "low", createdAt: Date.now() });
                    });
                  }}
                >
                  ✓ Approve: add the fixes to my tasks
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Light({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={s.light} data-on={on}>
      <i /> {label}
    </span>
  );
}

/* ---------------- phone calls ---------------- */

type CallsData = { calls: { id: string; at: number; topic: string; note?: string; repeat?: string }[]; devices: { device: string; added: number }[]; push: boolean };
const TOPICS = [
  { id: "updates", label: "My updates (plan, tasks, jobs, mail)" },
  { id: "dsa", label: "DSA practice session" },
  { id: "jobs", label: "New job matches" },
  { id: "note", label: "A reminder (my own words)" },
];
const b64 = (s: string) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

function Calls({ telegram }: { telegram: boolean }) {
  const [data, setData] = useState<CallsData | null>(null);
  const [here, setHere] = useState<"unknown" | "on" | "off" | "unsupported">("unknown");
  const [msg, setMsg] = useState("");
  const [when, setWhen] = useState("");
  const [topic, setTopic] = useState("updates");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState("none");
  const load = () =>
    void fetch("/api/jarvis/call")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  useEffect(() => {
    const t = setTimeout(load, 0);
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setHere("unsupported");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      setHere(sub ? "on" : "off");
    })();
    return () => clearTimeout(t);
  }, []);

  const enable = async () => {
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setMsg("Notifications are blocked for this site. Allow them in the browser settings, then try again.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return setMsg("Calls aren't configured on this server yet.");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
      const device = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : /Mac/.test(navigator.userAgent) ? "Mac" : "This device";
      const r = await fetch("/api/jarvis/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), device }) });
      if (!r.ok) throw new Error("save failed");
      setHere("on");
      setMsg(`✓ ${device} will ring when JARVIS calls.`);
      load();
    } catch (e) {
      setMsg(`Couldn't enable calls here: ${(e as Error).message}. On iPhone, first add this page to your Home Screen (Share → Add to Home Screen) and open it from there.`);
    }
  };
  const callNow = async () => {
    setMsg("Calling…");
    const r = await fetch("/api/jarvis/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "now", topic: "updates" }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { pushed?: number; flagged?: boolean } | null;
    setMsg(j ? `Ringing ${j.pushed ?? 0} device(s)${j.flagged ? " and every open hub" : ""}.` : "Couldn't place the call.");
  };
  const schedule = async () => {
    const at = new Date(when).getTime();
    const r = await fetch("/api/jarvis/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "schedule", at, topic, note: note || undefined, repeat }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setMsg(j?.ok ? `✓ Call scheduled for ${new Date(at).toLocaleString()}${repeat !== "none" ? ` (${repeat})` : ""}.` : (j?.error ?? "Couldn't schedule."));
    if (j?.ok) {
      setNote("");
      load();
    }
  };

  return (
    <section className={h.card}>
      <h2 className={s.h2}>JARVIS calls you</h2>
      <p className={h.sub}>Your phone rings like a call (even with the app closed). Answer and talk: JARVIS gives you your updates and answers your questions out loud.</p>
      <p className={s.meta}>
        This device: {here === "on" ? "✓ will ring" : here === "unsupported" ? "can't receive calls (use Chrome/Edge, or the installed app on iPhone)" : "not enabled"} · {data?.devices.length ?? 0} device(s) enabled
        {telegram ? " · plus Telegram voice notes" : ""}
      </p>
      <div className={s.row}>
        {here !== "on" && here !== "unsupported" && (
          <button type="button" className={h.btnPrimary} onClick={() => void enable()}>
            🔔 Enable calls on this device
          </button>
        )}
        <button type="button" className={h.btn} onClick={() => void callNow()}>
          📞 Test call now
        </button>
      </div>
      <p className={s.meta} style={{ marginTop: 14 }}>
        Schedule a call
      </p>
      <div className={s.row}>
        <input className={h.input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Call time" style={{ flex: "1 1 190px" }} />
        <select className={h.select} value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">
          <option value="none">Once</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Weekdays</option>
        </select>
      </div>
      <div className={s.row}>
        <select className={h.select} value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="What the call is about" style={{ flex: "1 1 200px" }}>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {topic === "note" && <input className={h.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Leave for the interview at 10:30" aria-label="Reminder text" />}
        <button type="button" className={h.btn} disabled={!when} onClick={() => void schedule()}>
          Schedule
        </button>
      </div>
      {msg && <p className={s.meta}>{msg}</p>}
      {!!data?.calls.length && (
        <ul className={s.mails}>
          {data.calls.map((c) => (
            <li key={c.id}>
              <b>
                {new Date(c.at).toLocaleString()} · {TOPICS.find((t) => t.id === c.topic)?.label ?? c.topic}
                {c.repeat && c.repeat !== "none" ? ` · ${c.repeat}` : ""}
              </b>
              <span>
                {c.note ?? ""}{" "}
                <button
                  type="button"
                  className={h.btnGhost}
                  onClick={() =>
                    void fetch("/api/jarvis/call", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) }).then(load)
                  }
                >
                  Cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <details className={s.meta}>
        <summary>Set up on your phone</summary>
        <p>iPhone: open the hub in Safari → Share → Add to Home Screen → open JARVIS from the home screen → JARVIS tab → Enable calls.</p>
        <p>Android: open the hub in Chrome → menu → Install app (or Add to Home screen) → JARVIS tab → Enable calls.</p>
      </details>
    </section>
  );
}

type MailStatus = { email: boolean; telegram: boolean; to: string; lastSent: { at: number; channel: string; title: string } | null };

/** Reminders, important plan blocks, brief/report and new job openings, emailed to Sanjeev (Gmail app password: free). */
function EmailUpdates() {
  const [st, setSt] = useState<MailStatus | null>(null);
  const [msg, setMsg] = useState("");
  const load = () =>
    void fetch("/api/jarvis/notify")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSt);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);
  const test = async () => {
    setMsg("Sending…");
    const r = await fetch("/api/jarvis/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) }).catch(() => null);
    const ch = String(((await r?.json().catch(() => null)) as { channel?: string } | null)?.channel ?? "none");
    setMsg(ch === "email" ? `✓ Sent to ${st?.to ?? "your inbox"}. Check your mail.` : ch === "telegram" ? "Email failed, sent on Telegram instead. Check the Gmail app password in Setup." : "Couldn't send: connect Gmail in Setup first.");
    load();
  };
  return (
    <section className={h.card}>
      <h2 className={s.h2}>Email updates</h2>
      <p className={h.sub}>JARVIS emails you: reminders when they fall due, important plan blocks as they start, your 8:00 morning brief, your 21:30 nightly report, and new job openings (70%+ match, at most every 3 h). Free, no credits.</p>
      <p className={s.meta}>
        {st ? (st.email ? `✓ Sending to ${st.to}` : "Gmail not connected: add the app password in Setup") : "Checking…"}
        {st?.telegram ? " · Telegram as fallback" : ""}
        {st?.lastSent ? ` · last: “${st.lastSent.title}”, ${new Date(st.lastSent.at).toLocaleString()}` : ""}
      </p>
      <div className={s.row}>
        <button type="button" className={h.btnPrimary} onClick={() => void test()}>
          ✉ Send a test email
        </button>
      </div>
      {msg && <p className={s.meta}>{msg}</p>}
    </section>
  );
}
