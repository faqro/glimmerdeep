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
  incrementStat: (name, amount) => ipcRenderer.invoke('steam:incrementStat', name, amount),
  createLobby: (roomId, signaling) => ipcRenderer.invoke('steam:createLobby', roomId, signaling),
  joinLobbyById: (lobbyId) => ipcRenderer.invoke('steam:joinLobbyById', lobbyId),
  getSteamId: () => ipcRenderer.invoke('steam:getSteamId'),
  isFriend: (steamId64) => ipcRenderer.invoke('steam:isFriend', steamId64),
  addFriend: (steamId64) => ipcRenderer.invoke('steam:addFriend', steamId64),
  updateLobbyState: (state, joinable) => ipcRenderer.invoke('steam:updateLobbyState', state, joinable),
  openInviteDialog: () => ipcRenderer.invoke('steam:openInviteDialog'),
  leaveLobby: () => ipcRenderer.invoke('steam:leaveLobby'),
  consumePendingInvite: () => ipcRenderer.invoke('steam:consumePendingInvite'),
  onLobbyJoinInvite: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('steam:lobbyJoinInvite', handler);
    return () => ipcRenderer.removeListener('steam:lobbyJoinInvite', handler);
  },
});
