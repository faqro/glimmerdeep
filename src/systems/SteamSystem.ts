export type SteamAchievementId =
  | 'ACH_FIRST_BLOOD'
  | 'ACH_BOSS_SLAYER'
  | 'ACH_FLOOR_3'
  | 'ACH_FLOOR_6'
  | 'ACH_EVERHEART_RESTORED'
  | 'ACH_SOLO_CHAMPION'
  | 'ACH_COOP_CHAMPION'
  | 'ACH_HOARDER'
  | 'ACH_LORE_SEEKER'
  | 'ACH_ITEM_COLLECTOR'
  | 'ACH_JOURNAL_MASTER'
  | 'ACH_SECRET_ARSENAL'
  | 'ACH_PERSISTENT'
  | 'ACH_PINCUSHION'
  | 'ACH_FRUGAL'
  | 'ACH_COLD_HEARTED'
  | 'ACH_PACIFIST'
  | 'ACH_NO_HEAL'
  | 'ACH_SPEEDRUNNER';

const DEATH_COUNT_KEY = 'glimmerdeep_total_deaths';
const SPIKE_STAB_COUNT_KEY = 'glimmerdeep_spike_stabs';

const ADMIN_UNLOCK_STORAGE_KEY = 'glimmerdeep_admin_unlock';
const CLOUD_SAVE_FILE = 'glimmerdeep_save_v1.json';
const CLOUD_UPDATED_AT_KEY = 'glimmerdeep_cloud_updated_at_v1';
const CLOUD_SYNC_KEYS = [
  'glimmerdeep_settings_v1',
  'glimmerdeep_tutorial_completed_v1',
  'glimmerdeep_journal_v1',
  'glimmerdeep_selected_avatar',
  'glimmerdeep_selected_pet',
  'glimmerdeep_gamepad_layout',
  'glimmerdeep_signaling_v1',
  'glimmerdeep_total_deaths',
  'glimmerdeep_spike_stabs',
  'glimmerdeep_nyar_history_v1',
  'glimmerdeep_username',
  'glimmerdeep_player_uid_v1',
  'glimmerdeep_admin_unlock',
] as const;

export function hasAdminMasterUnlock(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function grantAdminMasterUnlock(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, 'true');
      steamSystem.scheduleCloudSync();
    }
  } catch {
    // ignore storage errors
  }
}

export function isDesktopBuild(): boolean {
  if (hasAdminMasterUnlock()) return true;
  if (import.meta.env.VITE_DESKTOP === 'true') return true;
  if (typeof window !== 'undefined' && window.glimmerdeepDesktop?.isDesktop) return true;
  return false;
}

export function isSteamworksBuild(): boolean {
  if (import.meta.env.VITE_STEAMWORKS === 'true') return true;
  if (typeof window !== 'undefined' && window.glimmerdeepDesktop?.isSteamworks) return true;
  return false;
}

class SteamSystem {
  private unlocked = new Set<string>();
  private _hasAvatarDlc = false;
  private _playerName: string | null = null;
  private _steamId: string | null = null;
  private _currentLobbyId: string | null = null;
  private _cloudSyncTimer: number | null = null;
  private _cloudBeforeUnloadBound = false;

  public getCachedPlayerName(): string | null {
    return this._playerName;
  }

  public getCachedSteamId(): string | null {
    return this._steamId;
  }

  public getCurrentLobbyId(): string | null {
    return this._currentLobbyId;
  }

