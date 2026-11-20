import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { BIOMES } from '../data/biomes';
import { BOSSES, ENEMIES } from '../data/enemies';
import { ARTIFACTS, CONSUMABLES } from '../data/items';
import { ROOM_TEMPLATES } from '../data/roomTemplates';
import { WEAPONS } from '../data/weapons';
import { SoundSystem } from '../audio/SoundSystem';
import { DungeonGenerator, GeneratedFloor } from '../systems/DungeonGenerator';
import { addItemToSlots, consumeUse, createItemInstance, hasArtifact, rollRandomItemId } from '../systems/InventorySystem';
import { net, NetWorldSync } from '../systems/MultiplayerSystem';
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
}

interface ActiveProjectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  fromPlayer: boolean;
  ownerId: string;
  damage: number;
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
}

interface ActiveHazard {
  x: number;
  y: number;
  radius: number;
  gfx: Phaser.GameObjects.Rectangle;
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
  private doorCooldownMs = 0;
  private paused = false;
  private transitioningLevel = false;

  private totalShardsCollected = 0;
  private totalEnemiesDefeated = 0;
  private netSyncTimerMs = 0;
  private plateCooldownMs = 0;

  private specialObjs: {
    merchant?: Phaser.GameObjects.Image;
    shrine?: Phaser.GameObjects.Image;
    altar?: Phaser.GameObjects.Image;
    portal?: Phaser.GameObjects.Image;
    plates: Array<{ id: string; order: number; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
  } = { plates: [] };

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data: { levelIndex?: number; floorSeed?: number; resetRun?: boolean; carryPlayer?: PlayerStateSnapshot }): void {
    this.levelIndex = data.levelIndex ?? 0;
    this.floorSeed = data.floorSeed ?? Math.floor(Math.random() * 900000) + 100000;
    this.transitioningLevel = false;
    this.paused = false;

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
    this.floor = DungeonGenerator.generateFloor(this.levelIndex, this.floorSeed, playerCount);
    this.currentRoom = this.floor.rooms[2][0];

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
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });

    this.loadRoom(0, 2, 88, 88);

    const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
    this.time.delayedCall(120, () => {
      this.ui.showToast(`Floor ${biome.level}: ${biome.name}`, '#f49ac1');
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

    kb.on('keydown-ESC', () => {
      if (this.ui.isOverlayOpen()) {
        this.ui.closeShop();
        this.paused = this.ui.togglePause(false);
      } else {
        this.paused = this.ui.togglePause();
      }
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

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.paused || this.ui.isOverlayOpen() || this.playerState.downed) return;
      if (pointer.rightButtonDown()) {
        this.handleSecondaryAction();
      } else {
        this.handlePrimaryAttack();
      }
    });
  }

  private setupNetworking(): void {
    net.onRemotePlayerState = (state, peerId) => {
      this.remotePlayers.set(peerId, state);
    };

    net.onRemoteAttack = (ev, peerId) => {
      if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
        this.spawnWeaponAttack(ev.x, ev.y, ev.angle, ev.weaponId, peerId, false);
      }
    };

    net.onRemoteInteract = (ev) => {
      if (ev.kind === 'revive' && (ev.targetId === this.playerState.id || ev.targetId === 'all') && this.playerState.downed) {
        this.reviveSelf();
      } else if (ev.kind === 'drop' && ev.itemId && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        if (targetRoom) {
          targetRoom.loot.push({
            uid: ev.targetId,
            kind: 'item',
            x: ev.x ?? 88,
            y: ev.y ?? 88,
            itemId: ev.itemId,
            uses: ev.uses,
            collected: false,
          });
          if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
            this.createLootObject(ev.targetId, 'item', ev.x ?? 88, ev.y ?? 88, ev.itemId, undefined, ev.uses);
          }
        }
      } else if (ev.kind === 'pickup' && ev.targetId) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const roomLoot = targetRoom?.loot.find((rl) => rl.uid === ev.targetId);
        if (roomLoot) roomLoot.collected = true;
        const vis = this.lootObjs.find((l) => l.uid === ev.targetId);
        if (vis && !vis.collected) {
          vis.collected = true;
          vis.sprite.destroy();
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
        if (p.id !== this.playerState.id) {
          this.remotePlayers.set(p.id, p);
        }
      }
      for (const rs of sync.roomStates) {
        const r = this.floor.rooms[rs.gy]?.[rs.gx];
        if (!r) continue;
        r.visited = rs.visited;
        r.cleared = rs.cleared;
        r.doorsLocked = rs.doorsLocked;
        r.secretRevealed = rs.secretRevealed;
        r.bossDefeated = rs.bossDefeated;
        r.puzzleSolved = rs.puzzleSolved;
        if (r.gx === this.currentRoom.gx && r.gy === this.currentRoom.gy) {
          for (const es of rs.enemies) {
            const ae = this.activeEnemies.find((e) => e.uid === es.uid);
            if (ae) {
              ae.hp = es.hp;
              if (!es.alive && ae.sprite.active) {
                ae.sprite.destroy();
              }
            }
          }
        }
      }
    };
  }

  private loadRoom(gx: number, gy: number, spawnX: number, spawnY: number): void {
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
    this.specialObjs = { plates: [] };

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

    this.playerState.gx = gx;
    this.playerState.gy = gy;
    this.playerSprite.setPosition(spawnX, spawnY);
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

    // Pillars & Props (skip pillars in boss room for clean arena)
    if (room.type !== 'boss' && room.type !== 'merchant' && room.type !== 'healing') {
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
      for (const h of template.hazards) {
        const hx = h.tx * 16 + 8;
        const hy = h.ty * 16 + 8;
        const hRect = this.add.rectangle(hx, hy, 15, 15, biome.accent, 0.48).setStrokeStyle(1, 0x100d24).setDepth(2);
        this.roomGroup.add(hRect);
        this.hazards.push({ x: hx, y: hy, radius: 8, gfx: hRect, tickMs: 0 });
      }
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
      } else {
        this.spawnExitPortal();
      }
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
    } else if (room.type === 'puzzle' && room.puzzlePlates) {
      for (const pl of room.puzzlePlates) {
        const px = pl.tx * 16 + 8;
        const py = pl.ty * 16 + 8;
        const sp = this.add.image(px, py, pl.activated ? 'obj_plate_lit' : 'obj_plate').setDepth(3);
        const num = addPixelText(this, px, py - 12, `${pl.order}`, 8, 0xffe066, 0.5, 0.5).setDepth(4);
        this.roomGroup.add(sp);
        this.roomGroup.add(num);
        this.specialObjs.plates.push({ id: pl.id, order: pl.order, sprite: sp, x: px, y: py });
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
    let key = 'item_shard';
    if (kind === 'heart') key = 'item_heart';
    else if (kind === 'chest') key = 'obj_chest_closed';
    else if (kind === 'item' && itemId) key = `item_${itemId}`;

    const sp = this.add.image(x, y, this.textures.exists(key) ? key : 'item_shard').setDepth(6);
    this.roomGroup.add(sp);
    this.lootObjs.push({ uid, kind, sprite: sp, itemId, uses, amount, collected: false });
  }

  private spawnPersistentFloorItem(itemId: string, x: number, y: number, uses?: number): void {
    const uid = `drop_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const cx = Phaser.Math.Clamp(Math.round(x), 24, 152);
    const cy = Phaser.Math.Clamp(Math.round(y), 24, 152);
    this.currentRoom.loot.push({
      uid,
      kind: 'item',
      x: cx,
      y: cy,
      itemId,
      uses,
      collected: false,
    });
    this.createLootObject(uid, 'item', cx, cy, itemId, undefined, uses);
    net.broadcastInteract({
      peerId: this.playerState.id,
      gx: this.currentRoom.gx,
      gy: this.currentRoom.gy,
      kind: 'drop',
      targetId: uid,
      itemId,
      uses,
      x: cx,
      y: cy,
    });
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
    const angle = Phaser.Math.Angle.Between(
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
        });
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
        });
        SoundSystem.playHeal();
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0xc084fc, 14);
        this.ui.showToast('Necromancy Altar revived all allies!', '#c084fc');
      } else {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 6);
        SoundSystem.playHeal();
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
            }
            this.spawnParticles(cs.x, cs.y, 0xb08968, 5);
            if (Math.random() < 0.4) {
              const uid = `cr_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
              this.currentRoom.loot.push({ uid, kind: 'shard', x: cs.x, y: cs.y, amount: 1, collected: false });
              this.createLootObject(uid, 'shard', cs.x, cs.y, undefined, 1);
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
    cometBoost = false
  ): void {
    const sp = this.physics.add.sprite(x, y, 'proj_orb').setDepth(11).setTint(color);
    this.projectiles.push({
      sprite: sp,
      fromPlayer: true,
      ownerId,
      damage,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifeMs: boomerang ? 1200 : 1600,
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
    });
  }

  private createEnemyProjectile(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color: number,
    burns = false
  ): void {
    const sp = this.physics.add.sprite(x, y, 'proj_orb').setDepth(11).setTint(color);
    this.projectiles.push({
      sprite: sp,
      fromPlayer: false,
      ownerId: 'enemy',
      damage,
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
    enemy.hp -= dmg;
    enemy.hitFlashMs = 120;
    enemy.sprite.setTint(0xffffff);
    SoundSystem.playHit();
    this.spawnParticles(enemy.sprite.x, enemy.sprite.y, 0xf49ac1, 4);

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
    enemy.sprite.destroy();
    this.activeEnemies = this.activeEnemies.filter((e) => e !== enemy);
    this.totalEnemiesDefeated++;
    this.spawnParticles(ex, ey, 0xffe066, 10);

    const roomEnemy = this.currentRoom.enemies.find((e) => e.uid === enemy.uid);
    if (roomEnemy) roomEnemy.alive = false;

    if (enemy.isBoss) {
      this.currentRoom.bossDefeated = true;
      this.currentRoom.cleared = true;
      this.currentRoom.doorsLocked = false;
      this.updateDoorVisuals();
      SoundSystem.playUnlock();
      this.spawnExitPortal();
      this.createLootObject(`boss_sh_${Date.now()}`, 'shard', ex - 16, ey, undefined, 12);
      this.createLootObject(`boss_itm_${Date.now()}`, 'item', ex + 16, ey, rollRandomItemId(new SeededRandom(Date.now())));
      this.triggerStarseed();
      return;
    }

    const def = ENEMIES[enemy.defId];
    const bonusShard = this.floor.modifier === 'greedy_shadows' ? 1 : 0;
    this.createLootObject(`sh_${Date.now()}_${Math.random()}`, 'shard', ex, ey, undefined, (def?.shardDrop ?? 2) + bonusShard);
    if (Math.random() < 0.18) {
      this.createLootObject(`ht_${Date.now()}_${Math.random()}`, 'heart', ex + 8, ey);
    }
    if (enemy.isElite) {
      this.triggerStarseed();
      this.createLootObject(`el_itm_${Date.now()}`, 'item', ex - 10, ey, rollRandomItemId(new SeededRandom(Date.now())));
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
          SoundSystem.playUnlock();
          const rng = new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
          const itemId = rollRandomItemId(rng);
          this.createLootObject(`ch_itm_${Date.now()}`, 'item', l.sprite.x, l.sprite.y + 14, itemId);
          const extra = this.floor.modifier === 'starfall' ? 6 : 3;
          this.createLootObject(`ch_sh_${Date.now()}`, 'shard', l.sprite.x - 14, l.sprite.y + 8, undefined, extra);
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
        this.createLootObject(`well_${Date.now()}`, 'item', 88, 102, itemId);
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
      this.createLootObject(`altar_${Date.now()}`, 'item', 88, 102, itemId);
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
    const angle = Phaser.Math.Angle.Between(
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
      const allInBoss = Array.from(this.remotePlayers.values()).every((p) => p.gx === 5 && p.gy === 2);
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
      this.playerSprite.setFrame(5);
      this.ui.showToast('You are downed! Ally can revive [E]', '#ff5d8f');
    }
  }

  private reviveSelf(): void {
    this.playerState.downed = false;
    this.playerState.hp = 4;
    this.invulnMs = 1200;
    this.playerSprite.setFrame(0);
    SoundSystem.playHeal();
    this.ui.showToast('Revived!', '#66ffd9');
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
    if (this.paused || this.transitioningLevel) return;

    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.invulnMs = Math.max(0, this.invulnMs - delta);
    this.doorCooldownMs = Math.max(0, this.doorCooldownMs - delta);
    this.plateCooldownMs = Math.max(0, this.plateCooldownMs - delta);

    // Status effects tick
    const hadVitality = StatusEffectManager.has(this.playerState.statusEffects, 'vitality');
    this.playerState.statusEffects = StatusEffectManager.tick(this.playerState.statusEffects, delta);
    if (hadVitality && !StatusEffectManager.has(this.playerState.statusEffects, 'vitality')) {
      this.playerState.maxHp = Math.max(16, this.playerState.maxHp - 4);
      this.playerState.hp = Math.max(1, Math.min(this.playerState.maxHp, this.playerState.hp - 4));
      this.ui.showToast('Everheart Elixir wore off', '#b8a1ff');
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
    this.checkDoorTransitions();
    this.updateFireflies(delta);
    this.syncMultiplayer(delta);
    this.pushUIUpdate();
  }

  private updatePlayerMovement(time: number, delta: number): void {
    if (this.playerState.downed) {
      this.playerSprite.setVelocity(0, 0);
      this.playerSprite.setFrame(5);
      this.playerState.downedTimerMs -= delta;
      if (this.playerState.downedTimerMs <= 0) {
        const anyAlive = Array.from(this.remotePlayers.values()).some((p) => !p.downed);
        if (!anyAlive) {
          this.scene.stop('UIScene');
          this.scene.start('GameOverScene', {
            victory: false,
            levelReached: this.levelIndex + 1,
            shardsCollected: this.totalShardsCollected,
            enemiesDefeated: this.totalEnemiesDefeated,
          });
        }
      }
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

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }

    // Dodge input
    if ((Phaser.Input.Keyboard.JustDown(this.keys.space) || Phaser.Input.Keyboard.JustDown(this.keys.shift)) && this.dodgeMs <= 0) {
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
    if (net.mode === 'client') return;

    const px = this.playerSprite.x;
    const py = this.playerSprite.y;

    for (const e of [...this.activeEnemies]) {
      if (!e.sprite.active) continue;

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

      // Contact damage
      if (dist < (e.isBoss ? 20 : 12)) {
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
        continue;
      }

      e.aiTimerMs -= delta;

      if (e.isBoss) {
        this.updateBossAI(e, angle, dist, delta, slowFactor);
        continue;
      }

      const spd = e.speed * slowFactor;
      if (e.behavior === 'chase' || e.behavior === 'shielded') {
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
        this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 115, e.damage, def.projectileColor, burns);
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

  private updateBossAI(e: ActiveEnemy, angle: number, _dist: number, delta: number, slowFactor: number): void {
    const bossDef = BOSSES[e.defId];
    if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
      e.phase = 2;
      this.ui.showToast(`${bossDef.name} enters Phase 2!`, '#ff47b6');
      this.spawnParticles(e.sprite.x, e.sprite.y, bossDef.accentColor, 14);
    }

    const isFirstBoss = e.defId === 'hollow_stag';

    // First boss spends 1 extra second in an idle position before attacking/switching state
    if (e.idleMs > 0) {
      e.idleMs -= delta;
      e.sprite.setVelocity(0, 0);
      if (e.idleMs > 0) return;
      // Idle pause finished: execute attack now
      e.aiTimerMs = e.phase === 2 ? 1450 : 1850;
      const projDmg = isFirstBoss ? 1 : e.damage;
      const pattern = Math.random();
      if (pattern < 0.45) {
        const bolts = e.phase === 2 ? 8 : 5;
        for (let i = 0; i < bolts; i++) {
          const a = angle + (Math.PI * 2 * i) / bolts;
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
      if (isFirstBoss) {
        e.idleMs = 1000;
        e.sprite.setVelocity(0, 0);
        return;
      }

      e.aiTimerMs = e.phase === 2 ? 1150 : 1550;
      const pattern = Math.random();
      const burns = e.defId === 'withered_everheart';
      if (pattern < 0.45) {
        // Radial burst
        const bolts = e.phase === 2 ? 8 : 5;
        for (let i = 0; i < bolts; i++) {
          const a = angle + (Math.PI * 2 * i) / bolts;
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, a, 120, e.damage, bossDef.accentColor, burns);
        }
      } else if (pattern < 0.8) {
        // Charge telegraph
        e.windupMs = 380;
        e.sprite.setTint(0xffe066);
      } else {
        // Aimed 3-way spread
        for (const off of [-0.25, 0, 0.25]) {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 140, e.damage, bossDef.accentColor, burns);
        }
      }
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

      p.sprite.setVelocity(p.vx, p.vy);

      // Wall bounce or destroy
      if (p.sprite.x < 16 || p.sprite.x > 160 || p.sprite.y < 16 || p.sprite.y > 160) {
        if (p.bouncesLeft > 0) {
          p.bouncesLeft--;
          if (p.sprite.x < 16 || p.sprite.x > 160) p.vx *= -1;
          if (p.sprite.y < 16 || p.sprite.y > 160) p.vy *= -1;
        } else {
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (p.fromPlayer && p.ownerId === this.playerState.id) {
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

    for (const h of this.hazards) {
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
            this.currentRoom.puzzleSolved = true;
            this.currentRoom.cleared = true;
            SoundSystem.playUnlock();
            this.ui.showToast('Puzzle solved!', '#66ffd9');
            const itemId = rollRandomItemId(new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
            this.createLootObject(`puz_${Date.now()}`, 'item', 88, 88, itemId);
          }
        } else {
          // Reset sequence
          for (const p of plates) p.activated = false;
          for (const s of this.specialObjs.plates) s.sprite.setTexture('obj_plate');
          SoundSystem.playHit();
          this.ui.showToast('Wrong order! Step 1 -> 2 -> 3', '#ff5d8f');
        }
      }
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
        vis.sprite.setPosition(st.x, st.y).setFlipX(st.flipX);
        vis.sprite.setFrame(st.downed ? 5 : st.dodging ? 4 : 0);
        vis.label.setPosition(st.x, st.y - 16);

        // Spread burning on direct contact with another player (preserving remaining duration)
        if (!this.playerState.downed && !st.downed) {
          const remoteBurn = st.statusEffects.find((e) => e.id === 'burning' && e.remainingMs > 0);
          if (remoteBurn && Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, st.x, st.y) < 14) {
            const localBurn = this.playerState.statusEffects.find((e) => e.id === 'burning');
            if (!localBurn) {
              StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', remoteBurn.remainingMs);
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
              loot: r.loot.map((l) => ({ uid: l.uid, collected: l.collected })),
            });
          }
        }
        net.broadcastWorldSync({
          levelIndex: this.levelIndex,
          floorSeed: this.floorSeed,
          modifier: this.floor.modifier,
          players: [this.playerState, ...Array.from(this.remotePlayers.values())],
          roomStates,
        });
      }
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

    this.ui.updateState({
      player: this.playerState,
      allies: Array.from(this.remotePlayers.values()),
      levelIndex: this.levelIndex,
      modifierId: this.floor.modifier as LevelModifierId,
      rooms: this.floor.rooms,
      currentRoom: this.currentRoom,
      bossInfo,
      promptText,
    });
  }
}
