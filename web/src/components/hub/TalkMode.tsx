"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { earEngine, ensureMic, feed, flush, levels, listenOnce, neuralState, say, spoken, startMeters, stopListening, stopMeters, stopSpeaking, voiceEngine, warmVoice, whisperProgress } from "@/lib/hub/jvoice";
import s from "./TalkMode.module.css";

type Phase = "starting" | "listening" | "thinking" | "speaking" | "paused";
type Ask = (text: string, onDelta: (d: string) => void) => Promise<string>;

/**
 * Talk to JARVIS like a call: it listens, answers out loud in a natural voice, then listens again.
 * Interrupt any time: start talking over it, tap the orb, press Stop (or Space/Esc). The answer stops at once (the
 * model stops too) and JARVIS listens, so you can correct it. Say "goodbye" or press ✕ to end.
 */
export default function TalkMode({ ask, cancel, onClose, intro, firstAsk }: { ask: Ask; cancel: () => void; onClose: () => void; intro?: string; firstAsk?: string }) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [cutIn, setCutIn] = useState(false); // "you interrupted: go ahead"
  const [bargeIn, setBargeIn] = useState(() => {
    try {
      return localStorage.getItem("jarvis-barge-in") !== "0";
    } catch {
      return true;
    }
  });
  const bargeRef = useRef(bargeIn);
  const turn = useRef(0); // every answer has a number; anything from an older one is ignored
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [note] = useState(() => (earEngine() === "whisper" ? "Using on-device Whisper for listening (first time downloads ~80 MB)." : earEngine() === "none" ? "This browser can't listen. Use the text box instead." : ""));
  const open = useRef(true);
  const phaseRef = useRef<Phase>("starting");
  const cv = useRef<HTMLCanvasElement>(null);
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* ---------- one answer: streamed, spoken, and stoppable ---------- */
  const answer = useCallback(
    async (text: string) => {
      const my = ++turn.current;
      setP("thinking");
      setReply("");
      let first = true;
      try {
        await ask(text, (d) => {
          if (turn.current !== my) return; // interrupted: drop the rest
          if (first) {
            first = false;
            setP("speaking");
          }
          feed(d);
          setReply((r) => r + d);
        });
      } catch {
        if (turn.current === my) say("Sorry, I lost my connection for a moment.");
      }
      if (turn.current !== my) return;
      flush();
      if (phaseRef.current !== "speaking") setP("speaking");
      await spoken();
    },
    [ask],
  );

  /** Stop talking and thinking right now, then listen (the loop carries on by itself). */
  const interrupt = useCallback(() => {
    turn.current++;
    cancel();
    stopSpeaking();
    setCutIn(true);
  }, [cancel]);

  /* ---------- conversation loop (only ever one) ---------- */
  const running = useRef(false);
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let misses = 0;
    try {
    while (open.current) {
      setP("listening");
      setHeard("");
      const text = await listenOnce((t) => setHeard(t));
      setCutIn(false);
      if (!open.current) break;
      if (!text) {
        if (++misses >= 3) {
          setP("paused");
          return;
        }
        continue;
      }
      misses = 0;
      setHeard(text);
      if (/^(goodbye|bye|end (the )?call|that'?s all|thank you,? that'?s all)\b/i.test(text)) {
        say("Goodbye, Sanjeev.");
        await spoken();
        onClose();
        return;
      }
      // "stop" / "wait" / "never mind" on their own: stay quiet and keep listening
      if (/^(stop|wait|hold on|cancel|never ?mind|shut up|quiet|enough|okay stop)[.!]?$/i.test(text.trim())) {
        setReply("");
        continue;
      }
      await answer(text);
    }
    } finally {
      running.current = false;
    }
  }, [answer, onClose]);
  const loop = useRef(run);
  useEffect(() => {
    loop.current = run;
  }, [run]);

  useEffect(() => {
    open.current = true;
    warmVoice();
    startMeters();
    void ensureMic(); // to hear Sanjeev talk over JARVIS
    const ears = earEngine();
    const h = new Date().getHours();
    const t = setTimeout(async () => {
      say(intro ?? `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, Sanjeev. I'm listening.`);
      setP("speaking");
      await spoken();
      // a call with an agenda (e.g. "your updates"): JARVIS speaks it first, then listens
      if (open.current && firstAsk) await answer(firstAsk);
      if (open.current && ears !== "none") void loop.current();
      else setP("paused");
    }, 250);
    return () => {
      open.current = false;
      clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a plain counter, not a DOM node: bumping it here voids any answer still streaming
      turn.current++;
      cancel();
      stopListening();
      stopSpeaking();
      stopMeters();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the call starts once; its opening line is read once
  }, []);

  const tapOrb = () => {
    if (phaseRef.current === "speaking" || phaseRef.current === "thinking") interrupt();
    else if (phaseRef.current === "paused") void loop.current();
    else if (phaseRef.current === "listening") stopListening();
  };

  // keyboard: Space or Esc stops JARVIS mid-answer
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Escape") && (phaseRef.current === "speaking" || phaseRef.current === "thinking")) {
        e.preventDefault();
        interrupt();
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [interrupt]);

  // barge-in: when Sanjeev starts talking over JARVIS, it stops and listens. The mic is echo-cancelled; the threshold
  // also adapts to whatever of JARVIS's own voice still leaks in, so it doesn't interrupt itself.
  useEffect(() => {
    bargeRef.current = bargeIn;
  }, [bargeIn]);
  useEffect(() => {
    let since = 0;
    let echo = 0.05;
    let loud = 0;
    const iv = setInterval(() => {
      if (phaseRef.current !== "speaking" || !bargeRef.current) {
        since = 0;
        loud = 0;
        return;
      }
      since ||= performance.now();
      const mic = levels.mic;
      if (performance.now() - since < 700) {
        echo = Math.max(echo, mic); // learn the echo floor while JARVIS starts speaking
        return;
      }
      const limit = Math.max(0.2, echo * 2.2 + levels.out * 0.25);
      loud = mic > limit ? loud + 1 : 0;
      if (loud < 6) echo = echo * 0.97 + mic * 0.03;
      if (loud >= 6) {
        // ~300 ms of clear speech over JARVIS
        loud = 0;
        since = 0;
        interrupt();
      }
    }, 50);
    return () => clearInterval(iv);
  }, [interrupt]);

  /* ---------- the reactor orb ---------- */
  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext("2d")!;
    let raf = 0;
    let t = 0;
    let lvl = 0;
    const parts = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.5, s: 0.002 + Math.random() * 0.006, z: Math.random() }));
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (c.width !== W * dpr) {
        c.width = W * dpr;
        c.height = H * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const p = phaseRef.current;
      const target = p === "listening" ? levels.mic : p === "speaking" ? levels.out : p === "thinking" ? 0.25 + 0.15 * Math.sin(t * 6) : 0.08;
      lvl += (target - lvl) * 0.18;
      t += 1 / 60;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.22;
      const hue = p === "thinking" ? "167,139,250" : p === "listening" ? "56,189,248" : "125,211,252";
      // glow
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.6);
      glow.addColorStop(0, `rgba(${hue},${0.28 + lvl * 0.4})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      // particles
      for (const q of parts) {
        q.a += q.s * (p === "thinking" ? 3 : 1 + lvl * 4);
        const rr = R * (1.25 + q.r * (1 + lvl * 0.6));
        g.fillStyle = `rgba(${hue},${0.25 + q.z * 0.6})`;
        g.beginPath();
        g.arc(cx + Math.cos(q.a) * rr, cy + Math.sin(q.a) * rr * 0.92, 0.6 + q.z * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      // waveform ring
      g.lineWidth = 2;
      g.strokeStyle = `rgba(${hue},0.9)`;
      g.shadowColor = `rgba(${hue},1)`;
      g.shadowBlur = 18;
      g.beginPath();
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        const wob = Math.sin(a * 6 + t * 3) * 0.5 + Math.sin(a * 11 - t * 5) * 0.3 + Math.sin(a * 3 + t * 1.7) * 0.2;
        const r = R * (1.02 + lvl * 0.28 * wob + lvl * 0.12);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      // rotating HUD arcs
      g.shadowBlur = 8;
      for (let k = 0; k < 3; k++) {
        const rr = R * (1.32 + k * 0.17);
        const sp = (k % 2 ? -1 : 1) * (0.4 + k * 0.25) * (p === "thinking" ? 3 : 1);
        g.lineWidth = k === 0 ? 3 : 1.5;
        g.strokeStyle = `rgba(${hue},${0.55 - k * 0.12})`;
        for (let j = 0; j < 3 + k; j++) {
          const a0 = t * sp + (j / (3 + k)) * Math.PI * 2;
          g.beginPath();
          g.arc(cx, cy, rr, a0, a0 + 0.5 + 0.3 * Math.sin(t + k));
          g.stroke();
        }
      }
      // core
      g.shadowBlur = 40;
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.92);
      core.addColorStop(0, "rgba(240,250,255,1)");
      core.addColorStop(0.18, `rgba(${hue},0.95)`);
      core.addColorStop(0.55, `rgba(${hue},${0.25 + lvl * 0.35})`);
      core.addColorStop(1, "rgba(4,6,12,0.0)");
      g.fillStyle = core;
      g.beginPath();
      g.arc(cx, cy, R * (0.92 + lvl * 0.08), 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      // inner spokes (arc-reactor)
      g.strokeStyle = "rgba(224,247,255,0.55)";
      g.lineWidth = 1.2;
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2 + t * 0.3;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.32, cy + Math.sin(a) * R * 0.32);
        g.lineTo(cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58);
        g.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const label = { starting: "Connecting…", listening: cutIn ? "Stopped · go ahead, I'm listening" : "Listening", thinking: "Thinking · tap to stop", speaking: bargeIn ? "Speaking · just talk to interrupt" : "Speaking · tap to interrupt", paused: "Tap the reactor to talk" }[phase];

  return (
    <div className={s.wrap} role="dialog" aria-label="Voice conversation with JARVIS">
      <header className={s.top}>
        <span className={s.brand}>JARVIS · VOICE</span>
        <span className={s.engine}>
          voice: {voiceEngine() === "neural" ? "neural (on-device)" : neuralState() === "loading" ? "neural loading…" : "browser"} · ears: {earEngine() === "whisper" ? `whisper${whisperProgress < 1 ? ` ${Math.round(whisperProgress * 100)}%` : ""}` : earEngine()}
        </span>
        <button type="button" className={s.close} onClick={onClose} aria-label="End voice conversation">
          ✕
        </button>
      </header>
      <button type="button" className={s.orbBtn} onClick={tapOrb} aria-label={label}>
        <canvas ref={cv} className={s.orb} />
      </button>
      <p className={s.state} data-phase={phase}>
        {label}
      </p>
      <div className={s.lines}>
        {heard && <p className={s.heard}>“{heard}”</p>}
        {reply && <p className={s.reply}>{reply.replace(/```[\s\S]*?(```|$)/g, "[code on screen]").replace(/[*_#`]/g, "").slice(-420)}</p>}
        {note && <p className={s.note}>{note}</p>}
      </div>
      <div className={s.controls}>
        {(phase === "speaking" || phase === "thinking") && (
          <button type="button" className={s.stop} onClick={interrupt}>
            ■ Stop
          </button>
        )}
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={bargeIn}
            onChange={(e) => {
              setBargeIn(e.target.checked);
              try {
                localStorage.setItem("jarvis-barge-in", e.target.checked ? "1" : "0");
              } catch {}
            }}
          />
          Interrupt by talking
        </label>
      </div>
      <p className={s.hint}>Stop: talk over it, tap the orb, ■ Stop, or Space · then correct it · say “goodbye” to end</p>
    </div>
  );
}
