"use client";

import { useEffect, useState } from "react";
import { emit, update, useHub } from "@/lib/hub/store";
import s from "./CallOverlay.module.css";

const ASK: Record<string, string> = {
  updates: "Give me my updates right now, spoken naturally in under 120 words, no lists: what's next on today's timetable, my top open tasks and reminders, my newest strong job matches, and anything important. End by asking what I'd like to do.",
  dsa: "Run a quick spoken DSA session: explain today's concept in three short sentences with a tiny example, then ask me one question about it.",
  jobs: "Tell me my top three newest job matches in a natural spoken way (role, company, why it fits), then ask if I want to apply or tailor my resume.",
};
/** Answer a JARVIS call: open the voice conversation; JARVIS speaks first (and runs the call's agenda), then listens. */
export function answerCall(text: string, topic?: string) {
  update((d) => d.call && (d.call.answered = true));
  emit({ type: "jarvis", prompt: "", talk: true, intro: topic && ASK[topic] ? "Hello Sanjeev, it's JARVIS." : `Hello Sanjeev, it's JARVIS. ${text}`, ask: topic ? ASK[topic] : undefined });
}

/** "JARVIS is calling": rings when the daemon (or a test) flags something urgent. Answer to hear it and talk back. */
export default function CallOverlay() {
  const call = useHub((x) => x.call);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const ringing = !!call && !call.answered && now - call.at < 30 * 60_000;

  useEffect(() => {
    if (!ringing) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {}
    const ring = () => {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const [k, f] of [[0, 880], [0.18, 1175], [0.5, 880], [0.68, 1175]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + k);
        g.gain.linearRampToValueAtTime(0.14, t + k + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + k + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(t + k);
        o.stop(t + k + 0.18);
      }
    };
    ring();
    const iv = setInterval(ring, 2200);
    const stop = setTimeout(() => clearInterval(iv), 30_000);
    if ("vibrate" in navigator) navigator.vibrate?.([300, 200, 300]);
    try {
      if (Notification.permission === "granted") new Notification("📞 JARVIS is calling", { body: call!.text.slice(0, 120) });
    } catch {}
    return () => {
      clearInterval(iv);
      clearTimeout(stop);
      void ctx?.close();
    };
  }, [ringing, call]);

  if (!ringing || !call) return null;
  const answer = () => answerCall(call.text, call.topic);
  return (
    <div className={s.wrap} role="alertdialog" aria-label="JARVIS is calling">
      <div className={s.card}>
        <span className={s.ring} aria-hidden>
          <span />
        </span>
        <p className={s.who}>JARVIS</p>
        <p className={s.what}>is calling…</p>
        <p className={s.preview}>{call.text.slice(0, 140)}</p>
        <div className={s.btns}>
          <button type="button" className={s.decline} onClick={() => update((d) => d.call && (d.call.answered = true))} aria-label="Decline">
            ✕
          </button>
          <button type="button" className={s.accept} onClick={answer} aria-label="Answer">
            📞
          </button>
        </div>
      </div>
    </div>
  );
}
