const SETTINGS_STORAGE_KEY = 'glimmerdeep_settings_v1';

export type ParticleQuality = 'full' | 'reduced';

export interface GameSettings {
  muted: boolean;
  musicVolume: number; // 0..100
  sfxVolume: number;   // 0..100
  screenShake: boolean;
  particles: ParticleQuality;
  crtScanlines: boolean;
  showControlHints: boolean;
  filterMessages: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  musicVolume: 100,
  sfxVolume: 100,
  screenShake: true,
  particles: 'full',
  crtScanlines: false,
  showControlHints: true,
  filterMessages: true,
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
      if (typeof parsed.crtScanlines === 'boolean') this.data.crtScanlines = parsed.crtScanlines;
      if (typeof parsed.showControlHints === 'boolean') {
        this.data.showControlHints = parsed.showControlHints;
      }
      if (typeof parsed.filterMessages === 'boolean') {
        this.data.filterMessages = parsed.filterMessages;
      }
    } catch {
      // ignore storage errors
    }
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore storage errors
    }
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

  private applyCrtScanlines(): void {
    if (typeof document === 'undefined') return;
    const id = 'glimmerdeep-crt-overlay';
    let el = document.getElementById(id);
    if (this.data.crtScanlines) {
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.position = 'fixed';
        el.style.inset = '0';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '9999';
        el.style.background =
          'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(8,6,18,0.28) 2px, rgba(8,6,18,0.28) 4px)';
        document.body.appendChild(el);
      }
    } else if (el) {
      el.remove();
    }
  }
}

export const settingsSystem = new SettingsManager();
