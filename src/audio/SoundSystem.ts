import bgmUrl from './lakeshrine.ogg';
import bossBgmUrl from './suspicious.ogg';

type MusicTrack = 'normal' | 'boss';

/**
 * Lightweight 16-bit Web Audio synthesizer for sound effects and background music.
 * Requires no external audio files for SFX and respects mute state.
 */
class SoundSystemImpl {
  private ctx: AudioContext | null = null;
  private _muted = false;
  private bgm: HTMLAudioElement | null = null;
  private bossBgm: HTMLAudioElement | null = null;
  private activeTrack: MusicTrack = 'normal';
  private bgmStarted = false;
  private unlockListenerBound = false;

  get muted(): boolean {
    return this._muted;
  }

  set muted(val: boolean) {
    this._muted = val;
    if (this.bgm) {
      this.bgm.muted = val;
    }
    if (this.bossBgm) {
      this.bossBgm.muted = val;
    }
  }

  private createLoopingAudio(url: string, track: MusicTrack): HTMLAudioElement {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.175;
    audio.muted = this._muted;
    audio.addEventListener('ended', () => {
      if (this.activeTrack !== track) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    });
    return audio;
  }

  private playActiveTrack(): void {
    const target = this.activeTrack === 'boss' ? this.bossBgm : this.bgm;
    if (!target) return;

    const tryPlay = () => {
      const current = this.activeTrack === 'boss' ? this.bossBgm : this.bgm;
      if (!current) return;
      current.play().then(() => {
        if (this.unlockListenerBound) {
          window.removeEventListener('pointerdown', tryPlay);
          window.removeEventListener('keydown', tryPlay);
          this.unlockListenerBound = false;
        }
      }).catch(() => {
        if (!this.unlockListenerBound) {
          this.unlockListenerBound = true;
          window.addEventListener('pointerdown', tryPlay);
          window.addEventListener('keydown', tryPlay);
        }
      });
    };

    tryPlay();
  }

  startMusic(): void {
    return; //temporarily disable music
    if (typeof window === 'undefined') return;
    if (!this.bgm) {
      this.bgm = this.createLoopingAudio(bgmUrl, 'normal');
    }
    if (!this.bossBgm) {
      this.bossBgm = this.createLoopingAudio(bossBgmUrl, 'boss');
    }
    if (this.bgmStarted) return;
    this.bgmStarted = true;
    this.playActiveTrack();
  }

  setMusicTrack(track: MusicTrack): void {
    if (typeof window === 'undefined') return;
    if (this.activeTrack === track) return;
    this.activeTrack = track;

    if (!this.bgmStarted) {
      this.startMusic();
      return;
    }

    if (track === 'boss') {
      this.bgm?.pause();
      if (this.bossBgm) {
        this.bossBgm.currentTime = 0;
      }
    } else {
      this.bossBgm?.pause();
    }

    this.playActiveTrack();
  }

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

    gain.gain.setValueAtTime(gainVal * 2, now);
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
