import { joinRoom, Room } from 'trystero';
import { pickRandomPaletteId } from '../data/palettes';
import { GameMode, LobbyPlayerInfo, PlayerStateSnapshot } from '../types/game';

const APP_ID = 'glimmerdeep-roguelike-v1';

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
  public inviteCode = '';
  public localPeerId = 'local';
  public localName = 'Wanderer';
  public localPaletteId = 'lavender';
  public players = new Map<string, LobbyPlayerInfo>();

  private localJoinedAt = 0;
  private room: Room | null = null;
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

  static generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
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

  private connectRoom(code: string, isHost: boolean): void {
    const room = joinRoom({ appId: APP_ID }, `gd-${code}`);
    this.room = room;
    this.localPeerId = (room as unknown as { selfId?: string }).selfId ?? `peer_${Math.floor(Math.random() * 100000)}`;
    this.localJoinedAt = isHost ? 0 : Date.now();

    this.players.set(this.localPeerId, {
      peerId: this.localPeerId,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready: isHost,
      isHost,
      joinedAt: this.localJoinedAt,
    });

    const lobbyAct = room.makeAction<LobbyPlayerInfo>('lobby');
    const startAct = room.makeAction<{ seed: number; levelIndex: number; restorePlayer?: PlayerStateSnapshot }>('start');
    const playerAct = room.makeAction<PlayerStateSnapshot>('pstate');
    const worldAct = room.makeAction<NetWorldSync>('wsync');
    const roomSyncAct = room.makeAction<NetRoomSync>('rsync');
    const attackAct = room.makeAction<NetAttackEvent>('attack');
    const interactAct = room.makeAction<NetInteractEvent>('interact');
    const playAgainAct = room.makeAction<{ ts: number }>('playagain');

    this.sendLobbyFn = (data, target) => lobbyAct.send(data, target ? { target } : undefined);
    this.sendStartFn = (data, target) => startAct.send(data, target ? { target } : undefined);
    this.sendPlayerStateFn = (data, target) => playerAct.send(data, target ? { target } : undefined);
    this.sendWorldSyncFn = (data, target) => worldAct.send(data, target ? { target } : undefined);
    this.sendRoomSyncFn = (data, target) => roomSyncAct.send(data, target ? { target } : undefined);
    this.sendAttackFn = (data, target) => attackAct.send(data, target ? { target } : undefined);
    this.sendInteractFn = (data, target) => interactAct.send(data, target ? { target } : undefined);
    this.sendPlayAgainFn = (data, target) => playAgainAct.send(data, target ? { target } : undefined);

    lobbyAct.onMessage((info, ctx) => {
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

    startAct.onMessage((payload) => {
      this.onGameStart?.(payload.seed, payload.levelIndex, payload.restorePlayer);
    });

    playerAct.onMessage((state, ctx) => {
      this.onRemotePlayerState?.(state, ctx.peerId);
    });

    worldAct.onMessage((sync) => {
      if (this.mode === 'client') {
        this.onWorldSync?.(sync);
      }
    });

    roomSyncAct.onMessage((sync, ctx) => {
      this.onRoomSync?.(sync, ctx.peerId);
    });

    attackAct.onMessage((ev, ctx) => {
      this.onRemoteAttack?.(ev, ctx.peerId);
    });

    interactAct.onMessage((ev, ctx) => {
      this.onRemoteInteract?.(ev, ctx.peerId);
    });

    playAgainAct.onMessage(() => {
      for (const p of this.players.values()) {
        p.ready = p.isHost;
      }
      this.onPlayAgain?.();
    });

    room.onPeerJoin((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo) {
        this.sendLobbyFn?.(selfInfo, peerId);
      }
      this.onLobbyUpdate?.();
    });

    room.onPeerLeave((ctx) => {
      const peerId = typeof ctx === 'string' ? ctx : ctx.peerId;
      this.handlePeerLeave(peerId);
    });

    // Broadcast our initial lobby info
    const selfInfo = this.players.get(this.localPeerId);
    if (selfInfo) {
      this.sendLobbyFn?.(selfInfo);
    }
  }

  handlePeerLeave(peerId: string): void {
    const leaving = this.players.get(peerId);
    this.players.delete(peerId);
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
    if (this.room) {
      try {
        this.room.leave();
      } catch {
        // ignore
      }
      this.room = null;
    }
    this.players.clear();
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
  }
}

export const net = new MultiplayerSystem();
