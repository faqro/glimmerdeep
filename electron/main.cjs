const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const pkg = require('../package.json');
const isSteamworksEnabled =
  pkg.steamworks === true || process.env.GLIMMERDEEP_STEAMWORKS === 'true';

let steamClient = null;

function initSteamworks() {
  if (!isSteamworksEnabled) return;
  try {
    const steamworks = require('steamworks.js');
    const appId = Number(pkg.steamAppId || process.env.STEAM_APP_ID || 480);
    steamClient = steamworks.init(appId);
    if (typeof steamworks.electronEnableSteamOverlay === 'function') {
      steamworks.electronEnableSteamOverlay();
    }
    console.log(`[Steamworks] Initialized for AppID ${appId}`);
  } catch (err) {
    console.warn('[Steamworks] Initialization skipped or failed:', err?.message || err);
    steamClient = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 810,
    minWidth: 720,
    minHeight: 540,
    title: 'Glimmerdeep',
    icon: path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#0b0917',
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('steam:isAvailable', () => Boolean(steamClient));

ipcMain.handle('steam:hasAvatarDlc', () => {
  if (!steamClient) return false;
  const dlcAppId = Number(pkg.steamDlcAppId || process.env.STEAM_DLC_APP_ID || 0);
  if (!dlcAppId) return false;
  try {
    return Boolean(steamClient.apps.isDlcInstalled(dlcAppId));
  } catch {
    return false;
  }
});

ipcMain.handle('steam:getPlayerName', () => {
  if (!steamClient) return null;
  try {
    return steamClient.localplayer.getName();
  } catch {
    return null;
  }
});

ipcMain.handle('steam:unlockAchievement', (_event, achievementId) => {
  if (!steamClient || typeof achievementId !== 'string') return false;
  try {
    if (steamClient.achievement.isActivated(achievementId)) return true;
    const ok = steamClient.achievement.activate(achievementId);
    steamClient.stats.store();
    return ok;
  } catch (err) {
    console.warn('[Steamworks] unlockAchievement failed:', achievementId, err?.message || err);
    return false;
  }
});

ipcMain.handle('steam:submitLeaderboardTime', async (_event, leaderboardName, timeMs) => {
  if (!steamClient || typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs <= 0) {
    return false;
  }
  const roundedMs = Math.max(1, Math.round(timeMs));
  try {
    // Store best solo clear time in Steam Stats (lower is better)
    const prev = steamClient.stats.getInt('solo_best_time_ms');
    if (prev === null || prev <= 0 || roundedMs < prev) {
      steamClient.stats.setInt('solo_best_time_ms', roundedMs);
    }
    const clears = steamClient.stats.getInt('solo_clears') ?? 0;
    steamClient.stats.setInt('solo_clears', clears + 1);
    steamClient.stats.store();

    // If leaderboard bindings are present on steamClient, upload directly
    if (steamClient.leaderboard && typeof steamClient.leaderboard.findOrCreateLeaderboard === 'function') {
      const lb = await steamClient.leaderboard.findOrCreateLeaderboard(
        String(leaderboardName || 'Solo Speedrun'),
        'Ascending',
        'TimeMilliseconds'
      );
      if (lb && typeof lb.uploadScore === 'function') {
        await lb.uploadScore(roundedMs, 'KeepBest');
      }
    }
    return true;
  } catch (err) {
    console.warn('[Steamworks] submitLeaderboardTime failed:', err?.message || err);
    return false;
  }
});

ipcMain.handle('steam:setStat', (_event, statName, value) => {
  if (!steamClient || typeof statName !== 'string' || typeof value !== 'number') return false;
  try {
    steamClient.stats.setInt(statName, Math.round(value));
    return steamClient.stats.store();
  } catch {
    return false;
  }
});

app.whenReady().then(() => {
  initSteamworks();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
