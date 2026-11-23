import { joinRoom as joinNostrRoom, Room } from 'trystero';
import { joinRoom as joinMqttRoom } from '@trystero-p2p/mqtt';
import { pickRandomPaletteId } from '../data/palettes';
import { GameMode, LobbyPlayerInfo, PlayerStateSnapshot } from '../types/game';

export type SignalingBackend = 'nostr' | 'mqtt';

const APP_ID = 'glimmerdeep-roguelike-v1';
const SIGNALING_STORAGE_KEY = 'glimmerdeep_signaling';
const PLAYER_UID_STORAGE_KEY = 'glimmerdeep_player_uid';
const HEARTBEAT_INTERVAL_MS = 3000;
const PEER_STALE_TIMEOUT_MS = 12000;

const MQTT_RELAY_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ];

  const customTurnUrl = import.meta.env?.VITE_TURN_URL as string | undefined;
  const customTurnUser = import.meta.env?.VITE_TURN_USERNAME as string | undefined;
  const customTurnCred = import.meta.env?.VITE_TURN_CREDENTIAL as string | undefined;
  if (customTurnUrl) {
    servers.push({
      urls: customTurnUrl,
      ...(customTurnUser ? { username: customTurnUser } : {}),
      ...(customTurnCred ? { credential: customTurnCred } : {}),
    });
  }

  // Public OpenRelay TURN servers for cross-network / symmetric NAT traversal
  servers.push(
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'e8dd65b92f6dde54d2b4e524',
      credential: 'uWdWNmkhvyqTWKjN',
    },
    {
      urls: 'turn:standard.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65b92f6dde54d2b4e524',
      credential: 'uWdWNmkhvyqTWKjN',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'e8dd65b92f6dde54d2b4e524',
      credential: 'uWdWNmkhvyqTWKjN',
    },
    {
      urls: 'turns:standard.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92f6dde54d2b4e524',
      credential: 'uWdWNmkhvyqTWKjN',
    }
  );

  return servers;
}

export interface NetAttackEvent {
  peerId: string;
  gx: number;
  gy: number;
  x: number;
  y: number;
  angle: number;
  weaponId: string;
}

export interface NetInteractEvent {
  peerId: string;
  gx: number;
  gy: number;
  kind:
    | 'pickup'
    | 'drop'
    | 'buy'
    | 'heal'
    | 'event'
    | 'revive'
    | 'exit'
    | 'plate'
    | 'mirror'
    | 'block'
    | 'block_reset'
    | 'crate'
    | 'enemy_hit'
    | 'pillar_use'
    | 'game_over';
  targetId?: string;
  lootKind?: 'shard' | 'item' | 'heart' | 'chest';
  amount?: number;
  itemId?: string;
  uses?: number;
  x?: number;
  y?: number;
}

export interface SyncedProjectile {
  uid: string;
  gx: number;
  gy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  fromPlayer: boolean;
  ownerId: string;
  damage: number;
  burns?: boolean;
}

export interface NetRoomSync {
  gx: number;
  gy: number;
  cleared: boolean;
  doorsLocked: boolean;
  bossDefeated?: boolean;
  enemies: Array<{ uid: string; x: number; y: number; hp: number; alive: boolean }>;
  projectiles: SyncedProjectile[];
}

export interface NetWorldSync {
  levelIndex: number;
  floorSeed: number;
  modifier: string;
  hostGx?: number;
  hostGy?: number;
  players: PlayerStateSnapshot[];
  lobbyPlayers?: LobbyPlayerInfo[];
  projectiles?: SyncedProjectile[];
  roomStates: Array<{
    gx: number;
    gy: number;
    visited: boolean;
    cleared: boolean;
    doorsLocked: boolean;
    secretRevealed: boolean;
    bossDefeated?: boolean;
    puzzleSolved?: boolean;
    puzzleMirrors?: Array<{ id: string; orientation: 'slash' | 'backslash' }>;
    puzzleBlocks?: Array<{ id: string; tx: number; ty: number }>;
    brokenCrates?: string[];
    shopSold?: boolean[];
    enemies: Array<{ uid: string; x: number; y: number; hp: number; alive: boolean }>;
    loot: Array<{
      uid: string;
      kind: 'shard' | 'item' | 'heart' | 'chest';
      x: number;
      y: number;
      itemId?: string;
      uses?: number;
      amount?: number;
      collected: boolean;
    }>;
  }>;
}

export class MultiplayerSystem {
  public mode: GameMode = 'solo';
  public signalingBackend: SignalingBackend = 'nostr';
  public inviteCode = '';
  public localPeerId = 'local';
  public readonly localUid: string;
  public localName = 'Wanderer';
  public localPaletteId = 'lavender';
  public players = new Map<string, LobbyPlayerInfo>();

