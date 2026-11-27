import { steamSystem } from './SteamSystem';

const SETTINGS_STORAGE_KEY = 'glimmerdeep_settings_v1';
const TUTORIAL_COMPLETED_KEY = 'glimmerdeep_tutorial_completed_v1';

export type ParticleQuality = 'full' | 'reduced';
export type CrtScanlinesMode = 'off' | 'medium' | 'high';

export interface GameSettings {
  muted: boolean;
  musicVolume: number; // 0..100
  sfxVolume: number;   // 0..100
  screenShake: boolean;
  particles: ParticleQuality;
  crtScanlines: CrtScanlinesMode;
  showControlHints: boolean;
  chatMessages: boolean;
  filterMessages: boolean;
  speedrunCounter: boolean;
  hideUsernames: boolean;
  hideEnvironmentText: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  musicVolume: 100,
  sfxVolume: 100,
  screenShake: true,
  particles: 'full',
  crtScanlines: 'off',
  showControlHints: true,
  chatMessages: true,
  filterMessages: true,
  speedrunCounter: false,
  hideUsernames: false,
  hideEnvironmentText: false,
};

const PROFANITY_B64 =
  'ZnVja3xzaGl0fGJpdGNofGFzc2hvbGV8YmFzdGFyZHxkaWNrfGNvY2t8cHVzc3l8Y3VudHx3aG9yZXxzbHV0fGRhbW58Y3JhcHxwaXNzfGZhZ3xmYWdnb3R8cmV0YXJkfG5pZ2dlcnxuaWdnYXxtb3RoZXJmdWNrZXJ8YnVsbHNoaXR8ZHVtYmFzc3xqYWNrYXNz';

let cachedProfanityRegex: RegExp | null = null;

function getProfanityRegex(): RegExp | null {
  if (cachedProfanityRegex) return cachedProfanityRegex;
  try {
    const decoded = typeof atob === 'function' ? atob(PROFANITY_B64) : '';
    if (!decoded) return null;
    cachedProfanityRegex = new RegExp(`\\b(${decoded})(s|ed|ing|er)?\\b`, 'gi');
    return cachedProfanityRegex;
  } catch {
    return null;
  }
}

export function filterProfanity(text: string): string {
  const rx = getProfanityRegex();
  if (!rx) return text;
  return text.replace(rx, (match) => '*'.repeat(match.length));
}

class SettingsManager {
  private data: GameSettings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<(s: GameSettings) => void>();

  constructor() {
    this.load();
    this.applyCrtScanlines();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      if (typeof parsed.muted === 'boolean') this.data.muted = parsed.muted;
      if (typeof parsed.musicVolume === 'number') {
        this.data.musicVolume = Math.max(0, Math.min(100, Math.round(parsed.musicVolume)));
      }
      if (typeof parsed.sfxVolume === 'number') {
        this.data.sfxVolume = Math.max(0, Math.min(100, Math.round(parsed.sfxVolume)));
      }
      if (typeof parsed.screenShake === 'boolean') this.data.screenShake = parsed.screenShake;
      if (parsed.particles === 'full' || parsed.particles === 'reduced') {
        this.data.particles = parsed.particles;
      }
      if (typeof parsed.crtScanlines === 'boolean') {
        this.data.crtScanlines = parsed.crtScanlines ? 'medium' : 'off';
      } else if (
        parsed.crtScanlines === 'off' ||
        parsed.crtScanlines === 'medium' ||
        parsed.crtScanlines === 'high'
      ) {
        this.data.crtScanlines = parsed.crtScanlines;
      }
      if (typeof parsed.showControlHints === 'boolean') {
        this.data.showControlHints = parsed.showControlHints;
      }
      if (typeof parsed.chatMessages === 'boolean') {
        this.data.chatMessages = parsed.chatMessages;
      }
      if (typeof parsed.filterMessages === 'boolean') {
        this.data.filterMessages = parsed.filterMessages;
      }
      if (typeof parsed.speedrunCounter === 'boolean') {
        this.data.speedrunCounter = parsed.speedrunCounter;
      }
      if (typeof parsed.hideUsernames === 'boolean') {
        this.data.hideUsernames = parsed.hideUsernames;
      }
      if (typeof parsed.hideEnvironmentText === 'boolean') {
        this.data.hideEnvironmentText = parsed.hideEnvironmentText;
      }
    } catch {
      // ignore storage errors
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.data));
      steamSystem.scheduleCloudSync();
    } catch {
      // ignore storage errors
    }
    this.applyCrtScanlines();
    for (const cb of this.listeners) {
      cb(this.data);
    }
  }

  public reloadFromStorage(): void {
    this.data = { ...DEFAULT_SETTINGS };
    this.load();
    this.applyCrtScanlines();
    for (const cb of this.listeners) {
      cb(this.data);
    }
  }

  public get current(): Readonly<GameSettings> {
    return this.data;
  }

  public update(patch: Partial<GameSettings>): void {
    Object.assign(this.data, patch);
    this.save();
  }

  public onChange(cb: (s: GameSettings) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public hasCompletedTutorial(): boolean {
    try {
      return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === '1';
    } catch {
      return false;
    }
  }

  public markTutorialCompleted(): void {
    try {
      localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
      steamSystem.scheduleCloudSync();
    } catch {
      // ignore storage errors
    }
  }

  private applyCrtScanlines(): void {
    if (typeof document === 'undefined') return;
    const id = 'glimmerdeep-crt-overlay';
    let el = document.getElementById(id);
    const container = document.getElementById('game-container');
    const mode = this.data.crtScanlines;

    if (mode === 'off') {
      if (el) el.remove();
      if (container) {
        container.style.borderRadius = '';
        container.style.overflow = '';
      }
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '9999';
      document.body.appendChild(el);
    }

    if (mode === 'high') {
      el.style.background = [
        'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 54%, rgba(6,4,14,0.45) 84%, rgba(3,2,8,0.85) 100%)',
        'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 3px, rgba(8,6,18,0.52) 3px, rgba(8,6,18,0.52) 6px)',
      ].join(', ');
      el.style.borderRadius = '22px';
      el.style.boxShadow = 'inset 0 0 38px rgba(0,0,0,0.72), inset 0 0 8px rgba(180,160,255,0.12)';
      if (container) {
        container.style.borderRadius = '18px';
        container.style.overflow = 'hidden';
      }
    } else {
      el.style.background =
        'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(8,6,18,0.28) 2px, rgba(8,6,18,0.28) 4px)';
      el.style.borderRadius = '';
      el.style.boxShadow = '';
      if (container) {
        container.style.borderRadius = '';
        container.style.overflow = '';
      }
    }
  }
}

export const settingsSystem = new SettingsManager();
