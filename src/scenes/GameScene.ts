import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { BIOMES } from '../data/biomes';
import { BOSSES, ENEMIES } from '../data/enemies';
import { ARTIFACTS, CONSUMABLES } from '../data/items';
import { ROOM_TEMPLATES } from '../data/roomTemplates';
import { WEAPONS } from '../data/weapons';
import { SoundSystem } from '../audio/SoundSystem';
import { isMobileMode, mobileInput } from '../mobile/MobileInput';
import { DungeonGenerator, GeneratedFloor } from '../systems/DungeonGenerator';
import { addItemToSlots, consumeUse, createItemInstance, hasArtifact, rollRandomItemId } from '../systems/InventorySystem';
import { JournalSystem } from '../systems/JournalSystem';
import { net, NetRoomSync, NetWorldSync, SyncedProjectile } from '../systems/MultiplayerSystem';
import { StatusEffectManager } from '../systems/StatusEffectSystem';
import {
  Direction,
  InventoryItem,
  LevelModifierId,
  PlayerStateSnapshot,
  RoomData,
} from '../types/game';
import { SeededRandom, getDailySeed } from '../utils/SeededGenerator';
import { UIScene } from './UIScene';

interface ActiveEnemy {
  uid: string;
  defId: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  behavior: string;
  isElite: boolean;
  isBoss: boolean;
  aiTimerMs: number;
  attackCooldownMs: number;
  windupMs: number;
  idleMs: number;
  dashingMs: number;
  dashVx: number;
  dashVy: number;
  slowedMs: number;
  bubbledMs: number;
  burningMs: number;
  burnTickMs: number;
  hitFlashMs: number;
  phase: number;
  bossStep?: number;
  shieldOrbs?: Phaser.GameObjects.Image[];
  shieldAngle?: number;
  blockedShots?: number;
  repositionMs?: number;
  repositionDir?: number;
  targetX?: number;
  targetY?: number;
}

interface ActiveProjectile {
  uid: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  fromPlayer: boolean;
  ownerId: string;
  shooterUid?: string;
  damage: number;
  color: number;
  vx: number;
  vy: number;
  lifeMs: number;
  homing: boolean;
  boomerang: boolean;
  returning: boolean;
  bouncesLeft: number;
  slows: boolean;
  bubbles: boolean;
  burns: boolean;
  cometBoost?: boolean;
  startX?: number;
  startY?: number;
  hitUids: Set<string>;
  netSynced?: boolean;
  fromRemoteEvent?: boolean;
  targetX?: number;
  targetY?: number;
}

interface ActiveHazard {
  x: number;
  y: number;
  radius: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  tickMs: number;
}

interface ActiveSpikeTrap {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  state: 'idle' | 'armed' | 'extended';
  standMs: number;
  activeMs: number;
  hitThisCycle: boolean;
}

