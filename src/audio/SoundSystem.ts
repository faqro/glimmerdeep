/**
 * Lightweight 16-bit Web Audio synthesizer for sound effects and gentle ambient chimes.
 * Requires no external audio files and respects mute state.
 */
class SoundSystemImpl {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'triangle', gainVal = 0.08): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playSwing(): void {
    this.tone(360, 140, 0.09, 'triangle', 0.07);
  }

  playShoot(): void {
    this.tone(580, 260, 0.1, 'square', 0.045);
  }

  playHit(): void {
    this.tone(180, 70, 0.11, 'sawtooth', 0.07);
  }

  playPlayerHurt(): void {
    this.tone(140, 55, 0.18, 'sawtooth', 0.1);
  }

  playDodge(): void {
    this.tone(300, 520, 0.12, 'sine', 0.06);
  }

  playPickup(): void {
    this.tone(523, 784, 0.11, 'sine', 0.07);
  }

  playBreak(): void {
    this.tone(240, 80, 0.22, 'square', 0.08);
  }

  playUnlock(): void {
    this.tone(440, 660, 0.12, 'triangle', 0.07);
    setTimeout(() => this.tone(660, 880, 0.16, 'triangle', 0.07), 90);
  }

  playHeal(): void {
    this.tone(440, 587, 0.14, 'sine', 0.07);
    setTimeout(() => this.tone(587, 880, 0.18, 'sine', 0.07), 100);
  }

  playExplosion(): void {
    this.tone(120, 32, 0.28, 'sawtooth', 0.12);
  }
}

export const SoundSystem = new SoundSystemImpl();
