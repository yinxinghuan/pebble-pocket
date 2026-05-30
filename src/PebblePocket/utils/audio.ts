// Sea ambient + small bells. Per CLAUDE.md memory rules:
//   - never init AudioContext on mount; only on first user gesture
//   - ambient breathes with real silent gaps (rise 5-8s, hold 8-16s,
//     fall 6-10s, silent 7-16s, looped, random peak)

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let seaG: GainNode | null = null;
let liveVoices = 0;
const MAX_VOICES = 16;

export function initAudio(): void {
  if (actx) return;
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    actx = new Ctx();
    master = actx.createGain();
    master.gain.value = 0.42;
    master.connect(actx.destination);

    // Ocean layer — looping noise → bandpass → swelling gain
    seaG = actx.createGain();
    seaG.gain.value = 0.0001;
    seaG.connect(master);

    const sr = actx.sampleRate;
    const buf = actx.createBuffer(1, Math.floor(sr * 1.0), sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = actx.createBiquadFilter();
    bp.type = 'lowpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    src.connect(bp).connect(seaG);
    src.start();

    scheduleNextBreath();
  } catch (_) {
    actx = null;
  }
}

export function audioReady(): boolean {
  return !!actx && actx.state === 'running' && liveVoices < MAX_VOICES;
}

function trackVoice(durMs: number) {
  liveVoices++;
  setTimeout(() => { liveVoices--; }, durMs + 30);
}

function scheduleNextBreath() {
  if (!actx || !seaG) return;
  const t0 = actx.currentTime;
  const rise   = 5 + Math.random() * 3;
  const hold   = 8 + Math.random() * 8;
  const fall   = 6 + Math.random() * 4;
  const silent = 7 + Math.random() * 9;
  const peak   = 0.04 + Math.random() * 0.06;
  const g = seaG.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(Math.max(g.value, 0.0001), t0);
  g.exponentialRampToValueAtTime(peak,   t0 + rise);
  g.setValueAtTime(peak,                 t0 + rise + hold);
  g.exponentialRampToValueAtTime(0.0001, t0 + rise + hold + fall);
  const total = rise + hold + fall + silent;
  setTimeout(scheduleNextBreath, total * 1000);
}

// Small glassy bell when something happens
export function playBell(freq: number, vol = 0.16) {
  if (!audioReady() || !actx || !master) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  const m = actx.createOscillator();
  const mg = actx.createGain(); mg.gain.value = freq * 0.5;
  const g = actx.createGain();
  m.frequency.value = freq * 2.01;
  m.connect(mg).connect(o.frequency);
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(master);
  o.start(t); m.start(t);
  o.stop(t + 1.0); m.stop(t + 1.0);
  trackVoice(1000);
}

// Soft tide — louder swell on tap during stone detail
export function playSwell() {
  if (!audioReady() || !actx || !master) return;
  const t = actx.currentTime;
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(1, Math.floor(sr * 1.2), sr);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const bp = actx.createBiquadFilter();
  bp.type = 'lowpass'; bp.frequency.value = 480; bp.Q.value = 0.7;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  src.connect(bp).connect(g).connect(master);
  src.start(t); src.stop(t + 1.2);
  trackVoice(1200);
}