interface ActiveLootObj {
  uid: string;
  kind: 'shard' | 'item' | 'heart' | 'chest';
  sprite: Phaser.GameObjects.Image;
  itemId?: string;
  uses?: number;
  amount?: number;
  collected: boolean;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private floorSeed = 123456;
  private floor!: GeneratedFloor;
  private currentRoom!: RoomData;

  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  private wardRing!: Phaser.GameObjects.Arc;
  private playerState!: PlayerStateSnapshot;
  private remotePlayers = new Map<string, PlayerStateSnapshot>();
  private remoteSprites = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.BitmapText }>();
  private disconnectedPlayers = new Map<string, { levelIndex: number; snapshot: PlayerStateSnapshot }>();

  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private crateGroup!: Phaser.Physics.Arcade.StaticGroup;
  private doorZones: Array<{ dir: Direction; rect: Phaser.Geom.Rectangle; gfx: Phaser.GameObjects.Rectangle }> = [];
  private roomGroup!: Phaser.GameObjects.Group;

  private activeEnemies: ActiveEnemy[] = [];
  private projectiles: ActiveProjectile[] = [];
  private hazards: ActiveHazard[] = [];
  private spikeTraps: ActiveSpikeTrap[] = [];
  private lootObjs: ActiveLootObj[] = [];
  private fireflies: Array<{ sprite: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }> = [];

  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
    g: Phaser.Input.Keyboard.Key;
    tab: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    k1: Phaser.Input.Keyboard.Key;
    k2: Phaser.Input.Keyboard.Key;
    k3: Phaser.Input.Keyboard.Key;
  };

  private ui!: UIScene;
  private attackCooldownMs = 0;
  private invulnMs = 0;
  private dodgeMs = 0;
  private dodgeVx = 0;
  private dodgeVy = 0;
  private spikePinnedMs = 0;
  private staminaRegenMs = 0;
  private statusTickMs = 0;
  private burnFxMs = 0;
  private doorCooldownMs = 0;
  private paused = false;
  private transitioningLevel = false;

  private totalShardsCollected = 0;
  private totalEnemiesDefeated = 0;
  private netSyncTimerMs = 0;
  private plateCooldownMs = 0;
  private blockPushCooldownMs = 0;
  private giantStompCooldownMs = 0;
  private projSeq = 0;
  private spectateTargetId: string | null = null;
  private respawnAnimMs = 0;
  private remoteReviveAnimUntil = new Map<string, number>();

  private specialObjs: {
    merchant?: Phaser.GameObjects.Image;
    shrine?: Phaser.GameObjects.Image;
    altar?: Phaser.GameObjects.Image;
    portal?: Phaser.GameObjects.Image;
    beamGfx?: Phaser.GameObjects.Graphics;
    beamTarget?: Phaser.GameObjects.Image;
    resetRune?: { sprite: Phaser.GameObjects.Image; x: number; y: number };
    plates: Array<{ id: string; order: number; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
    mirrors: Array<{ id: string; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
    blocks: Array<{ id: string; sprite: Phaser.Physics.Arcade.Sprite }>;
    blockGoals: Array<{ tx: number; ty: number; sprite: Phaser.GameObjects.Image }>;
  } = { plates: [], mirrors: [], blocks: [], blockGoals: [] };

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data: {
    levelIndex?: number;
    floorSeed?: number;
    resetRun?: boolean;
    carryPlayer?: PlayerStateSnapshot;
    restoreReconnect?: boolean;
  }): void {
    this.levelIndex = data.levelIndex ?? 0;
    this.floorSeed = data.floorSeed ?? Math.floor(Math.random() * 900000) + 100000;
    this.transitioningLevel = false;
    this.paused = false;
    this.remotePlayers.clear();
    this.remoteSprites.clear();
    this.disconnectedPlayers.clear();
    this.spectateTargetId = null;

    if (data.resetRun || !data.carryPlayer) {
      this.totalShardsCollected = 0;
      this.totalEnemiesDefeated = 0;
      this.playerState = {
        id: net.localPeerId,
        name: net.localName,
        paletteId: net.localPaletteId,
        gx: 0,
        gy: 2,
        x: 88,
        y: 88,
        vx: 0,
        vy: 0,
        aimAngle: 0,
        hp: 16,
        maxHp: 16,
        shield: 0,
        stamina: 4,
        maxStamina: 4,
        shards: 0,
        downed: false,
        downedTimerMs: 0,
        dodging: false,
        activeSlot: 0,
        inventory: [createItemInstance('moonblade'), createItemInstance('heartdew_potion'), null],
        statusEffects: [],
        inExitReady: false,
        animState: 'idle',
        flipX: false,
      };
      JournalSystem.discoverItem('moonblade');
      JournalSystem.discoverItem('heartdew_potion');
    } else if (data.restoreReconnect) {
      net.localPaletteId = data.carryPlayer.paletteId;
      this.playerState = {
        ...data.carryPlayer,
        id: net.localPeerId,
        name: net.localName,
        inExitReady: false,
      };
    } else {
      this.playerState = {
        ...data.carryPlayer,
        gx: 0,
        gy: 2,
        x: 88,
        y: 88,
        inExitReady: false,
      };
    }

    const playerCount = net.mode === 'solo' ? 1 : Math.max(1, net.players.size);
    if (this.playerState.name === 'ADMIN') {
      JournalSystem.unlockAll();
    }
    this.floor = DungeonGenerator.generateFloor(this.levelIndex, this.floorSeed, playerCount);
    const spawnGx = data.restoreReconnect ? this.playerState.gx : 0;
    const spawnGy = data.restoreReconnect ? this.playerState.gy : 2;
    const spawnX = data.restoreReconnect ? this.playerState.x : 88;
    const spawnY = data.restoreReconnect ? this.playerState.y : 88;
    this.currentRoom = this.floor.rooms[spawnGy][spawnGx];

    this.roomGroup = this.add.group();
    this.wallGroup = this.physics.add.staticGroup();
    this.crateGroup = this.physics.add.staticGroup();

    this.physics.world.setBounds(0, 0, 176, 176);
    this.cameras.main.setZoom(1.18);
    this.cameras.main.centerOn(88, 88);

    this.playerSprite = this.physics.add.sprite(88, 88, `player_${this.playerState.paletteId}`, 0);
    this.playerSprite.setDepth(10);
    this.playerSprite.setSize(10, 12);
    this.playerSprite.setOffset(3, 10);
    this.playerSprite.setCollideWorldBounds(true);

    this.wardRing = this.add.circle(88, 88, 13, 0x6ef3ff, 0.12).setStrokeStyle(1, 0x6ef3ff, 0.85).setDepth(11).setVisible(false);

    this.physics.add.collider(this.playerSprite, this.wallGroup);
    this.physics.add.collider(this.playerSprite, this.crateGroup);

    this.setupInputs();
    this.setupNetworking();

    // Launch UIScene
    if (this.scene.isActive('UIScene')) {
      this.scene.stop('UIScene');
    }
    this.scene.launch('UIScene');
    this.ui = this.scene.get('UIScene') as UIScene;
    this.ui.setQuitHandler(() => {
      net.disconnect();
      SoundSystem.setMusicTrack('normal');
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
    this.ui.setPauseChangeHandler((paused) => {
      this.paused = paused;
    });
    this.ui.setSpectateHandlers(
      () => this.cycleSpectateTarget(-1),
      () => this.cycleSpectateTarget(1)
    );

    this.loadRoom(spawnGx, spawnGy, spawnX, spawnY);

    const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
    this.time.delayedCall(120, () => {
      this.ui.showToast(
        data.restoreReconnect ? 'Reconnected to run!' : `Floor ${biome.level}: ${biome.name}`,
        data.restoreReconnect ? '#66ffd9' : '#f49ac1'
      );
    });
  }

  private setupInputs(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      g: kb.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      tab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
      esc: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      k1: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      k2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      k3: kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
    };

    kb.on('keydown-TAB', (ev: KeyboardEvent) => {
      ev.preventDefault();
      this.ui.toggleMap();
    });

    let lastEscMs = 0;
    const handleEscToggle = () => {
      const now = performance.now();
      if (now - lastEscMs < 80) return;
      lastEscMs = now;
      if (!this.ui) return;
      if (this.ui.isOverlayOpen()) {
        this.ui.closeShop();
        this.paused = this.ui.togglePause(false);
      } else {
        this.paused = this.ui.togglePause();
      }
    };

    kb.on('keydown-ESC', handleEscToggle);

    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !ev.repeat) {
        ev.preventDefault();
        handleEscToggle();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onWindowKeyDown);
    });

    kb.on('keydown-Q', () => {
      if (!this.paused && !this.ui.isOverlayOpen() && !this.playerState.downed) {
        this.dropActiveItem();
      }
    });
    kb.on('keydown-ONE', () => (this.playerState.activeSlot = 0));
    kb.on('keydown-TWO', () => (this.playerState.activeSlot = 1));
    kb.on('keydown-THREE', () => (this.playerState.activeSlot = 2));
    kb.on('keydown-G', () => {
      if (!this.paused && !this.ui.isOverlayOpen() && !this.playerState.downed) {
        this.dropActiveItem();
      }
    });
    kb.on('keydown-E', () => {
      if (!this.paused) this.handleInteract();
    });

    const switchSpectator = (dir: -1 | 1) => {
      if (net.mode !== 'solo' && this.playerState.downed && !this.paused && !this.ui.isOverlayOpen()) {
        this.cycleSpectateTarget(dir);
      }
    };
    kb.on('keydown-LEFT', () => switchSpectator(-1));
    kb.on('keydown-A', () => switchSpectator(-1));
    kb.on('keydown-RIGHT', () => switchSpectator(1));
    kb.on('keydown-D', () => switchSpectator(1));

    this.input.mouse?.disableContextMenu();
    if (!isMobileMode()) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.paused || this.ui.isOverlayOpen() || this.playerState.downed) return;
        if (pointer.rightButtonDown()) {
          this.handleSecondaryAction();
        } else {
          this.handlePrimaryAttack();
        }
      });
    } else {
      const unsubBtn = mobileInput.onButton((btn) => {
        if (btn === 'tab') {
          this.ui.toggleMap();
        } else if (btn === 'esc') {
          if (this.ui.isOverlayOpen()) {
            this.ui.closeShop();
            this.paused = this.ui.togglePause(false);
          } else {
            this.paused = this.ui.togglePause();
          }
        } else if (btn === 'q') {
          if (!this.paused && !this.ui.isOverlayOpen() && !this.playerState.downed) {
            this.dropActiveItem();
          }
        } else if (btn === 'prevSlot') {
          if (!this.paused && !this.ui.isOverlayOpen()) {
            this.playerState.activeSlot = (this.playerState.activeSlot + 2) % 3;
          }
        } else if (btn === 'nextSlot') {
          if (!this.paused && !this.ui.isOverlayOpen()) {
            this.playerState.activeSlot = (this.playerState.activeSlot + 1) % 3;
          }
        } else if (btn === 'e') {
          if (!this.paused && !this.ui.isOverlayOpen()) {
            this.handleInteract();
          }
        }
      });

      const unsubNav = mobileInput.onNav((dir) => {
        if (dir === 'left') switchSpectator(-1);
        else if (dir === 'right') switchSpectator(1);
      });

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        unsubBtn();
        unsubNav();
      });
    }
  }

  private setupNetworking(): void {
    net.onLobbyUpdate = undefined;
    net.onGameStart = undefined;
    net.onPlayAgain = undefined;
    net.onRemotePlayerState = (state, peerId) => {
      if (net.players.has(peerId)) {
        this.remotePlayers.set(peerId, { ...state, id: peerId });
      }
    };

    net.onSelfIdResolved = (peerId) => {
      this.playerState.id = peerId;
    };

    net.onPeerJoined = (peerId, info) => {
      if (net.mode !== 'host') return;
      const saved = this.disconnectedPlayers.get(info.name);
      if (saved && saved.levelIndex === this.levelIndex) {
        this.disconnectedPlayers.delete(info.name);
        net.sendStartToPeer(peerId, this.floorSeed, this.levelIndex, saved.snapshot);
        this.ui.showToast(`${info.name} reconnected!`, '#66ffd9');
      } else {
        net.sendStartToPeer(peerId, this.floorSeed, this.levelIndex);
        this.ui.showToast(`${info.name} joined!`, '#66ffd9');
      }
    };

    net.onPeerLeft = (peerId, leaving) => {
      const lastState = this.remotePlayers.get(peerId);
      if (lastState) {
        this.disconnectedPlayers.set(lastState.name, {
          levelIndex: this.levelIndex,
          snapshot: {
            ...lastState,
            inventory: lastState.inventory.map((i) => (i ? { ...i } : null)),
            statusEffects: lastState.statusEffects.map((s) => ({ ...s })),
          },
        });
      }
      this.remotePlayers.delete(peerId);
      const vis = this.remoteSprites.get(peerId);
      if (vis) {
        vis.sprite.destroy();
        vis.label.destroy();
        this.remoteSprites.delete(peerId);
      }
      const name = leaving?.name ?? lastState?.name ?? 'A player';
      this.ui.showToast(`${name} disconnected`, '#ff5d8f');
    };

    net.onHostMigrated = (newHostPeerId, isLocalNewHost) => {
      if (isLocalNewHost) {
        this.netSyncTimerMs = 65;
        this.ui.showToast('Host disconnected! You are now Host', '#ffe066');
      } else {
        const hostName = net.players.get(newHostPeerId)?.name ?? 'Teammate';
        this.ui.showToast(`Host migrated to ${hostName}`, '#ffe066');
      }
    };

    net.onRemoteAttack = (ev, peerId) => {
      if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
        this.spawnWeaponAttack(ev.x, ev.y, ev.angle, ev.weaponId, peerId, false);
      }
    };

    net.onRemoteInteract = (ev) => {
      if (ev.kind === 'revive') {
        const isRipOut =
          ev.itemId === 'boss_revive' || ev.itemId === 'revive_totem' || ev.itemId === 'necromancy_altar';
        const accentColor =
          ev.itemId === 'necromancy_altar' ? 0xc084fc : ev.itemId === 'boss_revive' ? 0x66ffd9 : 0xffe066;

        if ((ev.targetId === this.playerState.id || ev.targetId === 'all') && this.playerState.downed) {
          this.reviveSelf(ev.amount, isRipOut, accentColor);
        }
        if (isRipOut) {
          for (const [peerId, st] of this.remotePlayers.entries()) {
            if (
              st.downed &&
              (ev.targetId === 'all' || ev.targetId === peerId) &&
              st.gx === this.currentRoom.gx &&
              st.gy === this.currentRoom.gy
            ) {
              this.playRipOutAnimationForRemote(peerId, accentColor);
            }
          }
        }
      } else if (ev.kind === 'drop' && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const lKind = ev.lootKind ?? 'item';
        if (targetRoom && !targetRoom.loot.some((l) => l.uid === ev.targetId)) {
          targetRoom.loot.push({
            uid: ev.targetId,
            kind: lKind,
            x: ev.x ?? 88,
            y: ev.y ?? 88,
            itemId: ev.itemId,
            amount: ev.amount,
            uses: ev.uses,
            collected: false,
          });
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            if (!this.lootObjs.some((l) => l.uid === ev.targetId)) {
              this.createLootObject(ev.targetId, lKind, ev.x ?? 88, ev.y ?? 88, ev.itemId, ev.amount, ev.uses);
            }
          }
        }
      } else if (ev.kind === 'pickup' && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        if (targetRoom) {
          const roomLoot = targetRoom.loot.find((rl) => rl.uid === ev.targetId);
          if (roomLoot) {
            roomLoot.collected = true;
          } else {
            targetRoom.loot.push({
              uid: ev.targetId,
              kind: 'shard',
              x: 0,
              y: 0,
              collected: true,
            });
          }
        }
        const vis = this.lootObjs.find((l) => l.uid === ev.targetId);
        if (vis && !vis.collected) {
          vis.collected = true;
          if (vis.kind === 'chest') vis.sprite.setTexture('obj_chest_open');
          else vis.sprite.destroy();
        }
      } else if (ev.kind === 'buy' && ev.uses !== undefined) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const entry = targetRoom?.shopStock?.[ev.uses];
        if (entry) entry.sold = true;
        if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy && this.ui.isOverlayOpen()) {
          this.openMerchantShop();
        }
      } else if (ev.kind === 'crate' && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        if (targetRoom) {
          if (!targetRoom.brokenCrates) targetRoom.brokenCrates = [];
          if (!targetRoom.brokenCrates.includes(ev.targetId)) {
            targetRoom.brokenCrates.push(ev.targetId);
          }
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            this.destroyCrateByKey(ev.targetId);
          }
        }
      } else if (ev.kind === 'enemy_hit' && ev.targetId) {
        const dmg = ev.uses ?? 1;
        if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy && this.isRoomAuthority()) {
          const ae = this.activeEnemies.find((e) => e.uid === ev.targetId);
          if (ae && ae.sprite.active) {
            this.damageEnemy(ae, dmg, ev.x);
          }
        } else if (net.mode === 'host' && (ev.gx !== this.currentRoom.gx || ev.gy !== this.currentRoom.gy)) {
          const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
          const re = targetRoom?.enemies.find((e) => e.uid === ev.targetId && e.alive);
          if (targetRoom && re) {
            re.hp -= dmg;
            if (re.hp <= 0) {
              re.hp = 0;
              re.alive = false;
              const def = ENEMIES[re.defId];
              const bonusShard = this.floor.modifier === 'greedy_shadows' ? 1 : 0;
              targetRoom.loot.push({
                uid: `sh_${Date.now()}_${Math.random()}`,
                kind: 'shard',
                x: re.x,
                y: re.y,
                amount: (def?.shardDrop ?? 2) + bonusShard,
                collected: false,
              });
              if (targetRoom.enemies.every((e) => !e.alive)) {
                targetRoom.cleared = true;
                targetRoom.doorsLocked = false;
              }
            }
          }
        }
      } else if (ev.kind === 'game_over') {
        this.triggerGameOver(false);
      } else if (ev.kind === 'mirror' && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const mirror = targetRoom?.puzzleBeam?.mirrors.find((m) => m.id === ev.targetId);
        if (mirror) {
          mirror.orientation = ev.uses === 0 ? 'slash' : 'backslash';
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            const vis = this.specialObjs.mirrors.find((m) => m.id === ev.targetId);
            vis?.sprite.setTexture(`obj_mirror_${mirror.orientation}`);
            this.updateMirrorBeam(true);
          }
        }
      } else if (ev.kind === 'block' && ev.targetId && ev.x !== undefined && ev.y !== undefined) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const block = targetRoom?.puzzleBlock?.blocks.find((b) => b.id === ev.targetId);
        if (block) {
          block.tx = ev.x;
          block.ty = ev.y;
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            const vis = this.specialObjs.blocks.find((b) => b.id === ev.targetId);
            vis?.sprite.setPosition(block.tx * 16 + 8, block.ty * 16 + 8);
            this.refreshBlockGoalVisuals();
            this.checkBlockPuzzleSolved();
          }
        }
      } else if (ev.kind === 'block_reset') {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        if (targetRoom?.puzzleBlock) {
          for (const b of targetRoom.puzzleBlock.blocks) {
            b.tx = b.initialTx;
            b.ty = b.initialTy;
          }
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            this.resetPuzzleBlocks(false);
          }
        }
      }
    };

    net.onWorldSync = (sync: NetWorldSync) => {
      if (net.mode !== 'client') return;
      if (sync.levelIndex !== this.levelIndex) {
        this.scene.restart({
          levelIndex: sync.levelIndex,
          floorSeed: sync.floorSeed,
          carryPlayer: this.playerState,
        });
        return;
      }
      for (const p of sync.players) {
        if (p.id !== this.playerState.id && net.players.has(p.id)) {
          this.remotePlayers.set(p.id, p);
        }
      }
      for (const peerId of Array.from(this.remotePlayers.keys())) {
        if (!net.players.has(peerId)) {
          this.remotePlayers.delete(peerId);
          const vis = this.remoteSprites.get(peerId);
          if (vis) {
            vis.sprite.destroy();
            vis.label.destroy();
            this.remoteSprites.delete(peerId);
          }
        }
      }
      for (const rs of sync.roomStates) {
        const r = this.floor.rooms[rs.gy]?.[rs.gx];
        if (!r) continue;
        const isSelfAuthorityInRoom = r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy && this.isRoomAuthority();
        const prevLocked = r.doorsLocked;
        const prevSecret = r.secretRevealed;
        r.visited = r.visited || rs.visited;
        r.secretRevealed = rs.secretRevealed;
        r.puzzleSolved = rs.puzzleSolved;
        if (!isSelfAuthorityInRoom) {
          r.cleared = rs.cleared;
          r.doorsLocked = rs.doorsLocked;
          r.bossDefeated = rs.bossDefeated;
        }
        if (rs.puzzleMirrors && r.puzzleBeam) {
          for (const pm of rs.puzzleMirrors) {
            const m = r.puzzleBeam.mirrors.find((x) => x.id === pm.id);
            if (m) m.orientation = pm.orientation;
          }
        }
        if (rs.puzzleBlocks && r.puzzleBlock) {
          for (const pb of rs.puzzleBlocks) {
            const b = r.puzzleBlock.blocks.find((x) => x.id === pb.id);
            if (b) {
              b.tx = pb.tx;
              b.ty = pb.ty;
            }
          }
        }

        if (rs.brokenCrates) {
          if (!r.brokenCrates) r.brokenCrates = [];
          for (const ck of rs.brokenCrates) {
            if (!r.brokenCrates.includes(ck)) {
              r.brokenCrates.push(ck);
              if (r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy) {
                this.destroyCrateByKey(ck, false);
              }
            }
          }
        }
        if (rs.shopSold && r.shopStock) {
          for (let si = 0; si < rs.shopSold.length && si < r.shopStock.length; si++) {
            r.shopStock[si].sold = rs.shopSold[si];
          }
        }

        if (!isSelfAuthorityInRoom) {
          const syncedIds = new Set(rs.enemies.map((es) => es.uid));
          for (const es of rs.enemies) {
            const re = r.enemies.find((e) => e.uid === es.uid);
            if (re) {
              re.x = es.x;
              re.y = es.y;
              re.hp = es.hp;
              re.alive = es.alive;
            }
          }
          if (r.gx === sync.hostGx && r.gy === sync.hostGy) {
            for (const re of r.enemies) {
              if (re.alive && !syncedIds.has(re.uid)) {
                re.alive = false;
                re.hp = 0;
              }
            }
          }
        }
        for (const ls of rs.loot) {
          const rl = r.loot.find((l) => l.uid === ls.uid);
          if (rl) {
            rl.collected = rl.collected || ls.collected;
          } else {
            r.loot.push({
              uid: ls.uid,
              kind: ls.kind,
              x: ls.x,
              y: ls.y,
              itemId: ls.itemId,
              uses: ls.uses,
              amount: ls.amount,
              collected: ls.collected,
            });
          }
        }

        if (r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy) {
          if (!isSelfAuthorityInRoom) {
            this.syncActiveEnemiesFromRemote(r, rs.enemies, r.gx === sync.hostGx && r.gy === sync.hostGy);
          }

          for (const ls of rs.loot) {
            const existing = this.lootObjs.find((l) => l.uid === ls.uid);
            if (!existing && !ls.collected) {
              const rl = r.loot.find((x) => x.uid === ls.uid);
              if (!rl?.collected) {
                this.createLootObject(ls.uid, ls.kind, ls.x, ls.y, ls.itemId, ls.amount, ls.uses);
              }
            } else if (existing && ls.collected && !existing.collected) {
              existing.collected = true;
              if (existing.kind === 'chest') existing.sprite.setTexture('obj_chest_open');
              else existing.sprite.destroy();
            }
          }
          for (const l of this.lootObjs) {
            const rl = r.loot.find((x) => x.uid === l.uid);
            if (rl?.collected && !l.collected) {
              l.collected = true;
              if (l.kind === 'chest') l.sprite.setTexture('obj_chest_open');
              else l.sprite.destroy();
            }
          }

          if (r.type === 'boss' && r.bossDefeated) {
            this.spawnExitPortal();
            if (r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy) {
              SoundSystem.setMusicTrack('normal');
            }
          }
          if (prevLocked !== r.doorsLocked || prevSecret !== r.secretRevealed) {
            this.updateDoorVisuals();
            if (prevLocked && !r.doorsLocked) SoundSystem.playUnlock();
          }
        }
      }

      // Sync ranged projectiles from host when host is in the same room
      if (sync.hostGx === this.currentRoom.gx && sync.hostGy === this.currentRoom.gy && sync.projectiles) {
        this.applySyncedProjectiles(this.currentRoom.gx, this.currentRoom.gy, sync.projectiles);
      }
    };

    net.onRoomSync = (sync: NetRoomSync) => {
      const r = this.floor.rooms[sync.gy]?.[sync.gx];
      if (!r) return;
      const inThisRoom = r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy;
      if (inThisRoom && this.isRoomAuthority()) return;

      const prevLocked = r.doorsLocked;
      r.cleared = sync.cleared;
      r.doorsLocked = sync.doorsLocked;
      if (sync.bossDefeated !== undefined) r.bossDefeated = sync.bossDefeated;

      const syncedIds = new Set(sync.enemies.map((es) => es.uid));
      for (const es of sync.enemies) {
        const re = r.enemies.find((e) => e.uid === es.uid);
        if (re) {
          re.x = es.x;
          re.y = es.y;
          re.hp = es.hp;
          re.alive = es.alive;
        }
      }
      for (const re of r.enemies) {
        if (re.alive && !syncedIds.has(re.uid)) {
          re.alive = false;
          re.hp = 0;
        }
      }

      if (inThisRoom) {
        this.syncActiveEnemiesFromRemote(r, sync.enemies, true);
        this.applySyncedProjectiles(sync.gx, sync.gy, sync.projectiles);

        if (r.type === 'boss' && r.bossDefeated) {
          this.spawnExitPortal();
          SoundSystem.setMusicTrack('normal');
        }
        if (prevLocked !== r.doorsLocked) {
          this.updateDoorVisuals();
          if (prevLocked && !r.doorsLocked) SoundSystem.playUnlock();
        }
      }
    };
  }

  private syncActiveEnemiesFromRemote(
    room: RoomData,
    syncedEnemies: Array<{ uid: string; x: number; y: number; hp: number; alive: boolean }>,
    authoritativeList: boolean
  ): void {
    const syncedById = new Map(syncedEnemies.map((es) => [es.uid, es]));
    for (const ae of this.activeEnemies) {
      const es = syncedById.get(ae.uid);
      const shouldDie =
        room.cleared ||
        (ae.isBoss && !!room.bossDefeated) ||
        (es ? !es.alive || es.hp <= 0 : authoritativeList);
      if (shouldDie) {
        if (ae.sprite.active) {
          this.spawnParticles(ae.sprite.x, ae.sprite.y, 0xffe066, 6);
          ae.sprite.destroy();
        }
        ae.hp = 0;
        const re = room.enemies.find((e) => e.uid === ae.uid);
        if (re) {
          re.alive = false;
          re.hp = 0;
        }
      } else if (es && ae.sprite.active) {
        ae.hp = es.hp;
        ae.targetX = es.x;
        ae.targetY = es.y;
      }
    }
    this.activeEnemies = this.activeEnemies.filter((e) => e.hp > 0 && e.sprite.active);
  }

  private isRoomAuthority(): boolean {
    if (net.mode === 'solo') return true;
    if (this.playerState.downed) return false;
    if (net.mode === 'host') return true;
    const gx = this.currentRoom.gx;
    const gy = this.currentRoom.gy;

    for (const [peerId, info] of net.players.entries()) {
      if (info.isHost) {
        const hostSnap = this.remotePlayers.get(peerId);
        if (hostSnap && !hostSnap.downed && hostSnap.gx === gx && hostSnap.gy === gy) {
          return false;
        }
      }
    }

    const peersInRoom: Array<{ peerId: string; joinedAt: number }> = [
      {
        peerId: this.playerState.id,
        joinedAt: net.players.get(this.playerState.id)?.joinedAt ?? Number.MAX_SAFE_INTEGER,
      },
    ];
    for (const [peerId, snap] of this.remotePlayers.entries()) {
      if (!snap.downed && snap.gx === gx && snap.gy === gy && net.players.has(peerId)) {
        peersInRoom.push({
          peerId,
          joinedAt: net.players.get(peerId)?.joinedAt ?? Number.MAX_SAFE_INTEGER,
        });
      }
    }
    peersInRoom.sort((a, b) => (a.joinedAt !== b.joinedAt ? a.joinedAt - b.joinedAt : a.peerId.localeCompare(b.peerId)));
    return peersInRoom[0]?.peerId === this.playerState.id;
  }

  private applySyncedProjectiles(gx: number, gy: number, projectiles: SyncedProjectile[]): void {
    const roomProjs = projectiles.filter(
      (sp) => sp.gx === gx && sp.gy === gy && sp.ownerId !== this.playerState.id
    );
    const activeUids = new Set(roomProjs.map((sp) => sp.uid));

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.fromRemoteEvent || (p.netSynced && !activeUids.has(p.uid))) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
      }
    }

    for (const sp of roomProjs) {
      const existing = this.projectiles.find((p) => p.netSynced && p.uid === sp.uid);
      if (existing) {
        existing.targetX = sp.x;
        existing.targetY = sp.y;
        existing.vx = sp.vx;
        existing.vy = sp.vy;
        existing.lifeMs = Math.max(existing.lifeMs, 250);
      } else {
        const sprite = this.physics.add.sprite(sp.x, sp.y, 'proj_orb').setDepth(11).setTint(sp.color);
        this.projectiles.push({
          uid: sp.uid,
          sprite,
          fromPlayer: sp.fromPlayer,
          ownerId: sp.ownerId,
          damage: sp.damage,
          color: sp.color,
          vx: sp.vx,
          vy: sp.vy,
          lifeMs: 2600,
          homing: false,
          boomerang: false,
          returning: false,
          bouncesLeft: 0,
          slows: false,
          bubbles: false,
          burns: !!sp.burns,
          hitUids: new Set(),
          netSynced: true,
          targetX: sp.x,
          targetY: sp.y,
        });
      }
    }
  }

  private loadRoom(gx: number, gy: number, spawnX: number, spawnY: number, isSpectating = false): void {
    // Save active enemy positions/HP back into currentRoom before leaving
    if (this.currentRoom && this.activeEnemies.length > 0 && this.isRoomAuthority()) {
      for (const ae of this.activeEnemies) {
        const re = this.currentRoom.enemies.find((e) => e.uid === ae.uid);
        if (re) {
          re.x = ae.sprite.active ? ae.sprite.x : re.x;
          re.y = ae.sprite.active ? ae.sprite.y : re.y;
          re.hp = ae.hp;
          re.alive = ae.hp > 0;
        }
      }
    }

    // Clear previous room objects
    this.roomGroup.clear(true, true);
    this.wallGroup.clear(true, true);
    this.crateGroup.clear(true, true);
    this.doorZones = [];
    this.activeEnemies = [];
    this.projectiles.forEach((p) => p.sprite.destroy());
    this.projectiles = [];
    this.hazards = [];
    this.spikeTraps = [];
    this.spikePinnedMs = 0;
    this.lootObjs = [];
    this.fireflies = [];
    this.blockPushCooldownMs = 0;
    this.respawnAnimMs = 0;
    this.remoteReviveAnimUntil.clear();
    this.specialObjs = { plates: [], mirrors: [], blocks: [], blockGoals: [] };

    const room = this.floor.rooms[gy][gx];
    this.currentRoom = room;
    room.visited = true;

    // Wandering Eye artifact reveals adjacent secret rooms
    if (hasArtifact(this.playerState.inventory, 'wandering_eye') !== -1) {
      for (let ry = 0; ry < 6; ry++) {
        for (let rx = 0; rx < 6; rx++) {
          const sr = this.floor.rooms[ry]?.[rx];
          if (sr && sr.type === 'secret') sr.secretRevealed = true;
        }
      }
    }

    if (!isSpectating) {
      this.playerState.gx = gx;
      this.playerState.gy = gy;
      this.playerSprite.setPosition(spawnX, spawnY).setVisible(true);
    } else {
      this.playerSprite.setVisible(gx === this.playerState.gx && gy === this.playerState.gy);
    }
    this.doorCooldownMs = 350;

    const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
    const template = ROOM_TEMPLATES[room.templateId % ROOM_TEMPLATES.length];
    const gfx = this.add.graphics().setDepth(0);
    this.roomGroup.add(gfx);

    // Draw 11 x 11 square tile room (9 x 9 walkable interior, 16x16 per tile = 176x176)
    for (let ty = 0; ty < 11; ty++) {
      for (let tx = 0; tx < 11; tx++) {
        const isBorder = tx === 0 || tx === 10 || ty === 0 || ty === 10;
        if (isBorder) {
          const isDoorTile =
            (ty === 0 && tx === 5 && (room.connections.north || (room.connections.secretNorth && room.secretRevealed))) ||
            (ty === 10 && tx === 5 && (room.connections.south || (room.connections.secretSouth && room.secretRevealed))) ||
            (tx === 0 && ty === 5 && (room.connections.west || (room.connections.secretWest && room.secretRevealed))) ||
            (tx === 10 && ty === 5 && (room.connections.east || (room.connections.secretEast && room.secretRevealed)));

          if (isDoorTile) {
            gfx.fillStyle(biome.floorLight, 1);
            gfx.fillRect(tx * 16, ty * 16, 16, 16);
          } else {
            gfx.fillStyle(biome.wallDark, 1);
            gfx.fillRect(tx * 16, ty * 16, 16, 16);
            gfx.fillStyle(biome.wallTop, 1);
            gfx.fillRect(tx * 16 + 1, ty * 16 + 1, 14, 10);

            // Secret wall crack hint
            const isSecretHint =
              (ty === 0 && tx === 5 && room.connections.secretNorth && !room.secretRevealed) ||
              (ty === 10 && tx === 5 && room.connections.secretSouth && !room.secretRevealed) ||
              (tx === 0 && ty === 5 && room.connections.secretWest && !room.secretRevealed) ||
              (tx === 10 && ty === 5 && room.connections.secretEast && !room.secretRevealed);
            if (isSecretHint) {
              gfx.fillStyle(biome.accent, 0.7);
              gfx.fillRect(tx * 16 + 6, ty * 16 + 4, 2, 8);
              gfx.fillRect(tx * 16 + 8, ty * 16 + 6, 3, 2);
            }

            const wall = this.add.rectangle(tx * 16 + 8, ty * 16 + 8, 16, 16, 0x000000, 0);
            this.wallGroup.add(wall);
            this.roomGroup.add(wall);
          }
        } else {
          const checker = (tx + ty) % 2 === 0;
          gfx.fillStyle(checker ? biome.floorDark : biome.floorLight, 1);
          gfx.fillRect(tx * 16, ty * 16, 16, 16);
        }
      }
    }

    // Add Door Trigger Zones
    const addDoor = (dir: Direction, x: number, y: number, w: number, h: number) => {
      const dg = this.add.rectangle(x, y, w, h, biome.accent, 0.25).setDepth(2);
      this.roomGroup.add(dg);
      this.doorZones.push({ dir, rect: new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), gfx: dg });
    };
    if (room.connections.north || (room.connections.secretNorth && room.secretRevealed)) addDoor('north', 88, 8, 18, 16);
    if (room.connections.south || (room.connections.secretSouth && room.secretRevealed)) addDoor('south', 88, 168, 18, 16);
    if (room.connections.west || (room.connections.secretWest && room.secretRevealed)) addDoor('west', 8, 88, 16, 18);
    if (room.connections.east || (room.connections.secretEast && room.secretRevealed)) addDoor('east', 168, 88, 16, 18);

    // Pillars & Props (skip pillars in boss/merchant/healing/puzzle rooms for clean layout)
    if (room.type !== 'boss' && room.type !== 'merchant' && room.type !== 'healing' && room.type !== 'puzzle') {
      for (const p of template.pillars) {
        const px = p.tx * 16 + 8;
        const py = p.ty * 16 + 8;
        gfx.fillStyle(biome.wallDark, 1);
        gfx.fillRect(p.tx * 16, p.ty * 16, 16, 16);
        gfx.fillStyle(biome.wallTop, 1);
        gfx.fillRect(p.tx * 16 + 2, p.ty * 16 + 2, 12, 10);
        const wall = this.add.rectangle(px, py, 16, 16, 0x000000, 0);
        this.wallGroup.add(wall);
        this.roomGroup.add(wall);
      }

      for (const c of template.crates) {
        const ck = `${c.tx},${c.ty}`;
        if (room.brokenCrates?.includes(ck)) continue;
        const crate = this.crateGroup.create(c.tx * 16 + 8, c.ty * 16 + 8, 'obj_crate') as Phaser.Physics.Arcade.Sprite;
        crate.setData('crateKey', ck);
        crate.setDepth(5);
        this.roomGroup.add(crate);
      }
    }

    // Props + Additive Colored Lights
    for (const pr of template.props) {
      const px = pr.tx * 16 + 8;
      const py = pr.ty * 16 + 8;
      const tex = pr.kind === 'mushroom' ? 'prop_mushroom' : 'prop_lantern';
      const sp = this.add.image(px, py, tex).setDepth(4);
      const glow = this.add
        .image(px, py, 'glow_soft')
        .setScale(1.1)
        .setTint(pr.kind === 'mushroom' ? biome.accent : 0xffd275)
        .setAlpha(0.28)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(15);
      this.roomGroup.add(sp);
      this.roomGroup.add(glow);
    }

    // Hazards (full pre-determined line layout in hazard rooms)
    if (room.type === 'hazard') {
      const hazardSet = new Set(template.hazards.map((h) => `${h.tx},${h.ty}`));
      const rimGfx = this.add.graphics().setDepth(3);
      rimGfx.fillStyle(0x2b1008, 0.85);
      for (const h of template.hazards) {
        const px = h.tx * 16;
        const py = h.ty * 16;
        const hx = px + 8;
        const hy = py + 8;
        const sp = this.add.image(hx, hy, 'tile_lava_0').setDepth(2);
        const hGlow = this.add
          .image(hx, hy, 'glow_soft')
          .setScale(0.95)
          .setTint(0xff6b1a)
          .setAlpha(0.28)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(15);
        this.roomGroup.add(sp);
        this.roomGroup.add(hGlow);
        this.hazards.push({
          x: hx,
          y: hy,
          radius: 8,
          sprite: sp,
          glow: hGlow,
          phase: (h.tx * 0.7 + h.ty * 1.1) % (Math.PI * 2),
          tickMs: 0,
        });

        // Draw outer crust rim only on edges not bordering another lava tile
        if (!hazardSet.has(`${h.tx},${h.ty - 1}`)) rimGfx.fillRect(px, py, 16, 1);
        if (!hazardSet.has(`${h.tx},${h.ty + 1}`)) rimGfx.fillRect(px, py + 15, 16, 1);
        if (!hazardSet.has(`${h.tx - 1},${h.ty}`)) rimGfx.fillRect(px, py, 1, 16);
        if (!hazardSet.has(`${h.tx + 1},${h.ty}`)) rimGfx.fillRect(px + 15, py, 1, 16);
      }
      this.roomGroup.add(rimGfx);
    }

    // Spike traps (black grates in hazard and combat rooms)
    if (room.type === 'hazard' || room.type === 'combat') {
      for (const s of template.spikes) {
        const sx = s.tx * 16 + 8;
        const sy = s.ty * 16 + 8;
        const sp = this.add.image(sx, sy, 'obj_spike_idle').setDepth(2);
        this.roomGroup.add(sp);
        this.spikeTraps.push({ x: sx, y: sy, sprite: sp, state: 'idle', standMs: 0, activeMs: 0, hitThisCycle: false });
      }
    }

    // Ambient Fireflies
    for (let i = 0; i < 5; i++) {
      const ff = this.add
        .image(Phaser.Math.Between(24, 152), Phaser.Math.Between(24, 152), 'particle_spark')
        .setTint(biome.accent)
        .setAlpha(0.6)
        .setDepth(16);
      this.roomGroup.add(ff);
      this.fireflies.push({
        sprite: ff,
        vx: Phaser.Math.FloatBetween(-10, 10),
        vy: Phaser.Math.FloatBetween(-10, 10),
        phase: Math.random() * 6,
      });
    }

    // Spawn Enemies if room not cleared
    if (!room.cleared && (room.type === 'combat' || room.type === 'hazard' || room.type === 'elite')) {
      const aliveList = room.enemies.filter((e) => e.alive);
      if (aliveList.length > 0) {
        room.doorsLocked = true;
        for (const es of aliveList) {
          this.spawnEnemyEntity(es.uid, es.defId, es.x, es.y, es.hp, es.maxHp, !!es.isElite, false);
        }
      } else {
        room.cleared = true;
        room.doorsLocked = false;
      }
    }

    // Boss Room
    if (room.type === 'boss') {
      if (!room.bossDefeated) {
        room.doorsLocked = true;
        const bossDef = BOSSES[biome.bossId];
        const playerScale = 1 + Math.max(0, net.players.size - 1) * 0.45;
        const bHp = Math.round(bossDef.hp * playerScale);
        this.spawnEnemyEntity('boss', bossDef.id, 128, 88, bHp, bHp, false, true);
        this.ui.showToast(`${bossDef.name}: ${bossDef.subtitle}`, '#ff75c3');
        SoundSystem.setMusicTrack('boss');
      } else {
        this.spawnExitPortal();
        SoundSystem.setMusicTrack('normal');
      }
    } else {
      SoundSystem.setMusicTrack('normal');
    }

    // Special Room Objects
    if (room.type === 'merchant') {
      this.specialObjs.merchant = this.add.image(88, 76, 'obj_merchant').setDepth(6);
      this.roomGroup.add(this.specialObjs.merchant);
    } else if (room.type === 'healing') {
      this.specialObjs.shrine = this.add.image(88, 84, 'obj_shrine').setDepth(6);
      if (room.healingUsed) this.specialObjs.shrine.setAlpha(0.45);
      this.roomGroup.add(this.specialObjs.shrine);
    } else if (room.type === 'event') {
      this.specialObjs.altar = this.add.image(88, 84, 'obj_altar').setDepth(6);
      if (room.eventUsed) this.specialObjs.altar.setAlpha(0.45);
      this.roomGroup.add(this.specialObjs.altar);
    } else if (room.type === 'puzzle') {
      if (room.puzzleObstacles) {
        for (const obs of room.puzzleObstacles) {
          const ox = obs.tx * 16 + 8;
          const oy = obs.ty * 16 + 8;
          gfx.fillStyle(biome.wallDark, 1);
          gfx.fillRect(obs.tx * 16, obs.ty * 16, 16, 16);
          gfx.fillStyle(biome.wallTop, 1);
          gfx.fillRect(obs.tx * 16 + 2, obs.ty * 16 + 2, 12, 10);
          gfx.fillStyle(biome.accent, 0.45);
          gfx.fillRect(obs.tx * 16 + 6, obs.ty * 16 + 5, 4, 4);
          const wall = this.add.rectangle(ox, oy, 16, 16, 0x000000, 0);
          this.wallGroup.add(wall);
          this.roomGroup.add(wall);
        }
      }
      if (room.puzzlePlates) {
        for (const pl of room.puzzlePlates) {
          const px = pl.tx * 16 + 8;
          const py = pl.ty * 16 + 8;
          const sp = this.add.image(px, py, pl.activated ? 'obj_plate_lit' : 'obj_plate').setDepth(3);
          const num = addPixelText(this, px, py - 12, `${pl.order}`, 8, 0xffe066, 0.5, 0.5).setDepth(4);
          this.roomGroup.add(sp);
          this.roomGroup.add(num);
          this.specialObjs.plates.push({ id: pl.id, order: pl.order, sprite: sp, x: px, y: py });
        }
      } else if (room.puzzleBeam) {
        const beam = room.puzzleBeam;
        const ex = beam.emitterTx * 16 + 8;
        const ey = beam.emitterTy * 16 + 8;
        const emitter = this.add.image(ex, ey, 'obj_emitter').setDepth(5);
        this.roomGroup.add(emitter);

        const tx = beam.targetTx * 16 + 8;
        const ty = beam.targetTy * 16 + 8;
        const target = this.add.image(tx, ty, room.puzzleSolved ? 'obj_beam_target_lit' : 'obj_beam_target').setDepth(5);
        this.roomGroup.add(target);
        this.specialObjs.beamTarget = target;

        for (const m of beam.mirrors) {
          const mx = m.tx * 16 + 8;
          const my = m.ty * 16 + 8;
          const sp = this.add.image(mx, my, `obj_mirror_${m.orientation}`).setDepth(5);
          this.roomGroup.add(sp);
          this.specialObjs.mirrors.push({ id: m.id, sprite: sp, x: mx, y: my });
        }

        const beamGfx = this.add.graphics().setDepth(4);
        this.roomGroup.add(beamGfx);
        this.specialObjs.beamGfx = beamGfx;
        this.updateMirrorBeam(false);
      } else if (room.puzzleBlock) {
        const bp = room.puzzleBlock;
        for (const g of bp.goals) {
          const gx = g.tx * 16 + 8;
          const gy = g.ty * 16 + 8;
          const gsp = this.add.image(gx, gy, 'obj_block_goal').setDepth(3);
          this.roomGroup.add(gsp);
          this.specialObjs.blockGoals.push({ tx: g.tx, ty: g.ty, sprite: gsp });
        }
        for (const b of bp.blocks) {
          const bx = b.tx * 16 + 8;
          const by = b.ty * 16 + 8;
          const bsp = this.physics.add.sprite(bx, by, 'obj_push_block').setDepth(6);
          bsp.setImmovable(true);
          bsp.setSize(14, 14);
          this.physics.add.collider(this.playerSprite, bsp);
          this.roomGroup.add(bsp);
          this.specialObjs.blocks.push({ id: b.id, sprite: bsp });
        }
        const rx = bp.resetTx * 16 + 8;
        const ry = bp.resetTy * 16 + 8;
        const rsp = this.add.image(rx, ry, 'obj_reset_rune').setDepth(3);
        const rlbl = addPixelText(this, rx, ry - 12, 'RST', 8, 0xff75c3, 0.5, 0.5).setDepth(4);
        this.roomGroup.add(rsp);
        this.roomGroup.add(rlbl);
        this.specialObjs.resetRune = { sprite: rsp, x: rx, y: ry };
        this.refreshBlockGoalVisuals();
      }
    }

    // Spawn Room Loot
    for (const l of room.loot) {
      if (l.collected) continue;
      this.createLootObject(l.uid, l.kind, l.x, l.y, l.itemId, l.amount, l.uses);
    }

    this.updateDoorVisuals();
  }

  private spawnExitPortal(): void {
    if (this.specialObjs.portal) return;
    const portal = this.add.image(88, 88, 'obj_portal').setDepth(5);
    const glow = this.add.image(88, 88, 'glow_soft').setScale(1.8).setTint(0x66ffd9).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
    this.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
    this.specialObjs.portal = portal;
    this.roomGroup.add(portal);
    this.roomGroup.add(glow);
  }

  private createLootObject(
    uid: string,
    kind: 'shard' | 'item' | 'heart' | 'chest',
    x: number,
    y: number,
    itemId?: string,
    amount?: number,
    uses?: number
  ): void {
    if (this.lootObjs.some((l) => l.uid === uid)) return;
    let key = 'item_shard';
    if (kind === 'heart') key = 'item_heart';
    else if (kind === 'chest') key = 'obj_chest_closed';
    else if (kind === 'item' && itemId) key = `item_${itemId}`;

    const sp = this.add.image(x, y, this.textures.exists(key) ? key : 'item_shard').setDepth(6);
    this.roomGroup.add(sp);
    this.lootObjs.push({ uid, kind, sprite: sp, itemId, uses, amount, collected: false });
  }

  private spawnRoomLoot(
    uid: string,
    kind: 'shard' | 'item' | 'heart' | 'chest',
    x: number,
    y: number,
    itemId?: string,
    amount?: number,
    uses?: number,
    broadcast = true
  ): void {
    const cx = Phaser.Math.Clamp(Math.round(x), 24, 152);
    const cy = Phaser.Math.Clamp(Math.round(y), 24, 152);
    if (!this.currentRoom.loot.some((l) => l.uid === uid)) {
      this.currentRoom.loot.push({
        uid,
        kind,
        x: cx,
        y: cy,
        itemId,
        amount,
        uses,
        collected: false,
      });
    }
    if (!this.lootObjs.some((l) => l.uid === uid)) {
      this.createLootObject(uid, kind, cx, cy, itemId, amount, uses);
    }
    if (broadcast && net.mode !== 'solo') {
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'drop',
        targetId: uid,
        lootKind: kind,
        itemId,
        amount,
        uses,
        x: cx,
        y: cy,
      });
    }
  }

  private destroyCrateByKey(crateKey: string, spawnParticles = true): void {
    this.crateGroup.getChildren().forEach((c) => {
      const cs = c as Phaser.Physics.Arcade.Sprite;
      if (cs.active && cs.getData('crateKey') === crateKey) {
        if (spawnParticles) this.spawnParticles(cs.x, cs.y, 0xb08968, 5);
        cs.destroy();
      }
    });
  }

  private spawnPersistentFloorItem(itemId: string, x: number, y: number, uses?: number): void {
    const uid = `drop_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    this.spawnRoomLoot(uid, 'item', x, y, itemId, undefined, uses, true);
  }

  private spawnEnemyEntity(
    uid: string,
    defId: string,
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    isElite: boolean,
    isBoss: boolean
  ): void {
    const def = isBoss ? BOSSES[defId] : ENEMIES[defId];
    if (!def) return;
    if (isBoss) JournalSystem.discoverBoss(defId);
    else JournalSystem.discoverEnemy(defId);
    const sprite = this.physics.add.sprite(x, y, def.spriteKey, 0).setDepth(9);
    if (isElite) {
      sprite.setScale(1.35);
      sprite.setTint(0xffd275);
    }
    sprite.setCollideWorldBounds(true);
    this.physics.add.collider(sprite, this.wallGroup);
    this.physics.add.collider(sprite, this.crateGroup);
    this.roomGroup.add(sprite);

    const mod = this.floor.modifier;
    let speed = def.speed;
    if (mod === 'mischievous_spirits') speed *= 1.15;
    if (mod === 'sleepy_night') speed *= 0.85;

    let shieldOrbs: Phaser.GameObjects.Image[] | undefined;
    if (isBoss && defId === 'crystal_guardian') {
      shieldOrbs = [];
      for (let i = 0; i < 3; i++) {
        const orb = this.add.image(x, y, 'obj_crystal_shield').setDepth(10);
        if (i >= 2) orb.setVisible(false);
        this.roomGroup.add(orb);
        shieldOrbs.push(orb);
      }
    }

    this.activeEnemies.push({
      uid,
      defId,
      sprite,
      hp,
      maxHp,
      speed,
      damage: def.damage + (mod === 'greedy_shadows' ? 1 : 0),
      behavior: isBoss ? 'boss' : (def as typeof ENEMIES[string]).behavior,
      isElite,
      isBoss,
      aiTimerMs: Phaser.Math.Between(300, 900),
      attackCooldownMs: isBoss ? 1400 : (def as typeof ENEMIES[string]).attackCooldownMs ?? 2000,
      windupMs: 0,
      idleMs: 0,
      dashingMs: 0,
      dashVx: 0,
      dashVy: 0,
      slowedMs: 0,
      bubbledMs: 0,
      burningMs: 0,
      burnTickMs: 0,
      hitFlashMs: 0,
      phase: 1,
      shieldOrbs,
      shieldAngle: 0,
    });
  }

  private updateDoorVisuals(): void {
    for (const d of this.doorZones) {
      d.gfx.setFillStyle(this.currentRoom.doorsLocked ? 0xff5d8f : 0x66ffd9, this.currentRoom.doorsLocked ? 0.45 : 0.25);
    }
  }

  private handlePrimaryAttack(): void {
    if (this.attackCooldownMs > 0 || this.dodgeMs > 0) return;
    const item = this.playerState.inventory[this.playerState.activeSlot];
    const angle = isMobileMode()
      ? mobileInput.dpadActive || mobileInput.dpadDirX !== 0 || mobileInput.dpadDirY !== 0
        ? mobileInput.dpadAngle
        : this.playerState.aimAngle
      : Phaser.Math.Angle.Between(
          this.playerSprite.x,
          this.playerSprite.y,
          this.input.activePointer.worldX,
          this.input.activePointer.worldY
        );
    this.playerState.aimAngle = angle;

    if (item && item.category === 'consumable') {
      this.attackCooldownMs = 250;
      this.useConsumable(this.playerState.activeSlot);
      return;
    }

    if (item && item.category === 'weapon') {
      const w = WEAPONS[item.id];
      if (w.staminaCost > 0) {
        if (this.playerState.stamina < w.staminaCost) {
          this.ui.showToast('Not enough stamina!', '#ff5d8f');
          return;
        }
        this.playerState.stamina -= w.staminaCost;
      }
      this.attackCooldownMs = w.cooldownMs;
      this.spawnWeaponAttack(this.playerSprite.x, this.playerSprite.y, angle, w.id, this.playerState.id, true);
      net.broadcastAttack({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        x: this.playerSprite.x,
        y: this.playerSprite.y,
        angle,
        weaponId: w.id,
      });

      // Ranged / magic weapons consume 1 charge on fire
      const isMeleeStyle = [
        'melee_arc',
        'heavy_slam',
        'heavy_sword',
        'echo_blade',
        'whip_pull',
        'spin_flail',
        'honey_slam',
        'frost_blade',
        'venom_blade',
      ].includes(w.style);
      if (!isMeleeStyle) {
        const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
        if (broke) {
          SoundSystem.playBreak();
          this.ui.showToast(`${w.name} broke!`, '#ffe066');
        }
      }
    } else {
      // Unarmed light spark so player is never helpless
      this.attackCooldownMs = 300;
      this.spawnWeaponAttack(this.playerSprite.x, this.playerSprite.y, angle, 'unarmed', this.playerState.id, true);
    }
  }

  private handleSecondaryAction(): void {
    const item = this.playerState.inventory[this.playerState.activeSlot];
    if (!item || item.category !== 'consumable') return;
    this.useConsumable(this.playerState.activeSlot);
  }

  private getAimAngle(): number {
    if (!isMobileMode()) {
      const ptr = this.input.activePointer;
      if (ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        return Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, wp.x, wp.y);
      }
    }
    return this.playerState.aimAngle;
  }

  private isPointInSolidWall(x: number, y: number): boolean {
    if (x < 22 || x > 154 || y < 22 || y > 154) return true;
    for (const obj of this.wallGroup.getChildren()) {
      const w = obj as Phaser.GameObjects.Rectangle;
      if (Math.abs(x - w.x) < 13 && Math.abs(y - w.y) < 13) return true;
    }
    for (const obj of this.crateGroup.getChildren()) {
      const c = obj as Phaser.Physics.Arcade.Sprite;
      if (c.active && Math.abs(x - c.x) < 13 && Math.abs(y - c.y) < 13) return true;
    }
    for (const b of this.specialObjs.blocks) {
      if (b.sprite.active && Math.abs(x - b.sprite.x) < 13 && Math.abs(y - b.sprite.y) < 13) return true;
    }
    return false;
  }

  private useConsumable(slotIdx: number): void {
    const item = this.playerState.inventory[slotIdx];
    if (!item || item.category !== 'consumable') return;

    const modMult = this.floor.modifier === 'lunar_bloom' ? 1.5 : 1;

    if (item.id === 'heartdew_potion') {
      const heal = Math.round(4 * modMult);
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + heal);
      SoundSystem.playHeal();
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xff5d8f, 8);
      this.ui.showToast(`+${heal} HP!`, '#ff5d8f');
    } else if (item.id === 'fairy_dust') {
      this.playerState.stamina = Math.min(this.playerState.maxStamina, this.playerState.stamina + 2);
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'moonblessed', 10000);
      SoundSystem.playHeal();
      this.ui.showToast('Moonblessed & +2 Stamina!', '#66ffd9');
    } else if (item.id === 'moonmilk') {
      this.playerState.shield = Math.min(6, this.playerState.shield + 3);
      SoundSystem.playPickup();
      this.ui.showToast('+3 Moon Shield!', '#70f8ff');
    } else if (item.id === 'starlight_brew') {
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'starward', 15000);
      SoundSystem.playHeal();
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x6ef3ff, 10);
      this.ui.showToast('Starward: Deflecting bolts (15s)!', '#6ef3ff');
    } else if (item.id === 'starlight_flask') {
      this.playerState.hp = this.playerState.maxHp;
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'starward', 15000);
      SoundSystem.playHeal();
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xffe066, 14);
      this.ui.showToast('Full Heal + 15s Starward!', '#ffe066');
    } else if (item.id === 'everheart_elixir') {
      if (!StatusEffectManager.has(this.playerState.statusEffects, 'vitality')) {
        this.playerState.maxHp += 4;
        this.playerState.hp += 4;
      }
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'vitality', 120000);
      SoundSystem.playHeal();
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xff75c3, 12);
      this.ui.showToast('+2 Max Hearts for 2m!', '#ff75c3');
    } else if (item.id === 'star_bomb') {
      this.triggerStarBomb(this.playerSprite.x, this.playerSprite.y);
    } else if (item.id === 'pocket_fireworks') {
      SoundSystem.playShoot();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        this.createPlayerProjectile(this.playerSprite.x, this.playerSprite.y, a, 210, 2, 0xff75c3, false, false, 1, false, false);
      }
    } else if (item.id === 'revive_totem') {
      // Pick the downed ally who has been dead the longest (smallest remaining downedTimerMs)
      const downedAllies = Array.from(this.remotePlayers.values())
        .filter((p) => p.downed)
        .sort((a, b) => a.downedTimerMs - b.downedTimerMs);
      const longestDowned = downedAllies[0];
      if (longestDowned) {
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: longestDowned.gx,
          gy: longestDowned.gy,
          kind: 'revive',
          targetId: longestDowned.id,
          itemId: 'revive_totem',
        });
        if (longestDowned.gx === this.currentRoom.gx && longestDowned.gy === this.currentRoom.gy) {
          this.playRipOutAnimationForRemote(longestDowned.id, 0xffe066);
        }
        SoundSystem.playHeal();
        this.ui.showToast(`Revived ${longestDowned.name}!`, '#ffe066');
      } else {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 4);
        SoundSystem.playHeal();
      }
    } else if (item.id === 'necromancy_altar') {
      const downedAllies = Array.from(this.remotePlayers.values()).filter((p) => p.downed);
      if (downedAllies.length > 0) {
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'revive',
          targetId: 'all',
          itemId: 'necromancy_altar',
        });
        for (const ally of downedAllies) {
          if (ally.gx === this.currentRoom.gx && ally.gy === this.currentRoom.gy) {
            this.playRipOutAnimationForRemote(ally.id, 0xc084fc);
          }
        }
        SoundSystem.playHeal();
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xc084fc, 14);
        this.ui.showToast('Necromancy Altar revived all allies!', '#c084fc');
      } else {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 6);
        SoundSystem.playHeal();
      }
    } else if (item.id === 'lucky_backpack') {
      const hasDownedAlly = Array.from(this.remotePlayers.values()).some((p) => p.downed);
      const bladeStyles = new Set(['melee_arc', 'heavy_sword', 'echo_blade', 'frost_blade', 'venom_blade']);
      const hasBlade = this.playerState.inventory.some(
        (s) => s !== null && s.category === 'weapon' && WEAPONS[s.id] && bladeStyles.has(WEAPONS[s.id].style)
      );

      let grantedId: string;
      if (hasDownedAlly) {
        grantedId = 'revive_totem';
      } else if (this.playerState.hp <= 4) {
        grantedId = 'heartdew_potion';
      } else if (!hasBlade) {
        const blades = Object.values(WEAPONS)
          .filter((w) => (w.rarity === 'common' || w.rarity === 'uncommon') && bladeStyles.has(w.style))
          .map((w) => w.id);
        grantedId = blades[Math.floor(Math.random() * blades.length)] ?? 'moonblade';
      } else {
        const pool = [
          ...Object.values(WEAPONS).filter((w) => (w.rarity === 'common' || w.rarity === 'uncommon') && !w.merchantOnly),
          ...Object.values(CONSUMABLES).filter((c) => (c.rarity === 'common' || c.rarity === 'uncommon') && !c.merchantOnly),
          ...Object.values(ARTIFACTS).filter((a) => (a.rarity === 'common' || a.rarity === 'uncommon') && !a.merchantOnly),
        ].map((x) => x.id);
        grantedId = pool[Math.floor(Math.random() * pool.length)] ?? 'heartdew_potion';
      }

      consumeUse(this.playerState.inventory, slotIdx, 1);
      const granted = createItemInstance(grantedId);
      if (granted) {
        addItemToSlots(this.playerState.inventory, slotIdx, granted);
        SoundSystem.playUnlock();
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xffe066, 12);
        this.ui.showToast(`Lucky Backpack: ${granted.name}!`, '#ffe066');
      }
      return;
    } else if (item.id === 'blink_scroll') {
      const aimAngle = this.getAimAngle();
      let destX = this.playerSprite.x;
      let destY = this.playerSprite.y;
      for (let dist = 4; dist <= 68; dist += 4) {
        const cx = this.playerSprite.x + Math.cos(aimAngle) * dist;
        const cy = this.playerSprite.y + Math.sin(aimAngle) * dist;
        if (this.isPointInSolidWall(cx, cy)) break;
        destX = cx;
        destY = cy;
      }
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xc084fc, 10);
      this.playerSprite.setPosition(destX, destY);
      this.invulnMs = Math.max(this.invulnMs, 350);
      this.spawnParticles(destX, destY, 0x6ef3ff, 12);
      SoundSystem.playPickup();
      this.ui.showToast('Blink!', '#c084fc');
    } else if (item.id === 'grappling_hook') {
      const aimAngle = this.getAimAngle();
      let bestEnemy: ActiveEnemy | null = null;
      let bestScore = Infinity;
      for (const e of this.activeEnemies) {
        if (!e.sprite.active) continue;
        const d = Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
        if (d > 140 || d < 14) continue;
        const a = Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(a - aimAngle));
        if (diff < 0.7 && d + diff * 40 < bestScore) {
          bestScore = d + diff * 40;
          bestEnemy = e;
        }
      }
      const targetAngle = bestEnemy
        ? Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, bestEnemy.sprite.x, bestEnemy.sprite.y)
        : aimAngle;
      const maxPull = bestEnemy
        ? Math.max(12, Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, bestEnemy.sprite.x, bestEnemy.sprite.y) - 10)
        : 76;
      let destX = this.playerSprite.x;
      let destY = this.playerSprite.y;
      for (let step = 12; step <= maxPull; step += 8) {
        const cx = Phaser.Math.Clamp(this.playerSprite.x + Math.cos(targetAngle) * step, 20, 156);
        const cy = Phaser.Math.Clamp(this.playerSprite.y + Math.sin(targetAngle) * step, 20, 156);
        if (this.isPointInSolidWall(cx, cy)) break;
        destX = cx;
        destY = cy;
      }
      const hookGfx = this.add.graphics().setDepth(12);
      hookGfx.lineStyle(2, 0xcbd5e1, 0.9);
      hookGfx.lineBetween(this.playerSprite.x, this.playerSprite.y, destX, destY);
      this.time.delayedCall(140, () => hookGfx.destroy());

      this.invulnMs = Math.max(this.invulnMs, 400);
      this.tweens.add({
        targets: this.playerSprite,
        x: destX,
        y: destY,
        duration: 110,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (bestEnemy?.sprite.active) {
            this.damageEnemy(bestEnemy, 2, targetAngle);
          }
        },
      });
      SoundSystem.playSwing();
      this.ui.showToast(bestEnemy ? 'Grapple Slam!' : 'Grappled!', '#cbd5e1');
    } else if (item.id === 'gravity_jar') {
      const cx = this.playerSprite.x;
      const cy = this.playerSprite.y;
      this.spawnParticles(cx, cy, 0x7c3aed, 16);
      SoundSystem.playUnlock();
      this.cameras.main.shake(100, 0.008);
      for (const e of this.activeEnemies) {
        if (!e.sprite.active || e.isBoss) continue;
        const a = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, cx, cy);
        const d = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, cx, cy);
        const pull = Math.max(0, Math.min(54, d - 18));
        const nx = Phaser.Math.Clamp(e.sprite.x + Math.cos(a) * pull, 22, 154);
        const ny = Phaser.Math.Clamp(e.sprite.y + Math.sin(a) * pull, 22, 154);
        if (!this.isPointInSolidWall(nx, ny)) {
          e.sprite.setPosition(nx, ny);
        }
        e.slowedMs = Math.max(e.slowedMs, 3500);
      }
      this.ui.showToast('Gravity Jar pulled foes in!', '#c084fc');
    } else if (item.id === 'chaos_dice') {
      const roll = Math.floor(Math.random() * 4);
      if (roll === 0) {
        let converted = 0;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
          const p = this.projectiles[i];
          if (!p.fromPlayer) {
            this.spawnParticles(p.sprite.x, p.sprite.y, 0x66ffd9, 4);
            p.sprite.destroy();
            this.projectiles.splice(i, 1);
            converted++;
          }
        }
        if (converted > 0) this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 1);
        SoundSystem.playHeal();
        this.ui.showToast('Chaos: Bullets vanished!', '#66ffd9');
      } else if (roll === 1) {
        SoundSystem.playShoot();
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          this.createPlayerProjectile(this.playerSprite.x, this.playerSprite.y, a, 195, 2, 0xffe066, false, false, 2, false, false);
        }
        this.ui.showToast('Chaos: Bouncing Barrage!', '#ffe066');
      } else if (roll === 2) {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 3);
        StatusEffectManager.addEffect(this.playerState.statusEffects, 'moonblessed', 10000);
        SoundSystem.playHeal();
        this.ui.showToast('Chaos: +3 HP & Moonblessed!', '#ff75c3');
      } else {
        const target = this.activeEnemies.find((e) => e.sprite.active);
        if (target) {
          this.spawnParticles(target.sprite.x, target.sprite.y, 0x6ef3ff, 14);
          this.damageEnemy(target, 7);
        }
        SoundSystem.playExplosion();
        this.ui.showToast('Chaos: Arcane Lightning!', '#6ef3ff');
      }
    } else if (item.id === 'decoy_plush') {
      const dx = this.playerSprite.x;
      const dy = this.playerSprite.y;
      const decoy = this.add.image(dx, dy, 'item_decoy_plush').setDepth(7);
      this.roomGroup.add(decoy);
      this.tweens.add({ targets: decoy, scale: 1.25, duration: 250, yoyo: true, repeat: 5 });
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'featherlight', 4000);
      SoundSystem.playPickup();
      this.ui.showToast('Decoy Plush armed (3s)!', '#f49ac1');
      this.time.delayedCall(2600, () => {
        if (decoy.active) {
          const ex = decoy.x;
          const ey = decoy.y;
          decoy.destroy();
          this.triggerStarBomb(ex, ey);
        }
      });
    } else if (item.id === 'titan_shroom') {
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'giant', 8000);
      SoundSystem.playUnlock();
      this.cameras.main.shake(120, 0.01);
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xff9f1c, 14);
      this.ui.showToast('TITAN MODE! Stomp enemies (8s)!', '#ff9f1c');
    } else if (item.id === 'chrono_hourglass') {
      for (const e of this.activeEnemies) {
        if (!e.sprite.active) continue;
        if (e.isBoss) {
          e.slowedMs = Math.max(e.slowedMs, 5000);
        } else {
          e.bubbledMs = Math.max(e.bubbledMs, 5000);
        }
        this.spawnParticles(e.sprite.x, e.sprite.y, 0x6ef3ff, 6);
      }
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'sparkling', 5000);
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'moonblessed', 5000);
      SoundSystem.playUnlock();
      this.ui.showToast('Time Frozen for 5s!', '#6ef3ff');
    } else if (item.id === 'swap_orb') {
      let nearest: ActiveEnemy | null = null;
      let minD = Infinity;
      for (const e of this.activeEnemies) {
        if (!e.sprite.active || e.isBoss) continue;
        const d = Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
        if (d < minD) {
          minD = d;
          nearest = e;
        }
      }
      if (nearest) {
        const ox = this.playerSprite.x;
        const oy = this.playerSprite.y;
        const tx = Phaser.Math.Clamp(nearest.sprite.x, 20, 156);
        const ty = Phaser.Math.Clamp(nearest.sprite.y, 20, 156);
        this.playerSprite.setPosition(tx, ty);
        nearest.sprite.setPosition(ox, oy);
        this.invulnMs = Math.max(this.invulnMs, 450);
        this.spawnParticles(tx, ty, 0x6ef3ff, 10);
        this.spawnParticles(ox, oy, 0xf49ac1, 10);
        this.damageEnemy(nearest, 3);
        SoundSystem.playPickup();
        this.ui.showToast('Swapped & Shocked!', '#6ef3ff');
      } else {
        const nx = 176 - this.playerSprite.x;
        const ny = 176 - this.playerSprite.y;
        if (!this.isPointInSolidWall(nx, ny)) this.playerSprite.setPosition(nx, ny);
        this.invulnMs = Math.max(this.invulnMs, 400);
        SoundSystem.playPickup();
        this.ui.showToast('Warped!', '#6ef3ff');
      }
    } else if (item.id === 'disco_prism') {
      SoundSystem.playShoot();
      const colors = [0xff5d8f, 0xffe066, 0x66ffd9, 0x6ef3ff, 0xc084fc];
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        this.createPlayerProjectile(
          this.playerSprite.x,
          this.playerSprite.y,
          a,
          200,
          2,
          colors[i % colors.length],
          false,
          false,
          2,
          false,
          false
        );
      }
      this.ui.showToast('Disco Prism!', '#ffe066');
    } else if (item.id === 'meteor_whistle') {
      SoundSystem.playPickup();
      this.ui.showToast('Meteors incoming!', '#ff6b35');
      for (let m = 0; m < 3; m++) {
        this.time.delayedCall(250 + m * 350, () => {
          const alive = this.activeEnemies.filter((e) => e.sprite.active);
          const target = alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
          const mx = target ? target.sprite.x : Phaser.Math.Between(36, 140);
          const my = target ? target.sprite.y : Phaser.Math.Between(36, 140);
          SoundSystem.playExplosion();
          this.cameras.main.shake(120, 0.011);
          this.spawnParticles(mx, my, 0xff6b35, 16);
          for (const e of [...this.activeEnemies]) {
            if (e.sprite.active && Phaser.Math.Distance.Between(mx, my, e.sprite.x, e.sprite.y) <= 44) {
              this.damageEnemy(e, 6);
            }
          }
        });
      }
    }

    consumeUse(this.playerState.inventory, slotIdx, 1);
  }

  private triggerStarBomb(x: number, y: number): void {
    SoundSystem.playExplosion();
    this.cameras.main.shake(140, 0.012);
    this.spawnParticles(x, y, 0xffe066, 16);

    for (const e of this.activeEnemies) {
      if (Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) <= 68) {
        this.damageEnemy(e, 5);
      }
    }

    // Reveal adjacent secret walls if near them
    let revealed = false;
    if (this.currentRoom.connections.secretNorth && y < 44 && !this.currentRoom.secretRevealed) {
      this.currentRoom.secretRevealed = true;
      revealed = true;
    }
    if (this.currentRoom.connections.secretSouth && y > 132 && !this.currentRoom.secretRevealed) {
      this.currentRoom.secretRevealed = true;
      revealed = true;
    }
    if (this.currentRoom.connections.secretWest && x < 44 && !this.currentRoom.secretRevealed) {
      this.currentRoom.secretRevealed = true;
      revealed = true;
    }
    if (this.currentRoom.connections.secretEast && x > 132 && !this.currentRoom.secretRevealed) {
      this.currentRoom.secretRevealed = true;
      revealed = true;
    }
    if (revealed) {
      SoundSystem.playUnlock();
      this.ui.showToast('Secret passage opened!', '#ffe066');
      this.loadRoom(this.currentRoom.gx, this.currentRoom.gy, this.playerSprite.x, this.playerSprite.y);
    }
  }

  private spawnWeaponAttack(
    x: number,
    y: number,
    angle: number,
    weaponId: string,
    ownerId: string,
    isLocal: boolean
  ): void {
    const w = WEAPONS[weaponId];
    const isMeleeStyle =
      weaponId === 'unarmed' ||
      (w &&
        [
          'melee_arc',
          'heavy_slam',
          'heavy_sword',
          'echo_blade',
          'whip_pull',
          'spin_flail',
          'honey_slam',
          'frost_blade',
          'venom_blade',
        ].includes(w.style));

    if (isMeleeStyle) {
      const dmg = w ? w.damage : 1;
      const range = w ? w.range : 26;
      const isHeavy = w?.style === 'heavy_slam' || w?.style === 'heavy_sword';
      const cutsProjectiles = w?.style === 'heavy_sword';
      const isSpin = w?.style === 'spin_flail';
      SoundSystem.playSwing();

      // Visual 16-bit slash arc (360 centered on player for flail)
      const sx = isSpin ? x : x + Math.cos(angle) * 16;
      const sy = isSpin ? y : y + Math.sin(angle) * 16;
      const slash = this.add.circle(sx, sy, isSpin ? range * 0.75 : isHeavy ? 20 : 13, w ? w.color : 0xffffff, 0.5).setDepth(12);
      this.tweens.add({ targets: slash, scale: 1.35, alpha: 0, duration: cutsProjectiles ? 220 : 150, onComplete: () => slash.destroy() });

      if (cutsProjectiles) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
          const p = this.projectiles[i];
          if (!p.fromPlayer && p.sprite.active) {
            const pd = Phaser.Math.Distance.Between(sx, sy, p.sprite.x, p.sprite.y);
            if (pd <= range) {
              this.spawnParticles(p.sprite.x, p.sprite.y, 0xffd275, 4);
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
            }
          }
        }
      }

      if (isLocal) {
        let hitAny = false;
        for (const e of [...this.activeEnemies]) {
          const dist = Phaser.Math.Distance.Between(sx, sy, e.sprite.x, e.sprite.y);
          if (dist <= range) {
            if (w?.style === 'frost_blade' || w?.style === 'honey_slam') {
              e.slowedMs = 3000;
            }
            if (w?.style === 'venom_blade') {
              e.burningMs = 3000;
              e.burnTickMs = 0;
            }
            if (w?.style === 'whip_pull' && !e.isBoss) {
              const pullA = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, x, y);
              e.sprite.x += Math.cos(pullA) * 14;
              e.sprite.y += Math.sin(pullA) * 14;
            }
            this.damageEnemy(e, dmg, isHeavy ? angle : undefined);
            hitAny = true;
          }
        }
        if (hitAny && w) {
          const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
          if (broke) {
            SoundSystem.playBreak();
            this.ui.showToast(`${w.name} broke!`, '#ffe066');
          }
        }

        // Echo Dagger repeats the slash after 220ms
        if (w?.style === 'echo_blade') {
          this.time.delayedCall(220, () => {
            if (!this.playerSprite.active) return;
            const ex = this.playerSprite.x + Math.cos(angle) * 16;
            const ey = this.playerSprite.y + Math.sin(angle) * 16;
            const echoSlash = this.add.circle(ex, ey, 13, 0xc084fc, 0.45).setDepth(12);
            this.tweens.add({ targets: echoSlash, scale: 1.3, alpha: 0, duration: 140, onComplete: () => echoSlash.destroy() });
            for (const e of [...this.activeEnemies]) {
              if (e.sprite.active && Phaser.Math.Distance.Between(ex, ey, e.sprite.x, e.sprite.y) <= range) {
                this.damageEnemy(e, dmg);
              }
            }
          });
        }

        // Smash crates
        this.crateGroup.getChildren().forEach((c) => {
          const cs = c as Phaser.Physics.Arcade.Sprite;
          if (cs.active && Phaser.Math.Distance.Between(sx, sy, cs.x, cs.y) <= range) {
            const ck = cs.getData('crateKey') as string | undefined;
            if (ck) {
              if (!this.currentRoom.brokenCrates) this.currentRoom.brokenCrates = [];
              if (!this.currentRoom.brokenCrates.includes(ck)) {
                this.currentRoom.brokenCrates.push(ck);
              }
              net.broadcastInteract({
                peerId: this.playerState.id,
                gx: this.currentRoom.gx,
                gy: this.currentRoom.gy,
                kind: 'crate',
                targetId: ck,
              });
            }
            this.spawnParticles(cs.x, cs.y, 0xb08968, 5);
            if (Math.random() < 0.4) {
              const uid = `cr_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
              this.spawnRoomLoot(uid, 'shard', cs.x, cs.y, undefined, 1);
            }
            cs.destroy();
          }
        });
      }
      return;
    }

    if (!w) return;
    SoundSystem.playShoot();
    const speedMult =
      (this.floor.modifier === 'wild_magic' ? 1.2 : 1) *
      StatusEffectManager.getProjectileSpeedMultiplier(this.playerState.statusEffects);
    const spd = (w.projectileSpeed ?? 200) * speedMult;

    if (w.style === 'prism_bounce') {
      for (const offset of [-0.22, 0, 0.22]) {
        this.createPlayerProjectile(x, y, angle + offset, spd, w.damage, w.color, false, false, 1, false, false, ownerId);
      }
    } else if (w.style === 'fan_spread') {
      const offsets = w.id === 'spark_wand' ? [-0.12, 0.12] : [-0.24, 0, 0.24];
      for (const offset of offsets) {
        this.createPlayerProjectile(x, y, angle + offset, spd, w.damage, w.color, false, false, 0, false, false, ownerId);
      }
    } else if (w.style === 'flamethrower') {
      const flameColors = [0xff4500, 0xff6b35, 0xff9f1c, 0xffe066];
      const offsets = [-0.24, -0.08, 0.08, 0.24];
      for (let i = 0; i < offsets.length; i++) {
        const jitter = (Math.random() - 0.5) * 0.08;
        this.createPlayerProjectile(
          x,
          y,
          angle + offsets[i] + jitter,
          spd * (0.9 + Math.random() * 0.2),
          w.damage,
          flameColors[i % flameColors.length],
          false,
          false,
          0,
          false,
          false,
          ownerId,
          true,
          false,
          420
        );
      }
    } else {
      this.createPlayerProjectile(
        x,
        y,
        angle,
        spd,
        w.damage,
        w.color,
        w.style === 'homing_staff',
        w.style === 'boomerang',
        w.style === 'bounce_spore' ? 2 : 0,
        w.style === 'frost_needle',
        w.style === 'bubble',
        ownerId,
        w.style === 'fireball',
        w.style === 'comet_shot'
      );
    }
  }

  private createPlayerProjectile(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: number,
    homing: boolean,
    boomerang: boolean,
    bouncesLeft: number,
    slows: boolean,
    bubbles: boolean,
    ownerId = this.playerState.id,
    burns = false,
    cometBoost = false,
    customLifeMs?: number
  ): void {
    const sp = this.physics.add.sprite(x, y, 'proj_orb').setDepth(11).setTint(color);
    this.projectiles.push({
      uid: `p_${this.playerState.id}_${++this.projSeq}`,
      sprite: sp,
      fromPlayer: true,
      ownerId,
      damage,
      color,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifeMs: customLifeMs ?? (boomerang ? 1200 : 1600),
      homing,
      boomerang,
      returning: false,
      bouncesLeft,
      slows,
      bubbles,
      burns,
      cometBoost,
      startX: x,
      startY: y,
      hitUids: new Set(),
      fromRemoteEvent: ownerId !== this.playerState.id,
    });
  }

  private createEnemyProjectile(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: number,
    burns = false,
    shooterUid?: string
  ): void {
    const sp = this.physics.add.sprite(x, y, 'proj_orb').setDepth(11).setTint(color);
    this.projectiles.push({
      uid: `ep_${++this.projSeq}`,
      sprite: sp,
      fromPlayer: false,
      ownerId: 'enemy',
      shooterUid,
      damage,
      color,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifeMs: 2600,
      homing: false,
      boomerang: false,
      returning: false,
      bouncesLeft: 0,
      slows: false,
      bubbles: false,
      burns,
      hitUids: new Set(),
    });
  }

  private damageEnemy(enemy: ActiveEnemy, dmg: number, knockbackAngle?: number): void {
    if (this.playerState.name === 'ADMIN') {
      dmg = Math.max(dmg, enemy.hp, 9999);
    }
    enemy.hitFlashMs = 120;
    enemy.sprite.setTint(0xffffff);
    SoundSystem.playHit();
    this.spawnParticles(enemy.sprite.x, enemy.sprite.y, 0xf49ac1, 4);

    if (!this.isRoomAuthority()) {
      enemy.hp = Math.max(0, enemy.hp - dmg);
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'enemy_hit',
        targetId: enemy.uid,
        uses: dmg,
        x: knockbackAngle,
      });
      return;
    }

    enemy.hp -= dmg;
    if (knockbackAngle !== undefined && !enemy.isBoss) {
      enemy.sprite.x += Math.cos(knockbackAngle) * 14;
      enemy.sprite.y += Math.sin(knockbackAngle) * 14;
    }

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: ActiveEnemy): void {
    const ex = enemy.sprite.x;
    const ey = enemy.sprite.y;
    if (enemy.shieldOrbs) {
      for (const orb of enemy.shieldOrbs) orb.destroy();
      enemy.shieldOrbs = undefined;
    }
    enemy.sprite.destroy();
    this.activeEnemies = this.activeEnemies.filter((e) => e !== enemy);
    this.totalEnemiesDefeated++;
    this.spawnParticles(ex, ey, 0xffe066, 10);

    const roomEnemy = this.currentRoom.enemies.find((e) => e.uid === enemy.uid);
    if (roomEnemy) {
      roomEnemy.hp = 0;
      roomEnemy.alive = false;
    }

    if (enemy.isBoss) {
      this.currentRoom.bossDefeated = true;
      this.currentRoom.cleared = true;
      this.currentRoom.doorsLocked = false;
      this.updateDoorVisuals();
      SoundSystem.playUnlock();
      SoundSystem.setMusicTrack('normal');
      this.spawnExitPortal();
      this.spawnRoomLoot(`boss_sh_${Date.now()}`, 'shard', ex - 16, ey, undefined, 12);
      this.spawnRoomLoot(`boss_itm_${Date.now()}`, 'item', ex + 16, ey, rollRandomItemId(new SeededRandom(Date.now())));
      this.triggerStarseed();
      this.reviveLongestDownedOnBossDefeat();
      return;
    }

    const def = ENEMIES[enemy.defId];
    const bonusShard = this.floor.modifier === 'greedy_shadows' ? 1 : 0;
    this.spawnRoomLoot(`sh_${Date.now()}_${Math.random()}`, 'shard', ex, ey, undefined, (def?.shardDrop ?? 2) + bonusShard);
    if (Math.random() < 0.18) {
      this.spawnRoomLoot(`ht_${Date.now()}_${Math.random()}`, 'heart', ex + 8, ey);
    }
    if (enemy.isElite) {
      this.triggerStarseed();
      this.spawnRoomLoot(`el_itm_${Date.now()}`, 'item', ex - 10, ey, rollRandomItemId(new SeededRandom(Date.now())));
    }

    if (this.activeEnemies.length === 0) {
      this.onRoomCleared();
    }
  }

  private triggerStarseed(): void {
    const idx = hasArtifact(this.playerState.inventory, 'starseed');
    if (idx !== -1) {
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 1);
      consumeUse(this.playerState.inventory, idx, 1);
      SoundSystem.playHeal();
      this.ui.showToast('Starseed healed +1 HP!', '#66ffd9');
    }
  }

  private onRoomCleared(): void {
    this.currentRoom.cleared = true;
    this.currentRoom.doorsLocked = false;
    this.updateDoorVisuals();
    SoundSystem.playUnlock();

    const acornIdx = hasArtifact(this.playerState.inventory, 'lucky_acorn');
    if (acornIdx !== -1) {
      this.playerState.shards += 3;
      this.totalShardsCollected += 3;
      consumeUse(this.playerState.inventory, acornIdx, 1);
      this.ui.showToast('Lucky Acorn: +3 Shards!', '#ffe066');
    }
    const crownIdx = hasArtifact(this.playerState.inventory, 'moth_crown');
    if (crownIdx !== -1) {
      consumeUse(this.playerState.inventory, crownIdx, 1);
    }
  }

  private handleInteract(): void {
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;

    // 1. Revive downed ally
    for (const ally of this.remotePlayers.values()) {
      if (ally.downed && ally.gx === this.currentRoom.gx && ally.gy === this.currentRoom.gy) {
        if (Phaser.Math.Distance.Between(px, py, ally.x, ally.y) < 30) {
          net.broadcastInteract({
            peerId: this.playerState.id,
            gx: this.currentRoom.gx,
            gy: this.currentRoom.gy,
            kind: 'revive',
            targetId: ally.id,
          });
          this.playerState.stamina = Math.min(this.playerState.maxStamina, this.playerState.stamina + 1);
          SoundSystem.playHeal();
          this.ui.showToast(`Revived ${ally.name}! (+1 Stamina)`, '#ff75c3');
          return;
        }
      }
    }

    // 2. Loot / Chests
    for (const l of this.lootObjs) {
      if (l.collected) continue;
      if (Phaser.Math.Distance.Between(px, py, l.sprite.x, l.sprite.y) < 26) {
        if (l.kind === 'chest') {
          l.collected = true;
          l.sprite.setTexture('obj_chest_open');
          const roomLoot = this.currentRoom.loot.find((rl) => rl.uid === l.uid);
          if (roomLoot) roomLoot.collected = true;
          net.broadcastInteract({
            peerId: this.playerState.id,
            gx: this.currentRoom.gx,
            gy: this.currentRoom.gy,
            kind: 'pickup',
            targetId: l.uid,
          });
          SoundSystem.playUnlock();
          const rng = new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
          const itemId = rollRandomItemId(rng);
          this.spawnRoomLoot(`ch_itm_${Date.now()}`, 'item', l.sprite.x, l.sprite.y + 14, itemId);
          const extra = this.floor.modifier === 'starfall' ? 6 : 3;
          this.spawnRoomLoot(`ch_sh_${Date.now()}`, 'shard', l.sprite.x - 14, l.sprite.y + 8, undefined, extra);
          return;
        }
        if (l.kind === 'item' && l.itemId) {
          const newItem = createItemInstance(l.itemId);
          if (!newItem) return;
          if (l.uses !== undefined) {
            newItem.uses = Math.max(1, Math.min(newItem.maxUses, l.uses));
          }
          const res = addItemToSlots(this.playerState.inventory, this.playerState.activeSlot, newItem);
          l.collected = true;
          l.sprite.destroy();
          const roomLoot = this.currentRoom.loot.find((rl) => rl.uid === l.uid);
          if (roomLoot) roomLoot.collected = true;
          net.broadcastInteract({
            peerId: this.playerState.id,
            gx: this.currentRoom.gx,
            gy: this.currentRoom.gy,
            kind: 'pickup',
            targetId: l.uid,
          });
          SoundSystem.playPickup();
          this.ui.showToast(`Picked up ${newItem.name}`, '#ffe066');
          if (res.replaced) {
            this.spawnPersistentFloorItem(res.replaced.id, px, py + 10, res.replaced.uses);
          }
          return;
        }
      }
    }

    // 3. Merchant
    if (this.specialObjs.merchant && Phaser.Math.Distance.Between(px, py, 88, 76) < 34 && this.currentRoom.shopStock) {
      this.openMerchantShop();
      return;
    }

    // 4. Healing Shrine
    if (this.specialObjs.shrine && !this.currentRoom.healingUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      this.currentRoom.healingUsed = true;
      this.specialObjs.shrine.setAlpha(0.45);
      const heal = this.floor.modifier === 'lunar_bloom' ? 6 : 4;
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + heal);
      SoundSystem.playHeal();
      this.spawnParticles(88, 84, 0xff5d8f, 10);
      this.ui.showToast(`Shrine restored +${heal} HP!`, '#66ffd9');
      return;
    }

    // 5. Event Altar
    if (this.specialObjs.altar && !this.currentRoom.eventUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      this.triggerEventAltar();
      return;
    }

    // 6. Exit Portal
    if (this.specialObjs.portal && Phaser.Math.Distance.Between(px, py, 88, 88) < 32) {
      this.playerState.inExitReady = true;
      this.tryAdvanceLevel();
      return;
    }

    // 6b. Mirror Rotation (Mirror/Beam Puzzle)
    if (this.currentRoom.type === 'puzzle' && !this.currentRoom.puzzleSolved && this.currentRoom.puzzleBeam) {
      for (const mVis of this.specialObjs.mirrors) {
        if (Phaser.Math.Distance.Between(px, py, mVis.x, mVis.y) < 24) {
          const model = this.currentRoom.puzzleBeam.mirrors.find((m) => m.id === mVis.id);
          if (model) {
            model.orientation = model.orientation === 'slash' ? 'backslash' : 'slash';
            mVis.sprite.setTexture(`obj_mirror_${model.orientation}`);
            SoundSystem.playPickup();
            net.broadcastInteract({
              peerId: this.playerState.id,
              gx: this.currentRoom.gx,
              gy: this.currentRoom.gy,
              kind: 'mirror',
              targetId: model.id,
              uses: model.orientation === 'slash' ? 0 : 1,
            });
            this.updateMirrorBeam(true);
            return;
          }
        }
      }
    }

    // 6c. Reset Blocks (Block-Push Puzzle)
    if (
      this.currentRoom.type === 'puzzle' &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.resetRune &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.resetRune.x, this.specialObjs.resetRune.y) < 26
    ) {
      this.resetPuzzleBlocks(true);
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'block_reset',
      });
      return;
    }

    // 7. Fallback: if no world object is in range and active slot is a consumable, use it with E
    const activeItem = this.playerState.inventory[this.playerState.activeSlot];
    if (activeItem && activeItem.category === 'consumable') {
      this.useConsumable(this.playerState.activeSlot);
    }
  }

  private openMerchantShop(): void {
    const stock = this.currentRoom.shopStock!;
    this.ui.openShop(stock, this.playerState.shards, (idx) => {
      const entry = stock[idx];
      if (!entry || entry.sold) return;
      if (this.playerState.shards < entry.price) {
        this.ui.showToast('Not enough shards!', '#ff5d8f');
        return;
      }
      const newItem = createItemInstance(entry.itemId);
      if (!newItem) return;
      this.playerState.shards -= entry.price;
      entry.sold = true;
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'buy',
        uses: idx,
      });
      const res = addItemToSlots(this.playerState.inventory, this.playerState.activeSlot, newItem);
      if (res.replaced) {
        this.spawnPersistentFloorItem(res.replaced.id, this.playerSprite.x, this.playerSprite.y + 12, res.replaced.uses);
      }
      SoundSystem.playPickup();
      this.ui.showToast(`Bought ${newItem.name}!`, '#66ffd9');
      this.openMerchantShop();
    });
  }

  private triggerEventAltar(): void {
    this.currentRoom.eventUsed = true;
    this.specialObjs.altar?.setAlpha(0.45);
    const kind = this.currentRoom.eventKind ?? 'lore_stone';

    if (kind === 'fairy_circle') {
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'moonblessed', 25000);
      StatusEffectManager.addEffect(this.playerState.statusEffects, 'sparkling', 25000);
      SoundSystem.playHeal();
      this.ui.showToast('Fairy Blessing: Moonblessed & Sparkling!', '#66ffd9');
    } else if (kind === 'wishing_well') {
      if (this.playerState.shards >= 5) {
        this.playerState.shards -= 5;
        const itemId = rollRandomItemId(new SeededRandom(Date.now()));
        this.spawnRoomLoot(`well_${Date.now()}`, 'item', 88, 102, itemId);
        SoundSystem.playPickup();
        this.ui.showToast('Wishing Well granted a gift!', '#ffe066');
      } else {
        this.currentRoom.eventUsed = false;
        this.specialObjs.altar?.setAlpha(1);
        this.ui.showToast('Need 5 shards for Wishing Well', '#b8a1ff');
      }
    } else if (kind === 'cursed_altar') {
      this.playerState.hp = Math.max(1, this.playerState.hp - 2);
      const itemId = rollRandomItemId(new SeededRandom(Date.now()));
      this.spawnRoomLoot(`altar_${Date.now()}`, 'item', 88, 102, itemId);
      SoundSystem.playHit();
      this.ui.showToast('Sacrificed 2 HP for an item!', '#ff75c3');
    } else {
      const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
      this.playerState.shards += 4;
      this.totalShardsCollected += 4;
      SoundSystem.playPickup();
      this.ui.showToast(biome.loreSnippet, '#b8a1ff');
    }
  }

  private dropActiveItem(): void {
    const item = this.playerState.inventory[this.playerState.activeSlot];
    if (!item) return;
    this.playerState.inventory[this.playerState.activeSlot] = null;
    const angle = isMobileMode()
      ? this.playerState.aimAngle
      : Phaser.Math.Angle.Between(
          this.playerSprite.x,
          this.playerSprite.y,
          this.input.activePointer.worldX,
          this.input.activePointer.worldY
        );
    const tx = this.playerSprite.x + Math.cos(angle) * 18;
    const ty = this.playerSprite.y + Math.sin(angle) * 18;
    this.spawnPersistentFloorItem(item.id, tx, ty, item.uses);
    SoundSystem.playSwing();
    this.ui.showToast(`Dropped ${item.name}`, '#b8a1ff');
  }

  private tryAdvanceLevel(): void {
    if (this.transitioningLevel) return;
    if (net.mode === 'client') {
      this.ui.showToast('Waiting for host at portal...', '#66ffd9');
      return;
    }
    if (net.mode === 'host') {
      const allInBoss = Array.from(this.remotePlayers.values())
        .filter((p) => !p.downed)
        .every((p) => p.gx === 5 && p.gy === 2);
      if (!allInBoss) {
        this.ui.showToast('Waiting for teammates in Boss Room!', '#ffe066');
        return;
      }
    }

    this.transitioningLevel = true;
    SoundSystem.playUnlock();

    if (this.levelIndex >= 5) {
      this.scene.stop('UIScene');
      this.scene.start('GameOverScene', {
        victory: true,
        levelReached: 6,
        shardsCollected: this.totalShardsCollected,
        enemiesDefeated: this.totalEnemiesDefeated,
      });
      return;
    }

    const nextLevel = this.levelIndex + 1;
    const nextSeed = getDailySeed(nextLevel);
    if (net.mode === 'host') {
      net.broadcastStart(nextSeed, nextLevel);
    }
    this.scene.restart({
      levelIndex: nextLevel,
      floorSeed: nextSeed,
      carryPlayer: this.playerState,
    });
  }

  private damagePlayer(rawDmg: number): void {
    if (this.playerState.name === 'ADMIN') return;
    if (this.invulnMs > 0 || this.dodgeMs > 0 || this.playerState.downed) return;

    const coreIdx = hasArtifact(this.playerState.inventory, 'everheart_core');
    if (coreIdx !== -1) {
      consumeUse(this.playerState.inventory, coreIdx, 1);
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 2);
      this.invulnMs = 800;
      SoundSystem.playHeal();
      this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xff47b6, 10);
      this.ui.showToast('Everheart Core blocked & healed!', '#ff47b6');
      return;
    }

    const glassIdx = hasArtifact(this.playerState.inventory, 'glass_heart');
    if (glassIdx !== -1) {
      consumeUse(this.playerState.inventory, glassIdx, 1);
      this.invulnMs = 700;
      SoundSystem.playBreak();
      this.ui.showToast('Glass Heart absorbed the hit!', '#a5f3fc');
      return;
    }

    let dmg = rawDmg;
    if (StatusEffectManager.has(this.playerState.statusEffects, 'fragile')) {
      dmg += 1;
    }

    if (this.playerState.shield > 0) {
      const absorbed = Math.min(this.playerState.shield, dmg);
      this.playerState.shield -= absorbed;
      dmg -= absorbed;
    }

    this.playerState.hp = Math.max(0, this.playerState.hp - dmg);
    this.invulnMs = 750;
    SoundSystem.playPlayerHurt();
    this.cameras.main.shake(130, 0.015);
    this.playerSprite.setTint(0xff5d8f);
    this.time.delayedCall(150, () => {
      if (this.playerSprite.active) this.playerSprite.clearTint();
    });

    if (this.playerState.hp <= 0) {
      this.onPlayerZeroHp();
    }
  }

  private onPlayerZeroHp(): void {
    const totemIdx = this.playerState.inventory.findIndex(
      (i) => i?.id === 'revive_totem' || i?.id === 'necromancy_altar'
    );
    if (totemIdx !== -1) {
      const usedItem = this.playerState.inventory[totemIdx]!;
      consumeUse(this.playerState.inventory, totemIdx, 1);
      this.playerState.hp = 6;
      this.invulnMs = 1500;
      SoundSystem.playHeal();
      this.ui.showToast(`${usedItem.name} saved you!`, '#ffe066');
      return;
    }

    if (net.mode === 'solo') {
      this.scene.stop('UIScene');
      this.scene.start('GameOverScene', {
        victory: false,
        levelReached: this.levelIndex + 1,
        shardsCollected: this.totalShardsCollected,
        enemiesDefeated: this.totalEnemiesDefeated,
      });
    } else {
      this.playerState.downed = true;
      this.playerState.downedTimerMs = 20000;
      this.playerSprite.setFrame(5).setDepth(7);
      net.broadcastPlayerState(this.playerState);
      const anyAlive = Array.from(this.remotePlayers.values()).some((p) => !p.downed);
      if (!anyAlive) {
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'game_over',
        });
        this.triggerGameOver(false);
        return;
      }
      this.ui.showToast('You are downed! Ally can revive [E]', '#ff5d8f');
    }
  }

  private triggerGameOver(victory: boolean): void {
    if (this.transitioningLevel) return;
    this.transitioningLevel = true;
    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', {
      victory,
      levelReached: victory ? 6 : this.levelIndex + 1,
      shardsCollected: this.totalShardsCollected,
      enemiesDefeated: this.totalEnemiesDefeated,
    });
  }

  private reviveLongestDownedOnBossDefeat(): void {
    if (net.mode === 'solo') return;

    const downedCandidates: PlayerStateSnapshot[] = [];
    if (this.playerState.downed) {
      downedCandidates.push(this.playerState);
    }
    for (const ally of this.remotePlayers.values()) {
      if (ally.downed) downedCandidates.push(ally);
    }
    if (downedCandidates.length === 0) return;

    downedCandidates.sort((a, b) => a.downedTimerMs - b.downedTimerMs);
    const longestDowned = downedCandidates[0];
    const halfHp = Math.max(1, Math.floor(longestDowned.maxHp / 2));

    if (longestDowned.id === this.playerState.id) {
      this.reviveSelf(halfHp, true, 0x66ffd9);
    } else {
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: longestDowned.gx,
        gy: longestDowned.gy,
        kind: 'revive',
        targetId: longestDowned.id,
        amount: halfHp,
        itemId: 'boss_revive',
      });
      if (longestDowned.gx === this.currentRoom.gx && longestDowned.gy === this.currentRoom.gy) {
        this.playRipOutAnimationForRemote(longestDowned.id, 0x66ffd9);
      }
      this.ui.showToast(`${longestDowned.name} was ripped from the earth!`, '#66ffd9');
    }
  }

  private reviveSelf(hpOverride?: number, ripOutAnim = false, accentColor = 0x66ffd9): void {
    this.playerState.downed = false;
    this.playerState.hp = Math.min(this.playerState.maxHp, hpOverride ?? 4);
    this.invulnMs = 1500;
    this.spectateTargetId = null;
    if (this.currentRoom.gx !== this.playerState.gx || this.currentRoom.gy !== this.playerState.gy) {
      this.loadRoom(this.playerState.gx, this.playerState.gy, this.playerState.x, this.playerState.y);
    }
    if (ripOutAnim) {
      this.respawnAnimMs = 560;
      this.playRipOutAnimation(this.playerSprite, this.playerState.x, this.playerState.y, accentColor, () => {
        this.respawnAnimMs = 0;
      });
    } else {
      this.playerSprite.setFrame(0).setDepth(10).setVisible(true);
      SoundSystem.playHeal();
    }
    net.broadcastPlayerState(this.playerState);
    this.ui.showToast(hpOverride !== undefined ? 'Ripped from the earth! (Half HP)' : 'Revived!', '#66ffd9');
  }

  private playRipOutAnimationForRemote(peerId: string, accentColor: number): void {
    const vis = this.remoteSprites.get(peerId);
    const st = this.remotePlayers.get(peerId);
    if (!vis || !vis.sprite.active || !st) return;

    this.remoteReviveAnimUntil.set(peerId, this.time.now + 580);
    this.playRipOutAnimation(vis.sprite, st.x, st.y, accentColor, () => {
      this.remoteReviveAnimUntil.delete(peerId);
    });
  }

  private playRipOutAnimation(
    sprite: Phaser.GameObjects.Sprite,
    anchorX: number,
    anchorY: number,
    accentColor: number,
    onComplete?: () => void
  ): void {
    SoundSystem.playBreak();
    this.time.delayedCall(160, () => SoundSystem.playHeal());
    this.cameras.main.shake(130, 0.008);

    // Ground crack & mound at the body's resting spot
    const rim = this.add.ellipse(anchorX, anchorY + 7, 18, 8, 0x5c4033, 0.7).setDepth(5);
    const pit = this.add.ellipse(anchorX, anchorY + 7, 12, 5, 0x100d24, 0.92).setDepth(6);
    const ring = this.add.circle(anchorX, anchorY + 5, 4, accentColor, 0.45).setDepth(8);

    this.tweens.add({
      targets: [rim, pit],
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 180,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.tweens.add({
          targets: [rim, pit],
          alpha: 0,
          scaleX: 0.7,
          scaleY: 0.7,
          duration: 360,
          onComplete: () => {
            rim.destroy();
            pit.destroy();
          },
        });
      },
    });

    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });

    // Dirt clods & spectral sparks erupting from the ground
    const dirtColors = [0x5c4033, 0x8b5a2b, 0x3b2618];
    for (let i = 0; i < 10; i++) {
      const isDirt = i < 6;
      const color = isDirt ? dirtColors[i % dirtColors.length] : accentColor;
      const texKey = isDirt ? 'particle_spark' : 'particle_star';
      const p = this.add.image(anchorX + Phaser.Math.Between(-4, 4), anchorY + 6, texKey).setTint(color).setDepth(14);
      const vx = Phaser.Math.Between(-18, 18);
      const peakY = anchorY - Phaser.Math.Between(12, 24);
      this.tweens.add({
        targets: p,
        x: anchorX + vx,
        y: peakY,
        duration: 210,
        ease: 'Cubic.Out',
        onComplete: () => {
          if (!p.active) return;
          this.tweens.add({
            targets: p,
            y: anchorY + Phaser.Math.Between(3, 9),
            alpha: 0,
            duration: 200,
            ease: 'Quad.In',
            onComplete: () => p.destroy(),
          });
        },
      });
    }

    // Yank the body out of the ground: tug -> rip upward -> slam down -> settle
    sprite
      .setVisible(true)
      .setPosition(anchorX, anchorY + 7)
      .setFrame(5)
      .setScale(1.2, 0.35)
      .setTint(0x8b7355)
      .setDepth(12);

    this.tweens.add({
      targets: sprite,
      x: anchorX - 2,
      y: anchorY + 5,
      duration: 60,
      yoyo: true,
      onComplete: () => {
        if (!sprite.active || !sprite.scene) {
          onComplete?.();
          return;
        }
        sprite.setFrame(0).clearTint();
        this.tweens.add({
          targets: sprite,
          x: anchorX,
          y: anchorY - 15,
          scaleX: 0.72,
          scaleY: 1.38,
          duration: 160,
          ease: 'Cubic.Out',
          onComplete: () => {
            if (!sprite.active || !sprite.scene) {
              onComplete?.();
              return;
            }
            this.tweens.add({
              targets: sprite,
              y: anchorY,
              scaleX: 1.25,
              scaleY: 0.78,
              duration: 150,
              ease: 'Quad.In',
              onComplete: () => {
                if (!sprite.active || !sprite.scene) {
                  onComplete?.();
                  return;
                }
                this.spawnParticles(anchorX, anchorY + 6, 0x8b5a2b, 5);
                this.tweens.add({
                  targets: sprite,
                  scaleX: 1,
                  scaleY: 1,
                  duration: 130,
                  ease: 'Back.Out',
                  onComplete: () => {
                    if (sprite.active) {
                      sprite.setPosition(anchorX, anchorY).setScale(1, 1).setDepth(10).clearTint();
                    }
                    onComplete?.();
                  },
                });
              },
            });
          },
        });
      },
    });
  }

  private spawnFireParticles(x: number, y: number, count = 2): void {
    const fireColors = [0xff4500, 0xff6b35, 0xff9f1c, 0xffe066];
    for (let i = 0; i < count; i++) {
      const sx = x + Phaser.Math.FloatBetween(-5, 5);
      const sy = y + Phaser.Math.FloatBetween(-4, 4);
      const color = fireColors[Math.floor(Math.random() * fireColors.length)];
      const p = this.add
        .image(sx, sy, i % 2 === 0 ? 'particle_spark' : 'particle_star')
        .setTint(color)
        .setDepth(14)
        .setAlpha(0.95);
      this.tweens.add({
        targets: p,
        x: sx + Phaser.Math.FloatBetween(-4, 4),
        y: sy - Phaser.Math.FloatBetween(10, 18),
        scale: 0.35,
        alpha: 0,
        duration: Phaser.Math.Between(240, 360),
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnParticles(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, i % 2 === 0 ? 'particle_star' : 'particle_spark').setTint(color).setDepth(14);
      const a = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(10, 26);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        alpha: 0,
        duration: 280,
        onComplete: () => p.destroy(),
      });
    }
  }

  update(time: number, delta: number): void {
    if (isMobileMode() && (this.paused || this.ui.isOverlayOpen())) {
      mobileInput.clearQueuedActions();
    }
    if (this.paused || this.transitioningLevel) return;

    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.invulnMs = Math.max(0, this.invulnMs - delta);
    this.respawnAnimMs = Math.max(0, this.respawnAnimMs - delta);
    this.doorCooldownMs = Math.max(0, this.doorCooldownMs - delta);
    this.plateCooldownMs = Math.max(0, this.plateCooldownMs - delta);
    this.blockPushCooldownMs = Math.max(0, this.blockPushCooldownMs - delta);
    this.giantStompCooldownMs = Math.max(0, this.giantStompCooldownMs - delta);

    // Status effects tick
    const hadVitality = StatusEffectManager.has(this.playerState.statusEffects, 'vitality');
    this.playerState.statusEffects = StatusEffectManager.tick(this.playerState.statusEffects, delta);
    if (hadVitality && !StatusEffectManager.has(this.playerState.statusEffects, 'vitality')) {
      this.playerState.maxHp = Math.max(16, this.playerState.maxHp - 4);
      this.playerState.hp = Math.max(1, Math.min(this.playerState.maxHp, this.playerState.hp - 4));
      this.ui.showToast('Everheart Elixir wore off', '#b8a1ff');
    }
    const isGiant = StatusEffectManager.has(this.playerState.statusEffects, 'giant');
    this.playerSprite.setScale(isGiant ? 1.85 : 1);
    if (isGiant && this.giantStompCooldownMs <= 0 && !this.playerState.downed) {
      for (const e of [...this.activeEnemies]) {
        if (!e.sprite.active) continue;
        const d = Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
        if (d < (e.isBoss ? 24 : 18)) {
          const stompAngle = Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
          this.damageEnemy(e, e.isBoss ? 2 : 4, stompAngle);
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xff9f1c, 8);
          this.cameras.main.shake(90, 0.008);
          this.giantStompCooldownMs = 380;
          break;
        }
      }
    }
    if (StatusEffectManager.has(this.playerState.statusEffects, 'burning')) {
      this.burnFxMs += delta;
      if (this.burnFxMs >= 85) {
        this.burnFxMs = 0;
        this.spawnFireParticles(this.playerSprite.x, this.playerSprite.y, 2);
      }
    } else {
      this.burnFxMs = 0;
    }

    this.statusTickMs += delta;
    if (this.statusTickMs >= 1000) {
      this.statusTickMs = 0;
      if (StatusEffectManager.has(this.playerState.statusEffects, 'burning')) {
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xff6b35, 3);
        this.damagePlayer(1);
      }
      if (StatusEffectManager.has(this.playerState.statusEffects, 'poisoned')) {
        this.damagePlayer(1);
      }
      if (StatusEffectManager.has(this.playerState.statusEffects, 'warmth') && !this.playerState.downed) {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 1);
      }
    }

    // Stamina regeneration (1 per 3s when not dodging)
    if (this.dodgeMs <= 0 && this.playerState.stamina < this.playerState.maxStamina) {
      this.staminaRegenMs += delta;
      if (this.staminaRegenMs >= 3000) {
        this.staminaRegenMs = 0;
        this.playerState.stamina = Math.min(this.playerState.maxStamina, this.playerState.stamina + 1);
      }
    }

    this.updatePlayerMovement(time, delta);
    this.updateEnemies(time, delta);
    this.updateProjectiles(delta);
    this.updateHazardsAndLoot(delta);
    this.updatePuzzlePlates();
    this.updatePuzzleBlocks();
    this.checkDoorTransitions();
    this.updateFireflies(delta);
    this.syncMultiplayer(delta);
    this.pushUIUpdate();
  }

  private updatePlayerMovement(time: number, delta: number): void {
    if (this.playerState.downed) {
      this.playerSprite.setVelocity(0, 0);
      this.playerSprite.setFrame(5).setDepth(7);
      this.playerState.downedTimerMs -= delta;
      const anyAlive = Array.from(this.remotePlayers.values()).some((p) => !p.downed);
      if (!anyAlive) {
        this.triggerGameOver(false);
        return;
      }
      this.updateSpectatorView();
      return;
    }

    if (this.respawnAnimMs > 0) {
      this.playerSprite.setVelocity(0, 0);
      this.playerState.dodging = false;
      return;
    }

    if (this.spikePinnedMs > 0) {
      this.spikePinnedMs = Math.max(0, this.spikePinnedMs - delta);
      this.playerSprite.setVelocity(0, 0);
      this.playerState.dodging = false;
      this.playerState.x = this.playerSprite.x;
      this.playerState.y = this.playerSprite.y;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
    if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
    if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
    if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;

    if (isMobileMode()) {
      if (Math.abs(mobileInput.moveX) > 0.05 || Math.abs(mobileInput.moveY) > 0.05) {
        dx = mobileInput.moveX;
        dy = mobileInput.moveY;
        if (!mobileInput.dpadActive) {
          this.playerState.aimAngle = Math.atan2(dy, dx);
        }
      }
      if (mobileInput.consumeAttack() || mobileInput.isDpadAttackActive()) {
        this.handlePrimaryAttack();
      }
    }

    if (dx !== 0 && dy !== 0) {
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
    }

    // Dodge input
    const wantDodge =
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.shift) ||
      (isMobileMode() && mobileInput.consumeDodge());
    if (wantDodge && this.dodgeMs <= 0) {
      if (this.playerState.stamina >= 1) {
        this.playerState.stamina -= 1;
        this.dodgeMs = 200;
        const dashDirX = dx !== 0 || dy !== 0 ? dx : Math.cos(this.playerState.aimAngle);
        const dashDirY = dx !== 0 || dy !== 0 ? dy : Math.sin(this.playerState.aimAngle);
        const dashSpd = 230 * StatusEffectManager.getDodgeDistanceMultiplier(this.playerState.statusEffects);
        this.dodgeVx = dashDirX * dashSpd;
        this.dodgeVy = dashDirY * dashSpd;
        SoundSystem.playDodge();
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x66ffd9, 5);

        const cometIdx = hasArtifact(this.playerState.inventory, 'tiny_comet');
        if (cometIdx !== -1) {
          consumeUse(this.playerState.inventory, cometIdx, 1);
          this.createPlayerProjectile(
            this.playerSprite.x,
            this.playerSprite.y,
            Math.atan2(-dashDirY, -dashDirX),
            90,
            2,
            0xffe066,
            false,
            false,
            0,
            false,
            false
          );
        }
      }
    }

    if (this.dodgeMs > 0) {
      this.dodgeMs -= delta;
      this.playerSprite.setVelocity(this.dodgeVx, this.dodgeVy);
      this.playerSprite.setFrame(4);
      this.playerState.dodging = true;
    } else {
      this.playerState.dodging = false;
      const modMult = this.floor.modifier === 'enchanted_floors' ? 1.15 : 1;
      const spd = 96 * modMult * StatusEffectManager.getSpeedMultiplier(this.playerState.statusEffects);
      this.playerSprite.setVelocity(dx * spd, dy * spd);
      if (dx !== 0) {
        this.playerState.flipX = dx < 0;
        this.playerSprite.setFlipX(this.playerState.flipX);
      }
      const moving = dx !== 0 || dy !== 0;
      const frame = moving ? (Math.floor(time / 160) % 2 === 0 ? 2 : 3) : Math.floor(time / 380) % 2;
      this.playerSprite.setFrame(frame);
      this.playerState.animState = moving ? 'walk' : 'idle';
    }

    this.playerState.x = this.playerSprite.x;
    this.playerState.y = this.playerSprite.y;

    const hasWard = StatusEffectManager.has(this.playerState.statusEffects, 'starward');
    this.wardRing.setPosition(this.playerSprite.x, this.playerSprite.y).setVisible(hasWard);
  }

  private updateEnemies(time: number, delta: number): void {
    if (!this.isRoomAuthority()) {
      const lerpFactor = 1 - Math.exp(-delta * 0.018);
      for (const e of this.activeEnemies) {
        if (!e.sprite.active) continue;
        e.sprite.setFrame(Math.floor(time / 280) % 2);
        if (e.targetX !== undefined && e.targetY !== undefined) {
          const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, e.targetX, e.targetY);
          if (dist > 48) {
            e.sprite.setPosition(e.targetX, e.targetY);
          } else if (dist > 0.2) {
            e.sprite.setPosition(
              Phaser.Math.Linear(e.sprite.x, e.targetX, lerpFactor),
              Phaser.Math.Linear(e.sprite.y, e.targetY, lerpFactor)
            );
          }
        }
        this.updateCrystalShields(e, delta);
        const playerDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.playerSprite.x, this.playerSprite.y);
        if (playerDist < (e.isBoss ? 20 : 12)) {
          this.damagePlayer(e.damage);
        }
      }
      return;
    }

    const hostX = this.playerSprite.x;
    const hostY = this.playerSprite.y;
    const roomAllies = Array.from(this.remotePlayers.values()).filter(
      (p) => !p.downed && p.gx === this.currentRoom.gx && p.gy === this.currentRoom.gy
    );

    for (const e of [...this.activeEnemies]) {
      if (!e.sprite.active) continue;

      let px = hostX;
      let py = hostY;
      let bestDist = this.playerState.downed
        ? Infinity
        : Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, hostX, hostY);
      for (const ally of roomAllies) {
        const d = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, ally.x, ally.y);
        if (d < bestDist) {
          bestDist = d;
          px = ally.x;
          py = ally.y;
        }
      }

      if (e.hitFlashMs > 0) {
        e.hitFlashMs -= delta;
        if (e.hitFlashMs <= 0) {
          e.sprite.clearTint();
          if (e.isElite) e.sprite.setTint(0xffd275);
        }
      }

      if (e.burningMs > 0) {
        e.burningMs -= delta;
        e.burnTickMs += delta;
        if (e.burnTickMs >= 1000) {
          e.burnTickMs = 0;
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xff6b35, 3);
          this.damageEnemy(e, 1);
          if (!e.sprite.active) continue;
        }
      }

      if (e.bubbledMs > 0) {
        e.bubbledMs -= delta;
        e.sprite.setVelocity(0, 0);
        continue;
      }

      const slowFactor = e.slowedMs > 0 ? 0.5 : 1;
      if (e.slowedMs > 0) e.slowedMs -= delta;

      e.sprite.setFrame(Math.floor(time / 280) % 2);

      const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, px, py);
      const angle = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, px, py);

      // Contact damage against local host player
      const hostDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, hostX, hostY);
      if (hostDist < (e.isBoss ? 20 : 12) && !StatusEffectManager.has(this.playerState.statusEffects, 'giant')) {
        this.damagePlayer(e.damage);
      }

      // Windup / Charge telegraph
      if (e.windupMs > 0) {
        e.windupMs -= delta;
        e.sprite.setVelocity(0, 0);
        if (e.windupMs <= 0) {
          e.dashingMs = 340;
          e.dashVx = Math.cos(angle) * 165 * slowFactor;
          e.dashVy = Math.sin(angle) * 165 * slowFactor;
        }
        continue;
      }

      if (e.dashingMs > 0) {
        e.dashingMs -= delta;
        e.sprite.setVelocity(e.dashVx, e.dashVy);
        if (e.dashingMs <= 0 && e.defId === 'hollow_stag') {
          e.sprite.setVelocity(0, 0);
          e.sprite.clearTint();
          e.idleMs = 3000;
        }
        continue;
      }

      e.aiTimerMs -= delta;
      this.updateCrystalShields(e, delta);

      if (e.isBoss) {
        this.updateBossAI(e, angle, dist, delta, slowFactor);
        continue;
      }

      const spd = e.speed * slowFactor;
      if (e.repositionMs && e.repositionMs > 0) {
        e.repositionMs -= delta;
        const body = e.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) {
          e.repositionDir = -(e.repositionDir ?? 1);
        }
        const flankAngle = angle + (e.repositionDir ?? 1) * 0.55;
        e.sprite.setVelocity(Math.cos(flankAngle) * spd * 1.15, Math.sin(flankAngle) * spd * 1.15);
      } else if (e.behavior === 'chase' || e.behavior === 'shielded') {
        e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      } else if (e.behavior === 'orbit') {
        const orbitAngle = angle + (dist > 85 ? 0.4 : 1.35);
        e.sprite.setVelocity(Math.cos(orbitAngle) * spd, Math.sin(orbitAngle) * spd);
      } else if (e.behavior === 'strafe') {
        const moveA = dist < 70 ? angle + Math.PI : dist > 120 ? angle : angle + Math.PI / 2;
        e.sprite.setVelocity(Math.cos(moveA) * spd, Math.sin(moveA) * spd);
      } else if (e.behavior === 'charge') {
        e.sprite.setVelocity(Math.cos(angle) * spd * 0.6, Math.sin(angle) * spd * 0.6);
        if (e.aiTimerMs <= 0 && dist < 130) {
          e.aiTimerMs = e.attackCooldownMs;
          e.windupMs = 420;
          e.sprite.setTint(0xffe066);
        }
      } else if (e.behavior === 'ambush') {
        if (dist < 110) {
          e.sprite.setVelocity(Math.cos(angle) * spd * 1.15, Math.sin(angle) * spd * 1.15);
        } else {
          e.sprite.setVelocity(0, 0);
        }
      } else if (e.behavior === 'zone') {
        e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      }

      // Ranged / Spore attacks
      const def = ENEMIES[e.defId];
      if (def?.projectileColor && e.aiTimerMs <= 0) {
        e.aiTimerMs = e.attackCooldownMs;
        const burns = e.defId === 'voidling';
        this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 115, e.damage, def.projectileColor, burns, e.uid);
      }
    }

    // Soft boid-style separation so enemies don't stack on the same spot,
    // while still allowing pass-through in tight corridors without getting stuck.
    for (let i = 0; i < this.activeEnemies.length; i++) {
      const a = this.activeEnemies[i];
      if (!a.sprite.active || a.bubbledMs > 0) continue;
      let sepX = 0;
      let sepY = 0;
      for (let j = 0; j < this.activeEnemies.length; j++) {
        if (i === j) continue;
        const b = this.activeEnemies[j];
        if (!b.sprite.active) continue;
        const minDist = a.isBoss || b.isBoss ? 22 : a.isElite || b.isElite ? 17 : 14;
        const dx = a.sprite.x - b.sprite.x;
        const dy = a.sprite.y - b.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
          const strength = ((minDist - d) / minDist) * 58;
          if (d < 0.1) {
            const fallbackA = (i * 2.39996) % (Math.PI * 2);
            sepX += Math.cos(fallbackA) * strength;
            sepY += Math.sin(fallbackA) * strength;
          } else {
            sepX += (dx / d) * strength;
            sepY += (dy / d) * strength;
          }
        }
      }
      if (sepX !== 0 || sepY !== 0) {
        const body = a.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body) {
          a.sprite.setVelocity(body.velocity.x + sepX, body.velocity.y + sepY);
        }
      }
    }
  }

  private updateBossAI(e: ActiveEnemy, angle: number, dist: number, delta: number, slowFactor: number): void {
    const bossDef = BOSSES[e.defId];
    if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
      e.phase = 2;
      this.ui.showToast(`${bossDef.name} enters Phase 2!`, '#ff47b6');
      this.spawnParticles(e.sprite.x, e.sprite.y, bossDef.accentColor, 14);
    }

    // Floor 1 boss: keep original behavior intact
    if (e.defId === 'hollow_stag') {
      if (e.idleMs > 0) {
        e.idleMs -= delta;
        e.sprite.setVelocity(0, 0);
        if (e.idleMs > 0) return;
        e.aiTimerMs = e.phase === 2 ? 1450 : 1850;
        const projDmg = 1;
        const pattern = Math.random();
        if (pattern < 0.45) {
          const bolts = 4;
          const baseAngle = Math.random() < 0.5 ? 0 : Math.PI / 4;
          for (let i = 0; i < bolts; i++) {
            const a = baseAngle + (Math.PI * 2 * i) / bolts;
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, a, 110, projDmg, bossDef.accentColor, false);
          }
        } else if (pattern < 0.8) {
          e.windupMs = 420;
          e.sprite.setTint(0xffe066);
        } else {
          for (const off of [-0.25, 0, 0.25]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 130, projDmg, bossDef.accentColor, false);
          }
        }
        return;
      }

      const spd = e.speed * slowFactor * (e.phase === 2 ? 1.2 : 1);
      e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      if (e.aiTimerMs <= 0) {
        e.idleMs = 1000;
        e.sprite.setVelocity(0, 0);
      }
      return;
    }

    const spd = e.speed * slowFactor * (e.phase === 2 ? 1.22 : 1);
    const step = (e.bossStep ?? 0);

    // Floor 2: Crystal Guardian — orbiting prism turret with rotating rings & fast sniper volleys
    if (e.defId === 'crystal_guardian') {
      const moveAngle = dist < 56 ? angle + Math.PI : dist > 105 ? angle : angle + Math.PI / 2;
      e.sprite.setVelocity(Math.cos(moveAngle) * spd, Math.sin(moveAngle) * spd);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 1000 : 1350;
        if (step % 3 === 0) {
          // Rotating crystal ring
          const bolts = e.phase === 2 ? 10 : 6;
          const rot = step * 0.45;
          for (let i = 0; i < bolts; i++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, rot + (Math.PI * 2 * i) / bolts, 115, e.damage, bossDef.accentColor, false);
          }
        } else if (step % 3 === 1) {
          // Fast aimed twin laser
          for (const off of [-0.1, 0.1]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 175, e.damage, 0xffffff, false);
          }
        } else {
          // 4-way diamond burst aimed at player
          for (const off of [-0.45, -0.15, 0.15, 0.45]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 140, e.damage, bossDef.accentColor, false);
          }
        }
      }
      return;
    }

    // Floor 3: The Mothercap — slow spore sovereign that summons fungal adds & slow drifting spore rings
    if (e.defId === 'mothercap') {
      e.sprite.setVelocity(Math.cos(angle) * spd * 0.55, Math.sin(angle) * spd * 0.55);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 1300 : 1750;
        const minionCount = this.activeEnemies.filter((m) => !m.isBoss && m.hp > 0).length;
        if (step % 3 === 0 && minionCount < 3) {
          const sx = Phaser.Math.Clamp(e.sprite.x + (Math.random() < 0.5 ? -26 : 26), 28, 148);
          const sy = Phaser.Math.Clamp(e.sprite.y + (Math.random() < 0.5 ? -20 : 20), 28, 148);
          const addDef = ENEMIES.mycelium_mite;
          this.spawnEnemyEntity(`boss_add_${Date.now()}_${step}`, 'mycelium_mite', sx, sy, addDef.hp, addDef.hp, false, false);
          this.spawnParticles(sx, sy, bossDef.accentColor, 8);
        } else {
          const bolts = e.phase === 2 ? 12 : 8;
          const offset = (step % 2) * (Math.PI / bolts);
          for (let i = 0; i < bolts; i++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, offset + (Math.PI * 2 * i) / bolts, 85, e.damage, bossDef.accentColor, false);
          }
        }
      }
      return;
    }

    // Floor 4: The Sludge Empress — frequent dash-charges & 5-way acid shotguns
    if (e.defId === 'sludge_empress') {
      e.sprite.setVelocity(Math.cos(angle) * spd * 0.9, Math.sin(angle) * spd * 0.9);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 950 : 1300;
        if (step % 2 === 0) {
          // Fast dash charge + acid splash
          e.windupMs = 260;
          e.sprite.setTint(0xa6ff4d);
          const splash = e.phase === 2 ? 6 : 4;
          for (let i = 0; i < splash; i++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + (Math.PI * 2 * i) / splash, 105, e.damage, bossDef.accentColor, false);
          }
        } else {
          // 5-way wide acid shotgun
          for (const off of [-0.5, -0.25, 0, 0.25, 0.5]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 145, e.damage, bossDef.accentColor, false);
          }
        }
      }
      return;
    }

    // Floor 5: The Clockwork Witch — teleports across quadrants & fires alternating + / x / sweeping arcs
    if (e.defId === 'clockwork_witch') {
      e.sprite.setVelocity(Math.cos(angle) * spd * 0.65, Math.sin(angle) * spd * 0.65);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 1050 : 1400;
        if (step % 3 === 0) {
          // Blink to another corner away from the player
          this.spawnParticles(e.sprite.x, e.sprite.y, bossDef.accentColor, 10);
          const nx = this.playerSprite.x < 88 ? Phaser.Math.Between(108, 144) : Phaser.Math.Between(32, 68);
          const ny = this.playerSprite.y < 88 ? Phaser.Math.Between(108, 144) : Phaser.Math.Between(32, 68);
          e.sprite.setPosition(nx, ny);
          this.spawnParticles(nx, ny, bossDef.accentColor, 10);
          const sweepAngle = Phaser.Math.Angle.Between(nx, ny, this.playerSprite.x, this.playerSprite.y);
          for (const off of [-0.4, -0.2, 0, 0.2, 0.4]) {
            this.createEnemyProjectile(nx, ny, sweepAngle + off, 150, e.damage, bossDef.accentColor, false);
          }
        } else {
          // Alternating + and x clockwork cross volleys
          const base = (step % 2) * (Math.PI / 4);
          const spokes = e.phase === 2 ? 8 : 4;
          for (let i = 0; i < spokes; i++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, base + (Math.PI * 2 * i) / spokes, 135, e.damage, bossDef.accentColor, false);
          }
        }
      }
      return;
    }

    // Floor 6: The Withered Everheart — burning spiral barrages, shadow summons, teleports & dashes
    e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
    if (e.aiTimerMs <= 0) {
      e.bossStep = step + 1;
      e.aiTimerMs = e.phase === 2 ? 900 : 1250;
      const mode = step % 4;
      if (mode === 0) {
        const bolts = e.phase === 2 ? 12 : 8;
        const rot = step * 0.35;
        for (let i = 0; i < bolts; i++) {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, rot + (Math.PI * 2 * i) / bolts, 125, e.damage, bossDef.accentColor, true);
        }
      } else if (mode === 1) {
        e.windupMs = 300;
        e.sprite.setTint(0xff47b6);
      } else if (mode === 2) {
        const minionCount = this.activeEnemies.filter((m) => !m.isBoss && m.hp > 0).length;
        if (e.phase === 2 && minionCount < 2) {
          const sx = Phaser.Math.Clamp(e.sprite.x + (Math.random() < 0.5 ? -24 : 24), 28, 148);
          const sy = Phaser.Math.Clamp(e.sprite.y + (Math.random() < 0.5 ? -20 : 20), 28, 148);
          const addDef = ENEMIES.shadow_mote;
          this.spawnEnemyEntity(`boss_add_${Date.now()}_${step}`, 'shadow_mote', sx, sy, addDef.hp, addDef.hp, false, false);
        }
        for (const off of [-0.45, -0.22, 0, 0.22, 0.45]) {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 155, e.damage, bossDef.accentColor, true);
        }
      } else {
        if (e.phase === 2) {
          this.spawnParticles(e.sprite.x, e.sprite.y, bossDef.accentColor, 10);
          const nx = this.playerSprite.x < 88 ? Phaser.Math.Between(104, 142) : Phaser.Math.Between(34, 72);
          const ny = this.playerSprite.y < 88 ? Phaser.Math.Between(104, 142) : Phaser.Math.Between(34, 72);
          e.sprite.setPosition(nx, ny);
          this.spawnParticles(nx, ny, bossDef.accentColor, 10);
        }
        for (const off of [-0.2, 0, 0.2]) {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 165, e.damage, 0xffffff, true);
        }
      }
    }
  }

  private updateCrystalShields(e: ActiveEnemy, delta: number): void {
    if (!e.shieldOrbs || e.shieldOrbs.length === 0) return;
    const isPhase2 = e.hp < e.maxHp * 0.5 || e.phase === 2;
    const activeCount = isPhase2 ? 3 : 2;
    const rotSpeed = isPhase2 ? 2.5 : 1.9;
    const radius = isPhase2 ? 24 : 23;
    e.shieldAngle = (e.shieldAngle ?? 0) + (delta / 1000) * rotSpeed;
    for (let i = 0; i < e.shieldOrbs.length; i++) {
      const orb = e.shieldOrbs[i];
      if (i >= activeCount) {
        orb.setVisible(false);
        continue;
      }
      orb.setVisible(true);
      const a = e.shieldAngle + (Math.PI * 2 * i) / activeCount;
      orb.setPosition(e.sprite.x + Math.cos(a) * radius, e.sprite.y + Math.sin(a) * radius);
      orb.setRotation(a + Math.PI / 2);
    }
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs -= delta;
      if (p.lifeMs <= 0 || !p.sprite.active) {
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.homing && p.fromPlayer && this.activeEnemies.length > 0) {
        let nearest = this.activeEnemies[0];
        let minD = Infinity;
        for (const e of this.activeEnemies) {
          const d = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.sprite.x, e.sprite.y);
          if (d < minD) {
            minD = d;
            nearest = e;
          }
        }
        if (nearest?.sprite.active) {
          const targetA = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, nearest.sprite.x, nearest.sprite.y);
          p.vx = Phaser.Math.Linear(p.vx, Math.cos(targetA) * 145, 0.08);
          p.vy = Phaser.Math.Linear(p.vy, Math.sin(targetA) * 145, 0.08);
        }
      }

      if (p.boomerang && !p.returning && p.lifeMs < 600) {
        p.returning = true;
        p.hitUids.clear();
      }
      if (p.boomerang && p.returning) {
        const retA = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, this.playerSprite.x, this.playerSprite.y);
        p.vx = Math.cos(retA) * 205;
        p.vy = Math.sin(retA) * 205;
      }

      if (p.netSynced && p.targetX !== undefined && p.targetY !== undefined) {
        const dt = delta / 1000;
        p.targetX += p.vx * dt;
        p.targetY += p.vy * dt;
        const t = 1 - Math.exp(-delta * 0.024);
        const nx = Phaser.Math.Linear(p.sprite.x, p.targetX, t);
        const ny = Phaser.Math.Linear(p.sprite.y, p.targetY, t);
        p.sprite.setVelocity(0, 0);
        p.sprite.setPosition(nx, ny);
      } else {
        p.sprite.setVelocity(p.vx, p.vy);
      }

      // Wall & solid block bounce or destroy
      let hitSolid = false;
      if (p.sprite.x < 16 || p.sprite.x > 160 || p.sprite.y < 16 || p.sprite.y > 160) {
        if (p.bouncesLeft > 0) {
          p.bouncesLeft--;
          if (p.sprite.x < 16 || p.sprite.x > 160) p.vx *= -1;
          if (p.sprite.y < 16 || p.sprite.y > 160) p.vy *= -1;
        } else {
          hitSolid = true;
        }
      } else if (!p.boomerang) {
        for (const obj of this.wallGroup.getChildren()) {
          const w = obj as Phaser.GameObjects.Rectangle;
          const dx = p.sprite.x - w.x;
          const dy = p.sprite.y - w.y;
          if (Math.abs(dx) < 9 && Math.abs(dy) < 9) {
            if (p.bouncesLeft > 0) {
              p.bouncesLeft--;
              if (Math.abs(dx) > Math.abs(dy)) {
                p.vx *= -1;
                p.sprite.x = w.x + Math.sign(dx || 1) * 9.5;
              } else {
                p.vy *= -1;
                p.sprite.y = w.y + Math.sign(dy || 1) * 9.5;
              }
            } else {
              hitSolid = true;
              if (!p.fromPlayer && p.shooterUid && w.x >= 16 && w.x <= 160 && w.y >= 16 && w.y <= 160) {
                const shooter = this.activeEnemies.find((e) => e.uid === p.shooterUid && e.sprite.active);
                if (shooter && !shooter.isBoss) {
                  shooter.blockedShots = (shooter.blockedShots ?? 0) + 1;
                  if (shooter.blockedShots >= 2) {
                    shooter.blockedShots = 0;
                    shooter.repositionMs = 1600;
                    shooter.repositionDir = shooter.repositionDir ?? (Math.random() < 0.5 ? 1 : -1);
                  }
                }
              }
            }
            break;
          }
        }
      }

      if (hitSolid) {
        this.spawnParticles(p.sprite.x, p.sprite.y, p.color, 3);
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer && p.ownerId === this.playerState.id) {
        let reflected = false;
        if (!p.boomerang) {
          for (const e of this.activeEnemies) {
            if (!e.sprite.active || !e.shieldOrbs) continue;
            for (const orb of e.shieldOrbs) {
              if (!orb.visible) continue;
              if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, orb.x, orb.y) < 9) {
                const na = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, orb.x, orb.y);
                const nx = Math.cos(na);
                const ny = Math.sin(na);
                const dot = p.vx * nx + p.vy * ny;
                if (dot < 0) {
                  p.vx = p.vx - 2 * dot * nx;
                  p.vy = p.vy - 2 * dot * ny;
                } else {
                  p.vx = -p.vx;
                  p.vy = -p.vy;
                }
                p.fromPlayer = false;
                p.ownerId = 'enemy';
                p.damage = 1;
                p.color = 0x6ef3ff;
                p.lifeMs = Math.max(p.lifeMs, 1800);
                p.hitUids.clear();
                p.sprite.setTint(0x6ef3ff);
                p.sprite.setPosition(orb.x + nx * 10, orb.y + ny * 10);
                SoundSystem.playHit();
                this.spawnParticles(orb.x, orb.y, 0x6ef3ff, 5);
                reflected = true;
                break;
              }
            }
            if (reflected) break;
          }
        }
        if (reflected) continue;

        for (const e of [...this.activeEnemies]) {
          if (!e.sprite.active || p.hitUids.has(e.uid)) continue;
          if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.sprite.x, e.sprite.y) < (e.isBoss ? 18 : 11)) {
            p.hitUids.add(e.uid);
            if (p.slows) e.slowedMs = 3000;
            if (p.bubbles && !e.isBoss) e.bubbledMs = 1500;
            if (p.burns) {
              e.burningMs = 3000;
              e.burnTickMs = 0;
              this.spawnParticles(e.sprite.x, e.sprite.y, 0xff6b35, 5);
            }
            let finalDmg = p.damage;
            if (p.cometBoost && p.startX !== undefined && p.startY !== undefined) {
              const traveled = Phaser.Math.Distance.Between(p.startX, p.startY, p.sprite.x, p.sprite.y);
              finalDmg += Math.floor(traveled / 45);
            }
            this.damageEnemy(e, finalDmg);
            if (!p.boomerang) {
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      } else if (!p.fromPlayer) {
        const distToPlayer = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, this.playerSprite.x, this.playerSprite.y);
        if (StatusEffectManager.has(this.playerState.statusEffects, 'starward') && distToPlayer < 15) {
          p.fromPlayer = true;
          p.ownerId = this.playerState.id;
          p.vx *= -1.45;
          p.vy *= -1.45;
          p.lifeMs = 1400;
          p.hitUids.clear();
          p.sprite.setTint(0x6ef3ff);
          SoundSystem.playSwing();
          this.spawnParticles(p.sprite.x, p.sprite.y, 0x6ef3ff, 4);
        } else if (distToPlayer < 10) {
          if (p.shooterUid) {
            const shooter = this.activeEnemies.find((e) => e.uid === p.shooterUid);
            if (shooter) shooter.blockedShots = 0;
          }
          if (p.burns) {
            StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', 3000);
          }
          this.damagePlayer(p.damage);
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private updateHazardsAndLoot(delta: number): void {
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    const now = this.time.now;
    const lavaFrame = Math.floor(now / 260) % 3;

    for (const h of this.hazards) {
      h.sprite.setTexture(`tile_lava_${lavaFrame}`);
      h.glow.setAlpha(0.24 + Math.sin(now * 0.004 + h.phase) * 0.08);
      h.tickMs = Math.max(0, h.tickMs - delta);
      if (Phaser.Math.Distance.Between(px, py, h.x, h.y) < h.radius) {
        // Reset burning to 3 seconds every time player touches lava/hazard
        const existingBurn = this.playerState.statusEffects.find((e) => e.id === 'burning');
        if (existingBurn) {
          existingBurn.remainingMs = 3000;
        } else {
          StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', 3000);
        }
        if (h.tickMs <= 0) {
          h.tickMs = 900;
          this.damagePlayer(1);
        }
      }
    }

    for (const s of this.spikeTraps) {
      const onGrate = !this.playerState.downed && Phaser.Math.Distance.Between(px, py, s.x, s.y) < 10;
      if (s.state === 'idle') {
        if (onGrate) {
          s.state = 'armed';
          s.standMs = 500; // Half the previous 1000ms delay
          s.sprite.setTint(0xffe066);
        }
      } else if (s.state === 'armed') {
        s.standMs -= delta;
        if (s.standMs <= 160 && s.standMs > 0) {
          s.sprite.clearTint();
          s.sprite.setTexture('obj_spike_mid');
        }
        if (s.standMs <= 0) {
          s.state = 'extended';
          s.activeMs = 1000;
          s.hitThisCycle = false;
          s.sprite.clearTint();
          s.sprite.setTexture('obj_spike_active');
          if (onGrate) {
            s.hitThisCycle = true;
            this.spikePinnedMs = 1000;
            this.dodgeMs = 0;
            this.damagePlayer(1);
            this.ui.showToast('Stabbed by spikes!', '#ff5d8f');
          }
        }
      } else {
        s.activeMs -= delta;
        if (s.activeMs <= 140 && s.activeMs > 0) {
          s.sprite.setTexture('obj_spike_mid');
        }
        if (onGrate && !s.hitThisCycle) {
          s.hitThisCycle = true;
          this.spikePinnedMs = Math.max(this.spikePinnedMs, s.activeMs);
          this.dodgeMs = 0;
          this.damagePlayer(1);
          this.ui.showToast('Stabbed by spikes!', '#ff5d8f');
        }
        if (s.activeMs <= 0) {
          s.state = 'idle';
          s.standMs = 0;
          s.hitThisCycle = false;
          s.sprite.setTexture('obj_spike_idle');
        }
      }
    }

    const attract = hasArtifact(this.playerState.inventory, 'moth_crown') !== -1;

    for (const l of this.lootObjs) {
      if (l.collected) continue;
      const d = Phaser.Math.Distance.Between(px, py, l.sprite.x, l.sprite.y);
      if (attract && (l.kind === 'shard' || l.kind === 'heart') && d < 80) {
        const a = Phaser.Math.Angle.Between(l.sprite.x, l.sprite.y, px, py);
        l.sprite.x += Math.cos(a) * 1.8;
        l.sprite.y += Math.sin(a) * 1.8;
      }

      if (d < 14 && (l.kind === 'shard' || l.kind === 'heart')) {
        l.collected = true;
        l.sprite.destroy();
        const roomLoot = this.currentRoom.loot.find((rl) => rl.uid === l.uid);
        if (roomLoot) roomLoot.collected = true;
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'pickup',
          targetId: l.uid,
        });
        if (l.kind === 'shard') {
          const amt = l.amount ?? 1;
          this.playerState.shards += amt;
          this.totalShardsCollected += amt;
          SoundSystem.playPickup();
        } else {
          this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 2);
          SoundSystem.playHeal();
        }
      }
    }
  }

  private updatePuzzlePlates(): void {
    if (this.currentRoom.type !== 'puzzle' || this.currentRoom.puzzleSolved || this.plateCooldownMs > 0) return;
    const plates = this.currentRoom.puzzlePlates;
    if (!plates) return;

    for (const sp of this.specialObjs.plates) {
      if (Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, sp.x, sp.y) < 12) {
        const model = plates.find((p) => p.id === sp.id);
        if (!model || model.activated) continue;

        const nextOrder = plates.filter((p) => p.activated).length + 1;
        this.plateCooldownMs = 350;
        if (model.order === nextOrder) {
          model.activated = true;
          sp.sprite.setTexture('obj_plate_lit');
          SoundSystem.playPickup();
          if (plates.every((p) => p.activated)) {
            this.solvePuzzle('Puzzle solved!');
          }
        } else {
          // Reset sequence
          for (const p of plates) p.activated = false;
          for (const s of this.specialObjs.plates) s.sprite.setTexture('obj_plate');
          SoundSystem.playHit();
          this.ui.showToast(`Wrong order! Step 1 -> ... -> ${plates.length}`, '#ff5d8f');
        }
      }
    }
  }

  private solvePuzzle(message: string): void {
    if (this.currentRoom.puzzleSolved) return;
    this.currentRoom.puzzleSolved = true;
    this.currentRoom.cleared = true;
    SoundSystem.playUnlock();
    this.ui.showToast(message, '#66ffd9');
    if (net.mode !== 'client') {
      const itemId = rollRandomItemId(new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
      this.spawnRoomLoot(`puz_${Date.now()}`, 'item', 88, 88, itemId);
    }
  }

  private updateMirrorBeam(checkSolve: boolean): void {
    const beam = this.currentRoom.puzzleBeam;
    const gfx = this.specialObjs.beamGfx;
    if (!beam || !gfx) return;

    gfx.clear();

    const dirVec: Record<Direction, { dx: number; dy: number }> = {
      north: { dx: 0, dy: -1 },
      south: { dx: 0, dy: 1 },
      east: { dx: 1, dy: 0 },
      west: { dx: -1, dy: 0 },
    };

    let tx = beam.emitterTx;
    let ty = beam.emitterTy;
    let { dx, dy } = dirVec[beam.emitterDir];
    const points: Array<{ x: number; y: number }> = [{ x: tx * 16 + 8, y: ty * 16 + 8 }];
    let hitTarget = false;

    for (let step = 0; step < 64; step++) {
      tx += dx;
      ty += dy;
      if (tx <= 0 || tx >= 10 || ty <= 0 || ty >= 10) {
        points.push({ x: tx * 16 + 8 - dx * 6, y: ty * 16 + 8 - dy * 6 });
        break;
      }
      if (
        (tx === beam.emitterTx && ty === beam.emitterTy) ||
        this.currentRoom.puzzleObstacles?.some((o) => o.tx === tx && o.ty === ty)
      ) {
        points.push({ x: tx * 16 + 8 - dx * 6, y: ty * 16 + 8 - dy * 6 });
        break;
      }
      points.push({ x: tx * 16 + 8, y: ty * 16 + 8 });

      if (tx === beam.targetTx && ty === beam.targetTy) {
        hitTarget = true;
        break;
      }

      const mirror = beam.mirrors.find((m) => m.tx === tx && m.ty === ty);
      if (mirror) {
        if (mirror.orientation === 'slash') {
          const ndx = -dy;
          const ndy = -dx;
          dx = ndx;
          dy = ndy;
        } else {
          const ndx = dy;
          const ndy = dx;
          dx = ndx;
          dy = ndy;
        }
      }
    }

    // Outer glow + inner bright beam
    gfx.lineStyle(4, hitTarget ? 0x66ffd9 : 0x6ef3ff, 0.35);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();

    gfx.lineStyle(1.5, 0xffffff, 0.95);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();

    if (hitTarget) {
      this.specialObjs.beamTarget?.setTexture('obj_beam_target_lit');
      if (checkSolve && !this.currentRoom.puzzleSolved) {
        this.solvePuzzle('Beam aligned! Puzzle solved!');
      }
    } else {
      this.specialObjs.beamTarget?.setTexture('obj_beam_target');
    }
  }

  private updatePuzzleBlocks(): void {
    if (
      this.currentRoom.type !== 'puzzle' ||
      this.currentRoom.puzzleKind !== 'block_push' ||
      this.currentRoom.puzzleSolved ||
      this.blockPushCooldownMs > 0 ||
      this.playerState.downed
    ) {
      return;
    }
    const bp = this.currentRoom.puzzleBlock;
    if (!bp) return;

    let moveX = 0;
    let moveY = 0;
    if (this.keys.a.isDown || this.keys.left.isDown) moveX -= 1;
    if (this.keys.d.isDown || this.keys.right.isDown) moveX += 1;
    if (this.keys.w.isDown || this.keys.up.isDown) moveY -= 1;
    if (this.keys.s.isDown || this.keys.down.isDown) moveY += 1;
    if (isMobileMode()) {
      if (Math.abs(mobileInput.moveX) > 0.25) moveX = Math.sign(mobileInput.moveX);
      if (Math.abs(mobileInput.moveY) > 0.25) moveY = Math.sign(mobileInput.moveY);
    }
    if (moveX === 0 && moveY === 0) return;

    const px = this.playerSprite.x;
    const py = this.playerSprite.y;

    for (const bVis of this.specialObjs.blocks) {
      const model = bp.blocks.find((b) => b.id === bVis.id);
      if (!model) continue;
      const bx = bVis.sprite.x;
      const by = bVis.sprite.y;
      const dx = bx - px;
      const dy = by - py;
      if (Math.hypot(dx, dy) > 19) continue;

      let stepX = 0;
      let stepY = 0;
      if (Math.abs(dx) >= Math.abs(dy)) {
        stepX = dx > 0 ? 1 : -1;
        if (moveX !== stepX) continue;
      } else {
        stepY = dy > 0 ? 1 : -1;
        if (moveY !== stepY) continue;
      }

      const ntx = model.tx + stepX;
      const nty = model.ty + stepY;
      if (ntx < 1 || ntx > 9 || nty < 1 || nty > 9) continue;
      if (ntx === bp.resetTx && nty === bp.resetTy) continue;
      if (this.currentRoom.puzzleObstacles?.some((o) => o.tx === ntx && o.ty === nty)) continue;
      if (bp.blocks.some((other) => other.id !== model.id && other.tx === ntx && other.ty === nty)) continue;

      model.tx = ntx;
      model.ty = nty;
      this.blockPushCooldownMs = 210;
      this.tweens.add({
        targets: bVis.sprite,
        x: ntx * 16 + 8,
        y: nty * 16 + 8,
        duration: 110,
        ease: 'Quad.easeOut',
      });
      SoundSystem.playSwing();
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'block',
        targetId: model.id,
        x: ntx,
        y: nty,
      });
      this.refreshBlockGoalVisuals();
      this.checkBlockPuzzleSolved();
      break;
    }
  }

  private resetPuzzleBlocks(playSound: boolean): void {
    const bp = this.currentRoom.puzzleBlock;
    if (!bp) return;
    for (const b of bp.blocks) {
      b.tx = b.initialTx;
      b.ty = b.initialTy;
      const vis = this.specialObjs.blocks.find((v) => v.id === b.id);
      vis?.sprite.setPosition(b.tx * 16 + 8, b.ty * 16 + 8);
    }
    this.refreshBlockGoalVisuals();
    if (playSound) {
      SoundSystem.playPickup();
      this.ui.showToast('Blocks reset!', '#ff75c3');
    }
  }

  private refreshBlockGoalVisuals(): void {
    const bp = this.currentRoom.puzzleBlock;
    if (!bp) return;
    for (const gVis of this.specialObjs.blockGoals) {
      const occupied = bp.blocks.some((b) => b.tx === gVis.tx && b.ty === gVis.ty);
      gVis.sprite.setTexture(occupied ? 'obj_block_goal_lit' : 'obj_block_goal');
    }
  }

  private checkBlockPuzzleSolved(): void {
    const bp = this.currentRoom.puzzleBlock;
    if (!bp || this.currentRoom.puzzleSolved) return;
    const allCovered = bp.goals.every((g) => bp.blocks.some((b) => b.tx === g.tx && b.ty === g.ty));
    if (allCovered) {
      this.solvePuzzle('Blocks aligned! Puzzle solved!');
    }
  }

  private checkDoorTransitions(): void {
    if (this.doorCooldownMs > 0 || this.currentRoom.doorsLocked) return;
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;

    for (const d of this.doorZones) {
      if (Phaser.Geom.Rectangle.Contains(d.rect, px, py)) {
        let nx = this.currentRoom.gx;
        let ny = this.currentRoom.gy;
        let sx = px;
        let sy = py;
        if (d.dir === 'north') {
          ny -= 1;
          sx = 88;
          sy = 152;
        } else if (d.dir === 'south') {
          ny += 1;
          sx = 88;
          sy = 24;
        } else if (d.dir === 'west') {
          nx -= 1;
          sx = 152;
          sy = 88;
        } else if (d.dir === 'east') {
          nx += 1;
          sx = 24;
          sy = 88;
        }
        if (this.floor.rooms[ny]?.[nx]) {
          this.loadRoom(nx, ny, sx, sy);
        }
        return;
      }
    }
  }

  private updateFireflies(delta: number): void {
    const dt = delta / 1000;
    for (const f of this.fireflies) {
      f.phase += dt * 3;
      f.sprite.x += f.vx * dt;
      f.sprite.y += f.vy * dt;
      f.sprite.setAlpha(0.3 + 0.4 * Math.abs(Math.sin(f.phase)));
      if (f.sprite.x < 20) f.sprite.x = 156;
      if (f.sprite.x > 156) f.sprite.x = 20;
      if (f.sprite.y < 20) f.sprite.y = 156;
      if (f.sprite.y > 156) f.sprite.y = 20;
    }
  }

  private syncMultiplayer(delta: number): void {
    if (net.mode === 'solo') return;

    // Prune any disconnected peers whose sprites/snapshots may still be around
    for (const peerId of Array.from(this.remotePlayers.keys())) {
      if (!net.players.has(peerId)) {
        this.remotePlayers.delete(peerId);
        const vis = this.remoteSprites.get(peerId);
        if (vis) {
          vis.sprite.destroy();
          vis.label.destroy();
          this.remoteSprites.delete(peerId);
        }
      }
    }

    // Render remote players in current room
    for (const [peerId, st] of this.remotePlayers.entries()) {
      const sameRoom = st.gx === this.currentRoom.gx && st.gy === this.currentRoom.gy;
      let vis = this.remoteSprites.get(peerId);
      if (sameRoom) {
        if (!vis) {
          const sp = this.add.sprite(st.x, st.y, `player_${st.paletteId}`, 0).setDepth(10);
          const lb = addPixelText(this, st.x, st.y - 16, st.name, 8, 0xffe066, 0.5, 0.5).setDepth(11);
          vis = { sprite: sp, label: lb };
          this.remoteSprites.set(peerId, vis);
        }
        const now = this.time.now;
        const isRipAnimating = (this.remoteReviveAnimUntil.get(peerId) ?? 0) > now;
        if (!isRipAnimating) {
          const playerLerp = 1 - Math.exp(-delta * 0.018);
          const pDist = Phaser.Math.Distance.Between(vis.sprite.x, vis.sprite.y, st.x, st.y);
          if (pDist > 48) {
            vis.sprite.setPosition(st.x, st.y);
          } else if (pDist > 0.2) {
            vis.sprite.setPosition(
              Phaser.Math.Linear(vis.sprite.x, st.x, playerLerp),
              Phaser.Math.Linear(vis.sprite.y, st.y, playerLerp)
            );
          }
          vis.sprite.setFlipX(st.flipX);
          vis.sprite.setDepth(st.downed ? 7 : 10);
          const pFrame = st.downed
            ? 5
            : st.dodging
            ? 4
            : st.animState === 'walk'
            ? Math.floor(now / 160) % 2 === 0
              ? 2
              : 3
            : Math.floor(now / 380) % 2;
          vis.sprite.setFrame(pFrame);
        }
        vis.label.setDepth(st.downed ? 8 : 11);
        vis.label.setPosition(vis.sprite.x, vis.sprite.y - 16);

        // Spread burning on direct contact with another player (preserving remaining duration)
        if (!this.playerState.downed && !st.downed) {
          const remoteBurn = st.statusEffects.find((e) => e.id === 'burning' && e.remainingMs > 0);
          if (remoteBurn) {
            if (Math.random() < delta / 90) {
              this.spawnFireParticles(vis.sprite.x, vis.sprite.y, 1);
            }
            if (Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, st.x, st.y) < 14) {
              const localBurn = this.playerState.statusEffects.find((e) => e.id === 'burning');
              if (!localBurn) {
                StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', remoteBurn.remainingMs);
              }
            }
          }
        }
      } else if (vis) {
        vis.sprite.destroy();
        vis.label.destroy();
        this.remoteSprites.delete(peerId);
      }
    }

    this.netSyncTimerMs += delta;
    if (this.netSyncTimerMs >= 65) {
      this.netSyncTimerMs = 0;
      net.broadcastPlayerState(this.playerState);

      if (net.mode === 'host') {
        const roomStates: NetWorldSync['roomStates'] = [];
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < 6; x++) {
            const r = this.floor.rooms[y]?.[x];
            if (!r) continue;
            roomStates.push({
              gx: r.gx,
              gy: r.gy,
              visited: r.visited,
              cleared: r.cleared,
              doorsLocked: r.doorsLocked,
              secretRevealed: r.secretRevealed,
              bossDefeated: r.bossDefeated,
              puzzleSolved: r.puzzleSolved,
              puzzleMirrors: r.puzzleBeam?.mirrors.map((m) => ({ id: m.id, orientation: m.orientation })),
              puzzleBlocks: r.puzzleBlock?.blocks.map((b) => ({ id: b.id, tx: b.tx, ty: b.ty })),
              brokenCrates: r.brokenCrates,
              shopSold: r.shopStock?.map((s) => s.sold),
              enemies:
                r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy
                  ? this.activeEnemies.map((e) => ({
                      uid: e.uid,
                      x: e.sprite.x,
                      y: e.sprite.y,
                      hp: e.hp,
                      alive: e.hp > 0,
                    }))
                  : r.enemies.map((e) => ({ uid: e.uid, x: e.x, y: e.y, hp: e.hp, alive: e.alive })),
              loot: r.loot.map((l) => ({
                uid: l.uid,
                kind: l.kind,
                x: l.x,
                y: l.y,
                itemId: l.itemId,
                uses: l.uses,
                amount: l.amount,
                collected: l.collected,
              })),
            });
          }
        }
        net.broadcastWorldSync({
          levelIndex: this.levelIndex,
          floorSeed: this.floorSeed,
          modifier: this.floor.modifier,
          hostGx: this.currentRoom.gx,
          hostGy: this.currentRoom.gy,
          players: [this.playerState, ...Array.from(this.remotePlayers.values()).filter((p) => net.players.has(p.id))],
          lobbyPlayers: Array.from(net.players.values()),
          projectiles: this.projectiles
            .filter((p) => p.sprite.active)
            .map((p) => ({
              uid: p.uid,
              gx: this.currentRoom.gx,
              gy: this.currentRoom.gy,
              x: p.sprite.x,
              y: p.sprite.y,
              vx: p.vx,
              vy: p.vy,
              color: p.color,
              fromPlayer: p.fromPlayer,
              ownerId: p.ownerId,
              damage: p.damage,
              burns: p.burns,
            })),
          roomStates,
        });
      } else if (net.mode === 'client' && this.isRoomAuthority()) {
        net.broadcastRoomSync({
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          cleared: this.currentRoom.cleared,
          doorsLocked: this.currentRoom.doorsLocked,
          bossDefeated: this.currentRoom.bossDefeated,
          enemies: this.activeEnemies.map((e) => ({
            uid: e.uid,
            x: e.sprite.x,
            y: e.sprite.y,
            hp: e.hp,
            alive: e.hp > 0,
          })),
          projectiles: this.projectiles
            .filter((p) => p.sprite.active)
            .map((p) => ({
              uid: p.uid,
              gx: this.currentRoom.gx,
              gy: this.currentRoom.gy,
              x: p.sprite.x,
              y: p.sprite.y,
              vx: p.vx,
              vy: p.vy,
              color: p.color,
              fromPlayer: p.fromPlayer,
              ownerId: p.ownerId,
              damage: p.damage,
              burns: p.burns,
            })),
        });
      }
    }
  }

  private getSpectateTargets(): PlayerStateSnapshot[] {
    return Array.from(this.remotePlayers.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  private getActiveSpectateTarget(): PlayerStateSnapshot | null {
    if (net.mode === 'solo' || !this.playerState.downed) return null;
    const targets = this.getSpectateTargets();
    if (targets.length === 0) return null;
    if (this.spectateTargetId) {
      const found = targets.find((t) => t.id === this.spectateTargetId);
      if (found) return found;
    }
    const chosen = targets.find((t) => !t.downed) ?? targets[0];
    this.spectateTargetId = chosen.id;
    return chosen;
  }

  private cycleSpectateTarget(dir: -1 | 1): void {
    const targets = this.getSpectateTargets();
    if (targets.length === 0) return;
    const curIdx = this.spectateTargetId ? targets.findIndex((t) => t.id === this.spectateTargetId) : 0;
    const baseIdx = curIdx === -1 ? 0 : curIdx;
    const nextIdx = (baseIdx + dir + targets.length) % targets.length;
    this.spectateTargetId = targets[nextIdx].id;
    SoundSystem.playPickup();
    this.updateSpectatorView();
  }

  private updateSpectatorView(): void {
    const target = this.getActiveSpectateTarget();
    if (!target) {
      this.playerSprite.setVisible(true);
      return;
    }
    if (target.gx !== this.currentRoom.gx || target.gy !== this.currentRoom.gy) {
      this.loadRoom(target.gx, target.gy, this.playerSprite.x, this.playerSprite.y, true);
    }
  }

  private pushUIUpdate(): void {
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    let promptText = '';

    if (this.specialObjs.merchant && Phaser.Math.Distance.Between(px, py, 88, 76) < 34) {
      promptText = '[E] Talk to Mimi';
    } else if (this.specialObjs.shrine && !this.currentRoom.healingUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      promptText = '[E] Drink from Healing Shrine';
    } else if (this.specialObjs.altar && !this.currentRoom.eventUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      promptText = '[E] Inspect Altar';
    } else if (this.specialObjs.portal && Phaser.Math.Distance.Between(px, py, 88, 88) < 32) {
      promptText = '[E] Enter Portal';
    } else if (
      this.currentRoom.type === 'puzzle' &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.resetRune &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.resetRune.x, this.specialObjs.resetRune.y) < 26
    ) {
      promptText = '[E] Reset Blocks';
    } else if (
      this.currentRoom.type === 'puzzle' &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.mirrors.some((m) => Phaser.Math.Distance.Between(px, py, m.x, m.y) < 24)
    ) {
      promptText = '[E] Rotate Mirror';
    } else {
      for (const l of this.lootObjs) {
        if (!l.collected && (l.kind === 'chest' || l.kind === 'item') && Phaser.Math.Distance.Between(px, py, l.sprite.x, l.sprite.y) < 26) {
          promptText = l.kind === 'chest' ? '[E] Open Chest' : `[E] Pick up ${l.itemId?.replace(/_/g, ' ')}`;
          break;
        }
      }
    }

    const bossEntity = this.activeEnemies.find((e) => e.isBoss);
    let bossInfo = null;
    if (bossEntity) {
      const bDef = BOSSES[bossEntity.defId];
      bossInfo = { name: bDef.name, hp: bossEntity.hp, maxHp: bossEntity.maxHp, accent: bDef.accentColor };
    }

    const spectateTarget = this.getActiveSpectateTarget();
    const uiPlayer = spectateTarget ?? this.playerState;
    const uiAllies = spectateTarget
      ? [this.playerState, ...Array.from(this.remotePlayers.values()).filter((p) => p.id !== spectateTarget.id)]
      : Array.from(this.remotePlayers.values());

    this.ui.updateState({
      player: uiPlayer,
      allies: uiAllies,
      levelIndex: this.levelIndex,
      modifierId: this.floor.modifier as LevelModifierId,
      rooms: this.floor.rooms,
      currentRoom: this.currentRoom,
      bossInfo,
      promptText,
      spectating: spectateTarget
        ? { targetName: spectateTarget.name, count: this.getSpectateTargets().length }
        : null,
    });
  }
}
