const { contextBridge, ipcRenderer } = require('electron');

const pkg = require('../package.json');
const isSteamworks = pkg.steamworks === true || process.env.GLIMMERDEEP_STEAMWORKS === 'true';

contextBridge.exposeInMainWorld('glimmerdeepDesktop', {
  isDesktop: true,
  isSteamworks,
  isAvailable: () => ipcRenderer.invoke('steam:isAvailable'),
  hasAvatarDlc: () => ipcRenderer.invoke('steam:hasAvatarDlc'),
  getPlayerName: () => ipcRenderer.invoke('steam:getPlayerName'),
  unlockAchievement: (id) => ipcRenderer.invoke('steam:unlockAchievement', id),
  submitLeaderboardTime: (name, timeMs) =>
    ipcRenderer.invoke('steam:submitLeaderboardTime', name, timeMs),
  setStat: (name, value) => ipcRenderer.invoke('steam:setStat', name, value),
});
