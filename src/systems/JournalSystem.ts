import { BOSSES, ENEMIES } from '../data/enemies';
import { ARTIFACTS, CONSUMABLES } from '../data/items';
import { WEAPONS } from '../data/weapons';

const JOURNAL_STORAGE_KEY = 'glimmerdeep_journal_v1';

export interface JournalSaveData {
  enemies: string[];
  bosses: string[];
  items: string[];
}

class JournalManager {
  private data: JournalSaveData = {
    enemies: [],
    bosses: [],
    items: [],
  };

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<JournalSaveData>;
      if (Array.isArray(parsed.enemies)) {
        this.data.enemies = parsed.enemies.filter((x): x is string => typeof x === 'string');
      }
      if (Array.isArray(parsed.bosses)) {
        this.data.bosses = parsed.bosses.filter((x): x is string => typeof x === 'string');
      }
      if (Array.isArray(parsed.items)) {
        this.data.items = parsed.items.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      // ignore storage/parse errors
    }
  }

  private save(): void {
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore storage errors
    }
  }

  public discoverEnemy(id: string): void {
    if (!id || this.data.enemies.includes(id)) return;
    this.data.enemies.push(id);
    this.save();
  }

  public discoverBoss(id: string): void {
    if (!id || this.data.bosses.includes(id)) return;
    this.data.bosses.push(id);
    this.save();
  }

  public discoverItem(id: string): void {
    if (!id || this.data.items.includes(id)) return;
    this.data.items.push(id);
    this.save();
  }

  public getDiscoveredEnemies(): string[] {
    return this.data.enemies;
  }

  public getDiscoveredBosses(): string[] {
    return this.data.bosses;
  }

  public getDiscoveredItems(): string[] {
    return this.data.items;
  }

  public unlockAll(): void {
    for (const id of Object.keys(ENEMIES)) {
      if (!this.data.enemies.includes(id)) this.data.enemies.push(id);
    }
    for (const id of Object.keys(BOSSES)) {
      if (!this.data.bosses.includes(id)) this.data.bosses.push(id);
    }
    for (const id of [...Object.keys(WEAPONS), ...Object.keys(CONSUMABLES), ...Object.keys(ARTIFACTS)]) {
      if (!this.data.items.includes(id)) this.data.items.push(id);
    }
    this.save();
  }
}

export const JournalSystem = new JournalManager();