  public async refreshSteamId(): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const id = await window.glimmerdeepDesktop?.getSteamId();
      if (id) this._steamId = id;
    } catch {
      // ignore
    }
    return this._steamId;
  }

  public async refreshPlayerName(): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const name = await window.glimmerdeepDesktop?.getPlayerName();
      if (name && name.trim().length > 0) {
        this._playerName = name.trim().slice(0, 12);
      }
    } catch {
      // ignore
    }
    return this._playerName;
  }

  public isAvatarDlcUnlocked(): boolean {
    if (hasAdminMasterUnlock()) return true;
    return isSteamworksBuild() && this._hasAvatarDlc;
  }

  public async refreshDlcStatus(): Promise<boolean> {
    if (hasAdminMasterUnlock()) {
      this._hasAvatarDlc = true;
      return true;
    }
    if (!isSteamworksBuild()) {
      this._hasAvatarDlc = false;
      return false;
    }
    try {
      this._hasAvatarDlc = Boolean(await window.glimmerdeepDesktop?.hasAvatarDlc());
    } catch {
      this._hasAvatarDlc = false;
    }
    return this._hasAvatarDlc;
  }

  public async unlockAchievement(id: SteamAchievementId): Promise<void> {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.unlockAchievement(id);
    } catch {
      // ignore IPC errors
    }
  }

  public async submitSoloClearTime(timeMs: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.submitLeaderboardTime('Solo Speedrun', timeMs);
    } catch {
      // ignore IPC errors
    }
  }

  public async submitCoopClearTime(timeMs: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.submitLeaderboardTime('Co-op Speedrun', timeMs);
    } catch {
      // ignore IPC errors
    }
  }

  public async getLeaderboardData(name: 'Solo Speedrun' | 'Co-op Speedrun'): Promise<{
    available: boolean;
    bestTimeMs: number | null;
    clears: number;
    entries: Array<{ rank: number; name: string; timeMs: number; isSelf?: boolean }>;
    appId: number | null;
  }> {
    if (!isSteamworksBuild()) {
      return { available: false, bestTimeMs: null, clears: 0, entries: [], appId: null };
    }
    try {
      const res = await window.glimmerdeepDesktop?.getLeaderboardData(name);
      if (res) return res;
    } catch {
      // ignore IPC errors
    }
    return { available: false, bestTimeMs: null, clears: 0, entries: [], appId: null };
  }

  public async openLeaderboardOverlay(): Promise<boolean> {
    if (!isSteamworksBuild()) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.openLeaderboardOverlay());
    } catch {
      return false;
    }
  }

  public recordDeath(): void {
    let total = 0;
    try {
      total = (Number(localStorage.getItem(DEATH_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(DEATH_COUNT_KEY, String(total));
    } catch {
      total = 1;
    }
    if (isSteamworksBuild()) {
      void window.glimmerdeepDesktop?.incrementStat('total_deaths', 1);
      this.scheduleCloudSync();
    }
    if (total >= 100) {
      void this.unlockAchievement('ACH_PERSISTENT');
    }
  }

  public recordSpikeStab(): void {
    let total = 0;
    try {
      total = (Number(localStorage.getItem(SPIKE_STAB_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(SPIKE_STAB_COUNT_KEY, String(total));
    } catch {
      total = 1;
    }
    if (isSteamworksBuild()) {
      void window.glimmerdeepDesktop?.incrementStat('spike_stabs', 1);
      this.scheduleCloudSync();
    }
    if (total >= 50) {
      void this.unlockAchievement('ACH_PINCUSHION');
    }
  }

  public async createLobby(roomId: string, signaling = 'nostr'): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const lobbyId = (await window.glimmerdeepDesktop?.createLobby(roomId, signaling)) ?? null;
      this._currentLobbyId = lobbyId;
      return lobbyId;
    } catch {
      return null;
    }
  }

  public async joinLobbyById(lobbyId: string): Promise<boolean> {
    if (!isSteamworksBuild() || !lobbyId) return false;
    if (this._currentLobbyId === lobbyId) return true;
    try {
      const ok = Boolean(await window.glimmerdeepDesktop?.joinLobbyById(lobbyId));
      if (ok) this._currentLobbyId = lobbyId;
      return ok;
    } catch {
      return false;
    }
  }

  public async isFriend(steamId64: string): Promise<boolean> {
    if (!isSteamworksBuild() || !steamId64) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.isFriend(steamId64));
    } catch {
      return false;
    }
  }

  public async addFriend(steamId64: string): Promise<boolean> {
    if (!isSteamworksBuild() || !steamId64) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.addFriend(steamId64));
    } catch {
      return false;
    }
  }

  public async updateLobbyState(state: 'lobby' | 'playing' | 'finished', joinable = true): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.updateLobbyState(state, joinable);
    } catch {
      // ignore
    }
  }

  public async openInviteDialog(): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.openInviteDialog();
    } catch {
      // ignore
    }
  }

  public async leaveLobby(): Promise<void> {
    this._currentLobbyId = null;
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.leaveLobby();
    } catch {
      // ignore
    }
  }

  public async consumePendingInvite(): Promise<{ roomId: string; signaling?: string; lobbyId?: string } | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const res = (await window.glimmerdeepDesktop?.consumePendingInvite()) ?? null;
      if (res?.lobbyId) this._currentLobbyId = res.lobbyId;
      return res;
    } catch {
      return null;
    }
  }

  public onLobbyJoinInvite(
    cb: (data: { roomId: string; signaling?: string; lobbyId?: string }) => void
  ): () => void {
    if (!isSteamworksBuild() || !window.glimmerdeepDesktop?.onLobbyJoinInvite) {
      return () => {};
    }
    return window.glimmerdeepDesktop.onLobbyJoinInvite((data) => {
      if (data?.lobbyId) this._currentLobbyId = data.lobbyId;
      cb(data);
    });
  }

  public async setStat(name: string, value: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.setStat(name, value);
    } catch {
      // ignore IPC errors
    }
  }

  public async syncFromCloud(onReload?: () => void): Promise<void> {
    if (!isSteamworksBuild() || typeof localStorage === 'undefined') return;
    if (!this._cloudBeforeUnloadBound && typeof window !== 'undefined') {
      this._cloudBeforeUnloadBound = true;
      window.addEventListener('beforeunload', () => {
        void this.flushCloudSync();
      });
    }
    try {
      const available = await window.glimmerdeepDesktop?.cloudIsAvailable();
      if (!available) return;
      const raw = await window.glimmerdeepDesktop?.cloudReadFile(CLOUD_SAVE_FILE);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          version?: number;
          updatedAt?: number;
          data?: Record<string, string>;
        };
        const cloudData = parsed?.data;
        if (cloudData && typeof cloudData === 'object') {
          const cloudUpdatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
          const localUpdatedAt = Number(localStorage.getItem(CLOUD_UPDATED_AT_KEY)) || 0;

          for (const key of CLOUD_SYNC_KEYS) {
            const cloudVal = cloudData[key];
            if (typeof cloudVal !== 'string') continue;
            const localVal = localStorage.getItem(key);

            if (key === 'glimmerdeep_journal_v1') {
              try {
                const cObj = JSON.parse(cloudVal) as { enemies?: string[]; bosses?: string[]; items?: string[] };
                const lObj = localVal
                  ? (JSON.parse(localVal) as { enemies?: string[]; bosses?: string[]; items?: string[] })
                  : {};
                const merged = {
                  enemies: Array.from(new Set([...(lObj.enemies ?? []), ...(cObj.enemies ?? [])])),
                  bosses: Array.from(new Set([...(lObj.bosses ?? []), ...(cObj.bosses ?? [])])),
                  items: Array.from(new Set([...(lObj.items ?? []), ...(cObj.items ?? [])])),
                };
                localStorage.setItem(key, JSON.stringify(merged));
              } catch {
                if (!localVal) localStorage.setItem(key, cloudVal);
              }
            } else if (key === 'glimmerdeep_total_deaths' || key === 'glimmerdeep_spike_stabs') {
              const mergedNum = Math.max(Number(localVal) || 0, Number(cloudVal) || 0);
              if (mergedNum > 0) localStorage.setItem(key, String(mergedNum));
            } else if (key === 'glimmerdeep_tutorial_completed_v1') {
              if (localVal === '1' || cloudVal === '1') localStorage.setItem(key, '1');
            } else if (key === 'glimmerdeep_admin_unlock') {
              if (localVal === 'true' || cloudVal === 'true') localStorage.setItem(key, 'true');
            } else if (key === 'glimmerdeep_nyar_history_v1') {
              try {
                const cArr = JSON.parse(cloudVal);
                const lArr = localVal ? JSON.parse(localVal) : [];
                if (Array.isArray(cArr) && Array.isArray(lArr)) {
                  localStorage.setItem(key, JSON.stringify(Array.from(new Set([...lArr, ...cArr]))));
                } else if (!localVal) {
                  localStorage.setItem(key, cloudVal);
                }
              } catch {
                if (!localVal) localStorage.setItem(key, cloudVal);
              }
            } else if (localVal === null || cloudUpdatedAt >= localUpdatedAt) {
              localStorage.setItem(key, cloudVal);
            }
          }

          if (cloudUpdatedAt > localUpdatedAt) {
            localStorage.setItem(CLOUD_UPDATED_AT_KEY, String(cloudUpdatedAt));
          }
        }
      }
      onReload?.();
      await this.syncToCloud();
    } catch {
      // ignore cloud sync errors
    }
  }

  public async syncToCloud(): Promise<boolean> {
    if (!isSteamworksBuild() || typeof localStorage === 'undefined') return false;
    try {
      const available = await window.glimmerdeepDesktop?.cloudIsAvailable();
      if (!available) return false;
      const data: Record<string, string> = {};
      for (const key of CLOUD_SYNC_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          data[key] = val;
        }
      }
      const now = Date.now();
      localStorage.setItem(CLOUD_UPDATED_AT_KEY, String(now));
      const payload = JSON.stringify({
        version: 1,
        updatedAt: now,
        data,
      });
      return Boolean(await window.glimmerdeepDesktop?.cloudWriteFile(CLOUD_SAVE_FILE, payload));
    } catch {
      return false;
    }
  }

  public scheduleCloudSync(): void {
    if (!isSteamworksBuild() || typeof window === 'undefined') return;
    if (this._cloudSyncTimer !== null) {
      window.clearTimeout(this._cloudSyncTimer);
    }
    this._cloudSyncTimer = window.setTimeout(() => {
      this._cloudSyncTimer = null;
      void this.syncToCloud();
    }, 250);
  }

  public async flushCloudSync(): Promise<void> {
    if (this._cloudSyncTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this._cloudSyncTimer);
      this._cloudSyncTimer = null;
    }
    await this.syncToCloud();
  }
}

export const steamSystem = new SteamSystem();
