/**
 * Web Audio synthesis — no external assets.
 * Unlock AudioContext on first user gesture (browser autoplay policy).
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private enabled = true;
  private unlocked = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.5 : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Call from a real pointer gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.5 : 0;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    this.unlocked = true;
  }

  private ready(): boolean {
    return this.enabled && this.unlocked && !!this.ctx && !!this.master;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 0.35);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private env(peak: number, attack: number, decay: number): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    const t = this.now();
    const p = Math.max(peak, 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  private tone(freq: number, type: OscillatorType, vol: number, dur: number, glideTo?: number): void {
    if (!this.ready() || !this.ctx) return;
    try {
      const t = this.now();
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 20), t + dur);
      const g = this.env(vol, 0.01, dur);
      if (!g) return;
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch {
      /* ignore audio glitches */
    }
  }

  private noise(vol: number, dur: number, filterFreq: number, q = 0.9): void {
    if (!this.ready() || !this.ctx) return;
    const buf = this.getNoise();
    if (!buf) return;
    try {
      const t = this.now();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(filterFreq, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(filterFreq * 0.35, 80), t + dur);
      filt.Q.value = q;
      const g = this.env(vol, 0.008, dur);
      if (!g) return;
      src.connect(filt);
      filt.connect(g);
      src.start(t);
      src.stop(t + dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  playSquish(pressure: number): void {
    if (!this.ready()) return;
    const p = Math.min(Math.max(pressure, 0), 1);
    const vol = 0.1 + p * 0.28;
    this.noise(vol, 0.1 + p * 0.07, 800 + p * 1400);
    this.tone(180 - p * 70, "sine", vol * 0.4, 0.08 + p * 0.04, 95);
  }

  playRelease(pressure: number): void {
    if (!this.ready()) return;
    const p = Math.min(Math.max(pressure, 0), 1);
    const vol = 0.07 + p * 0.16;
    this.tone(220 + p * 160, "sine", vol, 0.16, 400 + p * 180);
    if (p > 0.45) this.noise(vol * 0.3, 0.06, 2000, 1.1);
  }

  playCombo(combo: number): void {
    if (!this.ready()) return;
    const step = Math.min(combo, 12);
    const base = 330 * Math.pow(2, (step % 8) / 12);
    this.tone(base, "triangle", 0.08, 0.07, base * 1.18);
    const next = base * 1.25;
    window.setTimeout(() => this.tone(next, "triangle", 0.06, 0.08), 45);
  }

  playSpecial(type: string): void {
    if (!this.ready()) return;
    if (type === "milestone" || type === "achievement") {
      const notes = [523, 659, 784];
      notes.forEach((f, i) => {
        window.setTimeout(() => this.tone(f, "sine", 0.1, 0.14), i * 60);
      });
    } else if (type === "character") {
      this.tone(440, "sine", 0.08, 0.1, 660);
    } else if (type === "wake") {
      this.tone(520, "sine", 0.12, 0.08, 880);
      this.tone(780, "triangle", 0.06, 0.1);
    }
  }
}
