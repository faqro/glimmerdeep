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
  kind: 'pickup' | 'drop' | 'buy' | 'heal' | 'event' | 'revive' | 'exit' | 'plate';
  targetId?: string;
  itemId?: string;
  uses?: number;
  x?: number;
  y?: number;
}

export interface NetWorldSync {
  levelIndex: number;
  floorSeed: number;
  modifier: string;
  players: PlayerStateSnapshot[];
  roomStates: Array<{
    gx: number;
    gy: number;
    visited: boolean;
    cleared: boolean;
    doorsLocked: boolean;
    secretRevealed: boolean;
    bossDefeated?: boolean;
    puzzleSolved?: boolean;
    enemies: Array<{ uid: string; x: number; y: number; hp: number; alive: boolean }>;
    loot: Array<{ uid: string; collected: boolean }>;
  }>;
}

export class MultiplayerSystem {
  public mode: GameMode = 'solo';
  public inviteCode = '';
  public localPeerId = 'local';
  public localName = 'Wanderer';
  public localPaletteId = 'lavender';
  public players = new Map<string, LobbyPlayerInfo>();

  private room: Room | null = null;
  private sendLobbyFn: ((data: LobbyPlayerInfo, target?: string) => void) | null = null;
  private sendStartFn: ((data: { seed: number; levelIndex: number }, target?: string) => void) | null = null;
  private sendPlayerStateFn: ((data: PlayerStateSnapshot, target?: string) => void) | null = null;
  private sendWorldSyncFn: ((data: NetWorldSync, target?: string) => void) | null = null;
  private sendAttackFn: ((data: NetAttackEvent, target?: string) => void) | null = null;
  private sendInteractFn: ((data: NetInteractEvent, target?: string) => void) | null = null;

  public onLobbyUpdate?: () => void;
  public onGameStart?: (seed: number, levelIndex: number) => void;
  public onRemotePlayerState?: (state: PlayerStateSnapshot, fromPeer: string) => void;
  public onWorldSync?: (sync: NetWorldSync) => void;
  public onRemoteAttack?: (ev: NetAttackEvent, fromPeer: string) => void;
  public onRemoteInteract?: (ev: NetInteractEvent, fromPeer: string) => void;

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

    this.players.set(this.localPeerId, {
      peerId: this.localPeerId,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready: isHost,
      isHost,
    });

    const lobbyAct = room.makeAction<LobbyPlayerInfo>('lobby');
    const startAct = room.makeAction<{ seed: number; levelIndex: number }>('start');
    const playerAct = room.makeAction<PlayerStateSnapshot>('pstate');
    const worldAct = room.makeAction<NetWorldSync>('wsync');
    const attackAct = room.makeAction<NetAttackEvent>('attack');
    const interactAct = room.makeAction<NetInteractEvent>('interact');

    this.sendLobbyFn = (data, target) => lobbyAct.send(data, target ? { target } : undefined);
    this.sendStartFn = (data, target) => startAct.send(data, target ? { target } : undefined);
    this.sendPlayerStateFn = (data, target) => playerAct.send(data, target ? { target } : undefined);
    this.sendWorldSyncFn = (data, target) => worldAct.send(data, target ? { target } : undefined);
    this.sendAttackFn = (data, target) => attackAct.send(data, target ? { target } : undefined);
    this.sendInteractFn = (data, target) => interactAct.send(data, target ? { target } : undefined);

    lobbyAct.onMessage((info, ctx) => {
      if (this.players.size >= 4 && !this.players.has(ctx.peerId)) return;
      this.players.set(ctx.peerId, { ...info, peerId: ctx.peerId });

      // Ensure no two players share the same skin: non-host (or lexicographically higher peerId) re-rolls on collision
      const selfInfo = this.players.get(this.localPeerId);
      if (selfInfo && info.paletteId === selfInfo.paletteId && (this.mode !== 'host' && (info.isHost || this.localPeerId > ctx.peerId))) {
        const used = Array.from(this.players.values()).map((p) => p.paletteId);
        this.localPaletteId = pickRandomPaletteId(used);
        selfInfo.paletteId = this.localPaletteId;
        this.sendLobbyFn?.(selfInfo);
      }

      this.onLobbyUpdate?.();
    });

    startAct.onMessage((payload) => {
      this.onGameStart?.(payload.seed, payload.levelIndex);
    });

    playerAct.onMessage((state, ctx) => {
      this.onRemotePlayerState?.(state, ctx.peerId);
    });

    worldAct.onMessage((sync) => {
      if (this.mode === 'client') {
        this.onWorldSync?.(sync);
      }
    });

    attackAct.onMessage((ev, ctx) => {
      this.onRemoteAttack?.(ev, ctx.peerId);
    });

    interactAct.onMessage((ev, ctx) => {
      this.onRemoteInteract?.(ev, ctx.peerId);
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
      this.players.delete(peerId);
      this.onLobbyUpdate?.();
    });

    // Broadcast our initial lobby info
    const selfInfo = this.players.get(this.localPeerId);
    if (selfInfo) {
      this.sendLobbyFn?.(selfInfo);
    }
  }

  broadcastLobbySelf(ready: boolean): void {
    const info: LobbyPlayerInfo = {
      peerId: this.localPeerId,
      name: this.localName,
      paletteId: this.localPaletteId,
      ready,
      isHost: this.mode === 'host',
    };
    this.players.set(this.localPeerId, info);
    this.sendLobbyFn?.(info);
    this.onLobbyUpdate?.();
  }

  broadcastStart(seed: number, levelIndex = 0): void {
    if (this.mode !== 'host') return;
    this.sendStartFn?.({ seed, levelIndex });
  }

  broadcastPlayerState(state: PlayerStateSnapshot): void {
    if (this.mode === 'solo') return;
    this.sendPlayerStateFn?.(state);
  }

  broadcastWorldSync(sync: NetWorldSync): void {
    if (this.mode !== 'host') return;
    this.sendWorldSyncFn?.(sync);
  }

  broadcastAttack(ev: NetAttackEvent): void {
    if (this.mode === 'solo') return;
    this.sendAttackFn?.(ev);
  }

  broadcastInteract(ev: NetInteractEvent): void {
    if (this.mode === 'solo') return;
    this.sendInteractFn?.(ev);
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
    this.sendAttackFn = null;
    this.sendInteractFn = null;
  }
}

export const net = new MultiplayerSystem();
