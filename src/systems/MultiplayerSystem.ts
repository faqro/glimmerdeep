import { joinRoom as joinNostrRoom, JsonValue, Room } from 'trystero';
import { joinRoom as joinMqttRoom } from '@trystero-p2p/mqtt';
import { pickRandomPaletteId } from '../data/palettes';
import { GameMode, LobbyPlayerInfo, PlayerStateSnapshot } from '../types/game';

export type SignalingBackend = 'nostr' | 'mqtt';

const APP_ID = 'glimmerdeep-roguelike-v1';
const SIGNALING_STORAGE_KEY = 'glimmerdeep_signaling';
const PLAYER_UID_STORAGE_KEY = 'glimmerdeep_player_uid';
const HEARTBEAT_INTERVAL_MS = 3000;
const PEER_STALE_TIMEOUT_MS = 12000;

const NOSTR_RELAY_URLS = [
  'wss://fanfares.nostr1.com',
  'wss://nostr.overmind.lol',
  'wss://no.str.cr',
  'wss://nostr.hifish.org',
  'wss://nostr.sathoarder.com',
  'wss://nostrelay.circum.space',
  'wss://nostr.azzamo.net',
  'wss://nostr.liberty.fans',
  'wss://nostr.data.haus',
  'wss://bucket.coracle.social',
  'wss://relay.angor.io',
  'wss://nostr-01.yakihonne.com',
  'wss://nos.lol',
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

const MQTT_RELAY_URLS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

let cachedTurnIceServers: RTCIceServer[] = [];
let cachedTurnExpiresAt = 0;

function buildIceServers(dynamicTurnServers: RTCIceServer[] = []): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
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

  for (const s of dynamicTurnServers) {
    servers.push(s);
  }

  return servers;
}

async function resolveIceServers(): Promise<RTCIceServer[]> {
  const endpoint = (import.meta.env?.VITE_TURN_CREDENTIALS_URL as string | undefined)?.trim();
  if (!endpoint) return buildIceServers();

  const now = Date.now();
  if (cachedTurnIceServers.length > 0 && now < cachedTurnExpiresAt) {
    return buildIceServers(cachedTurnIceServers);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(endpoint, { method: 'GET', signal: controller.signal });
    if (!res.ok) return buildIceServers();
    const data = (await res.json()) as { iceServers?: RTCIceServer[]; ttl?: number };
    const list = Array.isArray(data.iceServers) ? data.iceServers : [];
    if (list.length > 0) {
      cachedTurnIceServers = list;
      const ttlMs = Math.max(60_000, ((data.ttl ?? 14400) - 60) * 1000);
      cachedTurnExpiresAt = Date.now() + ttlMs;
      return buildIceServers(list);
    }
  } catch {
    // Fall back to STUN / static TURN if Worker is unreachable or timed out
  } finally {
    clearTimeout(timer);
  }
  return buildIceServers();
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
    | 'boss_summon'
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
  textureKey?: string;
  scale?: number;
  spinSpeed?: number;
  rotateToVelocity?: boolean;
}

export interface NetRoomSync {
  gx: number;
  gy: number;
  cleared: boolean;
  doorsLocked: boolean;
  bossDefeated?: boolean;
  enemies: Array<{ uid: string; x: number; y: number; vx?: number; vy?: number; hp: number; alive: boolean }>;
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
  private connectGen = 0;
  private room: Room | null = null;
  private peerLastSeen = new Map<string, number>();
  private directPeers = new Set<string>();
  private seenRelayIds = new Set<string>();
  private relaySeq = 0;
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

