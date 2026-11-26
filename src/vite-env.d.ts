/// <reference types="vite/client" />

interface GlimmerdeepDesktopBridge {
  isDesktop: boolean;
  isSteamworks: boolean;
  isAvailable: () => Promise<boolean>;
  hasAvatarDlc: () => Promise<boolean>;
  getPlayerName: () => Promise<string | null>;
  unlockAchievement: (id: string) => Promise<boolean>;
  submitLeaderboardTime: (name: string, timeMs: number) => Promise<boolean>;
  setStat: (name: string, value: number) => Promise<boolean>;
  incrementStat: (name: string, amount?: number) => Promise<boolean>;
  createLobby: (roomId: string, signaling?: string) => Promise<string | null>;
  joinLobbyById: (lobbyId: string) => Promise<boolean>;
  getSteamId: () => Promise<string | null>;
  isFriend: (steamId64: string) => Promise<boolean>;
  addFriend: (steamId64: string) => Promise<boolean>;
  updateLobbyState: (state: string, joinable?: boolean) => Promise<boolean>;
  openInviteDialog: () => Promise<boolean>;
  leaveLobby: () => Promise<boolean>;
  consumePendingInvite: () => Promise<{ roomId: string; signaling?: string; lobbyId?: string } | null>;
  onLobbyJoinInvite: (cb: (data: { roomId: string; signaling?: string; lobbyId?: string }) => void) => () => void;
}

interface Window {
  glimmerdeepDesktop?: GlimmerdeepDesktopBridge;
}
