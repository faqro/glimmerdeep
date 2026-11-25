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
}

interface Window {
  glimmerdeepDesktop?: GlimmerdeepDesktopBridge;
}
