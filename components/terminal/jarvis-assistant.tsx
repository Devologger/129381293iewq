"use client";
import { useEffect, useRef, useState } from "react";
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: { transcript: string; isFinal?: boolean }[][]; resultIndex: number }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type Message = { from: "you" | "assistant"; text: string };
export function JarvisAssistant({ open, onClose, onCommand }: { open: boolean; onClose: () => void; onCommand: (command: string) => Promise<string> }) {
  const [phase, setPhase] = useState("standby"), [messages, setMessages] = useState<Message[]>([{ from: "assistant", text: "Systems ready. Ask for market status, direct the research council, or navigate your workspace." }]);
  const [input, setInput] = useState(""), [spoken, setSpoken] = useState(true), [continuous, setContinuous] = useState(false), [volume, setVolume] = useState(0);
  const recognition = useRef<Recognition | null>(null), active = useRef(false), busy = useRef(false), speakEnabled = useRef(true), conversation = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<{ stream: MediaStream; context: AudioContext; animation: number } | null>(null), startRef = useRef<() => void>(() => {}), submitRef = useRef<(text: string) => void>(() => {}), history = useRef<HTMLDivElement | null>(null);
  const visible = useRef(false);
  function stopMeter() { const a = audio.current; if (a) { cancelAnimationFrame(a.animation); a.stream.getTracks().forEach(t => t.stop()); void a.context.close(); audio.current = null; } setVolume(0); }
  async function meter() {
    if (!navigator.mediaDevices?.getUserMedia || audio.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 128; context.createMediaStreamSource(stream).connect(analyser);
      const state = { stream, context, animation: 0 }; audio.current = state;
      const values = new Uint8Array(analyser.frequencyBinCount);
      function tick() { analyser.getByteFrequencyData(values); setVolume(values.reduce((s, x) => s + x, 0) / values.length / 255); state.animation = requestAnimationFrame(tick); }
      tick();
    } catch { /* Recognition may still work without the optional local audio visualizer. */ }
  }
  function nextListen() { if (conversation.current && active.current) timer.current = setTimeout(() => startRef.current(), 450); }
  function stop() { active.current = false; conversation.current = false; setContinuous(false); recognition.current?.abort(); if (timer.current) clearTimeout(timer.current); window.speechSynthesis?.cancel(); stopMeter(); setPhase("standby"); }
  function say(text: string) {
    if (!speakEnabled.current || !window.speechSynthesis) { setPhase("standby"); nextListen(); return; }
    setPhase("speaking"); window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 700)); utterance.lang = "en-US"; utterance.rate = 1.03; utterance.pitch = .9;
    const voices = window.speechSynthesis.getVoices(); utterance.voice = voices.find(v => v.lang.startsWith("en") && v.localService) || voices.find(v => v.lang.startsWith("en")) || null;
    utterance.onend = () => { setPhase("standby"); nextListen(); }; utterance.onerror = () => { setPhase("standby"); nextListen(); }; window.speechSynthesis.speak(utterance);
  }
  async function submit(text: string) {
    if (busy.current || !text.trim()) return;
    if (timer.current) clearTimeout(timer.current);
    if (recognition.current) recognition.current.onend = null;
    recognition.current?.abort(); window.speechSynthesis?.cancel(); setInput(""); busy.current = true; setPhase("thinking");
    setMessages(m => [...m.slice(-19), { from: "you", text }]);
    let reply;
    try { reply = await onCommand(text); } catch (error) { reply = error instanceof Error ? error.message : "Request unavailable. Check Connections."; }
    setMessages(m => [...m.slice(-19), { from: "assistant", text: reply }]); busy.current = false;
    if (visible.current) say(reply);
  }
  function start() {
    if (busy.current) return;
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Speech) { setMessages(m => [...m, { from: "assistant", text: "Speech recognition is unavailable here. You can type commands and questions below." }]); return; }
    active.current = true; window.speechSynthesis?.cancel(); if (recognition.current) recognition.current.onend = null; recognition.current?.abort();
    const r = new Speech(); r.lang = "en-US"; r.interimResults = true; r.continuous = false; recognition.current = r;
    r.onresult = e => { const result = e.results[e.resultIndex]; if (!result?.[0]) return; setInput(result[0].transcript); if ((result as unknown as { isFinal: boolean }).isFinal) { r.onend = null; void submitRef.current(result[0].transcript); } };
    r.onerror = e => { if (e.error === "aborted") return; if (e.error === "no-speech") { setPhase("standby"); return; } stop(); setMessages(m => [...m, { from: "assistant", text: `Microphone unavailable (${e.error}). Check permission and HTTPS, or type below.` }]); };
    r.onend = () => { if (!busy.current) { setPhase("standby"); nextListen(); } };
    try { r.start(); setPhase("listening"); void meter(); } catch { stop(); }
  }
  useEffect(() => { startRef.current = start; submitRef.current = text => { void submit(text); }; });
  useEffect(() => { speakEnabled.current = spoken; conversation.current = continuous; }, [spoken, continuous]);
  useEffect(() => { history.current?.scrollTo({ top: history.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    visible.current = open;
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", key);
    return () => { visible.current = false; document.removeEventListener("keydown", key); active.current = false; conversation.current = false; if (recognition.current) recognition.current.onend = null; recognition.current?.abort(); if (timer.current) clearTimeout(timer.current); window.speechSynthesis?.cancel(); const a = audio.current; if (a) { cancelAnimationFrame(a.animation); a.stream.getTracks().forEach(t => t.stop()); void a.context.close(); audio.current = null; } };
  }, [open, onClose]);
  if (!open) return null;
  return <section className={`ot-jarvis ot-jarvis-${phase}`} aria-label="JARVIS voice assistant"><div className="ot-jarvis-header"><span>O B S I D I A N <small>VOICE INTERFACE / 01</small></span><button onClick={() => { stop(); onClose(); }} aria-label="Close voice assistant">×</button></div><div className="ot-jarvis-visual" style={{ "--voice-energy": volume } as React.CSSProperties}><div className="ot-jarvis-orbit orbit-one" /><div className="ot-jarvis-orbit orbit-two" /><div className="ot-jarvis-orbit orbit-three" /><div className="ot-jarvis-core"><span>O</span><i /><i /><i /></div><div className="ot-jarvis-crosshair crosshair-one" /><div className="ot-jarvis-crosshair crosshair-two" /></div><div className="ot-jarvis-state"><i />{phase === "thinking" ? "PROCESSING REQUEST" : phase === "listening" ? "LISTENING TO YOU" : phase === "speaking" ? "VOICE RESPONSE" : "AWAITING YOUR COMMAND"}</div><div className="ot-jarvis-wave" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ "--wave-delay": `${i * .047}s`, height: `${5 + Math.abs(Math.sin(i * 1.4)) * (phase === "listening" ? volume * 65 : phase === "speaking" ? 22 : 4)}px` } as React.CSSProperties} />)}</div><div className="ot-jarvis-history" ref={history} aria-live="polite">{messages.map((m, i) => <div key={i} className={`ot-jarvis-message ${m.from}`}><small>{m.from === "you" ? "YOU" : "OBSIDIAN"}</small><p>{m.text}</p></div>)}</div><form onSubmit={e => { e.preventDefault(); void submit(input); }}><input aria-label="Ask Obsidian" placeholder="Ask your council, or say ‘show demo desk’…" value={input} maxLength={1500} onChange={e => setInput(e.target.value)} /><button disabled={phase === "thinking" || !input.trim()}>Send</button></form><div className="ot-jarvis-controls"><button onClick={() => phase === "listening" ? stop() : start()} disabled={phase === "thinking"}>{phase === "listening" ? "Stop microphone" : "Start microphone"}</button><label><input type="checkbox" checked={spoken} onChange={e => { setSpoken(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Spoken replies</label><label><input type="checkbox" checked={continuous} onChange={e => { setContinuous(e.target.checked); conversation.current = e.target.checked; }} /> Conversation</label></div><p className="ot-jarvis-disclosure">Navigation and status are local. Research questions use your budgeted AI council. Demo orders require review in the demo desk. Browser speech services may process audio.</p></section>;
}
