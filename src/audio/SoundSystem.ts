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
import windGustSfxUrl from './windgust.ogg';
import rainLoopSfxUrl from './rainloop.ogg';
import arrowHitSfxUrl from './arrowhit.ogg';
import bowDrawSfxUrl from './bowdraw.ogg';
import bubblePopSfxUrl from './bubblepop.ogg';
import cicadaLoopSfxUrl from './cicadaloop.ogg';
import flamethrowerLoopSfxUrl from './flamethrowerloop.ogg';
import heavySlamSfxUrl from './heavyslam.ogg';
import laserLoopSfxUrl from './laserloop.ogg';
import laserPowerupSfxUrl from './laserpowerup.ogg';
import lightningElectricSfxUrl from './lightningelectric.ogg';
import magicShootSfxUrl from './magicshoot.ogg';
import merchantPurchaseSfxUrl from './merchantpurchase.ogg';
import necromancySummonSfxUrl from './necromancysummon.ogg';
import puzzleSuccessSfxUrl from './puzzlesuccess.ogg';
import slimeJumpSfxUrl from './slimejump.ogg';
import sporePoofSfxUrl from './sporepoof.ogg';
import weaponFloorSlamSfxUrl from './weaponfloorslam.ogg';
import weaponSlashSfxUrl from './weaponslash.ogg';
import weaponStabSfxUrl from './weaponstab.ogg';
import weaponWhipSfxUrl from './weaponwhip.ogg';
import explosionSfxUrl from './explosion.ogg';
import stompSfxUrl from './stomp.ogg';
import meteorCrashSfxUrl from './meteorcrash.ogg';
import grappleHitSfxUrl from './grapplehit.ogg';
import grappleReelLoopSfxUrl from './grapplereel.ogg';
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
  private lastEnemyShootAt = 0;
  private rainAudio: HTMLAudioElement | null = null;
  private rainActive = false;
  private rainFadeFactor = 0;
  private rainFadeTimer: number | null = null;
  private cicadaAudio: HTMLAudioElement | null = null;
  private cicadaActive = false;
  private flamethrowerAudio: HTMLAudioElement | null = null;
  private flamethrowerActive = false;
  private laserAudio: HTMLAudioElement | null = null;
  private laserActive = false;
  private grappleReelAudio: HTMLAudioElement | null = null;
  private grappleReelActive = false;
  private sfxDebounce = new Map<string, number>();

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
      if (this.rainAudio) {
        this.rainAudio.muted = s.muted;
        this.rainAudio.volume = 0.22 * (s.sfxVolume / 100) * this.rainFadeFactor;
      }
      if (this.cicadaAudio) {
        this.cicadaAudio.muted = s.muted;
        this.cicadaAudio.volume = 0.11 * (s.sfxVolume / 100);
      }
      if (this.flamethrowerAudio) {
        this.flamethrowerAudio.muted = s.muted;
        this.flamethrowerAudio.volume = 0.24 * (s.sfxVolume / 100);
      }
      if (this.laserAudio) {
        this.laserAudio.muted = s.muted;
        this.laserAudio.volume = 0.22 * (s.sfxVolume / 100);
      }
      if (this.grappleReelAudio) {
        this.grappleReelAudio.muted = s.muted;
        this.grappleReelAudio.volume = 0.24 * (s.sfxVolume / 100);
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

  playWindGust(): void {
    const sfxMult = settingsSystem.current.sfxVolume / 100;
    if (sfxMult <= 0) return;
    this.playOggSfx(windGustSfxUrl, 0.36 * sfxMult);
  }

  setRainActive(active: boolean): void {
    if (typeof window === 'undefined') return;
    if (this.rainActive === active) return;
    this.rainActive = active;

    if (!this.rainAudio) {
      const audio = new Audio(rainLoopSfxUrl);
      audio.loop = true;
      audio.volume = 0;
      audio.muted = this._muted;
      this.rainAudio = audio;
    }

    if (active) {
      this.rainAudio.muted = this._muted;
      this.rainAudio.play().catch(() => {});
    }

    if (this.rainFadeTimer === null) {
      const stepMs = 40;
      const fadeStep = stepMs / 800; // 800ms fade in/out
      this.rainFadeTimer = window.setInterval(() => {
        if (!this.rainAudio) return;
        if (this.rainActive) {
          this.rainFadeFactor = Math.min(1, this.rainFadeFactor + fadeStep);
        } else {
          this.rainFadeFactor = Math.max(0, this.rainFadeFactor - fadeStep);
        }
        const targetVol = 0.22 * (settingsSystem.current.sfxVolume / 100) * this.rainFadeFactor;
        this.rainAudio.muted = this._muted;
        this.rainAudio.volume = Math.max(0, Math.min(1, targetVol));

        if ((this.rainActive && this.rainFadeFactor >= 1) || (!this.rainActive && this.rainFadeFactor <= 0)) {
          if (!this.rainActive && this.rainFadeFactor <= 0) {
            this.rainAudio.pause();
          }
          if (this.rainFadeTimer !== null) {
            window.clearInterval(this.rainFadeTimer);
            this.rainFadeTimer = null;
          }
        }
      }, stepMs);
    }
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

  playEnemyShoot(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastEnemyShootAt < 45) return;
    this.lastEnemyShootAt = now;
    this.tone(420, 170, 0.075, 'square', 0.038);
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
    this.playDebouncedOgg('explosion', explosionSfxUrl, 0.38, 60);
  }

  playStomp(): void {
    this.playDebouncedOgg('stomp', stompSfxUrl, 0.38, 80);
  }

  playMeteorCrash(): void {
    this.playDebouncedOgg('meteorcrash', meteorCrashSfxUrl, 0.4, 80);
  }

  playGrappleHit(): void {
    this.playDebouncedOgg('grapplehit', grappleHitSfxUrl, 0.36, 60);
  }

  setGrappleReelActive(active: boolean): void {
    this.setSimpleLoop(
      active,
      grappleReelLoopSfxUrl,
      0.24,
      () => this.grappleReelAudio,
      (a) => { this.grappleReelAudio = a; },
      () => this.grappleReelActive,
      (v) => { this.grappleReelActive = v; }
    );
  }

  private playDebouncedOgg(key: string, url: string, baseVol = 0.34, minIntervalMs = 45): void {
    const sfxMult = settingsSystem.current.sfxVolume / 100;
    if (sfxMult <= 0 || this._muted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.sfxDebounce.get(key) ?? 0;
    if (now - last < minIntervalMs) return;
    this.sfxDebounce.set(key, now);
    this.playOggSfx(url, baseVol * sfxMult);
  }

  private setSimpleLoop(
    active: boolean,
    url: string,
    baseVol: number,
    getAudio: () => HTMLAudioElement | null,
    setAudio: (a: HTMLAudioElement) => void,
    getFlag: () => boolean,
    setFlag: (v: boolean) => void
  ): void {
    if (typeof window === 'undefined') return;
    if (getFlag() === active) return;
    setFlag(active);
    let audio = getAudio();
    if (!audio) {
      audio = new Audio(url);
      audio.loop = true;
      setAudio(audio);
    }
    const sfxMult = settingsSystem.current.sfxVolume / 100;
    audio.muted = this._muted;
    audio.volume = Math.max(0, Math.min(1, baseVol * sfxMult));
    if (active) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  setCicadaActive(active: boolean): void {
    this.setSimpleLoop(
      active,
      cicadaLoopSfxUrl,
      0.11,
      () => this.cicadaAudio,
      (a) => { this.cicadaAudio = a; },
      () => this.cicadaActive,
      (v) => { this.cicadaActive = v; }
    );
  }

  setFlamethrowerActive(active: boolean): void {
    this.setSimpleLoop(
      active,
      flamethrowerLoopSfxUrl,
      0.24,
      () => this.flamethrowerAudio,
      (a) => { this.flamethrowerAudio = a; },
      () => this.flamethrowerActive,
      (v) => { this.flamethrowerActive = v; }
    );
  }

  setLaserActive(active: boolean): void {
    this.setSimpleLoop(
      active,
      laserLoopSfxUrl,
      0.22,
      () => this.laserAudio,
      (a) => { this.laserAudio = a; },
      () => this.laserActive,
      (v) => { this.laserActive = v; }
    );
  }

  stopAllGameplayLoops(): void {
    this.setRainActive(false);
    this.setCicadaActive(false);
    this.setFlamethrowerActive(false);
    this.setLaserActive(false);
    this.setGrappleReelActive(false);
  }

  playArrowHit(): void {
    this.playDebouncedOgg('arrowhit', arrowHitSfxUrl, 0.32, 40);
  }

  playBowDraw(): void {
    this.playDebouncedOgg('bowdraw', bowDrawSfxUrl, 0.34, 60);
  }

  playBubblePop(): void {
    this.playDebouncedOgg('bubblepop', bubblePopSfxUrl, 0.34, 45);
  }

  playHeavySlam(): void {
    this.playDebouncedOgg('heavyslam', heavySlamSfxUrl, 0.38, 70);
  }

  playLaserPowerup(): void {
    this.playDebouncedOgg('laserpowerup', laserPowerupSfxUrl, 0.3, 180);
  }

  playLightningElectric(): void {
    this.playDebouncedOgg('lightning', lightningElectricSfxUrl, 0.36, 70);
  }

  playMagicShoot(): void {
    this.playDebouncedOgg('magicshoot', magicShootSfxUrl, 0.3, 45);
  }

  playMerchantPurchase(): void {
    this.playDebouncedOgg('merchantpurchase', merchantPurchaseSfxUrl, 0.38, 80);
  }

  playNecromancySummon(): void {
    this.playDebouncedOgg('necromancy', necromancySummonSfxUrl, 0.36, 120);
  }

  playPuzzleSuccess(): void {
    this.playDebouncedOgg('puzzlesuccess', puzzleSuccessSfxUrl, 0.4, 200);
  }

  playSlimeJump(): void {
    this.playDebouncedOgg('slimejump', slimeJumpSfxUrl, 0.28, 110);
  }

  playSporePoof(): void {
    this.playDebouncedOgg('sporepoof', sporePoofSfxUrl, 0.3, 110);
  }

  playWeaponFloorSlam(): void {
    this.playDebouncedOgg('weaponfloorslam', weaponFloorSlamSfxUrl, 0.36, 70);
  }

  playWeaponSlash(): void {
    this.playDebouncedOgg('weaponslash', weaponSlashSfxUrl, 0.32, 45);
  }

  playWeaponStab(): void {
    this.playDebouncedOgg('weaponstab', weaponStabSfxUrl, 0.32, 45);
  }

  playWeaponWhip(): void {
    this.playDebouncedOgg('weaponwhip', weaponWhipSfxUrl, 0.34, 60);
  }
}

export const SoundSystem = new SoundSystemImpl();