  hasDirectPeers(): boolean {
    if (this.directPeers.size > 0) return true;
    return this.room ? Object.keys(this.room.getPeers()).length > 0 : false;
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

  private async connectRoom(code: string, isHost: boolean): Promise<void> {
    const gen = ++this.connectGen;
    const normalizedCode = code.trim().toUpperCase();
    this.inviteCode = normalizedCode;
    this.connectionError = null;
    this.localJoinedAt = isHost ? 0 : Date.now();
    this.localPeerId = `pending_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.players.set(this.localPeerId, {
      peerId: this.localPeerId,
      uid: this.localUid,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready: isHost,
      isHost,
      joinedAt: this.localJoinedAt,
    });

    const iceServers = await resolveIceServers();
    if (gen !== this.connectGen || this.mode === 'solo') return;

    const baseConfig = {
      appId: APP_ID,
      trickleIce: false,
      rtcConfig: {
        iceServers,
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
                urls: NOSTR_RELAY_URLS,
                redundancy: NOSTR_RELAY_URLS.length,
              },
            },
            `gd-${normalizedCode}`
          );
    this.room = room;
    const rawSelfId = (room as unknown as { selfId?: string }).selfId;
    if (rawSelfId && rawSelfId.length > 0 && rawSelfId !== this.localPeerId) {
      const prevInfo = this.players.get(this.localPeerId);
      this.players.delete(this.localPeerId);
      this.localPeerId = rawSelfId;
      if (prevInfo) {
        this.players.set(rawSelfId, { ...prevInfo, peerId: rawSelfId, uid: this.localUid });
      }
    }

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

    type RelayChannel = 'lobby' | 'start' | 'pstate' | 'wsync' | 'rsync' | 'attack' | 'interact' | 'playagain' | 'peer_left';
    interface RelayEnvelope {
      [key: string]: JsonValue;
      id: string;
      from: string;
      to: string; // peerId or '*'
      ttl: number;
      ch: RelayChannel;
      data: JsonValue;
    }

    const lobbyAct = room.makeAction<LobbyPlayerInfo>('lobby');
    const startAct = room.makeAction<{ seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }>('start');
    const playerAct = room.makeAction<PlayerStateSnapshot>('pstate');
    const worldAct = room.makeAction<NetWorldSync>('wsync');
    const roomSyncAct = room.makeAction<NetRoomSync>('rsync');
    const attackAct = room.makeAction<NetAttackEvent>('attack');
    const interactAct = room.makeAction<NetInteractEvent>('interact');
    const playAgainAct = room.makeAction<{ ts: number }>('playagain');
    const relayAct = room.makeAction<RelayEnvelope>('relay');

    const markSeenRelay = (id: string): boolean => {
      if (this.seenRelayIds.has(id)) return false;
      this.seenRelayIds.add(id);
      if (this.seenRelayIds.size > 600) {
        const first = this.seenRelayIds.values().next().value;
        if (first) this.seenRelayIds.delete(first);
      }
      return true;
    };

    const sendRelay = (ch: RelayChannel, data: unknown, to = '*', from = this.localPeerId, excludePeer?: string) => {
      if (this.directPeers.size === 0) return;
      const id = `${from}_${++this.relaySeq}_${Date.now()}`;
      markSeenRelay(id);
      const env: RelayEnvelope = { id, from, to, ttl: 3, ch, data: data as JsonValue };
      if (to !== '*' && this.directPeers.has(to)) {
        relayAct.send(env, { target: to }).catch(() => {});
        return;
      }
      for (const dp of this.directPeers) {
        if (dp !== excludePeer) {
          relayAct.send(env, { target: dp }).catch(() => {});
        }
      }
    };

    const sendWithRelayFallback = <T>(
      act: { send: (d: T, opts?: { target?: string }) => Promise<unknown> },
      ch: RelayChannel,
      data: T,
      target?: string,
      alwaysRelayBroadcast = false
    ) => {
      if (target) {
        if (this.directPeers.has(target)) {
          act.send(data, { target }).catch(() => {});
        } else {
          sendRelay(ch, data, target);
        }
        return;
      }
      act.send(data).catch(() => {});
      if (alwaysRelayBroadcast || this.players.size > this.directPeers.size + 1) {
        sendRelay(ch, data, '*');
      }
    };

    this.sendLobbyFn = (data, target) => sendWithRelayFallback(lobbyAct, 'lobby', data, target, true);
    this.sendStartFn = (data, target) => sendWithRelayFallback(startAct, 'start', data, target, true);
    this.sendPlayerStateFn = (data, target) => sendWithRelayFallback(playerAct, 'pstate', data, target);
    this.sendWorldSyncFn = (data, target) => sendWithRelayFallback(worldAct, 'wsync', data, target);
    this.sendRoomSyncFn = (data, target) => sendWithRelayFallback(roomSyncAct, 'rsync', data, target);
    this.sendAttackFn = (data, target) => sendWithRelayFallback(attackAct, 'attack', data, target);
    this.sendInteractFn = (data, target) => sendWithRelayFallback(interactAct, 'interact', data, target);
    this.sendPlayAgainFn = (data, target) => sendWithRelayFallback(playAgainAct, 'playagain', data, target, true);

    const handleLobbyMessage = (info: LobbyPlayerInfo, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      if (fromPeer === this.localPeerId) return;
      if (this.players.size >= 4 && !this.players.has(fromPeer)) return;
      const isNew = !this.players.has(fromPeer);
      const fullInfo = { ...info, peerId: fromPeer };
      this.players.set(fromPeer, fullInfo);

      // Ensure no two players share the same skin: non-host (or lexicographically higher peerId) re-rolls on collision
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo && info.paletteId === selfInfo.paletteId && (this.mode !== 'host' && (info.isHost || this.localPeerId > fromPeer))) {
        const used = Array.from(this.players.values()).map((p) => p.paletteId);
        this.localPaletteId = pickRandomPaletteId(used);
        selfInfo.paletteId = this.localPaletteId;
        this.sendLobbyFn?.(selfInfo);
      }

      if (isNew) {
        this.onPeerJoined?.(fromPeer, fullInfo);
        // Bridge newly joined peer's info to other direct peers
        if (this.directPeers.has(fromPeer) && this.directPeers.size > 1) {
          sendRelay('lobby', fullInfo, '*', fromPeer, fromPeer);
        }
      }
      this.onLobbyUpdate?.();
    };

    const handleStartMessage = (payload: { seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      this.onGameStart?.(payload.seed, payload.levelIndex, payload.restorePlayer);
    };

    const handlePlayerStateMessage = (state: PlayerStateSnapshot, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      this.onRemotePlayerState?.(state, fromPeer);
    };

    const handleWorldSyncMessage = (sync: NetWorldSync, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      if (this.mode === 'client') {
        if (sync.lobbyPlayers) {
          this.syncRosterFromHost(sync.lobbyPlayers);
        }
        this.onWorldSync?.(sync);
      }
    };

    const handleRoomSyncMessage = (sync: NetRoomSync, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      this.onRoomSync?.(sync, fromPeer);
    };

    const handleAttackMessage = (ev: NetAttackEvent, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      this.onRemoteAttack?.(ev, fromPeer);
    };

    const handleInteractMessage = (ev: NetInteractEvent, fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      this.onRemoteInteract?.(ev, fromPeer);
    };

    const handlePlayAgainMessage = (fromPeer: string) => {
      this.peerLastSeen.set(fromPeer, Date.now());
      for (const p of this.players.values()) {
        p.ready = p.isHost;
      }
      this.onPlayAgain?.();
    };

    lobbyAct.onMessage((info, ctx) => handleLobbyMessage(info, ctx.peerId));
    startAct.onMessage((payload, ctx) => handleStartMessage(payload, ctx.peerId));
    playerAct.onMessage((state, ctx) => handlePlayerStateMessage(state, ctx.peerId));
    worldAct.onMessage((sync, ctx) => handleWorldSyncMessage(sync, ctx.peerId));
    roomSyncAct.onMessage((sync, ctx) => handleRoomSyncMessage(sync, ctx.peerId));
    attackAct.onMessage((ev, ctx) => handleAttackMessage(ev, ctx.peerId));
    interactAct.onMessage((ev, ctx) => handleInteractMessage(ev, ctx.peerId));
    playAgainAct.onMessage((_data, ctx) => handlePlayAgainMessage(ctx.peerId));

    relayAct.onMessage((env, ctx) => {
      this.peerLastSeen.set(ctx.peerId, Date.now());
      if (!env || !markSeenRelay(env.id)) return;
      if (env.from === this.localPeerId) return;

      if (env.to === this.localPeerId || env.to === '*') {
        switch (env.ch) {
          case 'lobby':
            handleLobbyMessage(env.data as unknown as LobbyPlayerInfo, env.from);
            break;
          case 'start':
            handleStartMessage(env.data as unknown as { seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }, env.from);
            break;
          case 'pstate':
            handlePlayerStateMessage(env.data as unknown as PlayerStateSnapshot, env.from);
            break;
          case 'wsync':
            handleWorldSyncMessage(env.data as unknown as NetWorldSync, env.from);
            break;
          case 'rsync':
            handleRoomSyncMessage(env.data as unknown as NetRoomSync, env.from);
            break;
          case 'attack':
            handleAttackMessage(env.data as unknown as NetAttackEvent, env.from);
            break;
          case 'interact':
            handleInteractMessage(env.data as unknown as NetInteractEvent, env.from);
            break;
          case 'playagain':
            handlePlayAgainMessage(env.from);
            break;
          case 'peer_left': {
            const leftId = env.data as string;
            if (leftId && leftId !== this.localPeerId && !this.directPeers.has(leftId) && this.players.has(leftId)) {
              this.handlePeerLeave(leftId);
            }
            break;
          }
        }
      }

      if (env.to !== this.localPeerId && env.ttl > 1) {
        const nextEnv: RelayEnvelope = { ...env, ttl: env.ttl - 1 };
        if (env.to !== '*' && this.directPeers.has(env.to)) {
          relayAct.send(nextEnv, { target: env.to }).catch(() => {});
        } else {
          for (const dp of this.directPeers) {
            if (dp !== ctx.peerId && dp !== env.from) {
              relayAct.send(nextEnv, { target: dp }).catch(() => {});
            }
          }
        }
      }
    });

    room.onPeerJoin((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      this.directPeers.add(peerId);
      this.peerLastSeen.set(peerId, Date.now());
      this.connectionError = null;
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo) {
        lobbyAct.send(selfInfo, { target: peerId }).catch(() => {});
      }
      // Share known indirect/other peers with the newly connected peer
      for (const p of this.players.values()) {
        if (p.peerId !== this.localPeerId && p.peerId !== peerId) {
          sendRelay('lobby', p, peerId, p.peerId);
        }
      }
      this.onLobbyUpdate?.();
    });

    room.onPeerLeave((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      this.directPeers.delete(peerId);
      if (this.directPeers.size > 0) {
        sendRelay('peer_left', peerId, '*', this.localPeerId, peerId);
      }
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
    this.connectGen++;
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
    this.seenRelayIds.clear();
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