  private localJoinedAt = 0;
  private room: Room | null = null;
  private peerLastSeen = new Map<string, number>();
  private directPeers = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sendLobbyFn: ((data: LobbyPlayerInfo, target?: string) => void) | null = null;
  private sendStartFn: ((data: { seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }, target?: string) => void) | null = null;
  private sendPlayerStateFn: ((data: PlayerStateSnapshot, target?: string) => void) | null = null;
  private sendWorldSyncFn: ((data: NetWorldSync, target?: string) => void) | null = null;
  private sendRoomSyncFn: ((data: NetRoomSync, target?: string) => void) | null = null;
  private sendAttackFn: ((data: NetAttackEvent, target?: string) => void) | null = null;
  private sendInteractFn: ((data: NetInteractEvent, target?: string) => void) | null = null;
  private sendPlayAgainFn: ((data: { ts: number }, target?: string) => void) | null = null;

  public onLobbyUpdate?: () => void;
  public onGameStart?: (seed: number, levelIndex: number, restorePlayer?: PlayerStateSnapshot) => void;
  public onRemotePlayerState?: (state: PlayerStateSnapshot, fromPeer: string) => void;
  public onWorldSync?: (sync: NetWorldSync) => void;
  public onRoomSync?: (sync: NetRoomSync, fromPeer: string) => void;
  public onRemoteAttack?: (ev: NetAttackEvent, fromPeer: string) => void;
  public onRemoteInteract?: (ev: NetInteractEvent, fromPeer: string) => void;
  public onPeerJoined?: (peerId: string, info: LobbyPlayerInfo) => void;
  public onPeerLeft?: (peerId: string, leavingPlayer?: LobbyPlayerInfo) => void;
  public onHostMigrated?: (newHostPeerId: string, isLocalNewHost: boolean) => void;
  public onPlayAgain?: () => void;
  public onSelfIdResolved?: (peerId: string) => void;
  public onConnectionError?: (message: string) => void;
  public connectionError: string | null = null;

