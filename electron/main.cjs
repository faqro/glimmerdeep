const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const pkg = require('../package.json');
const isSteamworksEnabled =
  pkg.steamworks === true || process.env.GLIMMERDEEP_STEAMWORKS === 'true';

let steamClient = null;
let currentLobby = null;
let mainWindow = null;
let pendingInviteData = null;

async function handleSteamLobbyJoin(lobbyId) {
  if (!steamClient || !lobbyId) return;
  try {
    if (currentLobby) {
      try {
        currentLobby.leave();
      } catch {
        // ignore leave error
      }
      currentLobby = null;
    }
    const lobby = await steamClient.matchmaking.joinLobby(BigInt(lobbyId));
    currentLobby = lobby;
    const roomId = lobby.getData('trystero_room');
    const signaling = lobby.getData('signaling') || 'nostr';
    if (!roomId) {
      console.warn('[Steamworks] Joined Steam lobby without trystero_room data');
      return;
    }
    const payload = { roomId, signaling };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('steam:lobbyJoinInvite', payload);
    } else {
      pendingInviteData = payload;
    }
  } catch (err) {
    console.warn('[Steamworks] Failed to join Steam lobby:', err?.message || err);
  }
}

function initSteamworks() {
  if (!isSteamworksEnabled) return;
  try {
    const steamworks = require('steamworks.js');
    const appId = Number(pkg.steamAppId || process.env.STEAM_APP_ID || 480);
    steamClient = steamworks.init(appId);
    if (typeof steamworks.electronEnableSteamOverlay === 'function') {
      steamworks.electronEnableSteamOverlay();
    }

    if (steamClient.callback && typeof steamClient.callback.register === 'function') {
      const JoinRequested = steamworks.SteamCallback?.GameLobbyJoinRequested ?? 8;
      steamClient.callback.register(JoinRequested, (data) => {
        if (data && data.lobby_steam_id) {
          void handleSteamLobbyJoin(data.lobby_steam_id);
        }
      });
    }

    // Handle +connect_lobby <lobbyId> launch argument
    const connectIdx = process.argv.indexOf('+connect_lobby');
    if (connectIdx !== -1 && process.argv[connectIdx + 1]) {
      const lobbyArg = process.argv[connectIdx + 1];
      setTimeout(() => {
        void handleSteamLobbyJoin(lobbyArg);
      }, 600);
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
  mainWindow = win;
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
  const isCoop = String(leaderboardName || '').toLowerCase().includes('co-op');
  const bestStat = isCoop ? 'mp_best_time_ms' : 'solo_best_time_ms';
  const clearsStat = isCoop ? 'mp_clears' : 'solo_clears';

  try {
    const prev = steamClient.stats.getInt(bestStat);
    if (prev === null || prev <= 0 || roundedMs < prev) {
      steamClient.stats.setInt(bestStat, roundedMs);
    }
    const clears = steamClient.stats.getInt(clearsStat) ?? 0;
    steamClient.stats.setInt(clearsStat, clears + 1);
    steamClient.stats.store();

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

ipcMain.handle('steam:incrementStat', (_event, statName, amount = 1) => {
  if (!steamClient || typeof statName !== 'string') return false;
  try {
    const cur = steamClient.stats.getInt(statName) ?? 0;
    steamClient.stats.setInt(statName, cur + Math.round(amount));
    return steamClient.stats.store();
  } catch {
    return false;
  }
});

ipcMain.handle('steam:createLobby', async (_event, roomId, signaling = 'nostr') => {
  if (!steamClient || typeof roomId !== 'string' || !roomId) return false;
  try {
    if (currentLobby) {
      try {
        currentLobby.leave();
      } catch {
        // ignore
      }
      currentLobby = null;
    }
    // LobbyType.FriendsOnly = 1, maxMembers = 4
    const lobby = await steamClient.matchmaking.createLobby(1, 4);
    lobby.setData('trystero_room', roomId);
    lobby.setData('signaling', String(signaling || 'nostr'));
    lobby.setData('state', 'lobby');
    lobby.setJoinable(true);
    currentLobby = lobby;
    return true;
  } catch (err) {
    console.warn('[Steamworks] createLobby failed:', err?.message || err);
    return false;
  }
});

ipcMain.handle('steam:updateLobbyState', (_event, state, joinable = true) => {
  if (!steamClient || !currentLobby) return false;
  try {
    currentLobby.setData('state', String(state || 'lobby'));
    currentLobby.setJoinable(Boolean(joinable));
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('steam:openInviteDialog', () => {
  if (!steamClient || !currentLobby) return false;
  try {
    currentLobby.openInviteDialog();
    return true;
  } catch (err) {
    console.warn('[Steamworks] openInviteDialog failed:', err?.message || err);
    return false;
  }
});

ipcMain.handle('steam:leaveLobby', () => {
  if (currentLobby) {
    try {
      currentLobby.leave();
    } catch {
      // ignore
    }
    currentLobby = null;
  }
  return true;
});

ipcMain.handle('steam:consumePendingInvite', () => {
  const data = pendingInviteData;
  pendingInviteData = null;
  return data;
});

app.on('before-quit', () => {
  if (currentLobby) {
    try {
      currentLobby.leave();
    } catch {
      // ignore
    }
    currentLobby = null;
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
