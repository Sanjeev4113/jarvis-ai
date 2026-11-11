// JARVIS ears, fallback layer: Whisper (base.en) running fully in the browser with transformers.js. Free, private, offline after
// the first download (~80 MB, cached). Used when the browser has no built-in speech recognition (Firefox, some Androids).
// In:  {type:"load"} | {type:"transcribe", id, audio: Float32Array (16 kHz mono)}
// Out: {type:"progress", progress} | {type:"ready", device} | {type:"text", id, text} | {type:"error", id?, message}
const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";
const MODEL = "onnx-community/whisper-base.en";
let asr = null;
let loading = null;
const files = new Map();

function load() {
  loading ??= (async () => {
    const { pipeline } = await import(LIB);
    const gpu = self.navigator?.gpu && (await self.navigator.gpu.requestAdapter().catch(() => null));
    const device = gpu ? "webgpu" : "wasm";
    asr = await pipeline("automatic-speech-recognition", MODEL, {
      device,
      dtype: device === "webgpu" ? "fp32" : "q8",
      progress_callback: (p) => {
        if (p.status !== "progress" || !p.total) return;
        files.set(p.file, [p.loaded, p.total]);
        let l = 0;
        let t = 0;
        for (const [a, b] of files.values()) {
          l += a;
          t += b;
        }
        postMessage({ type: "progress", progress: t ? l / t : 0 });
      },
    });
    postMessage({ type: "ready", device });
  })().catch((e) => {
    loading = null;
    postMessage({ type: "error", message: String(e?.message ?? e) });
    throw e;
  });
  return loading;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "load") return load().catch(() => {});
  if (m.type === "transcribe") {
    try {
      await load();
      const out = await asr(m.audio, { language: "english", task: "transcribe" });
      postMessage({ type: "text", id: m.id, text: String(out?.text ?? "").trim() });
    } catch (err) {
      postMessage({ type: "error", id: m.id, message: String(err?.message ?? err) });
    }
  }
};