  constructor() {
    let uid = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const savedUid = localStorage.getItem(PLAYER_UID_STORAGE_KEY);
      if (savedUid && savedUid.trim().length > 0) {
        uid = savedUid;
      } else {
        localStorage.setItem(PLAYER_UID_STORAGE_KEY, uid);
      }
      const saved = localStorage.getItem(SIGNALING_STORAGE_KEY);
      if (saved === 'mqtt' || saved === 'nostr') {
        this.signalingBackend = saved;
      }
    } catch {
      // ignore storage access errors
    }
    this.localUid = uid;
  }

  setSignalingBackend(backend: SignalingBackend): void {
    this.signalingBackend = backend;
    try {
      localStorage.setItem(SIGNALING_STORAGE_KEY, backend);
    } catch {
      // ignore storage access errors
    }
  }

  static generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  startSolo(name: string, paletteId: string): void {
    this.disconnect();
    this.mode = 'solo';
    this.localPeerId = 'local';
    this.localName = name || 'Wanderer';
    this.localPaletteId = paletteId;
    this.players.clear();
  }

  hostGame(name: string, paletteId: string): string {
    this.disconnect();
    const code = MultiplayerSystem.generateInviteCode();
    this.mode = 'host';
    this.inviteCode = code;
    this.localName = name || 'Host';
    this.localPaletteId = paletteId;
    this.connectRoom(code, true);
    return code;
  }

  joinGame(code: string, name: string, paletteId: string): void {
    this.disconnect();
    this.mode = 'client';
    this.inviteCode = code.toUpperCase().trim();
    this.localName = name || 'Guest';
    this.localPaletteId = paletteId;
    this.connectRoom(this.inviteCode, false);
  }

  reconnectClientWithBackend(backend: SignalingBackend): void {
    if (this.mode !== 'client' || !this.inviteCode) return;
    const savedCallbacks = {
      onLobbyUpdate: this.onLobbyUpdate,
      onGameStart: this.onGameStart,
      onRemotePlayerState: this.onRemotePlayerState,
      onWorldSync: this.onWorldSync,
      onRoomSync: this.onRoomSync,
      onRemoteAttack: this.onRemoteAttack,
      onRemoteInteract: this.onRemoteInteract,
      onPeerJoined: this.onPeerJoined,
      onPeerLeft: this.onPeerLeft,
      onHostMigrated: this.onHostMigrated,
      onPlayAgain: this.onPlayAgain,
      onSelfIdResolved: this.onSelfIdResolved,
      onConnectionError: this.onConnectionError,
    };
    const code = this.inviteCode;
    const name = this.localName;
    const paletteId = this.localPaletteId;

    this.setSignalingBackend(backend);
    this.disconnect();

    this.onLobbyUpdate = savedCallbacks.onLobbyUpdate;
    this.onGameStart = savedCallbacks.onGameStart;
    this.onRemotePlayerState = savedCallbacks.onRemotePlayerState;
    this.onWorldSync = savedCallbacks.onWorldSync;
    this.onRoomSync = savedCallbacks.onRoomSync;
    this.onRemoteAttack = savedCallbacks.onRemoteAttack;
    this.onRemoteInteract = savedCallbacks.onRemoteInteract;
    this.onPeerJoined = savedCallbacks.onPeerJoined;
    this.onPeerLeft = savedCallbacks.onPeerLeft;
    this.onHostMigrated = savedCallbacks.onHostMigrated;
    this.onPlayAgain = savedCallbacks.onPlayAgain;
    this.onSelfIdResolved = savedCallbacks.onSelfIdResolved;
    this.onConnectionError = savedCallbacks.onConnectionError;

    this.mode = 'client';
    this.inviteCode = code;
    this.localName = name;
    this.localPaletteId = paletteId;
    this.connectRoom(code, false);
    this.onLobbyUpdate?.();
  }

  private connectRoom(code: string, isHost: boolean): void {
    const normalizedCode = code.trim().toUpperCase();
    this.inviteCode = normalizedCode;
    this.connectionError = null;

    const baseConfig = {
      appId: APP_ID,
      trickleIce: true,
      rtcConfig: {
        iceServers: buildIceServers(),
        iceCandidatePoolSize: 4,
      },
    };

    const room =
      this.signalingBackend === 'mqtt'
        ? joinMqttRoom(
            {
              ...baseConfig,
              relayConfig: {
                urls: MQTT_RELAY_URLS,
                redundancy: MQTT_RELAY_URLS.length,
              },
            },
            `gd-${normalizedCode}`
          )
        : joinNostrRoom(
            {
              ...baseConfig,
              relayConfig: {
                redundancy: 16,
              },
            },
            `gd-${normalizedCode}`
          );
    this.room = room;
    const rawSelfId = (room as unknown as { selfId?: string }).selfId;
    this.localPeerId =
      rawSelfId && rawSelfId.length > 0
        ? rawSelfId
        : `pending_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.localJoinedAt = isHost ? 0 : Date.now();

    this.players.set(this.localPeerId, {
      peerId: this.localPeerId,
      uid: this.localUid,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready: isHost,
      isHost,
      joinedAt: this.localJoinedAt,
    });

    room
      .getSelf()
      .then((self) => {
        if (this.room !== room || !self.peerId || self.peerId === this.localPeerId) return;
        const prevId = this.localPeerId;
        const existing = this.players.get(prevId);
        this.players.delete(prevId);
        this.localPeerId = self.peerId;
        const selfInfo: LobbyPlayerInfo = existing
          ? { ...existing, peerId: self.peerId, uid: this.localUid }
          : {
              peerId: self.peerId,
              uid: this.localUid,
              name: this.localName,
              paletteId: this.localPaletteId,
              ready: isHost,
              isHost,
              joinedAt: this.localJoinedAt,
            };
        this.players.set(self.peerId, selfInfo);
        this.onSelfIdResolved?.(self.peerId);
        this.sendLobbyFn?.(selfInfo);
        this.onLobbyUpdate?.();
      })
      .catch(() => {
        // ignore if room was left before getSelf resolved
      });

    const lobbyAct = room.makeAction<LobbyPlayerInfo>('lobby');
    const startAct = room.makeAction<{ seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }>('start');
    const playerAct = room.makeAction<PlayerStateSnapshot>('pstate');
    const worldAct = room.makeAction<NetWorldSync>('wsync');
    const roomSyncAct = room.makeAction<NetRoomSync>('rsync');
    const attackAct = room.makeAction<NetAttackEvent>('attack');
    const interactAct = room.makeAction<NetInteractEvent>('interact');
    const playAgainAct = room.makeAction<{ ts: number }>('playagain');

    this.sendLobbyFn = (data, target) => {
      lobbyAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendStartFn = (data, target) => {
      startAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendPlayerStateFn = (data, target) => {
      playerAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendWorldSyncFn = (data, target) => {
      worldAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendRoomSyncFn = (data, target) => {
      roomSyncAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendAttackFn = (data, target) => {
      attackAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendInteractFn = (data, target) => {
      interactAct.send(data, target ? { target } : undefined).catch(() => {});
    };
    this.sendPlayAgainFn = (data, target) => {
      playAgainAct.send(data, target ? { target } : undefined).catch(() => {});
    };

    lobbyAct.onMessage((info, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      if (ctx.peerId === this.localPeerId) return;
      if (this.players.size >= 4 && !this.players.has(ctx.peerId)) return;
      const isNew = !this.players.has(ctx.peerId);
      const fullInfo = { ...info, peerId: ctx.peerId };
      this.players.set(ctx.peerId, fullInfo);

      // Ensure no two players share the same skin: non-host (or lexicographically higher peerId) re-rolls on collision
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo && info.paletteId === selfInfo.paletteId && (this.mode !== 'host' && (info.isHost || this.localPeerId > ctx.peerId))) {
        const used = Array.from(this.players.values()).map((p) => p.paletteId);
        this.localPaletteId = pickRandomPaletteId(used);
        selfInfo.paletteId = this.localPaletteId;
        this.sendLobbyFn?.(selfInfo);
      }

      if (isNew) {
        this.onPeerJoined?.(ctx.peerId, fullInfo);
      }
      this.onLobbyUpdate?.();
    });

    startAct.onMessage((payload, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      this.onGameStart?.(payload.seed, payload.levelIndex, payload.restorePlayer);
    });

    playerAct.onMessage((state, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      this.onRemotePlayerState?.(state, ctx.peerId);
    });

    worldAct.onMessage((sync, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      if (this.mode === 'client') {
        if (sync.lobbyPlayers) {
          this.syncRosterFromHost(sync.lobbyPlayers);
        }
        this.onWorldSync?.(sync);
      }
    });

    roomSyncAct.onMessage((sync, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      this.onRoomSync?.(sync, ctx.peerId);
    });

    attackAct.onMessage((ev, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      this.onRemoteAttack?.(ev, ctx.peerId);
    });

    interactAct.onMessage((ev, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      this.onRemoteInteract?.(ev, ctx.peerId);
    });

    playAgainAct.onMessage((_data, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      for (const p of this.players.values()) {
        p.ready = p.isHost;
      }
      this.onPlayAgain?.();
    });

    room.onPeerJoin((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      this.directPeers.add(peerId);
      this.peerLastSeen.set(peerId, Date.now());
      this.connectionError = null;
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo) {
        this.sendLobbyFn?.(selfInfo, peerId);
      }
      this.onLobbyUpdate?.();
    });

    room.onPeerLeave((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      this.directPeers.delete(peerId);
      this.handlePeerLeave(peerId);
    });

    room.onError((err) => {
      if (this.room !== room) return;
      if (err.code === 'relay-failed' || err.code === 'peer-connect-failed') {
        this.connectionError =
          err.code === 'relay-failed'
            ? 'Signaling relay error - check internet connection'
            : 'Peer connection failed across network';
        this.onConnectionError?.(this.connectionError);
        this.onLobbyUpdate?.();
      }
    });

    this.startHeartbeat(room);

    // Broadcast our initial lobby info
    const selfInfo = this.players.get(this.localPeerId);
    if (selfInfo) {
      this.sendLobbyFn?.(selfInfo);
    }
  }

  private startHeartbeat(room: Room): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatTimer = setInterval(() => {
      if (this.room !== room || this.mode === 'solo') return;
      const now = Date.now();
      const activeDirect = Object.keys(room.getPeers());
      for (const peerId of activeDirect) {
        this.directPeers.add(peerId);
        if (!this.players.has(peerId)) {
          const selfInfo = this.players.get(this.localPeerId);
          if (selfInfo) {
            this.sendLobbyFn?.(selfInfo, peerId);
          }
        }
        Promise.race([
          room.ping(peerId),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ping-timeout')), 2500)),
        ])
          .then(() => {
            if (this.room === room) {
              this.peerLastSeen.set(peerId, Date.now());
            }
          })
          .catch(() => {
            // rely on stale timeout check below
          });
      }

      for (const peerId of Array.from(this.directPeers)) {
        if (peerId === this.localPeerId) continue;
        const last = this.peerLastSeen.get(peerId) ?? now;
        if (now - last > PEER_STALE_TIMEOUT_MS && this.players.has(peerId)) {
          this.directPeers.delete(peerId);
          this.handlePeerLeave(peerId);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private syncRosterFromHost(lobbyPlayers: LobbyPlayerInfo[]): void {
    const now = Date.now();
    const hostRosterIds = new Set<string>();
    for (const lp of lobbyPlayers) {
      hostRosterIds.add(lp.peerId);
      if (lp.peerId === this.localPeerId) continue;
      this.peerLastSeen.set(lp.peerId, now);
      if (!this.players.has(lp.peerId)) {
        this.players.set(lp.peerId, { ...lp });
      } else {
        const existing = this.players.get(lp.peerId)!;
        existing.isHost = lp.isHost;
        existing.name = lp.name;
        existing.paletteId = lp.paletteId;
        existing.ready = lp.ready;
      }
    }
    for (const peerId of Array.from(this.players.keys())) {
      if (peerId !== this.localPeerId && !hostRosterIds.has(peerId) && !this.directPeers.has(peerId)) {
        this.handlePeerLeave(peerId);
      }
    }
  }

  handlePeerLeave(peerId: string): void {
    const leaving = this.players.get(peerId);
    this.players.delete(peerId);
    this.peerLastSeen.delete(peerId);
    this.directPeers.delete(peerId);
    this.onPeerLeft?.(peerId, leaving);

    if (leaving?.isHost && this.players.size > 0) {
      const candidates = Array.from(this.players.values()).sort((a, b) => {
        const ta = a.joinedAt ?? Number.MAX_SAFE_INTEGER;
        const tb = b.joinedAt ?? Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return a.peerId.localeCompare(b.peerId);
      });
      const newHost = candidates[0];
      for (const p of candidates) {
        p.isHost = p.peerId === newHost.peerId;
      }
      newHost.ready = true;
      const isLocalNewHost = newHost.peerId === this.localPeerId;
      if (isLocalNewHost) {
        this.mode = 'host';
        this.sendLobbyFn?.(newHost);
      }
      this.onHostMigrated?.(newHost.peerId, isLocalNewHost);
    }

    this.onLobbyUpdate?.();
  }

  broadcastLobbySelf(ready: boolean): void {
    const info: LobbyPlayerInfo = {
      peerId: this.localPeerId,
      uid: this.localUid,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready,
      isHost: this.mode === 'host',
      joinedAt: this.localJoinedAt,
    };
    this.players.set(this.localPeerId, info);
    this.sendLobbyFn?.(info);
    this.onLobbyUpdate?.();
  }

  broadcastStart(seed: number, levelIndex = 0): void {
    if (this.mode !== 'host') return;
    this.sendStartFn?.({ seed, levelIndex });
  }

  sendStartToPeer(peerId: string, seed: number, levelIndex: number, restorePlayer?: PlayerStateSnapshot): void {
    if (this.mode !== 'host') return;
    this.sendStartFn?.({ seed, levelIndex, restorePlayer }, peerId);
  }

  broadcastPlayerState(state: PlayerStateSnapshot): void {
    if (this.mode === 'solo') return;
    this.sendPlayerStateFn?.(state);
  }

  broadcastWorldSync(sync: NetWorldSync): void {
    if (this.mode !== 'host') return;
    this.sendWorldSyncFn?.(sync);
  }

  broadcastRoomSync(sync: NetRoomSync): void {
    if (this.mode === 'solo') return;
    this.sendRoomSyncFn?.(sync);
  }

  broadcastAttack(ev: NetAttackEvent): void {
    if (this.mode === 'solo') return;
    this.sendAttackFn?.(ev);
  }

  broadcastInteract(ev: NetInteractEvent): void {
    if (this.mode === 'solo') return;
    this.sendInteractFn?.(ev);
  }

  broadcastPlayAgain(): void {
    if (this.mode !== 'host') return;
    for (const p of this.players.values()) {
      p.ready = p.isHost;
    }
    this.sendPlayAgainFn?.({ ts: Date.now() });
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.room) {
      try {
        this.room.leave();
      } catch {
        // ignore
      }
      this.room = null;
    }
    this.players.clear();
    this.peerLastSeen.clear();
    this.directPeers.clear();
    this.sendLobbyFn = null;
    this.sendStartFn = null;
    this.sendPlayerStateFn = null;
    this.sendWorldSyncFn = null;
    this.sendRoomSyncFn = null;
    this.sendAttackFn = null;
    this.sendInteractFn = null;
    this.sendPlayAgainFn = null;
    this.onLobbyUpdate = undefined;
    this.onGameStart = undefined;
    this.onRemotePlayerState = undefined;
    this.onWorldSync = undefined;
    this.onRoomSync = undefined;
    this.onRemoteAttack = undefined;
    this.onRemoteInteract = undefined;
    this.onPeerJoined = undefined;
    this.onPeerLeft = undefined;
    this.onHostMigrated = undefined;
    this.onPlayAgain = undefined;
    this.onSelfIdResolved = undefined;
    this.onConnectionError = undefined;
    this.connectionError = null;
  }
}

export const net = new MultiplayerSystem();
