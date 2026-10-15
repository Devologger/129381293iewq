"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: { results: { transcript: string; isFinal?: boolean }[][]; resultIndex: number }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type Message = { from: "you" | "assistant"; text: string };
export function JarvisAssistant({ open, onClose, onCommand, fullscreen = false, telemetry }: { fullscreen?: boolean; telemetry?: { market: string; source: string; price: string; account: string; positions: number }; open: boolean; onClose: () => void; onCommand: (command: string) => Promise<string> }) {
  const [phase, setPhase] = useState("standby"), [messages, setMessages] = useState<Message[]>([{ from: "assistant", text: "Systems ready. Ask for market status, direct the research council, or navigate your workspace." }]);
  const [input, setInput] = useState(""), [spoken, setSpoken] = useState(true), [continuous, setContinuous] = useState(false), [volume, setVolume] = useState(0);
  const recognition = useRef<Recognition | null>(null), active = useRef(false), busy = useRef(false), speakEnabled = useRef(true), conversation = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<{ stream: MediaStream; context: AudioContext; animation: number } | null>(null), startRef = useRef<() => void>(() => {}), submitRef = useRef<(text: string) => void>(() => {}), history = useRef<HTMLDivElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement|null>(null), remoteUrl=useRef<string|null>(null), remoteRequest=useRef<AbortController|null>(null);
  const [remoteConfigured,setRemoteConfigured]=useState(false),[remoteVoice,setRemoteVoice]=useState(false);
  useEffect(()=>{void fetch('/api/terminal/voice').then(r=>r.json()).then(d=>setRemoteConfigured(Boolean(d.configured))).catch(()=>{});return()=>{remoteRequest.current?.abort();remoteAudio.current?.pause();if(remoteUrl.current)URL.revokeObjectURL(remoteUrl.current);};},[]);
  function stopRemote(){remoteRequest.current?.abort();remoteAudio.current?.pause();if(remoteUrl.current)URL.revokeObjectURL(remoteUrl.current);remoteUrl.current=null;remoteAudio.current=null;}
  const visible = useRef(false);
  const [sound, setSound] = useState(false);
  const soundContext = useRef<AudioContext | null>(null);
  function cue(kind: "start" | "complete" | "stop") {
    if (!sound) return;
    try {
      const context = soundContext.current ||= new AudioContext(); void context.resume();
      const notes = kind === "start" ? [440, 660, 880] : kind === "complete" ? [660, 880] : [440, 220];
      notes.forEach((frequency, i) => { const oscillator = context.createOscillator(), gain = context.createGain(), at = context.currentTime + i * .09; oscillator.type = "sine"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.045, at + .012); gain.gain.exponentialRampToValueAtTime(.001, at + .14); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + .15); });
    } catch { /* Sound is optional; commands remain available. */ }
  }
  useEffect(() => () => { void soundContext.current?.close(); soundContext.current = null; }, []);
  const [immersive, setImmersive] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]), [voiceId, setVoiceId] = useState("");
  const [voiceRate, setVoiceRate] = useState(1), [voicePitch, setVoicePitch] = useState(.85);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => setVoices(synth.getVoices());
    const initial = setTimeout(update, 0);
    synth.addEventListener("voiceschanged", update);
    return () => { clearTimeout(initial); synth.removeEventListener("voiceschanged", update); };
  }, []);
  function stopMeter() { const a = audio.current; if (a) { cancelAnimationFrame(a.animation); a.stream.getTracks().forEach(t => t.stop()); void a.context.close(); audio.current = null; } setVolume(0); }
  async function meter() {
    if (!navigator.mediaDevices?.getUserMedia || audio.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const context = new AudioContext(), analyser = context.createAnalyser(); analyser.fftSize = 128; context.createMediaStreamSource(stream).connect(analyser);
      const state = { stream, context, animation: 0 }; audio.current = state;
      const values = new Uint8Array(analyser.frequencyBinCount);
      let lastTick = 0;
      function tick() { const now = performance.now(); if (now - lastTick > 80) { analyser.getByteFrequencyData(values); setVolume(values.reduce((s, x) => s + x, 0) / values.length / 255); lastTick = now; } state.animation = requestAnimationFrame(tick); }
      tick();
    } catch { /* Recognition may still work without the optional local audio visualizer. */ }
  }
  function nextListen() { if (conversation.current && active.current) timer.current = setTimeout(() => startRef.current(), 450); }
  function stop() { stopRemote(); cue("stop"); active.current = false; conversation.current = false; setContinuous(false); recognition.current?.abort(); if (timer.current) clearTimeout(timer.current); window.speechSynthesis?.cancel(); stopMeter(); setPhase("standby"); }
  async function say(text: string) {
    if(remoteVoice&&speakEnabled.current){
      stopRemote();const controller=new AbortController();remoteRequest.current=controller;
      try{setPhase("speaking");const r=await fetch('/api/terminal/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,700)}),signal:controller.signal});if(!r.ok)throw new Error();const blob=await r.blob();if(!visible.current||controller.signal.aborted)return;const url=URL.createObjectURL(blob);remoteUrl.current=url;const player=new Audio(url);remoteAudio.current=player;player.onended=()=>{setPhase("standby");stopRemote();nextListen();};await player.play();return;}catch{if(controller.signal.aborted)return;stopRemote();}
    }
    if (!speakEnabled.current || !window.speechSynthesis) { setPhase("standby"); nextListen(); return; }
    setPhase("speaking"); window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 700)); utterance.lang = "en-US"; utterance.rate = voiceRate; utterance.pitch = voicePitch;
    const voices = window.speechSynthesis.getVoices(); utterance.voice = voices.find(v => v.voiceURI === voiceId) || voices.find(v => /George|UK English Male|Ryan/i.test(v.name)) || voices.find(v => v.lang.startsWith("en") && v.localService) || voices.find(v => v.lang.startsWith("en")) || null;
    utterance.onend = () => { setPhase("standby"); nextListen(); }; utterance.onerror = () => { setPhase("standby"); nextListen(); }; window.speechSynthesis.speak(utterance);
  }
  async function submit(text: string) {
    if (busy.current || !text.trim()) return;
    if (timer.current) clearTimeout(timer.current);
    if (recognition.current) recognition.current.onend = null;
    recognition.current?.abort(); stopRemote(); window.speechSynthesis?.cancel(); setInput(""); busy.current = true; setPhase("thinking");
    setMessages(m => [...m.slice(-19), { from: "you", text }]);
    let reply;
    try { reply = await onCommand(text); } catch (error) { reply = error instanceof Error ? error.message : "Request unavailable. Check Connections."; }
    if (visible.current) cue("complete");
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
    cue("start");
    try { r.start(); setPhase("listening"); void meter(); } catch { stop(); }
  }
  useEffect(() => { startRef.current = start; submitRef.current = text => { void submit(text); }; });
  useEffect(() => { speakEnabled.current = spoken; conversation.current = continuous; }, [spoken, continuous]);
  useEffect(() => { history.current?.scrollTo({ top: history.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    visible.current = open;
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", key);
    return () => { stopRemote(); visible.current = false; document.removeEventListener("keydown", key); active.current = false; conversation.current = false; if (recognition.current) recognition.current.onend = null; recognition.current?.abort(); if (timer.current) clearTimeout(timer.current); window.speechSynthesis?.cancel(); const a = audio.current; if (a) { cancelAnimationFrame(a.animation); a.stream.getTracks().forEach(t => t.stop()); void a.context.close(); audio.current = null; } };
  }, [open, onClose]);
  if (!open) return null;
  return <section className={`ot-jarvis ot-jarvis-${phase}${fullscreen ? " penguin-cinematic" : ""}`} aria-label="JARVIS voice assistant"><div className="ot-jarvis-header"><span>P E N G U I N <small>VOICE INTERFACE / 01</small></span><div className="penguin-voice-window-actions">{fullscreen ? <button aria-label="Toggle browser fullscreen" onClick={async () => { try { if (document.fullscreenElement) { await document.exitFullscreen(); setImmersive(false); } else { await document.documentElement.requestFullscreen(); setImmersive(true); } } catch { setMessages(m => [...m, { from: "assistant", text: "Browser fullscreen is unavailable here. This cinematic page already fills the screen." }]); } }}>{immersive ? "Exit fullscreen" : "Fullscreen"}</button> : <Link href="/jarvis" onClick={stop}>Cinematic view ↗</Link>}<button onClick={() => { stop(); if (fullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {}); onClose(); }} aria-label="Close voice assistant">×</button></div></div>{fullscreen && <><div className="penguin-cinematic-grid" aria-hidden="true" /><div className="penguin-cinematic-stars" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`, animationDelay: `${-i * .4}s` }} />)}</div><div className="penguin-cinematic-title"><span>PERSONAL INTELLIGENCE SYSTEM</span><h1>Your command.<br /><em>One connected universe.</em></h1><p>Speak, explore, and question the evidence.</p></div>{telemetry && <div className="penguin-cinematic-telemetry"><div><small>SELECTED MARKET</small><strong>{telemetry.market}</strong><span>{telemetry.source} · {telemetry.price}</span></div><div><small>BINANCE DEMO</small><strong>{telemetry.account}</strong><span>{telemetry.positions} open positions</span></div></div>}</>}<div className="ot-jarvis-visual" style={{ "--voice-energy": volume } as React.CSSProperties}><div className="ot-jarvis-orbit orbit-one" /><div className="ot-jarvis-orbit orbit-two" /><div className="ot-jarvis-orbit orbit-three" /><div className="ot-jarvis-core"><span>P</span><i /><i /><i /></div><div className="ot-jarvis-crosshair crosshair-one" /><div className="ot-jarvis-crosshair crosshair-two" /></div><div className="ot-jarvis-state"><i />{phase === "thinking" ? "PROCESSING REQUEST" : phase === "listening" ? "LISTENING TO YOU" : phase === "speaking" ? "VOICE RESPONSE" : "AWAITING YOUR COMMAND"}</div><div className="ot-jarvis-wave" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ "--wave-delay": `${i * .047}s`, height: `${5 + Math.abs(Math.sin(i * 1.4)) * (phase === "listening" ? volume * 65 : phase === "speaking" ? 22 : 4)}px` } as React.CSSProperties} />)}</div><div className="ot-jarvis-history" ref={history} aria-live="polite">{messages.map((m, i) => <div key={i} className={`ot-jarvis-message ${m.from}`}><small>{m.from === "you" ? "YOU" : "PENGUIN"}</small><p>{m.text}</p></div>)}</div><form onSubmit={e => { e.preventDefault(); void submit(input); }}><input aria-label="Ask Penguin" placeholder="Ask your council, or say ‘show demo desk’…" value={input} maxLength={1500} onChange={e => setInput(e.target.value)} /><button disabled={phase === "thinking" || !input.trim()}>Send</button></form><div className="ot-jarvis-voice-settings"><label>Voice<select aria-label="Assistant voice" value={voiceId} onChange={e => setVoiceId(e.target.value)}><option value="">Automatic · British voice preferred</option>{voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label><label>Speaking rate<input aria-label="Speaking rate" type="range" min="0.7" max="1.3" step="0.05" value={voiceRate} onChange={e => setVoiceRate(Number(e.target.value))} /></label><label>Voice pitch<input aria-label="Voice pitch" type="range" min="0.5" max="1.2" step="0.05" value={voicePitch} onChange={e => setVoicePitch(Number(e.target.value))} /></label></div>{fullscreen && <div className="penguin-voice-suggestions">{["show status", "show budget", "show profile"].map(command => <button key={command} disabled={phase === "thinking"} onClick={() => void submit(command)}>{command}</button>)}</div>}<div className="ot-jarvis-controls"><button onClick={() => phase === "listening" ? stop() : start()} disabled={phase === "thinking"}>{phase === "listening" ? "Stop microphone" : "Start microphone"}</button>{remoteConfigured&&<label><input type="checkbox" checked={remoteVoice} onChange={e=>{setRemoteVoice(e.target.checked);stopRemote();}}/> Remote Jarvis voice</label>}<label><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /> Interface sounds</label><label><input type="checkbox" checked={spoken} onChange={e => { setSpoken(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Spoken replies</label><label><input type="checkbox" checked={continuous} onChange={e => { setContinuous(e.target.checked); conversation.current = e.target.checked; }} /> Conversation</label></div><p className="ot-jarvis-disclosure">Navigation and status are local. Research questions use your budgeted AI council. Demo orders require review in the demo desk. Browser speech services may process audio.</p></section>;
}
