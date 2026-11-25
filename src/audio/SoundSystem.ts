import menuBgmUrl from './menutheme.ogg';
import bgmUrl from './lakeshrine.ogg';
import bossBgmUrl from './suspicious.ogg';
import darkCaveBgmUrl from './darkcave.ogg';
import nyarBossBgmUrl from './bossmusic.ogg';
import creditsBgmUrl from './credittheme.ogg';
import bossAwakenSfxUrl from './bossawaken.ogg';
import bossSpawnSfxUrl from './bossspawn.ogg';
import bossDeadSfxUrl from './bossdead.ogg';
import bossEvilLaughSfxUrl from './bossevillaugh.ogg';
import { settingsSystem } from '../systems/SettingsSystem';

export type MusicTrack = 'menu' | 'normal' | 'boss' | 'darkcave' | 'nyar_boss' | 'credits';

const TRACK_URLS: Record<MusicTrack, string> = {
  menu: menuBgmUrl,
  normal: bgmUrl,
  boss: bossBgmUrl,
  darkcave: darkCaveBgmUrl,
  nyar_boss: nyarBossBgmUrl,
  credits: creditsBgmUrl,
};

/**
 * Lightweight 16-bit Web Audio synthesizer for sound effects and background music.
 * Requires no external audio files for SFX and respects mute state.
 */
class SoundSystemImpl {
  private ctx: AudioContext | null = null;
  private _muted = settingsSystem.current.muted;
  private tracks: Partial<Record<MusicTrack, HTMLAudioElement>> = {};
  private activeTrack: MusicTrack = 'menu';
  private bgmStarted = false;
  private unlockListenerBound = false;
  private laughLoopActive = false;
  private laughAudio: HTMLAudioElement | null = null;
  private laughTimer: number | null = null;

  constructor() {
    settingsSystem.onChange((s) => {
      this._muted = s.muted;
      const trackVol = 0.175 * (s.musicVolume / 100);
      for (const audio of Object.values(this.tracks)) {
        if (audio) {
          audio.muted = s.muted;
          audio.volume = trackVol;
        }
      }
      if (this.laughAudio) {
        this.laughAudio.muted = s.muted;
        this.laughAudio.volume = 0.25 * (s.sfxVolume / 100);
      }
    });
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(val: boolean) {
    this._muted = val;
    settingsSystem.update({ muted: val });
  }

  private getOrCreateTrack(track: MusicTrack): HTMLAudioElement {
    const existing = this.tracks[track];
    if (existing) return existing;

    const audio = new Audio(TRACK_URLS[track]);
    audio.loop = true;
    audio.volume = 0.175 * (settingsSystem.current.musicVolume / 100);
    audio.muted = this._muted;
    audio.addEventListener('ended', () => {
      if (this.activeTrack !== track) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    });
    this.tracks[track] = audio;
    return audio;
  }

  private playActiveTrack(): void {
    const target = this.getOrCreateTrack(this.activeTrack);

    const tryPlay = () => {
      const current = this.getOrCreateTrack(this.activeTrack);
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

    if (target) tryPlay();
  }

  startMusic(): void {
    if (typeof window === 'undefined') return;
    this.getOrCreateTrack(this.activeTrack);
    if (this.bgmStarted) return;
    this.bgmStarted = true;
    this.playActiveTrack();
  }

  setMusicTrack(track: MusicTrack): void {
    if (typeof window === 'undefined') return;
    if (this.activeTrack === track && this.bgmStarted) return;
    const prevTrack = this.activeTrack;
    this.activeTrack = track;

    if (!this.bgmStarted) {
      this.startMusic();
      return;
    }

    if (prevTrack !== track) {
      this.tracks[prevTrack]?.pause();
    }
    const nextAudio = this.getOrCreateTrack(track);
    if (track === 'boss' || track === 'nyar_boss' || track === 'credits') {
      nextAudio.currentTime = 0;
    }

    this.playActiveTrack();
  }

  private playOggSfx(url: string, volume = 0.38): void {
    if (typeof window === 'undefined' || this._muted) return;
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {});
  }

  playBossAwaken(): void {
    this.playOggSfx(bossAwakenSfxUrl, 0.4);
  }

  playBossSpawn(): void {
    this.playOggSfx(bossSpawnSfxUrl, 0.42);
  }

  playBossDead(): void {
    this.playOggSfx(bossDeadSfxUrl, 0.45);
  }

  startBossEvilLaughLoop(): void {
    if (typeof window === 'undefined') return;
    if (this.laughLoopActive) return;
    this.laughLoopActive = true;

    if (!this.laughAudio) {
      const audio = new Audio(bossEvilLaughSfxUrl);
      audio.volume = 0.32;
      audio.muted = this._muted;
      audio.addEventListener('ended', () => {
        if (!this.laughLoopActive) return;
        this.laughTimer = window.setTimeout(() => {
          if (!this.laughLoopActive || !this.laughAudio) return;
          this.laughAudio.currentTime = 0;
          this.laughAudio.play().catch(() => {});
        }, 1000);
      });
      this.laughAudio = audio;
    }

    this.laughAudio.muted = this._muted;
    this.laughAudio.currentTime = 0;
    this.laughAudio.play().catch(() => {});
  }

  stopBossEvilLaughLoop(): void {
    this.laughLoopActive = false;
    if (this.laughTimer !== null) {
      window.clearTimeout(this.laughTimer);
      this.laughTimer = null;
    }
    if (this.laughAudio) {
      this.laughAudio.pause();
      this.laughAudio.currentTime = 0;
    }
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

    const sfxMult = settingsSystem.current.sfxVolume / 100;
    if (sfxMult <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(Math.max(0.001, gainVal * 2 * sfxMult), now);
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
