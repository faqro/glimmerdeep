import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { BIOMES } from '../data/biomes';
import { BOSSES, ENEMIES } from '../data/enemies';
import { ARTIFACTS, CONSUMABLES } from '../data/items';
import { getPetById, getSavedPetId, PetDef } from '../data/pets';
import { ROOM_TEMPLATES } from '../data/roomTemplates';
import { WEAPONS } from '../data/weapons';
import { SoundSystem } from '../audio/SoundSystem';
import { isMobileMode, mobileInput } from '../mobile/MobileInput';
import { getControlActionText } from '../systems/ControlHints';
import { DungeonGenerator, GeneratedFloor } from '../systems/DungeonGenerator';
import { inputSystem, localCoopSession } from '../systems/InputSystem';
import { addItemToSlots, consumeUse, createItemInstance, hasArtifact, rollBossCombatItemId, rollRandomItemId, rollSecretChestItemId } from '../systems/InventorySystem';
import { JournalSystem } from '../systems/JournalSystem';
import { net, NetRoomSync, NetWorldSync, SyncedProjectile } from '../systems/MultiplayerSystem';
import { StatusEffectManager } from '../systems/StatusEffectSystem';
import { settingsSystem } from '../systems/SettingsSystem';
import { grantAdminMasterUnlock, steamSystem } from '../systems/SteamSystem';
import {
  Direction,
  InventoryItem,
  LevelModifierId,
  PlayerStateSnapshot,
  RoomData,
  StatusEffectId,
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
  slowFxMs?: number;
  frostSlowMs?: number;
  windSlowMs?: number;
  frozenMs?: number;
  iceHits?: number;
  iceGfx?: Phaser.GameObjects.Graphics;
  bubbledMs: number;
  bubbleGfx?: Phaser.GameObjects.Graphics;
  bubbleDriftVx?: number;
  bubbleDriftVy?: number;
  burningMs: number;
  burnTickMs: number;
  burnFxMs: number;
  hitFlashMs: number;
  phase: number;
  bossStep?: number;
  shieldOrbs?: Phaser.GameObjects.Image[];
  shieldAngle?: number;
  blockedShots?: number;
  repositionMs?: number;
  repositionDir?: number;
  attackBurstLeft?: number;
  attackBurstTimerMs?: number;
  attackPhase?: number;
  telegraphMs?: number;
  telegraphKind?: string;
  dashRingOnEnd?: boolean;
  oozeTrailMs?: number;
  targetX?: number;
  targetY?: number;
  targetVx?: number;
  targetVy?: number;
  lastSyncAt?: number;
}

interface ActivePet {
  def: PetDef;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
  z: number;
  animTimerMs: number;
  hopTimerMs: number;
  hopCooldownMs: number;
  isFlying: boolean;
  facingLeft: boolean;
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
  freezes?: boolean;
  bubbles: boolean;
  bubbled?: boolean;
  bubbleGfx?: Phaser.GameObjects.Graphics;
  burns: boolean;
  cometBoost?: boolean;
  slimeSplatter?: boolean;
  splitSpore?: boolean;
  starShatter?: boolean;
  voidRift?: boolean;
  shockBlast?: boolean;
  starBomb?: boolean;
  lunarDisc?: boolean;
  lunarSliceMs?: number;
  isMusicNote?: boolean;
  floatPhase?: number;
  healsAlly?: boolean;
  healAmount?: number;
  textureKey?: string;
  spinSpeed?: number;
  rotateToVelocity?: boolean;
  wobbleAmp?: number;
  wobbleFreq?: number;
  wobblePhase?: number;
  accel?: number;
  curveRate?: number;
  sporeBurst?: boolean;
  inflictEffect?: StatusEffectId;
  inflictDurationMs?: number;
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
  bonusItemId?: string;
  uses?: number;
  amount?: number;
  collected: boolean;
}

interface ActiveSkeleton {
  uid: string;
  staffInstanceId: string;
  ownerId?: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  maxHp: number;
  attackCooldownMs: number;
  hitFlashMs: number;
  formationIndex: number;
}

interface CarriedSkeletonState {
  uid: string;
  staffInstanceId: string;
  ownerId?: string;
  hp: number;
  maxHp: number;
  formationIndex: number;
}

interface RunAchievementFlags {
  boughtAnything: boolean;
  revivedAnyone: boolean;
  hurtAnyEnemy: boolean;
  healedAtAll: boolean;
}

interface LocalPlayerActor {
  slotIndex: number;
  inputType: 'gamepad' | 'keyboard';
  padIndex: number;
  state: PlayerStateSnapshot;
  sprite: Phaser.Physics.Arcade.Sprite;
  wardRing: Phaser.GameObjects.Arc;
  aimReticle: Phaser.GameObjects.Arc;
  nameTag: Phaser.GameObjects.BitmapText;
  attackCooldownMs: number;
  invulnMs: number;
  dodgeMs: number;
  dodgeVx: number;
  dodgeVy: number;
  spikePinnedMs: number;
  staminaRegenMs: number;
  statusTickMs: number;
  burnFxMs: number;
  hitFlashMs: number;
  slowTinted: boolean;
  windSlowMs: number;
  windSlowTinted: boolean;
  respawnAnimMs: number;
  beamDamageTickMs: number;
  flameDamageTickMs: number;
  cometTrailActiveMs: number;
  cometTrailAccumMs: number;
}

export class GameScene extends Phaser.Scene {
  private levelIndex = 0;
  private floorSeed = 123456;
  private floor!: GeneratedFloor;
  private currentRoom!: RoomData;

  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  private wardRing!: Phaser.GameObjects.Arc;
  private aimReticle!: Phaser.GameObjects.Arc;
  private playerState!: PlayerStateSnapshot;
  private localPlayers: LocalPlayerActor[] = [];
  private activeLocalActor: LocalPlayerActor | null = null;
  private remotePlayers = new Map<string, PlayerStateSnapshot>();
  private remotePlayerLastDirectAt = new Map<string, number>();
  private remoteSprites = new Map<
    string,
    {
      sprite: Phaser.GameObjects.Sprite;
      label: Phaser.GameObjects.BitmapText;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      lastRecvAt: number;
    }
  >();
  private disconnectedPlayers = new Map<string, { levelIndex: number; snapshot: PlayerStateSnapshot }>();

  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private crateGroup!: Phaser.Physics.Arcade.StaticGroup;
  private doorBlockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private pushBlockGroup!: Phaser.Physics.Arcade.Group;
  private skeletonGroup!: Phaser.Physics.Arcade.Group;
  private doorZones: Array<{
    dir: Direction;
    rect: Phaser.Geom.Rectangle;
    gfx: Phaser.GameObjects.Graphics;
    x: number;
    y: number;
    w: number;
    h: number;
    targetGx?: number;
    targetGy?: number;
    spawnX?: number;
    spawnY?: number;
    isBossGate?: boolean;
    isTestExit?: boolean;
    isTutorialExit?: boolean;
  }> = [];
  private roomGroup!: Phaser.GameObjects.Group;
  private roomWidthPx = 176;
  private roomHeightPx = 176;
  private isTestRoom = false;
  private isTutorial = false;
  private tutorialReturnToMenu = false;
  private testSpawnCooldownMs = 0;
  private testWaveCount = 4;
  private testCrateRespawnTimers = new Map<string, number>();
  private testHealingPad: { x: number; y: number; cooldownMs: number } | null = null;
  private lastLavaFrame = -1;

  private activeEnemies: ActiveEnemy[] = [];
  private summonedSkeletons: ActiveSkeleton[] = [];
  private playerPet: ActivePet | null = null;
  private remotePets = new Map<string, ActivePet>();
  private projectiles: ActiveProjectile[] = [];
  private hazards: ActiveHazard[] = [];
  private slimeSplatters: Array<{ x: number; y: number; radius: number; gfx: Phaser.GameObjects.Graphics; lifeMs: number; fromEnemy?: boolean }> = [];
  private playerHitFlashMs = 0;
  private playerSlowTinted = false;
  private playerWindSlowMs = 0;
  private playerWindSlowTinted = false;
  private floorWeatherElapsedMs = 0;
  private roomWeatherOffsets = new Map<string, number>();
  private acidRainDmgTimerMs = 3500;
  private roomWindTimers = new Map<string, number>();
  private weatherGfx?: Phaser.GameObjects.Graphics;
  private rainDrops: Array<{ x: number; y: number; vx: number; vy: number; len: number; targetY: number }> = [];
  private rainSplashes: Array<{ x: number; y: number; lifeMs: number; maxLifeMs: number; color: number }> = [];
  private windStreaks: Array<{ x: number; y: number; vx: number; len: number; lifeMs: number; maxLifeMs: number }> = [];
  private cometTrailActiveMs = 0;
  private cometTrailAccumMs = 0;
  private cometTrailNodes: Array<{ x: number; y: number; gfx: Phaser.GameObjects.Graphics; lifeMs: number; hitUids: Set<string> }> = [];
  private pillarObjs: Array<{ idx: number; x: number; y: number; tx: number; ty: number; gfx: Phaser.GameObjects.Graphics }> = [];
  private spikeTraps: ActiveSpikeTrap[] = [];
  private lootObjs: ActiveLootObj[] = [];
  private fireflies: Array<{ sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }> = [];
  private beamGfx!: Phaser.GameObjects.Graphics;
  private beamDamageTickMs = 0;
  private beamDrainAccumMs = 0;
  private beamFxAccumMs = 0;
  private flameDamageTickMs = 0;
  private flameDrainAccumMs = 0;
  private flameFxAccumMs = 0;
  private prismBeams: Array<{
    gfx: Phaser.GameObjects.Graphics;
    ownerId: string;
    isLocal: boolean;
    angle: number;
    range: number;
    damage: number;
    chargeMs: number;
    activeMs: number;
    fxAccumMs: number;
    hitUids: Set<string>;
  }> = [];

  // Level 7 & Nyarlathotep Boss State
  private l7WhisperStep = 0;
  private l7BossGateUnlockedToastShown = false;
  private nyarlathotepSummonPending = false;
  private nyarlathotepSummoning = false;
  private nyarWaitToastCooldownMs = 0;
  private nyarGfx?: Phaser.GameObjects.Graphics;
  private nyarArmState: 'idle' | 'extending' | 'holding' | 'recoiling' = 'idle';
  private nyarArmAngle = 0;
  private nyarArmLength = 0;
  private nyarArmMaxLength = 126;
  private nyarArmCooldownMs = 2600;
  private nyarGrabbedMs = 0;
  private nyarThrowMs = 0;
  private nyarThrowVx = 0;
  private nyarThrowVy = 0;
  private nyarBeamState: 'idle' | 'telegraph' | 'sweeping' = 'idle';
  private nyarBeamTimerMs = 0;
  private nyarBeamAngle = 0;
  private nyarBeamSweepDir = 1;
  private nyarBeamCooldownMs = 4500;
  private nyarBeamHitCooldownMs = 0;
  private nyarSpawnTimerMs = 3500;
  private nyarRainTimerMs = 4000;
  private nyarRainHeartAlt = false;
  private nyarDialogueTimerMs = 5500;
  private nyarDialoguePool: string[] = [];
  private nyarDialogueIdx = 0;

  // Clockwork Witch Sweeping Laser State
  private witchGfx?: Phaser.GameObjects.Graphics;
  private witchLaserState: 'idle' | 'telegraph' | 'sweeping' = 'idle';
  private witchLaserTimerMs = 0;
  private witchLaserAngle = 0;
  private witchLaserSweepDir = 1;
  private witchLaserHitCooldownMs = 0;

  // Withered Everheart Distinct Attacks State
  private everheartGfx?: Phaser.GameObjects.Graphics;
  private everheartThorns: Array<{ x: number; y: number; timerMs: number; erupted: boolean; hit: boolean }> = [];
  private everheartPulses: Array<{ x: number; y: number; radius: number; maxRadius: number; hit: boolean }> = [];
  private everheartTetherMs = 0;

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
  private runStartMs = 0;
  private usedCheatsInRun = false;
  private runFlags: RunAchievementFlags = {
    boughtAnything: false,
    revivedAnyone: false,
    hurtAnyEnemy: false,
    healedAtAll: false,
  };
  private netSyncTimerMs = 0;
  private worldSyncTimerMs = 0;
  private plateCooldownMs = 0;
  private blockPushCooldownMs = 0;
  private giantStompCooldownMs = 0;
  private giantStepShakeCooldownMs = 0;
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
    simonCenter?: { sprite: Phaser.GameObjects.Image; x: number; y: number };
    plates: Array<{ id: string; order: number; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
    mirrors: Array<{ id: string; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
    blocks: Array<{ id: string; sprite: Phaser.Physics.Arcade.Sprite }>;
    blockGoals: Array<{ tx: number; ty: number; sprite: Phaser.GameObjects.Image }>;
    lights: Array<{ id: string; gx: number; gy: number; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
    simonRunes: Array<{ id: string; idx: number; color: number; sprite: Phaser.GameObjects.Image; x: number; y: number }>;
  } = { plates: [], mirrors: [], blocks: [], blockGoals: [], lights: [], simonRunes: [] };
  private simonPlaying = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  private getRenderScale(): number {
    return localCoopSession.active ? 4 : 1;
  }

  create(data: {
    levelIndex?: number;
    floorSeed?: number;
    resetRun?: boolean;
    carryPlayer?: PlayerStateSnapshot;
    carryLocalPlayers?: PlayerStateSnapshot[];
    carrySkeletons?: CarriedSkeletonState[];
    carryRunStartMs?: number;
    carryRunFlags?: RunAchievementFlags;
    carryUsedCheats?: boolean;
    restoreReconnect?: boolean;
    exitedTestRoom?: boolean;
    isTutorial?: boolean;
    tutorialReturnToMenu?: boolean;
  }): void {
    this.levelIndex = data.levelIndex ?? 0;
    this.floorSeed = data.floorSeed ?? getDailySeed(this.levelIndex);
    this.runStartMs = data.resetRun || !data.carryRunStartMs ? Date.now() : data.carryRunStartMs;
    this.runFlags =
      data.resetRun || !data.carryRunFlags
        ? { boughtAnything: false, revivedAnyone: false, hurtAnyEnemy: false, healedAtAll: false }
        : { ...data.carryRunFlags };
    if (!data.isTutorial) {
      if (this.levelIndex >= 2) void steamSystem.unlockAchievement('ACH_FLOOR_3');
      if (this.levelIndex >= 5) void steamSystem.unlockAchievement('ACH_FLOOR_6');
    }
    this.transitioningLevel = false;
    this.paused = false;
    this.testSpawnCooldownMs = 0;
    this.testWaveCount = 4;
    this.l7WhisperStep = 0;
    this.l7BossGateUnlockedToastShown = false;
    this.nyarlathotepSummonPending = false;
    this.nyarlathotepSummoning = false;
    this.nyarWaitToastCooldownMs = 0;
    this.remotePlayers.clear();
    this.remotePlayerLastDirectAt.clear();
    this.remoteSprites.clear();
    this.disconnectedPlayers.clear();
    this.spectateTargetId = null;

    if (data.resetRun || !data.carryPlayer) {
      this.totalShardsCollected = 0;
      this.totalEnemiesDefeated = 0;
      const isSecretLoadout = net.localName === 'SECRET';
      const isTesterLoadout = net.localName === 'TESTER' && !data.exitedTestRoom;
      this.playerState = {
        id: net.localPeerId,
        name: net.localName,
        paletteId: net.localPaletteId,
        petId: steamSystem.isAvatarDlcUnlocked() ? (net.localPetId ?? getSavedPetId()) : null,
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
        inventory: isTesterLoadout
          ? [null, null, null]
          : isSecretLoadout
            ? [
                createItemInstance('shugorons_horn'),
                createItemInstance('black_staff'),
                createItemInstance('haunters_eye'),
              ]
            : [createItemInstance('moonblade'), createItemInstance('heartdew_potion'), null],
        statusEffects: [],
        inExitReady: false,
        animState: 'idle',
        flipX: false,
      };
      if (isSecretLoadout) {
        JournalSystem.discoverItem('shugorons_horn');
        JournalSystem.discoverItem('black_staff');
        JournalSystem.discoverItem('haunters_eye');
      } else if (!isTesterLoadout) {
        JournalSystem.discoverItem('moonblade');
        JournalSystem.discoverItem('heartdew_potion');
      }
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
        gx: this.levelIndex === 6 ? 0 : 0,
        gy: this.levelIndex === 6 ? 1 : 2,
        x: this.levelIndex === 6 ? 36 : 88,
        y: this.levelIndex === 6 ? 72 : 88,
        inExitReady: false,
      };
    }

    const playerCount = localCoopSession.active
      ? Math.max(1, localCoopSession.players.length)
      : net.mode === 'solo'
        ? 1
        : Math.max(1, net.players.size);
    if (this.playerState.name === 'ADMIN' || net.localName === 'ADMIN') {
      JournalSystem.unlockAll();
    }
    if (this.playerState.name === 'ADMIN12345' || net.localName === 'ADMIN12345') {
      grantAdminMasterUnlock();
    }
    this.isTestRoom =
      (this.playerState.name === 'TESTER' || net.localName === 'TESTER') &&
      (data.resetRun || !data.carryPlayer) &&
      !data.exitedTestRoom;
    const cheatNames = new Set(['ADMIN', 'ADMIN2', 'TESTER', 'ADMIN12345']);
    this.usedCheatsInRun =
      (!data.resetRun && Boolean(data.carryUsedCheats)) ||
      cheatNames.has(this.playerState.name) ||
      cheatNames.has(net.localName) ||
      this.isTestRoom ||
      Boolean(data.exitedTestRoom);
    this.isTutorial = Boolean(data.isTutorial) && !this.isTestRoom;
    this.tutorialReturnToMenu = Boolean(data.tutorialReturnToMenu);
    this.floor = this.isTestRoom
      ? DungeonGenerator.generateTestFloor(this.floorSeed)
      : this.isTutorial
        ? DungeonGenerator.generateTutorialFloor(this.floorSeed)
        : DungeonGenerator.generateFloor(this.levelIndex, this.floorSeed, playerCount);
    this.initFloorWeather();
    const spawnGx = data.restoreReconnect ? this.playerState.gx : 0;
    const spawnGy = data.restoreReconnect ? this.playerState.gy : this.levelIndex === 6 ? 1 : 2;
    const spawnX = data.restoreReconnect
      ? this.playerState.x
      : this.isTestRoom
        ? 168
        : this.levelIndex === 6
          ? 36
          : 88;
    const spawnY = data.restoreReconnect
      ? this.playerState.y
      : this.isTestRoom
        ? 408
        : this.levelIndex === 6
          ? 72
          : 88;
    if ((this.levelIndex === 6 || this.isTestRoom) && !data.restoreReconnect) {
      this.playerState.gx = spawnGx;
      this.playerState.gy = spawnGy;
      this.playerState.x = spawnX;
      this.playerState.y = spawnY;
    }
    this.currentRoom = this.floor.rooms[spawnGy][spawnGx];

    this.roomGroup = this.add.group();
    this.wallGroup = this.physics.add.staticGroup();
    this.crateGroup = this.physics.add.staticGroup();
    this.doorBlockGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.pushBlockGroup = this.physics.add.group({ immovable: true });
    this.skeletonGroup = this.physics.add.group();
    this.beamGfx = this.add.graphics().setDepth(12);

    const renderScale = this.getRenderScale();
    const targetW = 360 * renderScale;
    const targetH = 270 * renderScale;
    if (this.scale.width !== targetW || this.scale.height !== targetH) {
      this.scale.setGameSize(targetW, targetH);
    }

    this.physics.world.setBounds(0, 0, 176, 176);
    this.cameras.main.setZoom((localCoopSession.active ? 0.84 : 1.18) * renderScale);
    this.cameras.main.centerOn(88, 88);
    const origShake = this.cameras.main.shake.bind(this.cameras.main);
    this.cameras.main.shake = ((
      duration?: number,
      intensity?: number,
      force?: boolean,
      callback?: Phaser.Types.Cameras.Scene2D.CameraShakeCallback,
      context?: unknown
    ) => {
      if (!settingsSystem.current.screenShake) return this.cameras.main;
      const scale = this.getRenderScale();
      const scaledIntensity = typeof intensity === 'number' ? intensity / (scale * scale) : intensity;
      return origShake(duration, scaledIntensity, force, callback, context);
    }) as typeof this.cameras.main.shake;

    this.localPlayers = [];
    this.activeLocalActor = null;

    if (localCoopSession.active && localCoopSession.players.length > 0) {
      const tagColors = [0x66ffd9, 0xffe066, 0xf49ac1, 0x6ef3ff];
      localCoopSession.players.forEach((cfg, idx) => {
        const carried = !data.resetRun ? data.carryLocalPlayers?.[idx] : undefined;
        const st: PlayerStateSnapshot = carried
          ? {
              ...carried,
              gx: carried.downed ? -1 : 0,
              gy: carried.downed ? -1 : this.levelIndex === 6 ? 1 : 2,
              x: carried.downed ? carried.x : this.levelIndex === 6 ? 36 : 88,
              y: carried.downed ? carried.y : this.levelIndex === 6 ? 72 : 88,
              inExitReady: false,
            }
          : {
              id: `local_${idx}`,
              name: cfg.name,
              paletteId: cfg.paletteId,
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
              inventory:
                net.localName === 'TESTER' && !data.exitedTestRoom
                  ? [null, null, null]
                  : [createItemInstance('moonblade'), createItemInstance('heartdew_potion'), null],
              statusEffects: [],
              inExitReady: false,
              animState: 'idle',
              flipX: false,
            };

        const sp = this.physics.add.sprite(88, 88, `player_${st.paletteId}`, 0);
        sp.setDepth(10);
        sp.setSize(7, 7);
        sp.setOffset(4.5, 9.5);
        sp.setCollideWorldBounds(true);
        this.physics.add.collider(sp, this.wallGroup);
        this.physics.add.collider(sp, this.crateGroup);
        this.physics.add.collider(sp, this.pushBlockGroup);
        this.physics.add.collider(sp, this.doorBlockGroup, undefined, (_p, blockerObj) => {
          const b = blockerObj as Phaser.GameObjects.GameObject;
          if (!b.getData('isDoorGate')) return false;
          return this.currentRoom.doorsLocked || (Boolean(b.getData('isBossGate')) && !this.areAllLevel7ChambersCleared());
        });

        const wr = this.add.circle(88, 88, 13, 0x6ef3ff, 0.12).setStrokeStyle(1, 0x6ef3ff, 0.85).setDepth(11).setVisible(false);
        const ar = this.add.circle(88, 88, 2, 0xffe066, 0.9).setStrokeStyle(1, 0x100d24, 0.9).setDepth(15).setVisible(false);
        const nt = addPixelText(this, 88, 76, cfg.name, 8, tagColors[idx % tagColors.length], 0.5, 1).setDepth(14);

        this.localPlayers.push({
          slotIndex: idx,
          inputType: cfg.inputType,
          padIndex: cfg.padIndex,
          state: st,
          sprite: sp,
          wardRing: wr,
          aimReticle: ar,
          nameTag: nt,
          attackCooldownMs: 0,
          invulnMs: 0,
          dodgeMs: 0,
          dodgeVx: 0,
          dodgeVy: 0,
          spikePinnedMs: 0,
          staminaRegenMs: 0,
          statusTickMs: 0,
          burnFxMs: 0,
          hitFlashMs: 0,
          slowTinted: false,
          windSlowMs: 0,
          windSlowTinted: false,
          respawnAnimMs: 0,
          beamDamageTickMs: 0,
          flameDamageTickMs: 0,
          cometTrailActiveMs: 0,
          cometTrailAccumMs: 0,
        });
      });

      const first = this.localPlayers[0];
      this.playerState = first.state;
      this.playerSprite = first.sprite;
      this.wardRing = first.wardRing;
      this.aimReticle = first.aimReticle;
      this.spawnOrResetPlayerPet(this.playerSprite.x, this.playerSprite.y);
    } else {
      this.playerSprite = this.physics.add.sprite(88, 88, `player_${this.playerState.paletteId}`, 0);
      this.playerSprite.setDepth(10);
      this.playerSprite.setSize(7, 7);
      this.playerSprite.setOffset(4.5, 9.5);
      this.playerSprite.setCollideWorldBounds(true);

      this.wardRing = this.add.circle(88, 88, 13, 0x6ef3ff, 0.12).setStrokeStyle(1, 0x6ef3ff, 0.85).setDepth(11).setVisible(false);
      this.aimReticle = this.add.circle(88, 88, 2, 0xffe066, 0.9).setStrokeStyle(1, 0x100d24, 0.9).setDepth(15).setVisible(false);

      this.physics.add.collider(this.playerSprite, this.wallGroup);
      this.physics.add.collider(this.playerSprite, this.crateGroup);
      this.physics.add.collider(this.playerSprite, this.pushBlockGroup);
      this.physics.add.collider(this.playerSprite, this.doorBlockGroup, undefined, (_p, blockerObj) => {
        const b = blockerObj as Phaser.GameObjects.GameObject;
        if (!b.getData('isDoorGate')) return false;
        return this.currentRoom.doorsLocked || (Boolean(b.getData('isBossGate')) && !this.areAllLevel7ChambersCleared());
      });

      this.spawnOrResetPlayerPet(this.playerSprite.x, this.playerSprite.y);
    }
    this.physics.add.collider(this.enemyGroup, this.wallGroup);
    this.physics.add.collider(this.enemyGroup, this.crateGroup);
    this.physics.add.collider(this.enemyGroup, this.doorBlockGroup);
    this.physics.add.collider(this.skeletonGroup, this.wallGroup);
    this.physics.add.collider(this.skeletonGroup, this.crateGroup);
    this.physics.add.collider(this.skeletonGroup, this.doorBlockGroup);
    this.physics.add.collider(this.skeletonGroup, this.skeletonGroup);

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
      SoundSystem.stopBossEvilLaughLoop();
      SoundSystem.setMusicTrack('menu');
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
    this.ui.setSkipTutorialHandler(this.isTutorial ? () => this.skipTutorial() : undefined);
    this.ui.setPauseChangeHandler((paused) => {
      this.paused = paused;
    });
    this.ui.setSpectateHandlers(
      () => this.cycleSpectateTarget(-1),
      () => this.cycleSpectateTarget(1)
    );

    this.loadRoom(spawnGx, spawnGy, spawnX, spawnY);

    if (data.carrySkeletons && data.carrySkeletons.length > 0 && !data.resetRun) {
      const skOffsets = [
        { dx: -12, dy: -8 },
        { dx: 12, dy: -8 },
        { dx: -12, dy: 8 },
        { dx: 12, dy: 8 },
      ];
      for (const cs of data.carrySkeletons) {
        const off = skOffsets[cs.formationIndex % skOffsets.length];
        const sx = Phaser.Math.Clamp(spawnX + off.dx, 24, Math.max(24, this.roomWidthPx - 24));
        const sy = Phaser.Math.Clamp(spawnY + off.dy, 24, Math.max(24, this.roomHeightPx - 24));
        const skSprite = this.physics.add.sprite(sx, sy, 'ally_skeleton', 0).setDepth(9);
        skSprite.setSize(10, 12);
        skSprite.setOffset(3, 4);
        skSprite.setCollideWorldBounds(true);
        this.skeletonGroup.add(skSprite);
        this.summonedSkeletons.push({
          uid: cs.uid,
          staffInstanceId: cs.staffInstanceId,
          ownerId: cs.ownerId,
          sprite: skSprite,
          hp: cs.hp,
          maxHp: cs.maxHp,
          attackCooldownMs: 0,
          hitFlashMs: 0,
          formationIndex: cs.formationIndex,
        });
      }
    }

    const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
    this.time.delayedCall(120, () => {
      if (this.isTutorial) {
        this.ui.showToast('Tutorial: Learn the ropes of Glimmerdeep!', '#66ffd9');
      } else {
        this.ui.showToast(
          data.restoreReconnect ? 'Reconnected to run!' : `Floor ${biome.level}: ${biome.name}`,
          data.restoreReconnect ? '#66ffd9' : '#f49ac1'
        );
      }
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
      if (this.ui?.isChatOpen()) return;
      this.ui.toggleMap();
    });

    let lastEscMs = 0;
    const handleEscToggle = () => {
      const now = performance.now();
      if (now - lastEscMs < 80) return;
      lastEscMs = now;
      if (!this.ui || this.ui.isChatOpen()) return;
      if (this.ui.isOverlayOpen()) {
        this.ui.closeShop();
        this.ui.closeMap();
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
      } else if (
        ev.key === 'Backspace' &&
        !ev.repeat &&
        (this.playerState.name === 'ADMIN' ||
          this.playerState.name === 'ADMIN2' ||
          net.localName === 'ADMIN' ||
          net.localName === 'ADMIN2')
      ) {
        ev.preventDefault();
        if (!this.paused && !this.ui.isOverlayOpen() && !this.transitioningLevel) {
          this.tryAdvanceLevel(true);
        }
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      if (this.scale.width !== 360 || this.scale.height !== 270) {
        this.scale.setGameSize(360, 270);
      }
      this.nyarGfx = undefined;
      this.witchGfx = undefined;
      this.witchLaserState = 'idle';
      this.everheartGfx = undefined;
      this.everheartThorns = [];
      this.everheartPulses = [];
      this.everheartTetherMs = 0;
      this.summonedSkeletons = [];
      this.destroyPet(this.playerPet);
      this.playerPet = null;
      for (const rp of this.remotePets.values()) {
        this.destroyPet(rp);
      }
      this.remotePets.clear();
      this.activeEnemies = [];
      this.slimeSplatters = [];
      this.playerHitFlashMs = 0;
      this.playerSlowTinted = false;
      this.playerWindSlowMs = 0;
      this.playerWindSlowTinted = false;
      this.weatherGfx?.destroy();
      this.weatherGfx = undefined;
      this.rainDrops = [];
      this.rainSplashes = [];
      this.windStreaks = [];
      SoundSystem.stopAllGameplayLoops();
      this.pillarObjs = [];
      this.projectiles = [];
      this.remotePlayerLastDirectAt.clear();
      this.remoteSprites.clear();
    });

    const runForKeyboardPlayer = (fn: () => void) => {
      if (localCoopSession.active) {
        const kbActor = this.localPlayers.find((lp) => lp.inputType === 'keyboard');
        if (!kbActor || kbActor.state.downed) return;
        this.withLocalPlayer(kbActor, fn);
      } else {
        if (this.playerState.downed) return;
        fn();
      }
    };

    kb.on('keydown-Q', () => {
      if (!this.paused && !this.ui.isOverlayOpen() && !this.ui.isChatOpen()) {
        runForKeyboardPlayer(() => this.dropActiveItem());
      }
    });
    kb.on('keydown-ONE', () => {
      if (!this.ui.isChatOpen()) runForKeyboardPlayer(() => (this.playerState.activeSlot = 0));
    });
    kb.on('keydown-TWO', () => {
      if (!this.ui.isChatOpen()) runForKeyboardPlayer(() => (this.playerState.activeSlot = 1));
    });
    kb.on('keydown-THREE', () => {
      if (!this.ui.isChatOpen()) runForKeyboardPlayer(() => (this.playerState.activeSlot = 2));
    });
    kb.on('keydown-G', () => {
      if (!this.paused && !this.ui.isOverlayOpen() && !this.ui.isChatOpen()) {
        runForKeyboardPlayer(() => this.dropActiveItem());
      }
    });
    kb.on('keydown-E', () => {
      if (!this.paused && !this.ui.isOverlayOpen() && !this.ui.isChatOpen()) {
        runForKeyboardPlayer(() => this.handleInteract());
      }
    });
    kb.on('keydown-T', () => {
      if (
        net.mode !== 'solo' &&
        !localCoopSession.active &&
        !this.paused &&
        !this.ui.isOverlayOpen() &&
        !this.ui.isChatOpen()
      ) {
        this.ui.openChatKeyboard();
      }
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
        if (this.paused || this.ui.isOverlayOpen()) return;
        runForKeyboardPlayer(() => {
          if (pointer.rightButtonDown()) {
            this.handleSecondaryAction();
          } else {
            this.handlePrimaryAttack();
          }
        });
      });
      this.input.on(
        'wheel',
        (
          _pointer: Phaser.Input.Pointer,
          _currentlyOver: Phaser.GameObjects.GameObject[],
          _deltaX: number,
          deltaY: number
        ) => {
          if (this.paused || this.ui.isOverlayOpen() || deltaY === 0) return;
          runForKeyboardPlayer(() => {
            const step = deltaY > 0 ? 1 : 2;
            this.playerState.activeSlot = (this.playerState.activeSlot + step) % 3;
          });
        }
      );
    } else {
      const unsubBtn = mobileInput.onButton((btn) => {
        if (btn === 'tab') {
          this.ui.toggleMap();
        } else if (btn === 'esc') {
          if (this.ui.isOverlayOpen()) {
            this.ui.closeShop();
            this.ui.closeMap();
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

      const unsubSlot = mobileInput.onSelectSlot((slotIdx) => {
        if (!this.paused && !this.ui.isOverlayOpen() && slotIdx >= 0 && slotIdx < 3) {
          if (this.playerState.activeSlot !== slotIdx) {
            this.playerState.activeSlot = slotIdx;
            SoundSystem.playSwing();
          }
        }
      });

      const unsubNav = mobileInput.onNav((dir) => {
        if (dir === 'left') switchSpectator(-1);
        else if (dir === 'right') switchSpectator(1);
      });

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        unsubBtn();
        unsubSlot();
        unsubNav();
      });
    }
  }

  private setupNetworking(): void {
    net.onChatMessage = (msg) => {
      this.ui?.addChatMessage(msg.sender, msg.text);
    };
    net.onLobbyUpdate = undefined;
    net.onGameStart = undefined;
    net.onPlayAgain = undefined;
    net.onRemotePlayerState = (state, peerId) => {
      if (net.players.has(peerId)) {
        const now = performance.now();
        this.remotePlayers.set(peerId, { ...state, id: peerId });
        this.remotePlayerLastDirectAt.set(peerId, now);
        const vis = this.remoteSprites.get(peerId);
        if (vis) {
          vis.targetX = state.x;
          vis.targetY = state.y;
          vis.vx = state.vx ?? 0;
          vis.vy = state.vy ?? 0;
          vis.lastRecvAt = now;
        }
      }
    };

    net.onSelfIdResolved = (peerId) => {
      this.playerState.id = peerId;
    };

    net.onPeerJoined = (peerId, info) => {
      if (net.mode !== 'host') return;
      const key = info.uid ?? info.name;
      const saved = this.disconnectedPlayers.get(key);
      if (saved && saved.levelIndex === this.levelIndex) {
        this.disconnectedPlayers.delete(key);
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
        const key = leaving?.uid ?? lastState.name;
        this.disconnectedPlayers.set(key, {
          levelIndex: this.levelIndex,
          snapshot: {
            ...lastState,
            inventory: lastState.inventory.map((i) => (i ? { ...i } : null)),
            statusEffects: lastState.statusEffects.map((s) => ({ ...s })),
          },
        });
      }
      this.remotePlayers.delete(peerId);
      this.remotePlayerLastDirectAt.delete(peerId);
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
        this.netSyncTimerMs = 45;
        this.worldSyncTimerMs = 250;
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
      } else if (ev.kind === 'heal') {
        if (ev.targetId === this.playerState.id && !this.playerState.downed) {
          const heal = ev.amount ?? 3;
          this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + heal);
          SoundSystem.playHeal();
          this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x66ffd9, 10);
          this.ui.showToast(`+${heal} HP from ally!`, '#66ffd9');
          net.broadcastPlayerState(this.playerState);
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
      } else if (ev.kind === 'pillar_use' && ev.uses !== undefined) {
        const targetRoom = this.floor.rooms[ev.gy]?.[ev.gx];
        const pillarModel = targetRoom?.pillars?.[ev.uses];
        if (pillarModel) {
          pillarModel.used = true;
        }
        if (ev.gx === this.currentRoom.gx && ev.gy === this.currentRoom.gy) {
          const pObj = this.pillarObjs.find((po) => po.idx === ev.uses);
          if (pObj) {
            this.drawPillarVisual(pObj.gfx, pObj.tx, pObj.ty, true);
            this.spawnParticles(pObj.x, pObj.y, 0x94a3b8, 10);
          }
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
      } else if (ev.kind === 'boss_summon') {
        if (
          this.levelIndex === 6 &&
          this.currentRoom.type === 'boss' &&
          ev.gx === this.currentRoom.gx &&
          ev.gy === this.currentRoom.gy &&
          this.nyarlathotepSummonPending &&
          !this.nyarlathotepSummoning &&
          !this.currentRoom.bossDefeated
        ) {
          this.startNyarlathotepSummon(false);
        }
      } else if (ev.kind === 'game_over') {
        if (ev.itemId === 'credits') {
          SoundSystem.stopBossEvilLaughLoop();
          this.scene.stop('UIScene');
          this.scene.start('CreditsScene');
        } else {
          this.triggerGameOver(false);
        }
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
          carrySkeletons: this.getCarriedSkeletons(),
        });
        return;
      }
      const now = performance.now();
      for (const p of sync.players) {
        if (p.id !== this.playerState.id && net.players.has(p.id)) {
          const lastDirect = this.remotePlayerLastDirectAt.get(p.id) ?? 0;
          if (!this.remotePlayers.has(p.id) || now - lastDirect > 300) {
            this.remotePlayers.set(p.id, p);
          }
        }
      }
      for (const peerId of Array.from(this.remotePlayers.keys())) {
        if (!net.players.has(peerId)) {
          this.remotePlayers.delete(peerId);
          this.remotePlayerLastDirectAt.delete(peerId);
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
              SoundSystem.stopBossEvilLaughLoop();
              SoundSystem.setMusicTrack(this.getNormalMusicTrack());
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
          SoundSystem.stopBossEvilLaughLoop();
          SoundSystem.setMusicTrack(this.getNormalMusicTrack());
        } else if (
          r.type === 'boss' &&
          !r.bossDefeated &&
          this.levelIndex === 6 &&
          sync.enemies.some((es) => es.alive && es.uid === 'boss')
        ) {
          SoundSystem.setMusicTrack('nyar_boss');
          SoundSystem.startBossEvilLaughLoop();
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
    syncedEnemies: Array<{ uid: string; x: number; y: number; vx?: number; vy?: number; hp: number; alive: boolean }>,
    authoritativeList: boolean
  ): void {
    const syncedById = new Map(syncedEnemies.map((es) => [es.uid, es]));
    const now = performance.now();
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
        ae.targetVx = es.vx ?? 0;
        ae.targetVy = es.vy ?? 0;
        ae.lastSyncAt = now;
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
      let existing = this.projectiles.find((p) => p.netSynced && p.uid === sp.uid);
      if (!existing) {
        const remoteMatch = this.projectiles.find(
          (p) =>
            p.fromRemoteEvent &&
            p.ownerId === sp.ownerId &&
            Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, sp.x, sp.y) < 36
        );
        if (remoteMatch) {
          remoteMatch.uid = sp.uid;
          remoteMatch.fromRemoteEvent = false;
          remoteMatch.netSynced = true;
          existing = remoteMatch;
        }
      }
      if (existing) {
        existing.targetX = sp.x;
        existing.targetY = sp.y;
        existing.vx = sp.vx;
        existing.vy = sp.vy;
        existing.lifeMs = Math.max(existing.lifeMs, 250);
      } else {
        const tex = sp.textureKey || 'proj_orb';
        const sprite = this.physics.add.sprite(sp.x, sp.y, tex).setDepth(11).setTint(sp.color);
        if (sp.scale && sp.scale !== 1) sprite.setScale(sp.scale);
        if (!sp.fromPlayer) SoundSystem.playEnemyShoot();
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
          textureKey: tex,
          spinSpeed: sp.spinSpeed,
          rotateToVelocity: sp.rotateToVelocity,
          hitUids: new Set(),
          netSynced: true,
          targetX: sp.x,
          targetY: sp.y,
        });
      }
    }
  }

  private loadRoom(gx: number, gy: number, spawnX: number, spawnY: number, isSpectating = false): void {
    if (this.currentRoom?.isTestRoom) {
      this.despawnAllTestEnemies();
    }
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
    this.doorBlockGroup.clear(true, true);
    this.enemyGroup.clear(true, true);
    this.pushBlockGroup.clear(true, true);
    this.doorZones = [];
    this.activeEnemies = [];
    this.projectiles.forEach((p) => {
      p.bubbleGfx?.destroy();
      p.sprite.destroy();
    });
    this.projectiles = [];
    this.hazards = [];
    this.slimeSplatters = [];
    this.cometTrailActiveMs = 0;
    this.cometTrailAccumMs = 0;
    this.cometTrailNodes.forEach((n) => n.gfx.destroy());
    this.cometTrailNodes = [];
    this.pillarObjs = [];
    this.spikeTraps = [];
    this.spikePinnedMs = 0;
    this.lootObjs = [];
    this.fireflies = [];
    this.testCrateRespawnTimers.clear();
    this.testHealingPad = null;
    this.testWaveCount = 4;
    this.lastLavaFrame = -1;
    this.beamGfx?.clear();
    this.beamDamageTickMs = 0;
    this.beamDrainAccumMs = 0;
    this.flameDamageTickMs = 0;
    this.flameDrainAccumMs = 0;
    this.flameFxAccumMs = 0;
    this.prismBeams.forEach((b) => b.gfx.destroy());
    this.prismBeams = [];
    this.blockPushCooldownMs = 0;
    this.respawnAnimMs = 0;
    this.remoteReviveAnimUntil.clear();
    this.simonPlaying = false;
    this.specialObjs = { plates: [], mirrors: [], blocks: [], blockGoals: [], lights: [], simonRunes: [] };

    const room = this.floor.rooms[gy][gx];
    this.currentRoom = room;
    room.visited = true;

    const wTiles = room.widthTiles ?? 11;
    const hTiles = room.heightTiles ?? 11;
    this.roomWidthPx = wTiles * 16;
    this.roomHeightPx = hTiles * 16;
    this.physics.world.setBounds(0, 0, this.roomWidthPx, this.roomHeightPx);

    this.nyarGfx?.destroy();
    this.nyarGfx = undefined;
    this.witchGfx?.destroy();
    this.witchGfx = undefined;
    this.witchLaserState = 'idle';
    this.everheartGfx?.destroy();
    this.everheartGfx = undefined;
    this.everheartThorns = [];
    this.everheartPulses = [];
    this.everheartTetherMs = 0;
    this.nyarArmState = 'idle';
    this.nyarArmLength = 0;
    this.nyarGrabbedMs = 0;
    this.nyarThrowMs = 0;
    this.nyarBeamState = 'idle';
    this.nyarSpawnTimerMs = 7000;
    this.nyarRainTimerMs = 4000;
    this.nyarRainHeartAlt = false;
    this.nyarlathotepSummonPending = false;
    this.nyarlathotepSummoning = false;
    this.nyarWaitToastCooldownMs = 0;

    if (localCoopSession.active) {
      const renderScale = this.getRenderScale();
      const cam = this.cameras.main;
      cam.stopFollow();
      cam.removeBounds();
      if (room.type === 'boss' && this.levelIndex === 6) {
        // Final Boss Room: zoomed out so the entire room is visible at once without scrolling
        const fitZoom = Math.min(254 / this.roomWidthPx, 240 / this.roomHeightPx);
        cam.setZoom(Math.max(0.55, Math.min(0.75, fitZoom)) * renderScale);
        cam.centerOn(this.roomWidthPx / 2, this.roomHeightPx / 2);
      } else if (wTiles > 11 || hTiles > 11) {
        // Level 7 hallway: zoomed out, centered on average player position in update()
        cam.setZoom(0.84 * renderScale);
        cam.centerOn(spawnX, this.roomHeightPx / 2);
      } else {
        cam.setZoom(0.84 * renderScale);
        cam.centerOn(88, 88);
      }
    } else if (wTiles > 11 || hTiles > 11) {
      const cam = this.cameras.main;
      const viewW = cam.width / cam.zoom;
      const viewH = cam.height / cam.zoom;
      const hudPadX = 64;
      const bx = this.roomWidthPx < viewW ? -(viewW - this.roomWidthPx) / 2 : -hudPadX;
      const by = this.roomHeightPx < viewH ? -(viewH - this.roomHeightPx) / 2 : -18;
      const bw = Math.max(this.roomWidthPx + hudPadX * 2, viewW);
      const bh = Math.max(this.roomHeightPx + 36, viewH);
      cam.setBounds(bx, by, bw, bh);
      cam.startFollow(this.playerSprite, true, 0.16, 0.16);
    } else {
      this.cameras.main.stopFollow();
      this.cameras.main.removeBounds();
      this.cameras.main.centerOn(88, 88);
    }

    // Wandering Eye artifact reveals adjacent secret rooms
    const anyWanderingEye = localCoopSession.active
      ? this.localPlayers.some((lp) => hasArtifact(lp.state.inventory, 'wandering_eye') !== -1)
      : hasArtifact(this.playerState.inventory, 'wandering_eye') !== -1;
    if (anyWanderingEye) {
      for (let ry = 0; ry < 6; ry++) {
        for (let rx = 0; rx < 6; rx++) {
          const sr = this.floor.rooms[ry]?.[rx];
          if (sr && sr.type === 'secret') sr.secretRevealed = true;
        }
      }
    }

    if (localCoopSession.active && this.localPlayers.length > 0) {
      const spread = [
        { dx: -6, dy: -4 },
        { dx: 6, dy: -4 },
        { dx: -6, dy: 4 },
        { dx: 6, dy: 4 },
      ];
      this.localPlayers.forEach((lp, idx) => {
        if (lp.state.downed) {
          const inThisRoom = lp.state.gx === gx && lp.state.gy === gy;
          lp.state.vx = 0;
          lp.state.vy = 0;
          lp.spikePinnedMs = 0;
          lp.sprite.setPosition(lp.state.x, lp.state.y).setVelocity(0, 0).setVisible(inThisRoom);
          lp.nameTag.setPosition(lp.state.x, lp.state.y - 12).setVisible(inThisRoom);
          return;
        }
        const off = this.localPlayers.length > 1 ? spread[idx % spread.length] : { dx: 0, dy: 0 };
        const px = Phaser.Math.Clamp(spawnX + off.dx, 22, Math.max(22, this.roomWidthPx - 22));
        const py = Phaser.Math.Clamp(spawnY + off.dy, 22, Math.max(22, this.roomHeightPx - 22));
        lp.state.gx = gx;
        lp.state.gy = gy;
        lp.state.x = px;
        lp.state.y = py;
        lp.state.vx = 0;
        lp.state.vy = 0;
        lp.spikePinnedMs = 0;
        lp.sprite.setPosition(px, py).setVelocity(0, 0).setVisible(true);
        lp.nameTag.setPosition(px, py - 12).setVisible(true);
      });
      const petOwner = this.localPlayers.find((lp) => !lp.state.downed) ?? this.localPlayers[0];
      this.spawnOrResetPlayerPet(petOwner && !petOwner.state.downed ? petOwner.sprite.x : spawnX, petOwner && !petOwner.state.downed ? petOwner.sprite.y : spawnY);
      const skOffsets = [
        { dx: -12, dy: -8 },
        { dx: 12, dy: -8 },
        { dx: -12, dy: 8 },
        { dx: 12, dy: 8 },
      ];
      for (const sk of this.summonedSkeletons) {
        if (!sk.sprite.active) continue;
        const ownerActor = sk.ownerId ? this.localPlayers.find((lp) => lp.state.id === sk.ownerId) : undefined;
        const baseX = ownerActor && !ownerActor.state.downed ? ownerActor.sprite.x : spawnX;
        const baseY = ownerActor && !ownerActor.state.downed ? ownerActor.sprite.y : spawnY;
        const off = skOffsets[sk.formationIndex % skOffsets.length];
        sk.sprite
          .setPosition(
            Phaser.Math.Clamp(baseX + off.dx, 24, Math.max(24, this.roomWidthPx - 24)),
            Phaser.Math.Clamp(baseY + off.dy, 24, Math.max(24, this.roomHeightPx - 24))
          )
          .setVelocity(0, 0)
          .setVisible(true);
      }
    } else if (!isSpectating) {
      this.playerState.gx = gx;
      this.playerState.gy = gy;
      this.playerState.x = spawnX;
      this.playerState.y = spawnY;
      this.playerState.vx = 0;
      this.playerState.vy = 0;
      this.playerSprite.setPosition(spawnX, spawnY).setVisible(true);
      if (net.mode !== 'solo') {
        net.broadcastPlayerState(this.playerState);
      }
      const skOffsets = [
        { dx: -12, dy: -8 },
        { dx: 12, dy: -8 },
        { dx: -12, dy: 8 },
        { dx: 12, dy: 8 },
      ];
      for (const sk of this.summonedSkeletons) {
        if (!sk.sprite.active) continue;
        const off = skOffsets[sk.formationIndex % skOffsets.length];
        sk.sprite
          .setPosition(
            Phaser.Math.Clamp(spawnX + off.dx, 24, Math.max(24, this.roomWidthPx - 24)),
            Phaser.Math.Clamp(spawnY + off.dy, 24, Math.max(24, this.roomHeightPx - 24))
          )
          .setVelocity(0, 0)
          .setVisible(true);
      }
      this.spawnOrResetPlayerPet(spawnX, spawnY);
    } else {
      const inPlayerRoom = gx === this.playerState.gx && gy === this.playerState.gy;
      this.playerSprite.setVisible(inPlayerRoom);
      for (const sk of this.summonedSkeletons) {
        if (sk.sprite.active) sk.sprite.setVisible(inPlayerRoom);
      }
      if (this.playerPet) {
        this.playerPet.sprite.setVisible(inPlayerRoom);
        this.playerPet.shadow.setVisible(inPlayerRoom);
      }
    }
    this.doorCooldownMs = 350;

    const biome = BIOMES[Math.min(this.levelIndex, BIOMES.length - 1)];
    const template = ROOM_TEMPLATES[room.templateId % ROOM_TEMPLATES.length];
    const gfx = this.add.graphics().setDepth(0);
    this.roomGroup.add(gfx);

    const l7BossGateOpen = this.levelIndex === 6 && this.areAllLevel7ChambersCleared();
    const hallwayDoorMap = new Map<string, NonNullable<RoomData['hallwayDoors']>[number]>();
    if (room.hallwayDoors) {
      for (const hd of room.hallwayDoors) {
        hallwayDoorMap.set(`${hd.tx},${hd.ty}`, hd);
      }
    }

    const solidWallTiles = new Set<string>();
    const isBorderWallOpen = (tx: number, ty: number): boolean => {
      const hd = hallwayDoorMap.get(`${tx},${ty}`);
      const isHallwayDoorOpen = hd ? (!hd.isBossGate || l7BossGateOpen) : false;
      const isStandardDoorTile =
        !room.hallwayDoors &&
        !room.isTestRoom &&
        ((ty === 0 && tx === 5 && (room.connections.north || (room.connections.secretNorth && room.secretRevealed))) ||
          (ty === hTiles - 1 && tx === 5 && (room.connections.south || (room.connections.secretSouth && room.secretRevealed))) ||
          (tx === 0 && ty === 5 && (room.connections.west || (room.connections.secretWest && room.secretRevealed) || !!room.tutorialSkipDoor)) ||
          (tx === wTiles - 1 && ty === 5 && (room.connections.east || (room.connections.secretEast && room.secretRevealed) || !!room.tutorialExitDoor)));
      const isTestExitTile = !!room.isTestRoom && tx === 0 && ty === 16;
      return isHallwayDoorOpen || isStandardDoorTile || isTestExitTile;
    };

    for (let ty = 0; ty < hTiles; ty++) {
      for (let tx = 0; tx < wTiles; tx++) {
        const isBorder = tx === 0 || tx === wTiles - 1 || ty === 0 || ty === hTiles - 1;
        if (isBorder && !isBorderWallOpen(tx, ty)) {
          solidWallTiles.add(`${tx},${ty}`);
        }
      }
    }
    if (room.isTestRoom) {
      for (let ty = 1; ty < hTiles - 1; ty++) {
        if (ty >= 14 && ty <= 18) continue;
        solidWallTiles.add(`20,${ty}`);
      }
    }
    if (!room.isTestRoom && !room.isTutorialRoom && room.type !== 'start' && room.type !== 'boss' && (room.type !== 'merchant' || room.enemies.length > 0) && room.type !== 'healing' && room.type !== 'puzzle') {
      for (const p of template.pillars) {
        const px = p.tx * 16 + 8;
        const py = p.ty * 16 + 8;
        if (room.type === 'merchant' && Math.abs(px - 88) < 18 && Math.abs(py - 76) < 18) continue;
        solidWallTiles.add(`${p.tx},${p.ty}`);
      }
    }
    if ((room.type === 'puzzle' || room.type === 'secret') && room.puzzleObstacles) {
      for (const obs of room.puzzleObstacles) {
        solidWallTiles.add(`${obs.tx},${obs.ty}`);
      }
    }

    const draw25DWallTile = (
      targetGfx: Phaser.GameObjects.Graphics,
      tx: number,
      ty: number,
      insetX = 1,
      accentCenter = false
    ) => {
      const hasBelow = solidWallTiles.has(`${tx},${ty + 1}`);
      const x0 = tx * 16;
      const y0 = ty * 16;
      targetGfx.fillStyle(biome.wallDark, 1);
      targetGfx.fillRect(x0, y0, 16, 16);
      const topY = y0 + 1;
      const topH = hasBelow ? 14 : 10;
      targetGfx.fillStyle(biome.wallTop, 1);
      targetGfx.fillRect(x0 + insetX, topY, 16 - insetX * 2, topH);
      if (accentCenter) {
        targetGfx.fillStyle(biome.accent, 0.45);
        targetGfx.fillRect(x0 + 6, y0 + 4, 4, 4);
      }
    };

    // Draw room tiles (11x11 by default, or larger scrollable rooms for Level 7)
    for (let ty = 0; ty < hTiles; ty++) {
      let rowWallGfx: Phaser.GameObjects.Graphics | null = null;
      const getRowWallGfx = () => {
        if (!rowWallGfx) {
          rowWallGfx = this.add.graphics().setDepth(6 + (ty * 16 + 12) / 1000);
          this.roomGroup.add(rowWallGfx);
        }
        return rowWallGfx;
      };
      for (let tx = 0; tx < wTiles; tx++) {
        const isBorder = tx === 0 || tx === wTiles - 1 || ty === 0 || ty === hTiles - 1;
        if (isBorder) {
          const hd = hallwayDoorMap.get(`${tx},${ty}`);

          if (isBorderWallOpen(tx, ty)) {
            gfx.fillStyle(biome.floorLight, 1);
            gfx.fillRect(tx * 16, ty * 16, 16, 16);
          } else {
            const wGfx = getRowWallGfx();
            draw25DWallTile(wGfx, tx, ty, 1, false);

            if (hd?.isBossGate && !l7BossGateOpen) {
              // Sealed eldritch boss gate at the end of the Level 7 hallway
              wGfx.fillStyle(0xff8c1a, 0.75);
              wGfx.fillRect(tx * 16 + 4, ty * 16 + 3, 8, 10);
              wGfx.fillStyle(0x0b0917, 0.9);
              wGfx.fillRect(tx * 16 + 6, ty * 16 + 5, 4, 6);
            }

            // Secret wall crack hint
            const isSecretHint =
              !room.hallwayDoors &&
              ((ty === 0 && tx === 5 && room.connections.secretNorth && !room.secretRevealed) ||
                (ty === hTiles - 1 && tx === 5 && room.connections.secretSouth && !room.secretRevealed) ||
                (tx === 0 && ty === 5 && room.connections.secretWest && !room.secretRevealed) ||
                (tx === wTiles - 1 && ty === 5 && room.connections.secretEast && !room.secretRevealed));
            if (isSecretHint) {
              wGfx.fillStyle(biome.accent, 0.7);
              wGfx.fillRect(tx * 16 + 6, ty * 16 + 4, 2, 8);
              wGfx.fillRect(tx * 16 + 8, ty * 16 + 6, 3, 2);
            }

            const wall = this.add.rectangle(tx * 16 + 8, ty * 16 + 8, 16, 16, 0x000000, 0);
            this.wallGroup.add(wall);
            this.roomGroup.add(wall);
          }
        } else {
          const checker = (tx + ty) % 2 === 0;
          if (room.isTestRoom && tx >= 21) {
            gfx.fillStyle(checker ? 0x261522 : 0x2e1a29, 1);
          } else {
            gfx.fillStyle(checker ? biome.floorDark : biome.floorLight, 1);
          }
          gfx.fillRect(tx * 16, ty * 16, 16, 16);
          if (this.levelIndex === 6 && ((tx * 37 + ty * 19) % 7 === 0)) {
            // Corrupted void veins on Level 7 floors
            gfx.fillStyle(0x140a26, 0.85);
            gfx.fillRect(tx * 16 + 3, ty * 16 + 5, 6, 1);
            gfx.fillRect(tx * 16 + 7, ty * 16 + 6, 1, 5);
            gfx.fillStyle(0x020105, 0.9);
            gfx.fillRect(tx * 16 + 4, ty * 16 + 6, 3, 1);
          }
        }
      }
    }

    // Add Door Trigger Zones
    const addDoor = (
      dir: Direction,
      x: number,
      y: number,
      w: number,
      h: number,
      extra?: {
        targetGx?: number;
        targetGy?: number;
        spawnX?: number;
        spawnY?: number;
        isBossGate?: boolean;
        isTestExit?: boolean;
        isTutorialExit?: boolean;
        tint?: number;
      }
    ) => {
      const dg = this.add.graphics().setDepth(3);
      this.roomGroup.add(dg);
      // Invisible blocker so enemies/skeletons cannot walk out through doorways (and players cannot pass closed gates)
      const blocker = this.add.rectangle(x, y, w, h, 0x000000, 0);
      blocker.setData('isDoorGate', true);
      blocker.setData('isBossGate', Boolean(extra?.isBossGate));
      this.doorBlockGroup.add(blocker);
      this.roomGroup.add(blocker);
      this.doorZones.push({
        dir,
        rect: new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h),
        gfx: dg,
        x,
        y,
        w,
        h,
        targetGx: extra?.targetGx,
        targetGy: extra?.targetGy,
        spawnX: extra?.spawnX,
        spawnY: extra?.spawnY,
        isBossGate: extra?.isBossGate,
        isTestExit: extra?.isTestExit,
        isTutorialExit: extra?.isTutorialExit,
      });
    };

    if (room.isTestRoom) {
      // Exit door on west wall to leave the test room
      addDoor('west', 8, 16 * 16 + 8, 16, 18, { isTestExit: true, tint: 0x66ffd9 });
      const exitLbl = addPixelText(this, 22, 16 * 16 + 8, 'EXIT', 8, 0x66ffd9, 0, 0.5).setDepth(3);
      this.roomGroup.add(exitLbl);

      // Divider wall at tx = 20 with a wide archway at ty = 14..18
      for (let ty = 1; ty < hTiles - 1; ty++) {
        if (ty >= 14 && ty <= 18) continue;
        const divGfx = this.add.graphics().setDepth(6 + (ty * 16 + 12) / 1000);
        draw25DWallTile(divGfx, 20, ty, 1, false);
        this.roomGroup.add(divGfx);
        const divWall = this.add.rectangle(20 * 16 + 8, ty * 16 + 8, 16, 16, 0x000000, 0);
        this.wallGroup.add(divWall);
        this.roomGroup.add(divWall);
      }

      // Invisible enemy blocker across the archway so enemies cannot leave the dungeon section
      const archBlocker = this.add.rectangle(20 * 16 + 8, 16 * 16 + 8, 16, 5 * 16, 0x000000, 0);
      this.doorBlockGroup.add(archBlocker);
      this.roomGroup.add(archBlocker);

      const archFloor = this.add.rectangle(20 * 16 + 8, 16 * 16 + 8, 16, 5 * 16, 0xff5d8f, 0.14).setDepth(2);
      this.roomGroup.add(archFloor);

      const dungeonLbl = addPixelText(this, 21 * 16 + 8, 16 * 16 + 8, 'DUNGEON ->', 8, 0xff8fab, 0, 0.5).setDepth(3);
      this.roomGroup.add(dungeonLbl);

      // Test crates in the main section
      for (const tx of [3, 4, 5]) {
        const ck = `${tx},26`;
        if (room.brokenCrates?.includes(ck)) continue;
        const cy = 26 * 16 + 8;
        const crate = this.crateGroup.create(tx * 16 + 8, cy, 'obj_crate') as Phaser.Physics.Arcade.Sprite;
        crate.setData('crateKey', ck);
        crate.setDepth(6 + (cy + 4) / 1000);
        this.roomGroup.add(crate);
      }

      // Healing pad in the main section (outside the dungeon)
      const healX = 15 * 16 + 8;
      const healY = 26 * 16 + 8;
      const healBase = this.add.circle(healX, healY, 12, 0x16a34a, 0.35).setStrokeStyle(1, 0x66ffd9, 0.9).setDepth(2);
      const healGlow = this.add
        .image(healX, healY, 'glow_soft')
        .setScale(1.3)
        .setTint(0x66ffd9)
        .setAlpha(0.32)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(3);
      const healCross = this.add.graphics().setDepth(3);
      healCross.fillStyle(0x66ffd9, 0.95);
      healCross.fillRect(healX - 5, healY - 1.5, 10, 3);
      healCross.fillRect(healX - 1.5, healY - 5, 3, 10);
      const healLbl = addPixelText(this, healX, healY - 16, 'HEAL', 8, 0x66ffd9, 0.5, 0.5).setDepth(3);
      this.roomGroup.add(healBase);
      this.roomGroup.add(healGlow);
      this.roomGroup.add(healCross);
      this.roomGroup.add(healLbl);
      this.testHealingPad = { x: healX, y: healY, cooldownMs: 0 };

      // Lava pools in the dungeon section
      const testLavaTiles = [
        { tx: 25, ty: 11 },
        { tx: 26, ty: 11 },
        { tx: 25, ty: 12 },
        { tx: 26, ty: 12 },
        { tx: 25, ty: 20 },
        { tx: 26, ty: 20 },
        { tx: 25, ty: 21 },
        { tx: 26, ty: 21 },
      ];
      const testLavaSet = new Set(testLavaTiles.map((h) => `${h.tx},${h.ty}`));
      const testRimGfx = this.add.graphics().setDepth(3);
      testRimGfx.fillStyle(this.isAcidLavaFloor() ? 0x0b2b14 : 0x2b1008, 0.85);
      for (const h of testLavaTiles) {
        const px = h.tx * 16;
        const py = h.ty * 16;
        const hx = px + 8;
        const hy = py + 8;
        const sp = this.add.image(hx, hy, this.isAcidLavaFloor() ? 'tile_acid_0' : 'tile_lava_0').setDepth(2);
        const hGlow = this.add
          .image(hx, hy, 'glow_soft')
          .setScale(0.95)
          .setTint(this.isAcidLavaFloor() ? 0x66ff33 : 0xff6b1a)
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
        if (!testLavaSet.has(`${h.tx},${h.ty - 1}`)) testRimGfx.fillRect(px, py, 16, 1);
        if (!testLavaSet.has(`${h.tx},${h.ty + 1}`)) testRimGfx.fillRect(px, py + 15, 16, 1);
        if (!testLavaSet.has(`${h.tx - 1},${h.ty}`)) testRimGfx.fillRect(px, py, 1, 16);
        if (!testLavaSet.has(`${h.tx + 1},${h.ty}`)) testRimGfx.fillRect(px + 15, py, 1, 16);
      }
      this.roomGroup.add(testRimGfx);

      // Spike traps in the dungeon section
      const testSpikeTiles = [
        { tx: 23, ty: 16 },
        { tx: 29, ty: 16 },
        { tx: 26, ty: 5 },
        { tx: 26, ty: 27 },
      ];
      for (const s of testSpikeTiles) {
        const sx = s.tx * 16 + 8;
        const sy = s.ty * 16 + 8;
        const sp = this.add.image(sx, sy, 'obj_spike_idle').setDepth(2);
        this.roomGroup.add(sp);
        this.spikeTraps.push({ x: sx, y: sy, sprite: sp, state: 'idle', standMs: 0, activeMs: 0, hitThisCycle: false });
      }
    } else if (room.hallwayDoors) {
      for (const hd of room.hallwayDoors) {
        if (hd.isBossGate && !l7BossGateOpen) continue;
        const dx = hd.tx * 16 + 8;
        const dy = hd.ty * 16 + 8;
        const isVert = hd.dir === 'north' || hd.dir === 'south';
        addDoor(hd.dir, dx, dy, isVert ? 18 : 16, isVert ? 16 : 18, {
          targetGx: hd.targetGx,
          targetGy: hd.targetGy,
          spawnX: hd.spawnX,
          spawnY: hd.spawnY,
          isBossGate: hd.isBossGate,
          tint: hd.isBossGate ? 0xff8c1a : undefined,
        });
      }
    } else {
      if (room.connections.north || (room.connections.secretNorth && room.secretRevealed)) addDoor('north', 88, 8, 18, 16);
      if (room.connections.south || (room.connections.secretSouth && room.secretRevealed)) addDoor('south', 88, 168, 18, 16);
      if (room.connections.west || (room.connections.secretWest && room.secretRevealed)) addDoor('west', 8, 88, 16, 18);
      if (room.connections.east || (room.connections.secretEast && room.secretRevealed)) addDoor('east', 168, 88, 16, 18);
      if (room.tutorialSkipDoor) {
        addDoor('west', 8, 88, 16, 18, { isTutorialExit: true });
        const skipLabel = this.tutorialReturnToMenu ? '<- SKIP (MENU)' : '<- SKIP';
        const skipTxt = addPixelText(this, 24, 74, skipLabel, 6, 0xf49ac1, 0, 0.5).setDepth(3);
        this.roomGroup.add(skipTxt);
      }
      if (room.tutorialExitDoor) {
        addDoor('east', 168, 88, 16, 18, { isTutorialExit: true });
        const exitLabel = this.tutorialReturnToMenu ? 'MENU ->' : 'LEVEL 1 ->';
        const exitTxt = addPixelText(this, 152, 74, exitLabel, 6, 0xffe066, 1, 0.5).setDepth(3);
        this.roomGroup.add(exitTxt);
      }
    }

    // Level 7 Hallway sconces & suspense feedback
    if (this.levelIndex === 6 && gx === 0 && gy === 1) {
      for (const stx of [4, 11, 18, 25, 32]) {
        const sx = stx * 16 + 8;
        gfx.fillStyle(0xff8c1a, 0.85);
        gfx.fillRect(sx - 2, 12, 4, 4);
        gfx.fillRect(sx - 2, this.roomHeightPx - 16, 4, 4);
        const topGlow = this.add.image(sx, 14, 'glow_soft').setScale(0.9).setTint(0xff8c1a).setAlpha(0.24).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
        const botGlow = this.add.image(sx, this.roomHeightPx - 14, 'glow_soft').setScale(0.9).setTint(0xff8c1a).setAlpha(0.24).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
        this.roomGroup.add(topGlow);
        this.roomGroup.add(botGlow);
      }
      const clearedCount = this.countClearedLevel7Chambers();
      if (clearedCount < 8) {
        this.ui.showToast(`Sealed Chambers Cleared: ${clearedCount} / 8`, '#ff8c1a');
      } else if (!this.l7BossGateUnlockedToastShown) {
        this.l7BossGateUnlockedToastShown = true;
        SoundSystem.playUnlock();
        this.ui.showToast('The sealed gate at the end of the hall opens...', '#ffe066');
      }
    }

    // Greek / Roman Pillars in Level 7 Boss Room (act as 1-use revive totems / solo 2-heart heal)
    if (room.pillars && room.pillars.length > 0) {
      room.pillars.forEach((p, idx) => {
        const px = p.tx * 16;
        const py = p.ty * 16;
        const pGfx = this.add.graphics().setDepth(6 + (py + 20) / 1000);
        this.drawPillarVisual(pGfx, p.tx, p.ty, !!p.used);
        this.roomGroup.add(pGfx);
        this.pillarObjs.push({ idx, x: px + 16, y: py + 16, tx: p.tx, ty: p.ty, gfx: pGfx });

        const wall = this.add.rectangle(px + 16, py + 16, 28, 28, 0x000000, 0);
        this.wallGroup.add(wall);
        this.roomGroup.add(wall);
      });
    }

    // Pillars & Props (skip pillars in boss/healing/puzzle rooms, normal merchant rooms, hallway, test room, and tutorial room)
    if (!room.isTestRoom && !room.isTutorialRoom && room.type !== 'start' && room.type !== 'boss' && (room.type !== 'merchant' || room.enemies.length > 0) && room.type !== 'healing' && room.type !== 'puzzle') {
      for (const p of template.pillars) {
        const px = p.tx * 16 + 8;
        const py = p.ty * 16 + 8;
        if (room.type === 'merchant' && Math.abs(px - 88) < 18 && Math.abs(py - 76) < 18) continue;
        const pilGfx = this.add.graphics().setDepth(6 + (py + 4) / 1000);
        draw25DWallTile(pilGfx, p.tx, p.ty, 2, false);
        this.roomGroup.add(pilGfx);
        const wall = this.add.rectangle(px, py, 16, 16, 0x000000, 0);
        this.wallGroup.add(wall);
        this.roomGroup.add(wall);
      }

      for (const c of template.crates) {
        const ck = `${c.tx},${c.ty}`;
        if (room.brokenCrates?.includes(ck)) continue;
        const cx = c.tx * 16 + 8;
        const cy = c.ty * 16 + 8;
        if (room.type === 'merchant' && Math.abs(cx - 88) < 18 && Math.abs(cy - 76) < 18) continue;
        const crate = this.crateGroup.create(cx, cy, 'obj_crate') as Phaser.Physics.Arcade.Sprite;
        crate.setData('crateKey', ck);
        crate.setDepth(6 + (cy + 4) / 1000);
        this.roomGroup.add(crate);
      }
    }

    // Props + Additive Colored Lights
    // Decorative floor props (no mushrooms on Level 7)
    for (const pr of template.props) {
      if (this.levelIndex === 6 && pr.kind === 'mushroom') continue;
      if (room.hallwayDoors || room.isTestRoom || room.isTutorialRoom) continue;
      const px = pr.tx * 16 + 8;
      const py = pr.ty * 16 + 8;
      const tex = pr.kind === 'mushroom' ? 'prop_mushroom' : 'prop_lantern';
      const sp = this.add.image(px, py, tex).setDepth(4);
      const glow = this.add
        .image(px, py, 'glow_soft')
        .setScale(1.1)
        .setTint(this.levelIndex === 6 ? 0x4c1d95 : pr.kind === 'mushroom' ? biome.accent : 0xffd275)
        .setAlpha(this.levelIndex === 6 ? 0.16 : 0.28)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(15);
      this.roomGroup.add(sp);
      this.roomGroup.add(glow);
    }

    // Hazards (full pre-determined line layout in hazard rooms)
    if (room.type === 'hazard' && !room.isTutorialRoom) {
      const hazardSet = new Set(template.hazards.map((h) => `${h.tx},${h.ty}`));
      const rimGfx = this.add.graphics().setDepth(3);
      rimGfx.fillStyle(this.isAcidLavaFloor() ? 0x0b2b14 : 0x2b1008, 0.85);
      for (const h of template.hazards) {
        const px = h.tx * 16;
        const py = h.ty * 16;
        const hx = px + 8;
        const hy = py + 8;
        const sp = this.add.image(hx, hy, this.isAcidLavaFloor() ? 'tile_acid_0' : 'tile_lava_0').setDepth(2);
        const hGlow = this.add
          .image(hx, hy, 'glow_soft')
          .setScale(0.95)
          .setTint(this.isAcidLavaFloor() ? 0x66ff33 : 0xff6b1a)
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
    if ((room.type === 'hazard' || room.type === 'combat') && !room.isTutorialRoom) {
      for (const s of template.spikes) {
        const sx = s.tx * 16 + 8;
        const sy = s.ty * 16 + 8;
        const sp = this.add.image(sx, sy, 'obj_spike_idle').setDepth(2);
        this.roomGroup.add(sp);
        this.spikeTraps.push({ x: sx, y: sy, sprite: sp, state: 'idle', standMs: 0, activeMs: 0, hitThisCycle: false });
      }
    }

    // Ambient Fireflies (glowing orange ember particles on Level 7)
    const ffCount = wTiles > 11 || hTiles > 11 ? 18 : 6;
    const isLevel7 = this.levelIndex === 6;
    for (let i = 0; i < ffCount; i++) {
      const fx = Phaser.Math.Between(24, Math.max(28, this.roomWidthPx - 24));
      const fy = Phaser.Math.Between(24, Math.max(28, this.roomHeightPx - 24));
      const ff = this.add
        .image(fx, fy, 'particle_spark')
        .setTint(isLevel7 ? 0xff6b1a : biome.accent)
        .setScale(isLevel7 ? 1.35 : 1)
        .setAlpha(isLevel7 ? 0.9 : 0.6)
        .setDepth(16);
      if (isLevel7) {
        ff.setBlendMode(Phaser.BlendModes.ADD);
      }
      this.roomGroup.add(ff);
      let ffGlow: Phaser.GameObjects.Image | undefined;
      if (isLevel7) {
        ffGlow = this.add
          .image(fx, fy, 'glow_soft')
          .setScale(0.45)
          .setTint(0xff6b1a)
          .setAlpha(0.35)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(15);
        this.roomGroup.add(ffGlow);
      }
      this.fireflies.push({
        sprite: ff,
        glow: ffGlow,
        vx: Phaser.Math.FloatBetween(-10, 10),
        vy: Phaser.Math.FloatBetween(-10, 10),
        phase: Math.random() * 6,
      });
    }

    if (room.isTutorialRoom) {
      this.renderTutorialRoom(room, draw25DWallTile);
    }

    // Spawn Enemies if room not cleared
    if (!room.cleared && (room.type === 'combat' || room.type === 'hazard' || room.type === 'elite' || (room.type === 'merchant' && room.enemies.length > 0))) {
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
        if (this.levelIndex === 6) {
          // Level 7 boss room starts eerily empty until the player steps inward
          this.nyarlathotepSummonPending = true;
          this.nyarlathotepSummoning = false;
          SoundSystem.stopBossEvilLaughLoop();
          SoundSystem.setMusicTrack(this.getNormalMusicTrack());
        } else {
          room.doorsLocked = true;
          const bossDef = BOSSES[biome.bossId];
          const playerScale = 1 + Math.max(0, net.players.size - 1) * 0.45;
          const bHp = Math.round(bossDef.hp * playerScale);
          this.spawnEnemyEntity('boss', bossDef.id, 128, 88, bHp, bHp, false, true);
          this.ui.showToast(`${bossDef.name}: ${bossDef.subtitle}`, '#ff75c3');
          SoundSystem.setMusicTrack('boss');
        }
      } else {
        this.spawnExitPortal();
        SoundSystem.stopBossEvilLaughLoop();
        SoundSystem.setMusicTrack(this.getNormalMusicTrack());
      }
    } else {
      SoundSystem.stopBossEvilLaughLoop();
      SoundSystem.setMusicTrack(this.getNormalMusicTrack());
    }

    // Special Room Objects
    if (room.type === 'merchant') {
      const mx = room.isTutorialRoom ? 64 : 88;
      const my = room.isTutorialRoom ? 76 : 76;
      this.specialObjs.merchant = this.add.image(mx, my, 'obj_merchant').setDepth(6);
      this.roomGroup.add(this.specialObjs.merchant);
      if (room.isTutorialRoom && room.tutorialStep === 2) {
        this.specialObjs.shrine = this.add.image(116, 108, 'obj_shrine').setDepth(6);
        if (room.healingUsed) this.specialObjs.shrine.setAlpha(0.45);
        this.roomGroup.add(this.specialObjs.shrine);
      }
    } else if (room.type === 'healing') {
      this.specialObjs.shrine = this.add.image(88, 84, 'obj_shrine').setDepth(6);
      if (room.healingUsed) this.specialObjs.shrine.setAlpha(0.45);
      this.roomGroup.add(this.specialObjs.shrine);
    } else if (room.type === 'event') {
      this.specialObjs.altar = this.add.image(88, 84, 'obj_altar').setDepth(6);
      if (room.eventUsed) this.specialObjs.altar.setAlpha(0.45);
      this.roomGroup.add(this.specialObjs.altar);
    } else if (room.type === 'puzzle' || room.type === 'secret') {
      if (room.puzzleObstacles) {
        for (const obs of room.puzzleObstacles) {
          const ox = obs.tx * 16 + 8;
          const oy = obs.ty * 16 + 8;
          const obsGfx = this.add.graphics().setDepth(6 + (oy + 4) / 1000);
          draw25DWallTile(obsGfx, obs.tx, obs.ty, 2, true);
          this.roomGroup.add(obsGfx);
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
          const bsp = this.physics.add.sprite(bx, by, 'obj_push_block').setDepth(6 + (by + 4) / 1000);
          bsp.setImmovable(true);
          bsp.setSize(14, 14);
          this.pushBlockGroup.add(bsp);
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
      } else if (room.puzzleLights) {
        for (const cell of room.puzzleLights) {
          const lx = cell.tx * 16 + 8;
          const ly = cell.ty * 16 + 8;
          const sp = this.add.image(lx, ly, cell.lit ? 'obj_plate_lit' : 'obj_plate').setDepth(3);
          this.roomGroup.add(sp);
          this.specialObjs.lights.push({ id: cell.id, gx: cell.gx, gy: cell.gy, sprite: sp, x: lx, y: ly });
        }
      } else if (room.puzzleSimon) {
        const cx = 5 * 16 + 8;
        const cy = 5 * 16 + 8;
        const centerSp = this.add.image(cx, cy, 'obj_reset_rune').setDepth(3).setTint(0x66ffd9);
        const centerLbl = addPixelText(this, cx, cy - 12, 'PLAY', 8, 0x66ffd9, 0.5, 0.5).setDepth(4);
        this.roomGroup.add(centerSp);
        this.roomGroup.add(centerLbl);
        this.specialObjs.simonCenter = { sprite: centerSp, x: cx, y: cy };

        for (const r of room.puzzleSimon.runes) {
          const rx = r.tx * 16 + 8;
          const ry = r.ty * 16 + 8;
          const sp = this.add.image(rx, ry, 'obj_plate').setDepth(3).setTint(r.color);
          this.roomGroup.add(sp);
          this.specialObjs.simonRunes.push({ id: r.id, idx: r.idx, color: r.color, sprite: sp, x: rx, y: ry });
        }
      }
    }

    // Spawn Room Loot
    for (const l of room.loot) {
      if (l.collected && l.kind !== 'chest') continue;
      this.createLootObject(l.uid, l.kind, l.x, l.y, l.itemId, l.amount, l.uses, l.bonusItemId, l.collected);
    }

    this.updateDoorVisuals();
  }

  private drawPillarVisual(gfx: Phaser.GameObjects.Graphics, tx: number, ty: number, used: boolean): void {
    gfx.clear();
    const px = tx * 16;
    const py = ty * 16;
    // Shadow
    gfx.fillStyle(0x040308, 0.55);
    gfx.fillRect(px + 3, py + 4, 30, 30);

    if (!used) {
      // Intact Greek/Roman marble pillar with glowing revive rune
      gfx.fillStyle(0x94a3b8, 1);
      gfx.fillRect(px + 2, py + 24, 28, 7);
      gfx.fillStyle(0xcbd5e1, 1);
      gfx.fillRect(px + 4, py + 22, 24, 3);
      gfx.fillStyle(0xdbeafe, 1);
      gfx.fillRect(px + 6, py + 8, 20, 15);
      gfx.fillStyle(0x94a3b8, 1);
      gfx.fillRect(px + 9, py + 9, 2, 13);
      gfx.fillRect(px + 15, py + 9, 2, 13);
      gfx.fillRect(px + 21, py + 9, 2, 13);
      gfx.fillStyle(0xf8fafc, 1);
      gfx.fillRect(px + 2, py + 2, 28, 6);
      gfx.fillStyle(0x64748b, 1);
      gfx.fillRect(px + 3, py + 6, 4, 3);
      gfx.fillRect(px + 25, py + 6, 4, 3);
      // Glowing revive rune on shaft
      gfx.fillStyle(0x66ffd9, 0.9);
      gfx.fillRect(px + 14, py + 13, 4, 6);
      gfx.fillStyle(0xffe066, 0.95);
      gfx.fillRect(px + 15, py + 14, 2, 4);
    } else {
      // Crumbling/destroyed Greek/Roman pillar
      gfx.fillStyle(0x64748b, 1);
      gfx.fillRect(px + 2, py + 24, 28, 7);
      gfx.fillStyle(0x94a3b8, 1);
      gfx.fillRect(px + 4, py + 22, 24, 3);
      // Shorter, jagged broken shaft
      gfx.fillStyle(0x94a3b8, 1);
      gfx.fillRect(px + 6, py + 14, 19, 9);
      gfx.fillRect(px + 7, py + 11, 7, 4);
      gfx.fillRect(px + 18, py + 12, 6, 3);
      // Deep dark cracks
      gfx.fillStyle(0x1e293b, 1);
      gfx.fillRect(px + 10, py + 15, 2, 7);
      gfx.fillRect(px + 16, py + 14, 2, 8);
      gfx.fillRect(px + 12, py + 18, 4, 1);
      // Scattered marble rubble around base
      gfx.fillStyle(0xcbd5e1, 1);
      gfx.fillRect(px + 1, py + 28, 4, 3);
      gfx.fillRect(px + 26, py + 27, 5, 4);
      gfx.fillRect(px + 13, py + 29, 4, 2);
      gfx.fillStyle(0x64748b, 1);
      gfx.fillRect(px + 4, py + 19, 3, 3);
    }
  }

  private spawnExitPortal(): void {
    if (this.specialObjs.portal) return;
    const cx = Math.round(this.roomWidthPx / 2);
    const cy = Math.round(this.roomHeightPx / 2);
    const portal = this.add.image(cx, cy, 'obj_portal').setDepth(5);
    const glow = this.add.image(cx, cy, 'glow_soft').setScale(1.8).setTint(0x66ffd9).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
    this.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
    this.specialObjs.portal = portal;
    this.roomGroup.add(portal);
    this.roomGroup.add(glow);
  }

  private skipTutorial(): void {
    settingsSystem.markTutorialCompleted();
    SoundSystem.playUnlock();
    this.isTutorial = false;
    if (this.tutorialReturnToMenu) {
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    } else {
      this.scene.restart({
        levelIndex: 0,
        floorSeed: getDailySeed(0),
        resetRun: true,
      });
    }
  }

  private renderTutorialRoom(
    room: RoomData,
    draw25DWallTile: (g: Phaser.GameObjects.Graphics, tx: number, ty: number, heightScale?: number, isBorder?: boolean) => void
  ): void {
    const addTutLabel = (x: number, y: number, text: string, color = 0xffe066) => {
      const lbl = addPixelText(this, x, y, text, 6, color, 0.5, 0.5).setDepth(3);
      this.roomGroup.add(lbl);
    };
    const addTutPillar = (tx: number, ty: number) => {
      const px = tx * 16 + 8;
      const py = ty * 16 + 8;
      const pilGfx = this.add.graphics().setDepth(6 + (py + 4) / 1000);
      draw25DWallTile(pilGfx, tx, ty, 2, false);
      this.roomGroup.add(pilGfx);
      const wall = this.add.rectangle(px, py, 16, 16, 0x000000, 0);
      this.wallGroup.add(wall);
      this.roomGroup.add(wall);
    };
    const addTutCrate = (tx: number, ty: number) => {
      const ck = `${tx},${ty}`;
      if (room.brokenCrates?.includes(ck)) return;
      const cx = tx * 16 + 8;
      const cy = ty * 16 + 8;
      const crate = this.crateGroup.create(cx, cy, 'obj_crate') as Phaser.Physics.Arcade.Sprite;
      crate.setData('crateKey', ck);
      crate.setDepth(6 + (cy + 4) / 1000);
      this.roomGroup.add(crate);
    };
    const addTutSpike = (tx: number, ty: number) => {
      const sx = tx * 16 + 8;
      const sy = ty * 16 + 8;
      const sp = this.add.image(sx, sy, 'obj_spike_idle').setDepth(2);
      this.roomGroup.add(sp);
      this.spikeTraps.push({ x: sx, y: sy, sprite: sp, state: 'idle', standMs: 0, activeMs: 0, hitThisCycle: false });
    };
    const addTutLava = (tiles: Array<{ tx: number; ty: number }>) => {
      const set = new Set(tiles.map((t) => `${t.tx},${t.ty}`));
      const rimGfx = this.add.graphics().setDepth(3);
      rimGfx.fillStyle(0x2b1008, 0.85);
      for (const h of tiles) {
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
        if (!set.has(`${h.tx},${h.ty - 1}`)) rimGfx.fillRect(px, py, 16, 1);
        if (!set.has(`${h.tx},${h.ty + 1}`)) rimGfx.fillRect(px, py + 15, 16, 1);
        if (!set.has(`${h.tx - 1},${h.ty}`)) rimGfx.fillRect(px, py, 1, 16);
        if (!set.has(`${h.tx + 1},${h.ty}`)) rimGfx.fillRect(px + 15, py, 1, 16);
      }
      this.roomGroup.add(rimGfx);
    };

    const atkKey = getControlActionText('attack');
    const dodgeKey = getControlActionText('dodge');
    const intKey = getControlActionText('interact');
    const dropKey = getControlActionText('drop');
    const mapKey = getControlActionText('map');
    const pauseKey = getControlActionText('pause');
    const moveText =
      inputSystem.controlType === 'gamepad'
        ? 'MOVE: L-STICK'
        : inputSystem.controlType === 'touch'
          ? 'MOVE: JOYSTICK'
          : 'MOVE: WASD / ARROWS';

    switch (room.tutorialStep) {
      case 0: {
        // Room 0: Movement Only (no traps, no crates)
        addTutLabel(88, 24, '1. MOVEMENT', 0x66ffd9);
        addTutLabel(88, 38, moveText, 0xffffff);
        addTutLabel(88, 128, `MAP: ${mapKey}  |  PAUSE: ${pauseKey}`, 0xb8a1ff);
        addTutLabel(88, 142, 'WALK EAST TO CONTINUE ->', 0xffe066);
        break;
      }
      case 1: {
        // Room 1: Melee Combat on Stationary Dummy
        addTutLabel(88, 24, '2. MELEE COMBAT', 0x66ffd9);
        addTutLabel(88, 38, `ATTACK DUMMY: ${atkKey}`, 0xffe066);
        addTutLabel(88, 142, 'DEFEAT FOES TO UNLOCK DOORS', 0xffffff);
        break;
      }
      case 2: {
        // Room 2: Merchant & Shrine — buy the Bow with exact shards
        addTutLabel(88, 24, '3. SHOP & SHRINE', 0x66ffd9);
        addTutLabel(64, 54, `SHOP [${intKey}]`, 0xffe066);
        addTutLabel(116, 86, `HEAL [${intKey}]`, 0x66ffd9);
        addTutLabel(88, 144, 'BUY THE BOW FROM MIMI!', 0xb8a1ff);
        break;
      }
      case 3: {
        // Room 3: Ranged Combat on Distant Dummy (2-tile lava moat blocks melee)
        addTutLabel(56, 24, '4. RANGED COMBAT', 0x66ffd9);
        addTutLabel(56, 36, 'EQUIP BOW: 1-3 / SCROLL', 0xffe066);
        addTutLabel(56, 144, `SHOOT ACROSS LAVA!`, 0xb8a1ff);
        const moatTiles: Array<{ tx: number; ty: number }> = [];
        for (let ty = 1; ty <= 9; ty++) {
          moatTiles.push({ tx: 6, ty }, { tx: 7, ty });
        }
        addTutLava(moatTiles);
        break;
      }
      case 4: {
        // Room 4: Crates, Dodging & Traps (introduced after combat)
        addTutLabel(88, 24, '5. CRATES, DODGE & TRAPS', 0x66ffd9);
        addTutLabel(88, 36, `SMASH CRATES (${atkKey}) FOR SHARDS`, 0xffe066);
        addTutLabel(88, 132, `DODGE: ${dodgeKey}  |  DROP: ${dropKey}`, 0xffffff);
        addTutLabel(88, 144, 'AVOID LAVA & SPIKES!', 0xff8fab);
        addTutCrate(4, 3);
        addTutCrate(4, 7);
        addTutSpike(7, 4);
        addTutSpike(7, 6);
        addTutLava([
          { tx: 7, ty: 2 },
          { tx: 7, ty: 8 },
        ]);
        break;
      }
      case 5: {
        // Room 5: Real Combat
        addTutLabel(88, 24, '6. REAL COMBAT', 0x66ffd9);
        addTutLabel(88, 36, 'DODGE SHOTS & DEFEAT FOES!', 0xffe066);
        addTutLabel(88, 144, `USE POTION IN SLOT 2: ${atkKey}`, 0xb8a1ff);
        addTutPillar(4, 3);
        addTutPillar(4, 7);
        break;
      }
      case 6: {
        // Room 6: Dungeon Puzzles
        addTutLabel(88, 24, '7. DUNGEON PUZZLES', 0x66ffd9);
        addTutLabel(88, 36, 'STEP PLATES: 1 -> 2 -> 3', 0xffe066);
        addTutLabel(88, 142, 'SOLVE PUZZLES FOR LOOT!', 0xb8a1ff);
        break;
      }
      case 7: {
        // Room 7: Secret Wall Room (use Star Bomb from Puzzle Room)
        addTutLabel(88, 24, '8. SECRET PASSAGES', 0x66ffd9);
        addTutLabel(88, 38, 'EQUIP STAR BOMB & THROW AT', 0xffe066);
        addTutLabel(88, 50, 'THE CRACKED EAST WALL ->', 0xffe066);
        if (!room.secretRevealed) {
          const hasBomb = this.playerState.inventory.some((it) => it?.id === 'star_bomb');
          const bombOnFloor = room.loot.some((l) => !l.collected && l.itemId === 'star_bomb');
          if (!hasBomb && !bombOnFloor) {
            this.spawnRoomLoot(`tut_free_bomb_${Date.now()}`, 'item', 88, 88, 'star_bomb');
          }
        }
        break;
      }
      case 8: {
        // Room 8: Final Trial & Exit Door
        addTutLabel(88, 24, '9. FINAL TRIAL', 0x66ffd9);
        addTutLabel(88, 36, 'DEFEAT FOES TO OPEN EXIT!', 0xffe066);
        addTutPillar(4, 4);
        addTutPillar(4, 6);
        break;
      }
    }
  }

  private createLootObject(
    uid: string,
    kind: 'shard' | 'item' | 'heart' | 'chest',
    x: number,
    y: number,
    itemId?: string,
    amount?: number,
    uses?: number,
    bonusItemId?: string,
    collected = false
  ): void {
    if (this.lootObjs.some((l) => l.uid === uid)) return;
    let key = 'item_shard';
    if (kind === 'heart') key = 'item_heart';
    else if (kind === 'chest') key = collected ? 'obj_chest_open' : 'obj_chest_closed';
    else if (kind === 'item' && itemId) key = `item_${itemId}`;

    const sp = this.add.image(x, y, this.textures.exists(key) ? key : 'item_shard').setDepth(6);
    this.roomGroup.add(sp);
    this.lootObjs.push({ uid, kind, sprite: sp, itemId, bonusItemId, uses, amount, collected });
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
    const cx = Phaser.Math.Clamp(Math.round(x), 24, Math.max(24, this.roomWidthPx - 24));
    const cy = Phaser.Math.Clamp(Math.round(y), 24, Math.max(24, this.roomHeightPx - 24));
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

  private smashCrate(cs: Phaser.Physics.Arcade.Sprite): void {
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
    const hasMothCrown = hasArtifact(this.playerState.inventory, 'moth_crown') !== -1;
    if (hasMothCrown && Math.random() < 0.25) {
      const uid = `cr_ht_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      this.spawnRoomLoot(uid, 'heart', cs.x, cs.y);
    } else if (Math.random() < 0.4) {
      const uid = `cr_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      this.spawnRoomLoot(uid, 'shard', cs.x, cs.y, undefined, 1);
    }
    cs.destroy();
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
    else if (defId !== 'tutorial_dummy') JournalSystem.discoverEnemy(defId);
    const sprite = this.physics.add.sprite(x, y, def.spriteKey, 0).setDepth(9);
    if (defId === 'tutorial_dummy') {
      sprite.setTint(0xd4a373);
      sprite.setImmovable(true);
    } else if (isElite) {
      sprite.setScale(1.35);
      sprite.setTint(0xffd275);
    }
    sprite.setCollideWorldBounds(true);
    this.enemyGroup.add(sprite);
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
      burnFxMs: 0,
      hitFlashMs: 0,
      phase: 1,
      shieldOrbs,
      shieldAngle: 0,
    });
  }

  private updateDoorVisuals(): void {
    const locked = this.currentRoom.doorsLocked;
    for (const d of this.doorZones) {
      d.gfx.clear();
      const isGateClosed = locked || (Boolean(d.isBossGate) && !this.areAllLevel7ChambersCleared());
      if (isGateClosed) {
        d.gfx.setDepth(7);
        const x0 = Math.round(d.x - d.w / 2);
        const y0 = Math.round(d.y - d.h / 2);
        const w = Math.round(d.w);
        const h = Math.round(d.h);
        // Dark iron backing + frame
        d.gfx.fillStyle(0x100d24, 0.72);
        d.gfx.fillRect(x0, y0, w, h);
        d.gfx.lineStyle(1, 0x334155, 1);
        d.gfx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);

        if (d.dir === 'north' || d.dir === 'south') {
          // Horizontal gate with vertical iron bars
          const barY = y0 + 2;
          const barH = Math.max(4, h - 4);
          d.gfx.fillStyle(0x64748b, 1);
          d.gfx.fillRect(x0 + 1, Math.round(d.y - 1), w - 2, 2);
          for (let bx = x0 + 2; bx <= x0 + w - 3; bx += 4) {
            d.gfx.fillStyle(0x475569, 1);
            d.gfx.fillRect(bx, barY, 2, barH);
            d.gfx.fillStyle(0x94a3b8, 1);
            d.gfx.fillRect(bx, barY, 1, barH);
          }
        } else {
          // Vertical gate with horizontal iron bars
          const barX = x0 + 2;
          const barW = Math.max(4, w - 4);
          d.gfx.fillStyle(0x64748b, 1);
          d.gfx.fillRect(Math.round(d.x - 1), y0 + 1, 2, h - 2);
          for (let by = y0 + 2; by <= y0 + h - 3; by += 4) {
            d.gfx.fillStyle(0x475569, 1);
            d.gfx.fillRect(barX, by, barW, 2);
            d.gfx.fillStyle(0x94a3b8, 1);
            d.gfx.fillRect(barX, by, barW, 1);
          }
        }
      } else {
        // Unlocked: plain floor tile with a yellow arrow pointing out of the room
        d.gfx.setDepth(3);
        const cx = Math.round(d.x);
        const cy = Math.round(d.y);
        let tipX = cx;
        let tipY = cy;
        let p1X = cx;
        let p1Y = cy;
        let p2X = cx;
        let p2Y = cy;
        let shaftX = cx;
        let shaftY = cy;
        let shaftW = 2;
        let shaftH = 2;

        if (d.dir === 'north') {
          tipX = cx; tipY = cy - 4;
          p1X = cx - 4; p1Y = cy;
          p2X = cx + 4; p2Y = cy;
          shaftX = cx - 1; shaftY = cy; shaftW = 2; shaftH = 4;
        } else if (d.dir === 'south') {
          tipX = cx; tipY = cy + 4;
          p1X = cx - 4; p1Y = cy;
          p2X = cx + 4; p2Y = cy;
          shaftX = cx - 1; shaftY = cy - 4; shaftW = 2; shaftH = 4;
        } else if (d.dir === 'west') {
          tipX = cx - 4; tipY = cy;
          p1X = cx; p1Y = cy - 4;
          p2X = cx; p2Y = cy + 4;
          shaftX = cx; shaftY = cy - 1; shaftW = 4; shaftH = 2;
        } else {
          tipX = cx + 4; tipY = cy;
          p1X = cx; p1Y = cy - 4;
          p2X = cx; p2Y = cy + 4;
          shaftX = cx - 4; shaftY = cy - 1; shaftW = 4; shaftH = 2;
        }

        d.gfx.fillStyle(0xffe066, 0.92);
        d.gfx.fillRect(shaftX, shaftY, shaftW, shaftH);
        d.gfx.fillTriangle(tipX, tipY, p1X, p1Y, p2X, p2Y);
      }
    }
  }

  private handlePrimaryAttack(): void {
    if (this.attackCooldownMs > 0 || this.dodgeMs > 0) return;
    const item = this.playerState.inventory[this.playerState.activeSlot];
    const angle = isMobileMode()
      ? mobileInput.dpadActive || mobileInput.dpadDirX !== 0 || mobileInput.dpadDirY !== 0
        ? mobileInput.dpadAngle
        : this.playerState.aimAngle
      : (this.activeLocalActor ? this.activeLocalActor.inputType === 'gamepad' : inputSystem.controlType === 'gamepad')
        ? this.playerState.aimAngle
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

    if (item && item.id === 'wandering_eye') {
      this.attackCooldownMs = 250;
      this.useWanderingEyeWallBreak(this.playerState.activeSlot);
      return;
    }

    if (item && item.category === 'weapon') {
      const w = WEAPONS[item.id];
      if (w.style === 'beam_prism' || w.style === 'flamethrower') {
        // Continuous stream/beam is handled while holding the shoot button in update()
        return;
      }
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

      // Ranged / magic weapons consume 1 charge on fire (necromancy_staff consumes only when summoning)
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
        'lightning_horn',
      ].includes(w.style);
      if (!isMeleeStyle && w.style !== 'necromancy_staff') {
        const isTutorialInfiniteBow =
          this.isTutorial && w.id === 'starstring_bow' && (this.currentRoom?.tutorialStep ?? 99) <= 3;
        if (!isTutorialInfiniteBow) {
          const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
          if (broke) {
            SoundSystem.playBreak();
            this.ui.showToast(`${w.name} broke!`, '#ffe066');
          }
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
    if (!item) return;
    if (item.id === 'wandering_eye') {
      this.useWanderingEyeWallBreak(this.playerState.activeSlot);
      return;
    }
    if (item.category !== 'consumable') return;
    this.useConsumable(this.playerState.activeSlot);
  }

  private getAimAngle(): number {
    const usePadAim = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
      : inputSystem.controlType === 'gamepad';
    if (!isMobileMode() && !usePadAim) {
      const ptr = this.input.activePointer;
      if (ptr) {
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        return Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, wp.x, wp.y);
      }
    }
    return this.playerState.aimAngle;
  }

  private isPointInSolidWall(x: number, y: number): boolean {
    const maxX = Math.max(154, this.roomWidthPx - 22);
    const maxY = Math.max(154, this.roomHeightPx - 22);
    if (x < 22 || x > maxX || y < 22 || y > maxY) return true;
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
    } else if (item.id === 'syringe') {
      const heal = Math.round(3 * modMult);
      if (net.mode === 'solo' && !localCoopSession.active) {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + heal);
        SoundSystem.playHeal();
        this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x66ffd9, 8);
        this.ui.showToast(`+${heal} HP!`, '#66ffd9');
      } else {
        const angle = this.playerState.aimAngle;
        SoundSystem.playShoot();
        this.createPlayerProjectile(
          this.playerSprite.x,
          this.playerSprite.y,
          angle,
          240,
          0,
          0x66ffd9,
          false,
          false,
          0,
          false,
          false,
          this.playerState.id,
          false,
          false,
          1400,
          false,
          true,
          heal
        );
        if (net.mode !== 'solo') {
          net.broadcastAttack({
            peerId: this.playerState.id,
            gx: this.currentRoom.gx,
            gy: this.currentRoom.gy,
            x: this.playerSprite.x,
            y: this.playerSprite.y,
            angle,
            weaponId: 'syringe_shot',
          });
        }
      }
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
      SoundSystem.playSwing();
      const angle = this.playerState.aimAngle;
      this.createPlayerProjectile(
        this.playerSprite.x,
        this.playerSprite.y,
        angle,
        220,
        0,
        0xffe066,
        false,
        false,
        0,
        false,
        false,
        this.playerState.id,
        false,
        false,
        520
      );
      const bombProj = this.projectiles[this.projectiles.length - 1];
      if (bombProj) {
        bombProj.starBomb = true;
        bombProj.sprite.setTexture('item_star_bomb').clearTint().setScale(1.05);
      }
    } else if (item.id === 'pocket_fireworks') {
      SoundSystem.playShoot();
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        this.createPlayerProjectile(this.playerSprite.x, this.playerSprite.y, a, 210, 2, 0xff75c3, false, false, 1, false, false);
      }
    } else if (item.id === 'revive_totem') {
      if (localCoopSession.active) {
        const downedLocal = this.localPlayers
          .filter((lp) => lp.state.downed)
          .sort((a, b) => a.state.downedTimerMs - b.state.downedTimerMs)[0];
        if (downedLocal) {
          downedLocal.state.downed = false;
          downedLocal.state.hp = Math.max(4, Math.floor(downedLocal.state.maxHp / 2));
          downedLocal.invulnMs = 1500;
          downedLocal.state.gx = this.currentRoom.gx;
          downedLocal.state.gy = this.currentRoom.gy;
          downedLocal.state.x = this.playerSprite.x;
          downedLocal.state.y = this.playerSprite.y;
          downedLocal.sprite.setPosition(this.playerSprite.x, this.playerSprite.y).setFrame(0).setDepth(10).setVisible(true);
          downedLocal.nameTag.setPosition(this.playerSprite.x, this.playerSprite.y - 12).setVisible(true);
          SoundSystem.playHeal();
          this.spawnParticles(downedLocal.sprite.x, downedLocal.sprite.y, 0xffe066, 12);
          this.runFlags.revivedAnyone = true;
          this.ui.showToast(`Revived ${downedLocal.state.name}!`, '#ffe066');
        } else {
          this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 4);
          SoundSystem.playHeal();
        }
      } else {
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
          this.runFlags.revivedAnyone = true;
          this.ui.showToast(`Revived ${longestDowned.name}!`, '#ffe066');
        } else {
          this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 4);
          SoundSystem.playHeal();
        }
      }
    } else if (item.id === 'necromancy_altar') {
      if (localCoopSession.active) {
        const downedLocals = this.localPlayers.filter((lp) => lp.state.downed);
        if (downedLocals.length > 0) {
          for (const lp of downedLocals) {
            lp.state.downed = false;
            lp.state.hp = Math.max(4, Math.floor(lp.state.maxHp / 2));
            lp.invulnMs = 1500;
            lp.state.gx = this.currentRoom.gx;
            lp.state.gy = this.currentRoom.gy;
            lp.state.x = this.playerSprite.x;
            lp.state.y = this.playerSprite.y;
            lp.sprite.setPosition(this.playerSprite.x, this.playerSprite.y).setFrame(0).setDepth(10).setVisible(true);
            lp.nameTag.setPosition(this.playerSprite.x, this.playerSprite.y - 12).setVisible(true);
            this.spawnParticles(lp.sprite.x, lp.sprite.y, 0xc084fc, 10);
          }
          SoundSystem.playHeal();
          this.runFlags.revivedAnyone = true;
          this.ui.showToast('Necromancy Altar revived all allies!', '#c084fc');
        } else {
          this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 6);
          SoundSystem.playHeal();
        }
      } else {
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
      }
    } else if (item.id === 'lucky_backpack') {
      const hasDownedAlly = localCoopSession.active
        ? this.localPlayers.some((lp) => lp.state.downed)
        : Array.from(this.remotePlayers.values()).some((p) => p.downed);
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
        : Math.max(160, Math.hypot(this.roomWidthPx, this.roomHeightPx));
      let destX = this.playerSprite.x;
      let destY = this.playerSprite.y;
      let hookX = destX;
      let hookY = destY;
      let wallHit = false;
      const stepSize = bestEnemy ? 8 : 4;
      const clampMaxX = Math.max(156, this.roomWidthPx - 20);
      const clampMaxY = Math.max(156, this.roomHeightPx - 20);
      for (let step = bestEnemy ? 12 : 4; step <= maxPull; step += stepSize) {
        const cx = Phaser.Math.Clamp(this.playerSprite.x + Math.cos(targetAngle) * step, 20, clampMaxX);
        const cy = Phaser.Math.Clamp(this.playerSprite.y + Math.sin(targetAngle) * step, 20, clampMaxY);
        if (this.isPointInSolidWall(cx, cy)) {
          wallHit = true;
          hookX = cx;
          hookY = cy;
          break;
        }
        destX = cx;
        destY = cy;
        hookX = cx;
        hookY = cy;
      }
      const hookGfx = this.add.graphics().setDepth(12);
      hookGfx.lineStyle(2, 0xcbd5e1, 0.9);
      hookGfx.lineBetween(this.playerSprite.x, this.playerSprite.y, hookX, hookY);
      this.time.delayedCall(140, () => hookGfx.destroy());
      if (!bestEnemy && wallHit) {
        this.spawnParticles(hookX, hookY, 0xcbd5e1, 6);
      }
      if (bestEnemy || wallHit) {
        SoundSystem.playGrappleHit();
      }
      SoundSystem.setGrappleReelActive(true);

      this.invulnMs = Math.max(this.invulnMs, 400);
      this.tweens.add({
        targets: this.playerSprite,
        x: destX,
        y: destY,
        duration: 110,
        ease: 'Quad.easeOut',
        onComplete: () => {
          SoundSystem.setGrappleReelActive(false);
          const hitDirectEnemy = Boolean(bestEnemy);
          if (bestEnemy?.sprite.active) {
            SoundSystem.playHeavySlam();
            const bx = bestEnemy.sprite.x;
            const by = bestEnemy.sprite.y;
            this.damageEnemy(bestEnemy, 2, targetAngle);
            for (const e of [...this.activeEnemies]) {
              if (e === bestEnemy || !e.sprite.active) continue;
              const d = Phaser.Math.Distance.Between(bx, by, e.sprite.x, e.sprite.y);
              if (d <= 26) {
                const kbAngle = d > 2 ? Phaser.Math.Angle.Between(bx, by, e.sprite.x, e.sprite.y) : targetAngle;
                this.damageEnemy(e, 2, kbAngle);
              }
            }
          } else if (!hitDirectEnemy && wallHit) {
            let slammedAny = false;
            for (const e of [...this.activeEnemies]) {
              if (!e.sprite.active) continue;
              const d = Phaser.Math.Distance.Between(hookX, hookY, e.sprite.x, e.sprite.y);
              if (d <= 28) {
                const kbAngle = d > 2 ? Phaser.Math.Angle.Between(hookX, hookY, e.sprite.x, e.sprite.y) : targetAngle;
                this.damageEnemy(e, 2, kbAngle);
                slammedAny = true;
              }
            }
            if (slammedAny) {
              SoundSystem.playHeavySlam();
              this.spawnParticles(destX, destY, 0xcbd5e1, 6);
            }
          }
        },
      });
      this.ui.showToast(bestEnemy ? 'Grapple Slam!' : wallHit ? 'Grappled to Wall!' : 'Grappled!', '#cbd5e1');
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
        const nx = Phaser.Math.Clamp(e.sprite.x + Math.cos(a) * pull, 22, Math.max(22, this.roomWidthPx - 22));
        const ny = Phaser.Math.Clamp(e.sprite.y + Math.sin(a) * pull, 22, Math.max(22, this.roomHeightPx - 22));
        if (!this.isPointInSolidWall(nx, ny)) {
          e.sprite.setPosition(nx, ny);
        }
        e.slowedMs = Math.max(e.slowedMs, 3500);
      }
      this.ui.showToast('Gravity Jar pulled foes in!', '#c084fc');
    } else if (item.id === 'chaos_dice') {
      const px = this.playerSprite.x;
      const py = this.playerSprite.y;
      const diceIcon = this.add.image(px, py - 12, 'item_chaos_dice').setDepth(16).setScale(1.1);
      this.roomGroup.add(diceIcon);
      this.tweens.add({
        targets: diceIcon,
        y: py - 24,
        angle: 360,
        alpha: 0,
        duration: 420,
        ease: 'Quad.Out',
        onComplete: () => diceIcon.destroy(),
      });

      const roll = Math.floor(Math.random() * 4);
      if (roll === 0) {
        let converted = 0;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
          const p = this.projectiles[i];
          if (!p.fromPlayer) {
            this.spawnParticles(p.sprite.x, p.sprite.y, 0x66ffd9, 5);
            p.sprite.destroy();
            this.projectiles.splice(i, 1);
            converted++;
          }
        }
        if (converted > 0) this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 1);
        const vanishRing = this.add.circle(px, py, 10, 0x66ffd9, 0.16).setStrokeStyle(1.8, 0x66ffd9, 0.95).setDepth(13);
        this.roomGroup.add(vanishRing);
        this.tweens.add({
          targets: vanishRing,
          radius: 72,
          alpha: 0,
          duration: 320,
          ease: 'Cubic.Out',
          onComplete: () => vanishRing.destroy(),
        });
        this.spawnParticles(px, py, 0x66ffd9, 10);
        SoundSystem.playHeal();
        this.ui.showToast('Chaos: Bullets vanished!', '#66ffd9');
      } else if (roll === 1) {
        const barrageRing = this.add.circle(px, py, 6, 0xffe066, 0.25).setStrokeStyle(1.8, 0xffe066, 0.95).setDepth(13);
        this.roomGroup.add(barrageRing);
        this.tweens.add({
          targets: barrageRing,
          radius: 26,
          alpha: 0,
          duration: 240,
          ease: 'Quad.Out',
          onComplete: () => barrageRing.destroy(),
        });
        this.spawnParticles(px, py, 0xffe066, 8);
        SoundSystem.playShoot();
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          this.createPlayerProjectile(px, py, a, 195, 2, 0xffe066, false, false, 2, false, false);
        }
        this.ui.showToast('Chaos: Bouncing Barrage!', '#ffe066');
      } else if (roll === 2) {
        this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 3);
        StatusEffectManager.addEffect(this.playerState.statusEffects, 'moonblessed', 10000);
        const blessRing = this.add.circle(px, py, 8, 0xff75c3, 0.22).setStrokeStyle(1.8, 0xff75c3, 0.95).setDepth(13);
        this.roomGroup.add(blessRing);
        this.tweens.add({
          targets: blessRing,
          radius: 30,
          alpha: 0,
          duration: 340,
          ease: 'Quad.Out',
          onComplete: () => blessRing.destroy(),
        });
        this.spawnParticles(px, py, 0xff75c3, 12);
        this.spawnParticles(px, py, 0xffe066, 6);
        SoundSystem.playHeal();
        this.ui.showToast('Chaos: +3 HP & Moonblessed!', '#ff75c3');
      } else {
        const target = this.activeEnemies.find((e) => e.sprite.active);
        const tx = target ? target.sprite.x : Phaser.Math.Clamp(px + Math.cos(this.playerState.aimAngle) * 44, 24, Math.max(24, this.roomWidthPx - 24));
        const ty = target ? target.sprite.y : Phaser.Math.Clamp(py + Math.sin(this.playerState.aimAngle) * 44, 24, Math.max(24, this.roomHeightPx - 24));
        const boltGfx = this.add.graphics().setDepth(15);
        this.roomGroup.add(boltGfx);
        boltGfx.lineStyle(4, 0x6ef3ff, 0.45);
        boltGfx.beginPath();
        boltGfx.moveTo(tx, Math.max(0, ty - 90));
        boltGfx.lineTo(tx - 6, ty - 56);
        boltGfx.lineTo(tx + 7, ty - 28);
        boltGfx.lineTo(tx, ty);
        boltGfx.strokePath();
        boltGfx.lineStyle(1.6, 0xffffff, 0.95);
        boltGfx.beginPath();
        boltGfx.moveTo(tx, Math.max(0, ty - 90));
        boltGfx.lineTo(tx - 6, ty - 56);
        boltGfx.lineTo(tx + 7, ty - 28);
        boltGfx.lineTo(tx, ty);
        boltGfx.strokePath();
        this.tweens.add({
          targets: boltGfx,
          alpha: 0,
          duration: 240,
          onComplete: () => boltGfx.destroy(),
        });
        this.spawnParticles(tx, ty, 0x6ef3ff, 14);
        this.cameras.main.shake(110, 0.009);
        if (target) {
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
        const tx = Phaser.Math.Clamp(nearest.sprite.x, 20, Math.max(20, this.roomWidthPx - 20));
        const ty = Phaser.Math.Clamp(nearest.sprite.y, 20, Math.max(20, this.roomHeightPx - 20));
        this.playerSprite.setPosition(tx, ty);
        nearest.sprite.setPosition(ox, oy);
        this.invulnMs = Math.max(this.invulnMs, 450);
        this.spawnParticles(tx, ty, 0x6ef3ff, 10);
        this.spawnParticles(ox, oy, 0xf49ac1, 10);
        this.damageEnemy(nearest, 3);
        SoundSystem.playPickup();
        this.ui.showToast('Swapped & Shocked!', '#6ef3ff');
      } else {
        const nx = this.roomWidthPx - this.playerSprite.x;
        const ny = this.roomHeightPx - this.playerSprite.y;
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
      const casterSprite = this.playerSprite;
      SoundSystem.playPickup();
      this.ui.showToast('Meteors incoming!', '#ff6b35');
      for (let m = 0; m < 3; m++) {
        this.time.delayedCall(m * 320, () => {
          if (!this.scene.isActive('GameScene')) return;
          const alive = this.activeEnemies.filter((e) => e.sprite.active);
          const target = alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
          const baseX = casterSprite.active ? casterSprite.x : this.playerSprite.x;
          const baseY = casterSprite.active ? casterSprite.y : this.playerSprite.y;
          const mx = target
            ? target.sprite.x
            : Phaser.Math.Clamp(baseX + Phaser.Math.Between(-64, 64), 32, Math.max(32, this.roomWidthPx - 32));
          const my = target
            ? target.sprite.y
            : Phaser.Math.Clamp(baseY + Phaser.Math.Between(-64, 64), 32, Math.max(32, this.roomHeightPx - 32));

          // Ground shadow + warning ring
          const shadow = this.add.circle(mx, my, 12, 0x0b0917, 0.5).setScale(0.25).setDepth(3);
          const warnRing = this.add.circle(mx, my, 18, 0xff6b35, 0.12).setStrokeStyle(1.2, 0xff9f1c, 0.75).setScale(0.3).setDepth(3);
          this.roomGroup.add(shadow);
          this.roomGroup.add(warnRing);

          // Big meteor raining down from the sky
          const startX = mx - 44;
          const startY = my - 115;
          const meteor = this.add.graphics().setPosition(startX, startY).setDepth(16);
          meteor.fillStyle(0xff4500, 0.45);
          meteor.fillCircle(0, 0, 14);
          meteor.fillStyle(0xff6b35, 0.9);
          meteor.fillCircle(0, 0, 11);
          meteor.fillStyle(0x4a2511, 1);
          meteor.fillCircle(0, 0, 8);
          meteor.fillStyle(0xffe066, 0.95);
          meteor.fillCircle(-2, 2, 4);
          this.roomGroup.add(meteor);

          const trail = this.add.graphics().setDepth(15);
          this.roomGroup.add(trail);

          this.tweens.add({
            targets: [shadow, warnRing],
            scale: 1,
            duration: 260,
            ease: 'Quad.In',
          });

          this.tweens.add({
            targets: meteor,
            x: mx,
            y: my,
            duration: 260,
            ease: 'Quad.In',
            onUpdate: () => {
              if (!trail.active || !meteor.active) return;
              trail.clear();
              trail.lineStyle(8, 0xff4500, 0.45);
              trail.lineBetween(meteor.x - 16, meteor.y - 42, meteor.x, meteor.y);
              trail.lineStyle(4, 0xffe066, 0.85);
              trail.lineBetween(meteor.x - 10, meteor.y - 26, meteor.x, meteor.y);
            },
            onComplete: () => {
              meteor.destroy();
              trail.destroy();
              shadow.destroy();
              warnRing.destroy();
              if (!this.scene.isActive('GameScene')) return;

              SoundSystem.playMeteorCrash();
              this.cameras.main.shake(120, 0.011);
              this.spawnParticles(mx, my, 0xff6b35, 16);
              this.spawnFireParticles(mx, my, 5);

              // Short circular blaze on the ground
              const blaze = this.add.circle(mx, my, 26, 0xff4500, 0.48).setStrokeStyle(2, 0xffe066, 0.9).setDepth(3);
              const blazeInner = this.add.circle(mx, my, 15, 0xff9f1c, 0.55).setDepth(3);
              const blazeGlow = this.add
                .image(mx, my, 'glow_soft')
                .setScale(2.0)
                .setTint(0xff6b35)
                .setAlpha(0.45)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(4);
              this.roomGroup.add(blaze);
              this.roomGroup.add(blazeInner);
              this.roomGroup.add(blazeGlow);
              this.tweens.add({
                targets: [blaze, blazeInner, blazeGlow],
                alpha: 0,
                scale: 0.85,
                delay: 220,
                duration: 220,
                ease: 'Quad.Out',
                onComplete: () => {
                  blaze.destroy();
                  blazeInner.destroy();
                  blazeGlow.destroy();
                },
              });

              for (const e of [...this.activeEnemies]) {
                if (e.sprite.active && Phaser.Math.Distance.Between(mx, my, e.sprite.x, e.sprite.y) <= 44) {
                  this.damageEnemy(e, 6);
                }
              }
            },
          });
        });
      }
    }

    consumeUse(this.playerState.inventory, slotIdx, 1);
  }

  private triggerStarBomb(x: number, y: number): void {
    SoundSystem.playExplosion();
    this.cameras.main.shake(180, 0.014);

    // Big expanding shockwave flash + star shrapnel burst
    const flash = this.add.circle(x, y, 14, 0xffffff, 0.85).setDepth(14);
    const blastRing = this.add.circle(x, y, 12, 0xff9f1c, 0.32).setStrokeStyle(3, 0xffe066, 0.95).setDepth(13);
    this.roomGroup.add(flash);
    this.roomGroup.add(blastRing);
    this.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 160,
      ease: 'Quad.Out',
      onComplete: () => flash.destroy(),
    });
    this.tweens.add({
      targets: blastRing,
      radius: 68,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => blastRing.destroy(),
    });

    const shrapnelColors = [0xffe066, 0xffd275, 0xff9f1c, 0xffffff];
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = Phaser.Math.Between(24, 72);
      const tex = i % 3 === 0 ? 'proj_star' : i % 2 === 0 ? 'particle_star' : 'particle_spark';
      const piece = this.add
        .image(x, y, tex)
        .setTint(shrapnelColors[i % shrapnelColors.length])
        .setScale(tex === 'proj_star' ? Phaser.Math.FloatBetween(0.75, 1.1) : Phaser.Math.FloatBetween(1.0, 1.5))
        .setDepth(14);
      this.tweens.add({
        targets: piece,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        angle: Phaser.Math.Between(-240, 240),
        scale: 0.2,
        alpha: 0,
        duration: Phaser.Math.Between(280, 460),
        ease: 'Quad.Out',
        onComplete: () => piece.destroy(),
      });
    }

    for (const e of [...this.activeEnemies]) {
      if (e.sprite.active && Phaser.Math.Distance.Between(x, y, e.sprite.x, e.sprite.y) <= 68) {
        this.damageEnemy(e, 10);
      }
    }

    for (const obj of [...this.crateGroup.getChildren()]) {
      const cs = obj as Phaser.Physics.Arcade.Sprite;
      if (cs.active && Phaser.Math.Distance.Between(x, y, cs.x, cs.y) <= 68) {
        this.smashCrate(cs);
      }
    }

    // Reveal adjacent secret walls if near them
    const opened = this.tryOpenAdjacentSecretWall(x, y);
    if (!opened && this.isTutorial && this.currentRoom?.tutorialStep === 7 && !this.currentRoom.secretRevealed) {
      const hasBomb = this.playerState.inventory.some((it) => it?.id === 'star_bomb');
      if (!hasBomb) {
        const freeBomb = createItemInstance('star_bomb');
        if (freeBomb) {
          addItemToSlots(this.playerState.inventory, this.playerState.activeSlot, freeBomb);
          this.ui.showToast('Missed wall! Free Star Bomb given.', '#ffe066');
        }
      }
    }
  }

  private isNearClosedSecretWall(x: number, y: number): boolean {
    if (this.currentRoom.secretRevealed) return false;
    return Boolean(
      (this.currentRoom.connections.secretNorth && y < 44) ||
        (this.currentRoom.connections.secretSouth && y > 132) ||
        (this.currentRoom.connections.secretWest && x < 44) ||
        (this.currentRoom.connections.secretEast && x > 132)
    );
  }

  private tryOpenAdjacentSecretWall(x: number, y: number): boolean {
    if (!this.isNearClosedSecretWall(x, y)) return false;
    this.currentRoom.secretRevealed = true;
    SoundSystem.playUnlock();
    this.spawnParticles(x, y, 0xffe066, 12);
    this.ui.showToast('Secret passage opened!', '#ffe066');
    this.loadRoom(this.currentRoom.gx, this.currentRoom.gy, this.playerSprite.x, this.playerSprite.y);
    return true;
  }

  private useWanderingEyeWallBreak(slotIdx: number): boolean {
    const item = this.playerState.inventory[slotIdx];
    if (!item || item.id !== 'wandering_eye') return false;
    if (!this.tryOpenAdjacentSecretWall(this.playerSprite.x, this.playerSprite.y)) {
      this.ui.showToast('Stand near a cracked secret wall!', '#ffe066');
      return false;
    }
    const broke = consumeUse(this.playerState.inventory, slotIdx, 1);
    if (broke) {
      SoundSystem.playBreak();
      this.ui.showToast('Wandering Eye shattered!', '#ffe066');
    }
    return true;
  }

  private spawnWeaponAttack(
    x: number,
    y: number,
    angle: number,
    weaponId: string,
    ownerId: string,
    isLocal: boolean
  ): void {
    if (weaponId === 'syringe_shot') {
      SoundSystem.playShoot();
      this.createPlayerProjectile(
        x,
        y,
        angle,
        240,
        0,
        0x66ffd9,
        false,
        false,
        0,
        false,
        false,
        ownerId,
        false,
        false,
        1400,
        false,
        true,
        3
      );
      return;
    }

    const w = WEAPONS[weaponId];
    if (weaponId === 'frost_needle' && w) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const needleRange = 32;
      let needleReach = needleRange;
      const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wl) => wl.active);
      for (let d = 8; d <= needleRange; d += 4) {
        const px = x + cos * d;
        const py = y + sin * d;
        if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
          needleReach = d;
          break;
        }
        if (walls.some((wl) => Math.abs(px - wl.x) < 8.5 && Math.abs(py - wl.y) < 8.5)) {
          needleReach = d;
          break;
        }
      }

      SoundSystem.playWeaponStab();
      const thrustDist = Math.min(needleReach, 20);
      const needle = this.add
        .image(x + cos * 6, y + sin * 6, 'item_frost_needle')
        .setRotation(angle + Math.PI / 4)
        .setScale(1.1)
        .setDepth(12);
      const streak = this.add.graphics().setDepth(11);
      streak.lineStyle(2.5, 0x9bf6ff, 0.7);
      streak.lineBetween(x + cos * 8, y + sin * 8, x + cos * needleReach, y + sin * needleReach);
      streak.lineStyle(1, 0xffffff, 0.9);
      streak.lineBetween(x + cos * 8, y + sin * 8, x + cos * needleReach, y + sin * needleReach);
      this.tweens.add({
        targets: streak,
        alpha: 0,
        duration: 165,
        onComplete: () => streak.destroy(),
      });
      this.tweens.add({
        targets: needle,
        x: x + cos * thrustDist,
        y: y + sin * thrustDist,
        duration: 80,
        ease: 'Cubic.Out',
        onComplete: () => {
          if (!needle.active) return;
          this.tweens.add({
            targets: needle,
            x: x + cos * 10,
            y: y + sin * 10,
            alpha: 0,
            duration: 100,
            ease: 'Quad.In',
            onComplete: () => needle.destroy(),
          });
        },
      });

      if (isLocal) {
        for (const e of [...this.activeEnemies]) {
          if (!e.sprite.active) continue;
          const dx = e.sprite.x - x;
          const dy = e.sprite.y - y;
          const along = dx * cos + dy * sin;
          const perp = Math.abs(-sin * dx + cos * dy);
          const pad = e.isBoss ? 14 : 9;
          if (along >= -4 && along <= needleReach + pad && perp <= (e.isBoss ? 15 : 10)) {
            if (e.bubbledMs > 0) {
              this.popEnemyBubble(e);
            }
            if (e.frozenMs && e.frozenMs > 0) {
              e.iceHits = (e.iceHits ?? 0) + 1;
              if (e.iceHits >= 2) {
                this.shatterEnemyIce(e);
              } else {
                this.drawEnemyIceCube(e, true);
                this.spawnParticles(e.sprite.x, e.sprite.y, 0xbae6fd, 5);
              }
            }
            this.spawnParticles(e.sprite.x, e.sprite.y, 0x9bf6ff, 4);
            // Melee hit deals damage with no knockback and no freeze
            this.damageEnemy(e, w.damage);
          }
        }
        this.hitNyarlathotepArm(x + cos * Math.min(needleReach, 22), y + sin * Math.min(needleReach, 22), 22, w.damage);
      }

      // Shoot snowball out from the tip of the needle
      const speedMult =
        (this.floor.modifier === 'wild_magic' ? 1.2 : 1) *
        StatusEffectManager.getProjectileSpeedMultiplier(this.playerState.statusEffects);
      const spd = (w.projectileSpeed ?? 220) * speedMult;
      const tipX = x + cos * Math.max(8, thrustDist - 2);
      const tipY = y + sin * Math.max(8, thrustDist - 2);
      this.time.delayedCall(55, () => {
        if (!this.scene.isActive('GameScene')) return;
        SoundSystem.playMagicShoot();
        this.spawnParticles(tipX, tipY, 0xe0f2fe, 3);
        this.createPlayerProjectile(
          tipX,
          tipY,
          angle,
          spd,
          w.damage,
          0xe0f2fe,
          false,
          false,
          0,
          false,
          false,
          ownerId,
          false,
          false,
          undefined,
          false,
          false,
          3,
          true
        );
      });
      return;
    }

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
          'lightning_horn',
        ].includes(w.style));

    if (isMeleeStyle) {
      const dmg = w ? w.damage : 1;
      const range = w ? w.range : 26;
      const isHeavy = w?.style === 'heavy_slam' || w?.style === 'heavy_sword';
      const cutsProjectiles = w?.style === 'heavy_sword';
      const isSpin = w?.style === 'spin_flail';
      const isShadowFork = weaponId === 'shadow_fork';
      const isSunRapier = weaponId === 'sun_rapier';
      const isCrystalGlaive = weaponId === 'crystal_glaive';
      const isPierceThrust = isShadowFork || isSunRapier || isCrystalGlaive;
      const isWhip = w?.style === 'whip_pull';
      const isKatana = weaponId === 'crescent_katana';
      const isVineScythe = weaponId === 'vine_scythe';
      const isFrostFang = weaponId === 'frost_fang';
      const isObsidianAxe = weaponId === 'obsidian_axe';
      const isAstralGreatsword = weaponId === 'astral_greatsword';
      if (isWhip) {
        SoundSystem.playWeaponWhip();
      } else if (isPierceThrust || w?.style === 'echo_blade') {
        SoundSystem.playWeaponStab();
      } else if (w?.style === 'lightning_horn') {
        SoundSystem.playLightningElectric();
      } else if (w?.style === 'heavy_slam' || w?.style === 'honey_slam') {
        SoundSystem.playHeavySlam();
      } else {
        SoundSystem.playWeaponSlash();
      }

      // Visual 16-bit slash arc (360 centered on player for flail, or spear/rapier poke for shadow_fork / sun_rapier)
      const sx = isSpin ? x : x + Math.cos(angle) * 16;
      const sy = isSpin ? y : y + Math.sin(angle) * 16;
      let forkMaxReach = range;
      if (isPierceThrust) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wl) => wl.active);
        for (let d = 8; d <= range; d += 4) {
          const px = x + cos * d;
          const py = y + sin * d;
          if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
            forkMaxReach = d;
            break;
          }
          if (walls.some((wl) => Math.abs(px - wl.x) < 8.5 && Math.abs(py - wl.y) < 8.5)) {
            forkMaxReach = d;
            break;
          }
        }
        const forkThrust = Math.min(forkMaxReach, isSunRapier || isCrystalGlaive ? 28 : 36);
        const pokeTex = isSunRapier ? 'item_sun_rapier' : isCrystalGlaive ? 'item_crystal_glaive' : 'item_shadow_fork';
        const pokeRot = isSunRapier || isCrystalGlaive ? angle + Math.PI / 4 : angle + Math.PI / 2;
        const streakColor = isSunRapier ? 0xffe066 : isCrystalGlaive ? 0x70f8ff : 0x8b5cf6;
        const streakCore = isSunRapier || isCrystalGlaive ? 0xffffff : 0xe9d5ff;
        const fork = this.add
          .image(x + cos * 6, y + sin * 6, pokeTex)
          .setRotation(pokeRot)
          .setScale(1.15)
          .setDepth(12);
        const streak = this.add.graphics().setDepth(11);
        streak.lineStyle(3, streakColor, 0.7);
        streak.lineBetween(x + cos * 8, y + sin * 8, x + cos * forkMaxReach, y + sin * forkMaxReach);
        streak.lineStyle(1.2, streakCore, 0.9);
        streak.lineBetween(x + cos * 8, y + sin * 8, x + cos * forkMaxReach, y + sin * forkMaxReach);
        this.tweens.add({
          targets: streak,
          alpha: 0,
          duration: 180,
          onComplete: () => streak.destroy(),
        });
        this.tweens.add({
          targets: fork,
          x: x + cos * forkThrust,
          y: y + sin * forkThrust,
          duration: 85,
          ease: 'Cubic.Out',
          onComplete: () => {
            if (!fork.active) return;
            this.tweens.add({
              targets: fork,
              x: x + cos * 10,
              y: y + sin * 10,
              alpha: 0,
              duration: 105,
              ease: 'Quad.In',
              onComplete: () => fork.destroy(),
            });
          },
        });
      } else if (isKatana) {
        this.spawnCrescentKatanaSwipe(x, y, angle, isLocal, 'item_crescent_katana', 0xc084fc, 0xffffff);
      } else if (isVineScythe) {
        this.spawnCrescentKatanaSwipe(x, y, angle, isLocal, 'fx_vine_scythe', 0x9ef01a, 0xd9f99d);
      } else if (isFrostFang) {
        this.spawnCrescentKatanaSwipe(x, y, angle, isLocal, 'item_frost_fang', 0x70f8ff, 0xe0f2fe);
      } else if (isObsidianAxe) {
        this.spawnObsidianAxeSlam(x, y, angle, isLocal);
      } else if (isAstralGreatsword) {
        this.spawnCrescentKatanaSwipe(x, y, angle, isLocal, 'item_astral_greatsword', 0xffe066, 0x6ef3ff);
      } else if (!isWhip) {
        const slash = this.add.circle(sx, sy, isSpin ? range * 0.75 : isHeavy ? 20 : 13, w ? w.color : 0xffffff, 0.5).setDepth(12);
        this.tweens.add({ targets: slash, scale: 1.35, alpha: 0, duration: cutsProjectiles ? 220 : 150, onComplete: () => slash.destroy() });
      }

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
        const chainedSet = new Set<ActiveEnemy>();
        let firstHit: ActiveEnemy | null = null;
        for (const e of [...this.activeEnemies]) {
          let hit = false;
          if (isPierceThrust) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const dx = e.sprite.x - x;
            const dy = e.sprite.y - y;
            const along = dx * cos + dy * sin;
            const perp = Math.abs(-sin * dx + cos * dy);
            const pad = e.isBoss ? 14 : 9;
            hit = along >= -4 && along <= forkMaxReach + pad && perp <= (e.isBoss ? 16 : 11);
          } else {
            const dist = Phaser.Math.Distance.Between(sx, sy, e.sprite.x, e.sprite.y);
            hit = dist <= range;
          }
          if (hit) {
            if (w?.style === 'lightning_horn') {
              if (!firstHit) firstHit = e;
              hitAny = true;
              continue;
            }
            if (w?.style === 'frost_blade' || w?.style === 'honey_slam') {
              e.slowedMs = 3000;
            }
            if (w?.style === 'venom_blade') {
              e.burningMs = 3000;
              e.burnTickMs = 0;
            }
            if (w?.style === 'whip_pull' && !e.isBoss) {
              this.spawnParticles(e.sprite.x, e.sprite.y, 0x34d399, 4);
              const pullA = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, x, y);
              const distToPlayer = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, x, y);
              const pullDist = Math.min(20, Math.max(0, distToPlayer - 18));
              const minX = this.isTestRoom ? 21 * 16 + 8 : 22;
              const targetX = Phaser.Math.Clamp(e.sprite.x + Math.cos(pullA) * pullDist, minX, Math.max(minX, this.roomWidthPx - 22));
              const targetY = Phaser.Math.Clamp(e.sprite.y + Math.sin(pullA) * pullDist, 22, Math.max(22, this.roomHeightPx - 22));
              if (pullDist > 0) {
                this.tweens.add({
                  targets: e.sprite,
                  x: targetX,
                  y: targetY,
                  delay: 75,
                  duration: 125,
                  ease: 'Quad.Out',
                });
              }
            }
            if (isPierceThrust) {
              this.spawnParticles(e.sprite.x, e.sprite.y, isSunRapier ? 0xffe066 : isCrystalGlaive ? 0x70f8ff : 0x8b5cf6, 4);
            }
            if (e.bubbledMs > 0) {
              this.popEnemyBubble(e);
            }
            if (e.frozenMs && e.frozenMs > 0) {
              e.iceHits = (e.iceHits ?? 0) + 1;
              if (e.iceHits >= 2) {
                this.shatterEnemyIce(e);
              } else {
                this.drawEnemyIceCube(e, true);
                this.spawnParticles(e.sprite.x, e.sprite.y, 0xbae6fd, 5);
              }
            }
            this.damageEnemy(e, dmg, isHeavy || isShadowFork ? angle : undefined);
            hitAny = true;
          }
        }
        if (this.hitNyarlathotepArm(sx, sy, range, dmg)) {
          hitAny = true;
        }
        if (w?.style === 'lightning_horn') {
          const firstHitFromMelee = firstHit !== null;
          const chainDmg = 5;
          if (!firstHit) {
            let bestDist = Infinity;
            for (const cand of this.activeEnemies) {
              if (!cand.sprite.active) continue;
              const d = Phaser.Math.Distance.Between(x, y, cand.sprite.x, cand.sprite.y);
              if (d < bestDist) {
                bestDist = d;
                firstHit = cand;
              }
            }
            if (firstHit) {
              hitAny = true;
              this.drawLightningBolt(x, y, firstHit.sprite.x, firstHit.sprite.y);
            }
          }
          if (firstHit) {
            let curr: ActiveEnemy | null = firstHit;
            while (curr) {
              chainedSet.add(curr);
              const cx = curr.sprite.x;
              const cy = curr.sprite.y;
              this.spawnParticles(cx, cy, 0x6ef3ff, 6);
              const isMeleeHit = curr === firstHit && firstHitFromMelee;
              this.damageEnemy(curr, isMeleeHit ? dmg : chainDmg, isMeleeHit ? angle : undefined);

              let nextEnemy: ActiveEnemy | null = null;
              let bestDist = Infinity;
              for (const cand of this.activeEnemies) {
                if (!cand.sprite.active || chainedSet.has(cand)) continue;
                const d = Phaser.Math.Distance.Between(cx, cy, cand.sprite.x, cand.sprite.y);
                if (d < bestDist) {
                  bestDist = d;
                  nextEnemy = cand;
                }
              }
              if (nextEnemy) {
                this.drawLightningBolt(cx, cy, nextEnemy.sprite.x, nextEnemy.sprite.y);
              }
              curr = nextEnemy;
            }
            this.cameras.main.shake(100, 0.008);
          }
        }
        if (hitAny && w) {
          const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
          if (broke) {
            SoundSystem.playBreak();
            this.ui.showToast(`${w.name} broke!`, '#ffe066');
          }
        }

        if (weaponId === 'cloudbreaker') {
          this.spawnCloudbreakerPulse(x, y, angle, true, hitAny);
        }
        if (isWhip) {
          this.spawnThornWhipAnim(x, y, angle, range);
        }

        // Echo Dagger sends out a sonic wave ripple (45 deg arc, knockback only) and repeats the slash after 220ms
        if (w?.style === 'echo_blade') {
          this.spawnEchoSonicWave(x, y, angle, true);
          const echoActor = this.activeLocalActor;
          const echoAngle = angle;
          this.time.delayedCall(220, () => {
            if (!this.scene.isActive('GameScene')) return;
            const actorSprite = echoActor ? echoActor.sprite : this.playerSprite;
            const actorDowned = echoActor ? echoActor.state.downed : this.playerState.downed;
            if (!actorSprite.active || actorDowned) return;
            const ex = actorSprite.x + Math.cos(echoAngle) * 16;
            const ey = actorSprite.y + Math.sin(echoAngle) * 16;
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
            this.smashCrate(cs);
          }
        });
      } else if (weaponId === 'cloudbreaker') {
        this.spawnCloudbreakerPulse(x, y, angle, false, true);
      } else if (w?.style === 'echo_blade') {
        this.spawnEchoSonicWave(x, y, angle, false);
      } else if (isWhip) {
        this.spawnThornWhipAnim(x, y, angle, range);
      }
      return;
    }

    if (!w) return;
    if (w.id === 'starstring_bow' || w.id === 'eclipse_bow' || w.style === 'comet_shot') {
      SoundSystem.playBowDraw();
    } else if (w.id === 'thunder_rod' || w.id === 'spark_wand') {
      SoundSystem.playLightningElectric();
    } else if (w.style === 'necromancy_staff') {
      SoundSystem.playNecromancySummon();
    } else if (w.id === 'slime_launcher') {
      SoundSystem.playSlimeJump();
    } else if (w.style === 'bounce_spore') {
      SoundSystem.playSporePoof();
    } else if (w.style !== 'flamethrower') {
      SoundSystem.playMagicShoot();
    }
    const speedMult =
      (this.floor.modifier === 'wild_magic' ? 1.2 : 1) *
      StatusEffectManager.getProjectileSpeedMultiplier(this.playerState.statusEffects);
    const spd = (w.projectileSpeed ?? 200) * speedMult;

    if (w.id === 'thunder_rod') {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let endX = x + cos * w.range;
      let endY = y + sin * w.range;
      let boltLen = w.range;
      const maxWallDistSq = (w.range + 16) * (w.range + 16);
      const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wl) => {
        if (!wl.active) return false;
        const dx = wl.x - x;
        const dy = wl.y - y;
        return dx * dx + dy * dy <= maxWallDistSq;
      });
      for (let d = 8; d <= w.range; d += 4) {
        const px = x + cos * d;
        const py = y + sin * d;
        if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
          endX = px;
          endY = py;
          boltLen = d;
          break;
        }
        if (walls.some((wl) => Math.abs(px - wl.x) < 8.5 && Math.abs(py - wl.y) < 8.5)) {
          endX = px;
          endY = py;
          boltLen = d;
          break;
        }
      }

      this.drawLightningBolt(x, y, endX, endY);
      this.spawnParticles(endX, endY, 0x6ef3ff, 5);

      if (isLocal) {
        for (const e of [...this.activeEnemies]) {
          if (!e.sprite.active) continue;
          const dx = e.sprite.x - x;
          const dy = e.sprite.y - y;
          const along = dx * cos + dy * sin;
          const pad = e.isBoss ? 14 : 9;
          if (along < 0 || along > boltLen + pad) continue;
          const perp = Math.abs(-sin * dx + cos * dy);
          if (perp <= (e.isBoss ? 22 : 16)) {
            this.spawnParticles(e.sprite.x, e.sprite.y, 0x6ef3ff, 5);
            this.damageEnemy(e, w.damage);
          }
        }
      }
      return;
    }

    if (w.style === 'prism_bounce') {
      const gfx = this.add.graphics().setDepth(12);
      this.roomGroup.add(gfx);
      this.prismBeams.push({
        gfx,
        ownerId,
        isLocal,
        angle,
        range: w.range,
        damage: w.damage,
        chargeMs: 500,
        activeMs: 250,
        fxAccumMs: 0,
        hitUids: new Set(),
      });
    } else if (w.style === 'fan_spread') {
      const offsets =
        w.id === 'spark_wand'
          ? [-Math.PI / 12, -Math.PI / 24, 0, Math.PI / 24, Math.PI / 12]
          : [-0.24, 0, 0.24];
      for (const offset of offsets) {
        this.createPlayerProjectile(x, y, angle + offset, spd, w.damage, w.color, false, false, 0, false, false, ownerId);
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          if (w.id === 'spark_wand') {
            lastProj.sprite.setTexture('particle_spark').setTint(0xfef08a).setScale(1.15);
          } else if (w.id === 'eclipse_bow') {
            lastProj.sprite.setTexture('proj_arrow').setRotation(angle + offset);
            lastProj.textureKey = 'proj_arrow';
            lastProj.rotateToVelocity = true;
          }
        }
      }
    } else if (w.style === 'necromancy_staff') {
      if (!isLocal) {
        this.spawnParticles(x, y, 0xc084fc, 8);
        return;
      }
      const activeItem = this.playerState.inventory[this.playerState.activeSlot];
      const staffId = activeItem?.instanceId ?? 'black_staff';
      this.summonedSkeletons = this.summonedSkeletons.filter((s) => s.sprite.active);
      const aliveForStaff = this.summonedSkeletons.filter((s) => s.staffInstanceId === staffId);
      const usedSlots = new Set(aliveForStaff.map((s) => s.formationIndex));
      const missingIndices: number[] = [];
      for (let idx = 0; idx < 4; idx++) {
        if (!usedSlots.has(idx)) missingIndices.push(idx);
      }
      if (missingIndices.length === 0) {
        this.ui.showToast('All 4 skeletons are already active!', '#c084fc');
        return;
      }

      const spawnOffsets = [
        { dx: -16, dy: -12 },
        { dx: 16, dy: -12 },
        { dx: -16, dy: 12 },
        { dx: 16, dy: 12 },
      ];
      for (const idx of missingIndices) {
        const off = spawnOffsets[idx];
        const sx = Phaser.Math.Clamp(x + off.dx, 24, Math.max(24, this.roomWidthPx - 24));
        const sy = Phaser.Math.Clamp(y + off.dy, 24, Math.max(24, this.roomHeightPx - 24));
        const skSprite = this.physics.add.sprite(sx, sy + 6, 'ally_skeleton', 0).setDepth(9);
        skSprite.setSize(10, 12);
        skSprite.setOffset(3, 4);
        skSprite.setCollideWorldBounds(true);
        skSprite.setScale(1, 0.2);
        this.skeletonGroup.add(skSprite);
        this.tweens.add({
          targets: skSprite,
          y: sy,
          scaleY: 1,
          duration: 240,
          ease: 'Back.easeOut',
        });
        this.spawnParticles(sx, sy, 0xc084fc, 5);
        this.summonedSkeletons.push({
          uid: `sk_${Date.now()}_${idx}_${Math.floor(Math.random() * 9999)}`,
          staffInstanceId: staffId,
          ownerId: this.playerState.id,
          sprite: skSprite,
          hp: 10,
          maxHp: 10,
          attackCooldownMs: 0,
          hitFlashMs: 0,
          formationIndex: idx,
        });
      }
      SoundSystem.playHeal();
      this.ui.showToast(
        missingIndices.length === 4 ? 'Raised 4 skeletons!' : `Raised ${missingIndices.length} skeleton${missingIndices.length > 1 ? 's' : ''}!`,
        '#c084fc'
      );
      const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
      if (broke) {
        SoundSystem.playBreak();
        this.ui.showToast(`${w.name} broke!`, '#ffe066');
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
        w.style === 'bounce_spore' && w.id !== 'mushroom_staff' ? 2 : w.id === 'lunar_chakram' ? 2 : w.style === 'boomerang' ? 4 : 0,
        w.style === 'frost_needle',
        w.style === 'bubble',
        ownerId,
        w.style === 'fireball',
        w.style === 'comet_shot',
        undefined,
        w.id === 'slime_launcher'
      );
      if (w.id === 'mushroom_staff') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) lastProj.splitSpore = true;
      } else if (w.id === 'star_cannon') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          lastProj.starShatter = true;
          lastProj.sprite.setTexture('proj_star').clearTint().setScale(1.15);
        }
      } else if (w.id === 'aurora_harp') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          const noteIdx = Math.floor(Math.random() * 4);
          const noteColors = [0x66ffd9, 0x6ef3ff, 0xc084fc, 0xf49ac1];
          lastProj.isMusicNote = true;
          lastProj.floatPhase = Math.random() * Math.PI * 2;
          lastProj.sprite.setTexture(`proj_note_${noteIdx}`).setTint(noteColors[noteIdx]);
        }
      } else if (w.id === 'void_orb') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          lastProj.voidRift = true;
        }
      } else if (w.id === 'lunar_chakram') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          lastProj.lunarDisc = true;
          lastProj.lunarSliceMs = 0;
          lastProj.sprite.setTexture('proj_lunar_chakram').clearTint();
        }
      } else if (w.id === 'celestial_scepter') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          lastProj.shockBlast = true;
        }
      } else if (w.id === 'starstring_bow') {
        const lastProj = this.projectiles[this.projectiles.length - 1];
        if (lastProj) {
          lastProj.sprite.setTexture('proj_arrow').setRotation(angle);
          lastProj.textureKey = 'proj_arrow';
          lastProj.rotateToVelocity = true;
        }
      }
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
    customLifeMs?: number,
    slimeSplatter = false,
    healsAlly = false,
    healAmount = 3,
    freezes = false
  ): void {
    const textureKey = boomerang ? 'item_dream_reaper' : healsAlly ? 'item_syringe' : 'proj_orb';
    const sp = this.physics.add.sprite(x, y, textureKey).setDepth(11);
    if (!boomerang && !healsAlly) {
      sp.setTint(color);
    }
    if (healsAlly) {
      sp.setRotation(angle).setScale(0.9);
    }
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
      freezes,
      bubbles,
      burns,
      cometBoost,
      slimeSplatter,
      healsAlly,
      healAmount,
      textureKey,
      rotateToVelocity: healsAlly,
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
    shooterUid?: string,
    opts?: {
      textureKey?: string;
      scale?: number;
      lifeMs?: number;
      bouncesLeft?: number;
      homing?: boolean;
      spinSpeed?: number;
      rotateToVelocity?: boolean;
      wobbleAmp?: number;
      wobbleFreq?: number;
      accel?: number;
      curveRate?: number;
      sporeBurst?: boolean;
      slimeSplatter?: boolean;
      inflictEffect?: StatusEffectId;
      inflictDurationMs?: number;
    }
  ): void {
    const tex = opts?.textureKey ?? 'proj_orb';
    const sp = this.physics.add.sprite(x, y, tex).setDepth(11).setTint(color);
    if (opts?.scale && opts.scale !== 1) {
      sp.setScale(opts.scale);
    }
    if (opts?.rotateToVelocity) {
      sp.setRotation(angle);
    }
    SoundSystem.playEnemyShoot();
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
      lifeMs: opts?.lifeMs ?? 2600,
      homing: !!opts?.homing,
      boomerang: false,
      returning: false,
      bouncesLeft: opts?.bouncesLeft ?? 0,
      slows: false,
      bubbles: false,
      burns,
      textureKey: tex,
      spinSpeed: opts?.spinSpeed,
      rotateToVelocity: opts?.rotateToVelocity,
      wobbleAmp: opts?.wobbleAmp,
      wobbleFreq: opts?.wobbleFreq,
      wobblePhase: 0,
      accel: opts?.accel,
      curveRate: opts?.curveRate,
      sporeBurst: opts?.sporeBurst,
      slimeSplatter: opts?.slimeSplatter,
      inflictEffect: opts?.inflictEffect,
      inflictDurationMs: opts?.inflictDurationMs,
      hitUids: new Set(),
    });
  }

  private damageEnemy(enemy: ActiveEnemy, dmg: number, knockbackAngle?: number): void {
    this.runFlags.hurtAnyEnemy = true;
    if (this.playerState.name === 'ADMIN' || net.localName === 'ADMIN') {
      dmg = Math.max(dmg, enemy.hp, 9999);
    }
    enemy.hitFlashMs = 120;
    enemy.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
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
      const minX = this.isTestRoom ? 21 * 16 + 8 : 22;
      enemy.sprite.x = Phaser.Math.Clamp(
        enemy.sprite.x + Math.cos(knockbackAngle) * 14,
        minX,
        Math.max(minX, this.roomWidthPx - 22)
      );
      enemy.sprite.y = Phaser.Math.Clamp(
        enemy.sprite.y + Math.sin(knockbackAngle) * 14,
        22,
        Math.max(22, this.roomHeightPx - 22)
      );
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
    if (enemy.bubbleGfx) {
      enemy.bubbleGfx.destroy();
      enemy.bubbleGfx = undefined;
    }
    if (enemy.iceGfx) {
      enemy.iceGfx.destroy();
      enemy.iceGfx = undefined;
    }
    enemy.sprite.destroy();
    this.activeEnemies = this.activeEnemies.filter((e) => e !== enemy);
    this.totalEnemiesDefeated++;
    if (this.totalEnemiesDefeated >= 1) void steamSystem.unlockAchievement('ACH_FIRST_BLOOD');
    if (enemy.isBoss) void steamSystem.unlockAchievement('ACH_BOSS_SLAYER');
    this.spawnParticles(ex, ey, 0xffe066, 10);

    if (!enemy.isBoss) {
      if (enemy.defId === 'ooze_ling') {
        this.spawnSlimeSplatter(ex, ey, true);
        for (let k = 0; k < 2; k++) {
          const da = Math.random() * Math.PI * 2;
          this.createEnemyProjectile(ex, ey, da, 85, enemy.damage, 0xa6ff4d, false, undefined, {
            textureKey: 'proj_glob',
            scale: 0.8,
            lifeMs: 650,
            spinSpeed: 0.4,
          });
        }
      } else if (enemy.defId === 'clockwork_tick') {
        for (let k = 0; k < 4; k++) {
          const da = Math.PI / 4 + (Math.PI / 2) * k;
          this.createEnemyProjectile(ex, ey, da, 115, enemy.damage, 0xffd275, false, undefined, {
            textureKey: 'proj_gear',
            scale: 0.85,
            lifeMs: 900,
            spinSpeed: 0.65,
          });
        }
      }
    }

    const roomEnemy = this.currentRoom.enemies.find((e) => e.uid === enemy.uid);
    if (roomEnemy) {
      roomEnemy.hp = 0;
      roomEnemy.alive = false;
    }

    if (enemy.isBoss) {
      if (enemy.defId === 'clockwork_witch') {
        this.witchGfx?.destroy();
        this.witchGfx = undefined;
        this.witchLaserState = 'idle';
      }
      if (enemy.defId === 'withered_everheart') {
        this.everheartGfx?.destroy();
        this.everheartGfx = undefined;
        this.everheartThorns = [];
        this.everheartPulses = [];
        this.everheartTetherMs = 0;
      }
      if (enemy.defId === 'nyarlathotep') {
        this.nyarGfx?.destroy();
        this.nyarGfx = undefined;
        this.nyarArmState = 'idle';
        this.nyarBeamState = 'idle';
        this.nyarGrabbedMs = 0;
        this.nyarThrowMs = 0;
        // Clear remaining chaos spawns on boss defeat
        for (const minion of [...this.activeEnemies]) {
          if (minion !== enemy && minion.sprite.active) {
            this.spawnParticles(minion.sprite.x, minion.sprite.y, 0xff8c1a, 5);
            minion.sprite.destroy();
          }
        }
        this.activeEnemies = [];
        this.recordNyarVictory();
        this.ui.showToast(
          `A vessel shatters... and yet, ${this.playerState.name}, I am still behind your eyes.`,
          '#ffe066'
        );
      }
      this.currentRoom.bossDefeated = true;
      this.currentRoom.cleared = true;
      this.currentRoom.doorsLocked = false;
      this.updateDoorVisuals();
      SoundSystem.playBossDead();
      SoundSystem.stopBossEvilLaughLoop();
      SoundSystem.setMusicTrack(this.getNormalMusicTrack());
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

    if (this.isTutorial && this.currentRoom.tutorialExitDoor) {
      settingsSystem.markTutorialCompleted();
      this.ui.showToast(
        this.tutorialReturnToMenu
          ? 'Tutorial Complete! Enter East Door for Menu!'
          : 'Tutorial Complete! Enter East Door for Level 1!',
        '#ffe066'
      );
    }

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

    // 1. Loot / Chests
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
          const itemId = l.itemId ?? rollRandomItemId(rng);
          this.spawnRoomLoot(`ch_itm_${Date.now()}`, 'item', l.sprite.x, l.sprite.y + 14, itemId);
          if (l.bonusItemId) {
            this.spawnRoomLoot(`ch_itm2_${Date.now()}`, 'item', l.sprite.x + 14, l.sprite.y + 10, l.bonusItemId);
          }
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
    if (this.specialObjs.merchant && Phaser.Math.Distance.Between(px, py, this.specialObjs.merchant.x, this.specialObjs.merchant.y) < 34 && this.currentRoom.shopStock) {
      this.openMerchantShop();
      return;
    }

    // 4. Healing Shrine
    if (this.specialObjs.shrine && !this.currentRoom.healingUsed && Phaser.Math.Distance.Between(px, py, this.specialObjs.shrine.x, this.specialObjs.shrine.y) < 32) {
      const shrineX = this.specialObjs.shrine.x;
      const shrineY = this.specialObjs.shrine.y;
      this.currentRoom.healingUsed = true;
      this.specialObjs.shrine.setAlpha(0.45);
      const heal = this.floor.modifier === 'lunar_bloom' ? 6 : 4;
      this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + heal);
      this.runFlags.healedAtAll = true;
      SoundSystem.playHeal();
      this.spawnParticles(shrineX, shrineY, 0xff5d8f, 10);

      if (localCoopSession.active) {
        const downedLocals = this.localPlayers
          .filter((lp) => lp.state.downed)
          .sort((a, b) => a.state.downedTimerMs - b.state.downedTimerMs);
        if (downedLocals.length > 0) {
          const longestDowned = downedLocals[0];
          this.runFlags.revivedAnyone = true;
          const halfHp = Math.max(1, Math.floor(longestDowned.state.maxHp / 2));
          longestDowned.state.downed = false;
          longestDowned.state.hp = Math.min(longestDowned.state.maxHp, halfHp);
          longestDowned.invulnMs = 1500;
          longestDowned.state.gx = this.currentRoom.gx;
          longestDowned.state.gy = this.currentRoom.gy;
          longestDowned.state.x = shrineX;
          longestDowned.state.y = shrineY + 12;
          longestDowned.sprite.setPosition(shrineX, shrineY + 12).setFrame(0).setDepth(10).setVisible(true);
          longestDowned.nameTag.setPosition(shrineX, shrineY).setVisible(true);
          this.spawnParticles(longestDowned.sprite.x, longestDowned.sprite.y, 0x66ffd9, 10);
          this.ui.showToast(`Shrine restored +${heal} HP & revived ${longestDowned.state.name}!`, '#66ffd9');
          return;
        }
      } else if (net.mode !== 'solo') {
        const downedAllies = Array.from(this.remotePlayers.values())
          .filter((p) => p.downed)
          .sort((a, b) => a.downedTimerMs - b.downedTimerMs);
        if (downedAllies.length > 0) {
          const longestDowned = downedAllies[0];
          this.runFlags.revivedAnyone = true;
          const halfHp = Math.max(1, Math.floor(longestDowned.maxHp / 2));
          net.broadcastInteract({
            peerId: this.playerState.id,
            gx: longestDowned.gx,
            gy: longestDowned.gy,
            kind: 'revive',
            targetId: longestDowned.id,
            amount: halfHp,
            itemId: 'revive_totem',
          });
          if (longestDowned.gx === this.currentRoom.gx && longestDowned.gy === this.currentRoom.gy) {
            this.playRipOutAnimationForRemote(longestDowned.id, 0x66ffd9);
          }
          this.spawnParticles(88, 84, 0x66ffd9, 10);
          this.ui.showToast(`Shrine restored +${heal} HP & revived ${longestDowned.name}!`, '#66ffd9');
          return;
        }
      }

      this.ui.showToast(`Shrine restored +${heal} HP!`, '#66ffd9');
      return;
    }

    // 5. Event Altar
    if (this.specialObjs.altar && !this.currentRoom.eventUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      this.triggerEventAltar();
      return;
    }

    // 6. Exit Portal
    if (
      this.specialObjs.portal &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.portal.x, this.specialObjs.portal.y) < 32
    ) {
      this.playerState.inExitReady = true;
      this.tryAdvanceLevel();
      return;
    }

    // 6a. Level 7 Boss Room Pillars (one-time revive totem / solo 2-heart heal)
    if (this.currentRoom.pillars && this.pillarObjs.length > 0) {
      for (const pObj of this.pillarObjs) {
        const model = this.currentRoom.pillars[pObj.idx];
        if (!model || model.used) continue;
        if (Phaser.Math.Distance.Between(px, py, pObj.x, pObj.y) < 32) {
          if (localCoopSession.active) {
            const downedLocals = this.localPlayers
              .filter((lp) => lp.state.downed)
              .sort((a, b) => a.state.downedTimerMs - b.state.downedTimerMs);
            if (downedLocals.length === 0) {
              this.ui.showToast('No downed allies to revive!', '#ffe066');
              return;
            }
            const longestDowned = downedLocals[0];
            model.used = true;
            this.drawPillarVisual(pObj.gfx, pObj.tx, pObj.ty, true);
            longestDowned.state.downed = false;
            longestDowned.state.hp = Math.max(4, Math.floor(longestDowned.state.maxHp / 2));
            longestDowned.invulnMs = 1500;
            longestDowned.state.gx = this.currentRoom.gx;
            longestDowned.state.gy = this.currentRoom.gy;
            longestDowned.state.x = pObj.x;
            longestDowned.state.y = pObj.y + 12;
            longestDowned.sprite.setPosition(pObj.x, pObj.y + 12).setFrame(0).setDepth(10).setVisible(true);
            longestDowned.nameTag.setPosition(pObj.x, pObj.y).setVisible(true);
            this.runFlags.revivedAnyone = true;
            SoundSystem.playHeal();
            this.spawnParticles(pObj.x, pObj.y, 0xffe066, 12);
            this.spawnParticles(pObj.x, pObj.y, 0x94a3b8, 8);
            this.ui.showToast(`Pillar revived ${longestDowned.state.name}!`, '#ffe066');
          } else if (net.mode === 'solo') {
            if (this.playerState.hp >= this.playerState.maxHp) {
              this.ui.showToast('Already at full HP!', '#ffe066');
              return;
            }
            model.used = true;
            this.drawPillarVisual(pObj.gfx, pObj.tx, pObj.ty, true);
            this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + 4);
            SoundSystem.playHeal();
            this.spawnParticles(pObj.x, pObj.y, 0x66ffd9, 10);
            this.spawnParticles(pObj.x, pObj.y, 0x94a3b8, 8);
            this.ui.showToast('Pillar restored 2 Hearts!', '#66ffd9');
          } else {
            const downedAllies = Array.from(this.remotePlayers.values())
              .filter((p) => p.downed)
              .sort((a, b) => a.downedTimerMs - b.downedTimerMs);
            if (downedAllies.length === 0) {
              this.ui.showToast('No downed allies to revive!', '#ffe066');
              return;
            }
            const longestDowned = downedAllies[0];
            model.used = true;
            this.drawPillarVisual(pObj.gfx, pObj.tx, pObj.ty, true);
            net.broadcastInteract({
              peerId: this.playerState.id,
              gx: this.currentRoom.gx,
              gy: this.currentRoom.gy,
              kind: 'pillar_use',
              uses: pObj.idx,
            });
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
            this.spawnParticles(pObj.x, pObj.y, 0xffe066, 12);
            this.spawnParticles(pObj.x, pObj.y, 0x94a3b8, 8);
            this.ui.showToast(`Pillar revived ${longestDowned.name}!`, '#ffe066');
          }
          return;
        }
      }
    }

    // 6b. Mirror Rotation (Mirror/Beam Puzzle)
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.currentRoom.puzzleBeam
    ) {
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
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
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

    // 6d. Lights-Out Rune Grid
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.currentRoom.puzzleLights
    ) {
      for (const lVis of this.specialObjs.lights) {
        if (Phaser.Math.Distance.Between(px, py, lVis.x, lVis.y) < 16) {
          for (const cell of this.currentRoom.puzzleLights) {
            if (Math.abs(cell.gx - lVis.gx) + Math.abs(cell.gy - lVis.gy) <= 1) {
              cell.lit = !cell.lit;
              const vis = this.specialObjs.lights.find((v) => v.id === cell.id);
              vis?.sprite.setTexture(cell.lit ? 'obj_plate_lit' : 'obj_plate');
            }
          }
          SoundSystem.playPickup();
          if (this.currentRoom.puzzleLights.every((c) => c.lit)) {
            this.solvePuzzle('Runes aligned! Secret unlocked!');
          }
          return;
        }
      }
    }

    // 6e. Arcane Memory (Simon) Runes
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.currentRoom.puzzleSimon &&
      !this.simonPlaying
    ) {
      const simon = this.currentRoom.puzzleSimon;
      if (
        this.specialObjs.simonCenter &&
        Phaser.Math.Distance.Between(px, py, this.specialObjs.simonCenter.x, this.specialObjs.simonCenter.y) < 20
      ) {
        this.playSimonSequence();
        return;
      }
      for (const rVis of this.specialObjs.simonRunes) {
        if (Phaser.Math.Distance.Between(px, py, rVis.x, rVis.y) < 20) {
          rVis.sprite.setTexture('obj_plate_lit');
          this.time.delayedCall(220, () => {
            if (rVis.sprite.active) rVis.sprite.setTexture('obj_plate');
          });
          if (simon.sequence[simon.progress] === rVis.idx) {
            simon.progress++;
            SoundSystem.playPickup();
            this.spawnParticles(rVis.x, rVis.y, rVis.color, 6);
            if (simon.progress >= simon.sequence.length) {
              this.solvePuzzle('Arcane echo mastered!');
            } else {
              this.ui.showToast(`Echo ${simon.progress}/${simon.sequence.length}`, '#66ffd9');
            }
          } else {
            simon.progress = 0;
            SoundSystem.playHit();
            this.ui.showToast(`Wrong rune! Center [${getControlActionText('interact')}] to replay`, '#ff5d8f');
          }
          return;
        }
      }
    }

    // 7. Wandering Eye secret wall break when standing near a cracked wall
    const eyeSlot = hasArtifact(this.playerState.inventory, 'wandering_eye');
    if (eyeSlot !== -1 && this.isNearClosedSecretWall(px, py)) {
      this.useWanderingEyeWallBreak(eyeSlot);
      return;
    }

    // 8. Fallback: if no world object is in range and active slot is a consumable, use it with E
    const activeItem = this.playerState.inventory[this.playerState.activeSlot];
    if (activeItem && activeItem.category === 'consumable') {
      this.useConsumable(this.playerState.activeSlot);
    }
  }

  private openMerchantShop(buyerOverride?: LocalPlayerActor | null): void {
    const buyerActor = buyerOverride !== undefined ? buyerOverride : this.activeLocalActor;
    const stock = this.currentRoom.shopStock!;
    const buyerShards = buyerActor ? buyerActor.state.shards : this.playerState.shards;
    this.ui.openShop(stock, buyerShards, (idx) => {
      const executePurchase = () => {
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
        SoundSystem.playMerchantPurchase();
        this.runFlags.boughtAnything = true;
        this.ui.showToast(`Bought ${newItem.name}!`, '#66ffd9');
        if (this.isTutorial && this.currentRoom.isTutorialRoom && entry.itemId === 'starstring_bow') {
          this.currentRoom.doorsLocked = false;
          this.currentRoom.cleared = true;
          this.updateDoorVisuals();
          SoundSystem.playUnlock();
          this.ui.showToast('Bought Starstring Bow! Head East!', '#66ffd9');
        }
        this.openMerchantShop(buyerActor);
      };

      if (buyerActor) {
        this.withLocalPlayer(buyerActor, executePurchase);
      } else {
        executePurchase();
      }
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
    const usePadAim = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
      : inputSystem.controlType === 'gamepad';
    const angle =
      isMobileMode() || usePadAim
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

  private tryAdvanceLevel(forceAdminSkip = false): void {
    if (this.transitioningLevel) return;
    if (net.mode === 'client' && !forceAdminSkip) {
      this.ui.showToast('Waiting for host at portal...', '#66ffd9');
      return;
    }
    if (net.mode === 'host' && !forceAdminSkip) {
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

    if (this.levelIndex >= 6) {
      const elapsedMs = Math.max(1, Date.now() - this.runStartMs);
      void steamSystem.unlockAchievement('ACH_EVERHEART_RESTORED');
      if (elapsedMs < 600_000) void steamSystem.unlockAchievement('ACH_SPEEDRUNNER');
      if (!this.runFlags.boughtAnything) void steamSystem.unlockAchievement('ACH_FRUGAL');
      if (!this.runFlags.hurtAnyEnemy) void steamSystem.unlockAchievement('ACH_PACIFIST');
      if (!this.runFlags.healedAtAll) void steamSystem.unlockAchievement('ACH_NO_HEAL');

      if (net.mode === 'solo' && !localCoopSession.active) {
        void steamSystem.unlockAchievement('ACH_SOLO_CHAMPION');
        if (!this.usedCheatsInRun) {
          void steamSystem.submitSoloClearTime(elapsedMs);
        }
      } else {
        void steamSystem.unlockAchievement('ACH_COOP_CHAMPION');
        if (!this.usedCheatsInRun) {
          void steamSystem.submitCoopClearTime(elapsedMs);
        }
        if (!this.runFlags.revivedAnyone) void steamSystem.unlockAchievement('ACH_COLD_HEARTED');
        void steamSystem.updateLobbyState('finished', false);
      }
      if (net.mode === 'host') {
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'game_over',
          itemId: 'credits',
        });
      }
      SoundSystem.stopBossEvilLaughLoop();
      this.scene.stop('UIScene');
      this.scene.start('CreditsScene');
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
      carryLocalPlayers: localCoopSession.active ? this.localPlayers.map((lp) => lp.state) : undefined,
      carrySkeletons: this.getCarriedSkeletons(),
      carryRunStartMs: this.runStartMs,
      carryRunFlags: this.runFlags,
      carryUsedCheats: this.usedCheatsInRun,
    });
  }

  private withLocalPlayer<T>(lp: LocalPlayerActor, fn: () => T): T {
    const prevActor = this.activeLocalActor;
    const prevState = this.playerState;
    const prevSprite = this.playerSprite;
    const prevWard = this.wardRing;
    const prevReticle = this.aimReticle;
    const prevAtk = this.attackCooldownMs;
    const prevInvuln = this.invulnMs;
    const prevDodge = this.dodgeMs;
    const prevDodgeVx = this.dodgeVx;
    const prevDodgeVy = this.dodgeVy;
    const prevPin = this.spikePinnedMs;
    const prevStam = this.staminaRegenMs;
    const prevStat = this.statusTickMs;
    const prevBurn = this.burnFxMs;
    const prevFlash = this.playerHitFlashMs;
    const prevSlow = this.playerSlowTinted;
    const prevWindMs = this.playerWindSlowMs;
    const prevWindTinted = this.playerWindSlowTinted;
    const prevRespawn = this.respawnAnimMs;
    const prevBeamTick = this.beamDamageTickMs;
    const prevFlameTick = this.flameDamageTickMs;
    const prevCometActive = this.cometTrailActiveMs;
    const prevCometAccum = this.cometTrailAccumMs;

    this.activeLocalActor = lp;
    this.playerState = lp.state;
    this.playerSprite = lp.sprite;
    this.wardRing = lp.wardRing;
    this.aimReticle = lp.aimReticle;
    this.attackCooldownMs = lp.attackCooldownMs;
    this.invulnMs = lp.invulnMs;
    this.dodgeMs = lp.dodgeMs;
    this.dodgeVx = lp.dodgeVx;
    this.dodgeVy = lp.dodgeVy;
    this.spikePinnedMs = lp.spikePinnedMs;
    this.staminaRegenMs = lp.staminaRegenMs;
    this.statusTickMs = lp.statusTickMs;
    this.burnFxMs = lp.burnFxMs;
    this.playerHitFlashMs = lp.hitFlashMs;
    this.playerSlowTinted = lp.slowTinted;
    this.playerWindSlowMs = lp.windSlowMs;
    this.playerWindSlowTinted = lp.windSlowTinted;
    this.respawnAnimMs = lp.respawnAnimMs;
    this.beamDamageTickMs = lp.beamDamageTickMs;
    this.flameDamageTickMs = lp.flameDamageTickMs;
    this.cometTrailActiveMs = lp.cometTrailActiveMs;
    this.cometTrailAccumMs = lp.cometTrailAccumMs;

    try {
      return fn();
    } finally {
      lp.attackCooldownMs = this.attackCooldownMs;
      lp.invulnMs = this.invulnMs;
      lp.dodgeMs = this.dodgeMs;
      lp.dodgeVx = this.dodgeVx;
      lp.dodgeVy = this.dodgeVy;
      lp.spikePinnedMs = this.spikePinnedMs;
      lp.staminaRegenMs = this.staminaRegenMs;
      lp.statusTickMs = this.statusTickMs;
      lp.burnFxMs = this.burnFxMs;
      lp.hitFlashMs = this.playerHitFlashMs;
      lp.slowTinted = this.playerSlowTinted;
      lp.windSlowMs = this.playerWindSlowMs;
      lp.windSlowTinted = this.playerWindSlowTinted;
      lp.respawnAnimMs = this.respawnAnimMs;
      lp.beamDamageTickMs = this.beamDamageTickMs;
      lp.flameDamageTickMs = this.flameDamageTickMs;
      lp.cometTrailActiveMs = this.cometTrailActiveMs;
      lp.cometTrailAccumMs = this.cometTrailAccumMs;

      this.activeLocalActor = prevActor;
      this.playerState = prevState;
      this.playerSprite = prevSprite;
      this.wardRing = prevWard;
      this.aimReticle = prevReticle;
      this.attackCooldownMs = prevAtk;
      this.invulnMs = prevInvuln;
      this.dodgeMs = prevDodge;
      this.dodgeVx = prevDodgeVx;
      this.dodgeVy = prevDodgeVy;
      this.spikePinnedMs = prevPin;
      this.staminaRegenMs = prevStam;
      this.statusTickMs = prevStat;
      this.burnFxMs = prevBurn;
      this.playerHitFlashMs = prevFlash;
      this.playerSlowTinted = prevSlow;
      this.playerWindSlowMs = prevWindMs;
      this.playerWindSlowTinted = prevWindTinted;
      this.respawnAnimMs = prevRespawn;
      this.beamDamageTickMs = prevBeamTick;
      this.flameDamageTickMs = prevFlameTick;
      this.cometTrailActiveMs = prevCometActive;
      this.cometTrailAccumMs = prevCometAccum;
    }
  }

  private getNearestAliveLocalPlayer(x: number, y: number): LocalPlayerActor | null {
    let best: LocalPlayerActor | null = null;
    let bestD = Infinity;
    for (const lp of this.localPlayers) {
      if (lp.state.downed || !lp.sprite.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, lp.sprite.x, lp.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = lp;
      }
    }
    return best;
  }

  private getCarriedSkeletons(): CarriedSkeletonState[] {
    return this.summonedSkeletons
      .filter((s) => s.sprite.active && s.hp > 0)
      .map((s) => ({
        uid: s.uid,
        staffInstanceId: s.staffInstanceId,
        ownerId: s.ownerId,
        hp: s.hp,
        maxHp: s.maxHp,
        formationIndex: s.formationIndex,
      }));
  }

  private damagePlayer(rawDmg: number): void {
    if (this.playerState.name === 'ADMIN' || net.localName === 'ADMIN') return;
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
    this.playerHitFlashMs = 120;
    SoundSystem.playPlayerHurt();
    this.cameras.main.shake(130, 0.015);
    this.playerSprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);

    if (this.playerState.hp <= 0) {
      this.onPlayerZeroHp();
    }
  }

  private dropAllHeldItems(): void {
    const offsets = [
      { dx: -14, dy: 6 },
      { dx: 14, dy: 6 },
      { dx: 0, dy: -12 },
    ];
    let droppedCount = 0;
    for (let i = 0; i < this.playerState.inventory.length; i++) {
      const item = this.playerState.inventory[i];
      if (!item) continue;
      this.playerState.inventory[i] = null;
      const offset = offsets[droppedCount % offsets.length];
      const uid = `drop_${this.playerState.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 9999)}`;
      this.spawnRoomLoot(
        uid,
        'item',
        this.playerSprite.x + offset.dx,
        this.playerSprite.y + offset.dy,
        item.id,
        undefined,
        item.uses,
        true
      );
      droppedCount++;
    }
  }

  private onPlayerZeroHp(): void {
    if (this.isTutorial) {
      this.playerState.hp = this.playerState.maxHp;
      this.playerState.stamina = this.playerState.maxStamina;
      this.playerState.statusEffects = this.playerState.statusEffects.filter(
        (se) => se.isPositive
      );
      this.invulnMs = 1800;
      const safeX = this.currentRoom.connections.west ? 32 : 88;
      const safeY = this.currentRoom.connections.south && !this.currentRoom.connections.west ? 142 : 88;
      this.playerState.x = safeX;
      this.playerState.y = safeY;
      this.playerSprite.setPosition(safeX, safeY).setVelocity(0, 0);
      SoundSystem.playHeal();
      this.spawnParticles(safeX, safeY, 0x66ffd9, 10);
      this.ui.showToast('Respawned in room! Full HP restored.', '#66ffd9');
      return;
    }

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

    if (!this.usedCheatsInRun) {
      steamSystem.recordDeath();
    }

    if (localCoopSession.active) {
      this.playerState.downed = true;
      this.playerState.downedTimerMs = 20000;
      this.playerSprite.setFrame(5).setDepth(3);
      const anyAlive = this.localPlayers.some((lp) => !lp.state.downed);
      if (!anyAlive) {
        this.triggerGameOver(false);
      } else {
        this.dropAllHeldItems();
        this.ui.showToast(`${this.playerState.name} is down!`, '#ff5d8f');
      }
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
      this.playerSprite.setFrame(5).setDepth(3);
      const anyAlive = Array.from(this.remotePlayers.values()).some((p) => !p.downed);
      if (!anyAlive) {
        net.broadcastPlayerState(this.playerState);
        net.broadcastInteract({
          peerId: this.playerState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'game_over',
        });
        this.triggerGameOver(false);
        return;
      }
      this.dropAllHeldItems();
      net.broadcastPlayerState(this.playerState);
      this.ui.showToast('You are downed! Wait for a revive!', '#ff5d8f');
    }
  }

  private getNormalMusicTrack(): 'normal' | 'darkcave' {
    return this.levelIndex === 6 ? 'darkcave' : 'normal';
  }

  private triggerGameOver(victory: boolean): void {
    if (this.transitioningLevel) return;
    this.transitioningLevel = true;
    SoundSystem.stopBossEvilLaughLoop();
    this.scene.stop('UIScene');
    this.scene.start('GameOverScene', {
      victory,
      levelReached: victory ? 7 : this.levelIndex + 1,
      shardsCollected: this.totalShardsCollected,
      enemiesDefeated: this.totalEnemiesDefeated,
    });
  }

  private reviveLongestDownedOnBossDefeat(): void {
    if (localCoopSession.active) {
      const downedLocals = this.localPlayers
        .filter((lp) => lp.state.downed)
        .sort((a, b) => a.state.downedTimerMs - b.state.downedTimerMs);
      if (downedLocals.length === 0) return;
      const longestDowned = downedLocals[0];
      const halfHp = Math.max(1, Math.floor(longestDowned.state.maxHp / 2));
      const aliveAnchor = this.localPlayers.find((lp) => !lp.state.downed);
      const rx = aliveAnchor ? aliveAnchor.sprite.x : 88;
      const ry = aliveAnchor ? aliveAnchor.sprite.y : 88;
      longestDowned.state.downed = false;
      longestDowned.state.hp = Math.min(longestDowned.state.maxHp, halfHp);
      longestDowned.invulnMs = 1500;
      longestDowned.state.gx = this.currentRoom.gx;
      longestDowned.state.gy = this.currentRoom.gy;
      longestDowned.state.x = rx;
      longestDowned.state.y = ry;
      longestDowned.sprite.setPosition(rx, ry).setFrame(0).setDepth(10).setVisible(true);
      longestDowned.nameTag.setPosition(rx, ry - 12).setVisible(true);
      SoundSystem.playHeal();
      this.spawnParticles(rx, ry, 0x66ffd9, 12);
      this.ui.showToast(`${longestDowned.state.name} was ripped from the earth!`, '#66ffd9');
      return;
    }

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
    this.spawnOrResetPlayerPet(this.playerState.x, this.playerState.y);
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

  private spawnSlimeDropParticle(x: number, y: number): void {
    const sx = x + Phaser.Math.FloatBetween(-5, 5);
    const sy = y + Phaser.Math.FloatBetween(-2, 4);
    const colors = [0x55ff88, 0x80ed99, 0x38b000];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const drop = this.add.circle(sx, sy, Phaser.Math.FloatBetween(1.1, 1.8), color, 0.9).setDepth(13);
    this.tweens.add({
      targets: drop,
      y: sy + Phaser.Math.FloatBetween(5, 9),
      scale: 0.4,
      alpha: 0,
      duration: Phaser.Math.Between(260, 380),
      ease: 'Quad.easeIn',
      onComplete: () => drop.destroy(),
    });
  }

  private spawnFireParticles(x: number, y: number, count = 2): void {
    const actualCount = settingsSystem.current.particles === 'reduced' ? Math.max(1, Math.floor(count / 2)) : count;
    const fireColors = [0xff4500, 0xff6b35, 0xff9f1c, 0xffe066];
    for (let i = 0; i < actualCount; i++) {
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
    const actualCount = settingsSystem.current.particles === 'reduced' ? Math.max(1, Math.floor(count / 2)) : count;
    for (let i = 0; i < actualCount; i++) {
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

    // Gamepad pause / overlay close
    const anyPadPause = localCoopSession.active
      ? this.localPlayers.some((lp) => lp.inputType === 'gamepad' && inputSystem.consumePadAction(lp.padIndex, 'pause'))
      : inputSystem.consumeAction('pause');
    if (anyPadPause && !this.ui.isChatOpen()) {
      if (this.ui.isOverlayOpen()) {
        this.ui.closeShop();
        this.ui.closeMap();
        this.paused = this.ui.togglePause(false);
      } else {
        this.paused = this.ui.togglePause();
      }
      return;
    }

    if (this.paused || this.transitioningLevel) return;

    if (
      net.mode !== 'solo' &&
      !localCoopSession.active &&
      !this.ui.isOverlayOpen() &&
      !this.ui.isChatOpen() &&
      inputSystem.consumeChatButton()
    ) {
      this.ui.openChatGamepad();
    }

    const anyPadMap = localCoopSession.active
      ? this.localPlayers.some((lp) => lp.inputType === 'gamepad' && inputSystem.consumePadAction(lp.padIndex, 'map'))
      : inputSystem.consumeAction('map');
    if (anyPadMap && !this.ui.isChatOpen()) {
      this.ui.toggleMap();
    }

    this.doorCooldownMs = Math.max(0, this.doorCooldownMs - delta);
    this.plateCooldownMs = Math.max(0, this.plateCooldownMs - delta);
    this.blockPushCooldownMs = Math.max(0, this.blockPushCooldownMs - delta);
    this.giantStompCooldownMs = Math.max(0, this.giantStompCooldownMs - delta);

    if (localCoopSession.active && this.localPlayers.length > 0) {
      this.beamGfx.clear();
      let anyLaserActive = this.witchLaserState === 'sweeping';
      let anyFlameActive = false;
      for (const lp of this.localPlayers) {
        this.withLocalPlayer(lp, () => {
          if (!this.ui.isOverlayOpen() && !this.ui.wasShopClosedRecently() && !this.playerState.downed && lp.inputType === 'gamepad') {
            if (inputSystem.consumePadAction(lp.padIndex, 'prevSlot')) {
              this.playerState.activeSlot = (this.playerState.activeSlot + 2) % 3;
            }
            if (inputSystem.consumePadAction(lp.padIndex, 'nextSlot')) {
              this.playerState.activeSlot = (this.playerState.activeSlot + 1) % 3;
            }
            if (inputSystem.consumePadAction(lp.padIndex, 'drop')) {
              this.dropActiveItem();
            }
            if (inputSystem.consumePadAction(lp.padIndex, 'interact')) {
              this.handleInteract();
            }
            if (inputSystem.consumePadAction(lp.padIndex, 'secondary')) {
              this.handleSecondaryAction();
            }
          }
          this.updateSinglePlayerTick(time, delta);
          if (this.beamDamageTickMs > 0) anyLaserActive = true;
          if (this.flameDamageTickMs > 0) anyFlameActive = true;
          lp.nameTag.setPosition(Math.round(this.playerSprite.x), Math.round(this.playerSprite.y - 12));
        });
      }
      SoundSystem.setLaserActive(anyLaserActive);
      SoundSystem.setFlamethrowerActive(anyFlameActive);

      // Scrolling wide/tall rooms (Level 7 Hallway & Test Room): center camera on average position of all players & prevent going off-camera
      const wTiles = this.currentRoom.widthTiles ?? 11;
      const hTiles = this.currentRoom.heightTiles ?? 11;
      if (!(this.currentRoom.type === 'boss' && this.levelIndex === 6) && (wTiles > 11 || hTiles > 11)) {
        const alive = this.localPlayers.filter((lp) => !lp.state.downed);
        const group = alive.length > 0 ? alive : this.localPlayers;
        const avgX = group.reduce((acc, lp) => acc + lp.sprite.x, 0) / group.length;
        const avgY = group.reduce((acc, lp) => acc + lp.sprite.y, 0) / group.length;
        const cam = this.cameras.main;
        const halfViewW = cam.width / cam.zoom / 2;
        const halfViewH = cam.height / cam.zoom / 2;
        const minCamX = Math.min(this.roomWidthPx / 2, halfViewW - 12);
        const maxCamX = Math.max(this.roomWidthPx / 2, this.roomWidthPx - halfViewW + 12);
        const camX = wTiles > 11 ? Phaser.Math.Clamp(avgX, minCamX, maxCamX) : this.roomWidthPx / 2;
        const minCamY = Math.min(this.roomHeightPx / 2, halfViewH - 12);
        const maxCamY = Math.max(this.roomHeightPx / 2, this.roomHeightPx - halfViewH + 12);
        const camY = hTiles > 11 ? Phaser.Math.Clamp(avgY, minCamY, maxCamY) : this.roomHeightPx / 2;
        cam.centerOn(camX, camY);

        const clampMinX = Math.max(16, camX - halfViewW + 14);
        const clampMaxX = Math.min(this.roomWidthPx - 16, camX + halfViewW - 14);
        const clampMinY = Math.max(16, camY - halfViewH + 14);
        const clampMaxY = Math.min(this.roomHeightPx - 16, camY + halfViewH - 14);
        for (const lp of this.localPlayers) {
          if (lp.state.downed && (lp.state.gx !== this.currentRoom.gx || lp.state.gy !== this.currentRoom.gy)) continue;
          if (wTiles > 11) {
            if (lp.sprite.x < clampMinX) {
              lp.sprite.x = clampMinX;
              lp.state.x = clampMinX;
            } else if (lp.sprite.x > clampMaxX) {
              lp.sprite.x = clampMaxX;
              lp.state.x = clampMaxX;
            }
          }
          if (hTiles > 11) {
            if (lp.sprite.y < clampMinY) {
              lp.sprite.y = clampMinY;
              lp.state.y = clampMinY;
            } else if (lp.sprite.y > clampMaxY) {
              lp.sprite.y = clampMaxY;
              lp.state.y = clampMaxY;
            }
          }
        }
      }
    } else {
      if (!this.ui.isOverlayOpen() && !this.ui.wasShopClosedRecently() && !this.ui.isChatOpen() && !this.playerState.downed) {
        if (inputSystem.consumeAction('prevSlot')) {
          this.playerState.activeSlot = (this.playerState.activeSlot + 2) % 3;
        }
        if (inputSystem.consumeAction('nextSlot')) {
          this.playerState.activeSlot = (this.playerState.activeSlot + 1) % 3;
        }
        if (inputSystem.consumeAction('drop')) {
          this.dropActiveItem();
        }
        if (inputSystem.consumeAction('interact')) {
          this.handleInteract();
        }
        if (inputSystem.consumeAction('secondary')) {
          this.handleSecondaryAction();
        }
      }
      this.updateSinglePlayerTick(time, delta);
    }

    this.updateLevel7Events(delta);
    this.updateTestRoomDungeon(delta);
    this.updatePrismBeams(delta);
    this.updateSummonedSkeletons(time, delta);
    this.updatePets(time, delta);
    this.updateEnemies(time, delta);
    this.updateProjectiles(delta);
    this.updateSlimeSplatters(delta);
    this.updateCometTrail(delta);
    this.updateHazardsAndLoot(delta);
    this.updatePuzzlePlates();
    this.updatePuzzleBlocks();
    this.checkDoorTransitions();
    this.updateFireflies(delta);
    this.updateFloorWeather(delta);
    this.syncMultiplayer(delta);
    this.pushUIUpdate();
  }

  private updateSinglePlayerTick(time: number, delta: number): void {
    const hpBeforeTick = this.playerState.hp;
    const wasDownedBeforeTick = this.playerState.downed;
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.invulnMs = Math.max(0, this.invulnMs - delta);
    this.respawnAnimMs = Math.max(0, this.respawnAnimMs - delta);

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
    this.giantStepShakeCooldownMs = Math.max(0, this.giantStepShakeCooldownMs - delta);
    if (
      isGiant &&
      !this.playerState.downed &&
      this.dodgeMs <= 0 &&
      (Math.abs(this.playerState.vx) > 5 || Math.abs(this.playerState.vy) > 5) &&
      this.giantStepShakeCooldownMs <= 0
    ) {
      this.cameras.main.shake(65, 0.0022);
      this.giantStepShakeCooldownMs = 240;
    }
    if (isGiant && this.giantStompCooldownMs <= 0 && !this.playerState.downed) {
      for (const e of [...this.activeEnemies]) {
        if (!e.sprite.active) continue;
        const d = Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
        if (d < (e.isBoss ? 24 : 18)) {
          const stompAngle = Phaser.Math.Angle.Between(this.playerSprite.x, this.playerSprite.y, e.sprite.x, e.sprite.y);
          SoundSystem.playStomp();
          this.damageEnemy(e, e.isBoss ? 2 : 4, stompAngle);
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xff9f1c, 8);
          this.cameras.main.shake(90, 0.008);
          this.giantStompCooldownMs = 380;
          break;
        }
      }
    }
    if (isGiant && !this.playerState.downed) {
      let smashedAny = false;
      for (const c of [...this.crateGroup.getChildren()]) {
        const cs = c as Phaser.Physics.Arcade.Sprite;
        if (!cs.active) continue;
        if (Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, cs.x, cs.y) < 20) {
          this.smashCrate(cs);
          this.spawnParticles(cs.x, cs.y, 0xff9f1c, 6);
          smashedAny = true;
        }
      }
      if (smashedAny) {
        SoundSystem.playStomp();
        this.cameras.main.shake(70, 0.005);
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
    this.updateBeamWeapon(delta);
    this.updateFlamethrowerWeapon(delta);
    this.updateAuroraHarpHoldFire();

    if (this.playerWindSlowMs > 0) {
      this.playerWindSlowMs = Math.max(0, this.playerWindSlowMs - delta);
    }

    if (this.playerHitFlashMs > 0) {
      this.playerHitFlashMs -= delta;
      if (this.playerHitFlashMs <= 0) {
        this.playerHitFlashMs = 0;
        if (this.playerSprite.active) {
          this.playerSprite.clearTint();
          this.playerSlowTinted = false;
          this.playerWindSlowTinted = false;
        }
      }
    }
    if (this.playerHitFlashMs <= 0 && this.playerSprite.active) {
      const isWindSlowed = !this.playerState.downed && this.playerWindSlowMs > 0;
      const isSlimeSlowed = !this.playerState.downed && StatusEffectManager.has(this.playerState.statusEffects, 'sluggish');
      if (isWindSlowed) {
        if (!this.playerWindSlowTinted || this.playerSprite.tintMode !== Phaser.TintModes.MULTIPLY) {
          this.playerSprite.setTint(0x7dd3fc).setTintMode(Phaser.TintModes.MULTIPLY);
          this.playerWindSlowTinted = true;
          this.playerSlowTinted = false;
        }
      } else if (isSlimeSlowed) {
        if (!this.playerSlowTinted || this.playerWindSlowTinted || this.playerSprite.tintMode !== Phaser.TintModes.MULTIPLY) {
          this.playerSprite.setTint(0x55ff88).setTintMode(Phaser.TintModes.MULTIPLY);
          this.playerSlowTinted = true;
          this.playerWindSlowTinted = false;
        }
      } else if (
        this.playerSlowTinted ||
        this.playerWindSlowTinted ||
        this.playerSprite.tintMode !== Phaser.TintModes.MULTIPLY ||
        this.playerSprite.tintTopLeft !== 0xffffff
      ) {
        this.playerSprite.clearTint();
        this.playerSlowTinted = false;
        this.playerWindSlowTinted = false;
      }
    }
    if (!wasDownedBeforeTick && !this.playerState.downed && this.playerState.hp > hpBeforeTick) {
      this.runFlags.healedAtAll = true;
    }
  }

  private updatePlayerMovement(time: number, delta: number): void {
    if (this.playerState.downed) {
      this.playerSprite.setVelocity(0, 0);
      this.playerState.vx = 0;
      this.playerState.vy = 0;
      this.playerSprite.setFrame(5).setDepth(3);
      this.playerState.downedTimerMs -= delta;
      if (localCoopSession.active) {
        const anyAlive = this.localPlayers.some((lp) => !lp.state.downed);
        if (!anyAlive) {
          this.triggerGameOver(false);
        }
        return;
      }
      const anyAlive = Array.from(this.remotePlayers.values()).some((p) => !p.downed);
      if (!anyAlive) {
        this.triggerGameOver(false);
        return;
      }
      this.updateSpectatorView();
      return;
    }

    if (this.nyarGrabbedMs > 0) {
      this.nyarGrabbedMs = Math.max(0, this.nyarGrabbedMs - delta);
      const boss = this.activeEnemies.find((e) => e.sprite.active && e.defId === 'nyarlathotep');
      if (boss) {
        const tipX = boss.sprite.x + Math.cos(this.nyarArmAngle) * this.nyarArmLength;
        const tipY = boss.sprite.y + Math.sin(this.nyarArmAngle) * this.nyarArmLength;
        this.playerSprite.setPosition(
          Phaser.Math.Clamp(tipX, 22, this.roomWidthPx - 22),
          Phaser.Math.Clamp(tipY, 22, this.roomHeightPx - 22)
        );
      }
      this.playerSprite.setVelocity(0, 0);
      this.playerState.x = this.playerSprite.x;
      this.playerState.y = this.playerSprite.y;
      this.playerState.vx = 0;
      this.playerState.vy = 0;
      return;
    }

    if (this.nyarThrowMs > 0) {
      this.nyarThrowMs = Math.max(0, this.nyarThrowMs - delta);
      this.playerSprite.setVelocity(this.nyarThrowVx, this.nyarThrowVy);
      this.playerState.x = this.playerSprite.x;
      this.playerState.y = this.playerSprite.y;
      this.playerState.vx = this.nyarThrowVx;
      this.playerState.vy = this.nyarThrowVy;
      return;
    }

    if (this.respawnAnimMs > 0 || this.ui?.isChatOpen() || this.ui?.isOverlayOpen()) {
      this.playerSprite.setVelocity(0, 0);
      this.playerState.vx = 0;
      this.playerState.vy = 0;
      this.playerState.dodging = false;
      return;
    }

    let dx = 0;
    let dy = 0;
    let wantDodge = false;

    if (this.activeLocalActor) {
      if (this.activeLocalActor.inputType === 'keyboard') {
        if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
        if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
        if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
        if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;
        wantDodge =
          Phaser.Input.Keyboard.JustDown(this.keys.space) ||
          Phaser.Input.Keyboard.JustDown(this.keys.shift);
      } else {
        const padIdx = this.activeLocalActor.padIndex;
        const padMove = inputSystem.getPadMoveVector(padIdx);
        dx = padMove.x;
        dy = padMove.y;
        const padAim = inputSystem.getPadAimVector(padIdx);
        if (padAim.active) {
          this.playerState.aimAngle = Math.atan2(padAim.y, padAim.x);
        }
        if (!this.ui.isOverlayOpen() && (inputSystem.consumePadAction(padIdx, 'attack') || inputSystem.isPadActionHeld(padIdx, 'attack'))) {
          this.handlePrimaryAttack();
        }
        wantDodge = !this.ui.wasShopClosedRecently() && inputSystem.consumePadAction(padIdx, 'dodge');
      }
    } else {
      if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;

      const padMove = inputSystem.getMoveVector();
      if (Math.abs(padMove.x) > 0 || Math.abs(padMove.y) > 0) {
        dx = padMove.x;
        dy = padMove.y;
      }

      const padAim = inputSystem.getAimVector();
      if (padAim.active) {
        this.playerState.aimAngle = Math.atan2(padAim.y, padAim.x);
      }

      if (!this.ui.isOverlayOpen() && (inputSystem.consumeAction('attack') || inputSystem.isActionHeld('attack'))) {
        this.handlePrimaryAttack();
      }

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

      wantDodge =
        Phaser.Input.Keyboard.JustDown(this.keys.space) ||
        Phaser.Input.Keyboard.JustDown(this.keys.shift) ||
        (!this.ui.wasShopClosedRecently() && inputSystem.consumeAction('dodge')) ||
        (isMobileMode() && mobileInput.consumeDodge());
    }

    if (dx !== 0 && dy !== 0) {
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }
    }

    // Dodge input (also allows escaping when pinned by a spike trap)

    if (this.spikePinnedMs > 0) {
      if (wantDodge && this.dodgeMs <= 0 && this.playerState.stamina >= 1) {
        this.spikePinnedMs = 0;
      } else {
        this.spikePinnedMs = Math.max(0, this.spikePinnedMs - delta);
        this.playerSprite.setVelocity(0, 0);
        this.playerState.vx = 0;
        this.playerState.vy = 0;
        this.playerState.dodging = false;
        this.playerState.x = this.playerSprite.x;
        this.playerState.y = this.playerSprite.y;
        return;
      }
    }
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
          this.cometTrailActiveMs = 240;
          this.cometTrailAccumMs = 20;
        }
      }
    }

    if (this.dodgeMs > 0) {
      this.dodgeMs -= delta;
      this.playerSprite.setVelocity(this.dodgeVx, this.dodgeVy);
      this.playerSprite.setFrame(4);
      this.playerState.dodging = true;
      if (this.cometTrailActiveMs > 0 && this.playerSprite.active) {
        this.cometTrailActiveMs -= delta;
        this.cometTrailAccumMs += delta;
        while (this.cometTrailAccumMs >= 20) {
          this.cometTrailAccumMs -= 20;
          const cx = this.playerSprite.x + Phaser.Math.FloatBetween(-2, 2);
          const cy = this.playerSprite.y + Phaser.Math.FloatBetween(-2, 2);
          const g = this.add.graphics().setDepth(3);
          g.fillStyle(0xffd275, 0.35);
          g.fillCircle(cx, cy, 2.8);
          g.fillStyle(0xffe066, 0.9);
          g.fillCircle(cx, cy, 1.6);
          g.fillStyle(0xffffff, 0.95);
          g.fillCircle(cx + Phaser.Math.FloatBetween(-1, 1), cy + Phaser.Math.FloatBetween(-1, 1), 0.8);
          this.roomGroup.add(g);
          this.cometTrailNodes.push({ x: cx, y: cy, gfx: g, lifeMs: 1100, hitUids: new Set() });
        }
      }
    } else {
      this.cometTrailActiveMs = 0;
      this.playerState.dodging = false;
      const modMult = this.floor.modifier === 'enchanted_floors' ? 1.15 : 1;
      const windMult = this.playerWindSlowMs > 0 ? 0.5 : 1;
      const spd = 96 * modMult * windMult * StatusEffectManager.getSpeedMultiplier(this.playerState.statusEffects);
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
    if (this.respawnAnimMs <= 0 && !this.playerState.downed) {
      this.playerSprite.setDepth(6 + (this.playerSprite.y + 6) / 1000);
    }
    const body = this.playerSprite.body as Phaser.Physics.Arcade.Body | null;
    this.playerState.vx = body ? body.velocity.x : 0;
    this.playerState.vy = body ? body.velocity.y : 0;

    const hasWard = StatusEffectManager.has(this.playerState.statusEffects, 'starward');
    this.wardRing.setPosition(this.playerSprite.x, this.playerSprite.y).setVisible(hasWard);

    const showReticle = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
      : inputSystem.controlType === 'gamepad';
    if (showReticle && !this.playerState.downed) {
      this.aimReticle
        .setPosition(
          this.playerSprite.x + Math.cos(this.playerState.aimAngle) * 18,
          this.playerSprite.y + Math.sin(this.playerState.aimAngle) * 18
        )
        .setVisible(true);
    } else {
      this.aimReticle.setVisible(false);
    }
  }

  private spawnObsidianAxeSlam(originX: number, originY: number, angle: number, isLocal: boolean): void {
    const ownerSprite = isLocal ? this.playerSprite : null;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const slamX = originX + cos * 24;
    const slamY = originY + sin * 24;

    const axe = this.add
      .image(originX + cos * 8, originY + sin * 8, 'item_obsidian_axe')
      .setOrigin(0.35, 0.75)
      .setScale(1.65)
      .setRotation(angle + Math.PI / 4)
      .setDepth(12);
    this.roomGroup.add(axe);

    // Phase 1: Slam down onto the floor
    this.tweens.add({
      targets: axe,
      x: slamX,
      y: slamY,
      scale: 1.25,
      duration: 110,
      ease: 'Quad.In',
      onComplete: () => {
        if (!axe.active) return;
        this.cameras.main.shake(95, 0.007);
        this.spawnParticles(slamX, slamY, 0xa855f7, 6);

        const impact = this.add.circle(slamX, slamY, 12, 0xa855f7, 0.45).setStrokeStyle(1.5, 0xe9d5ff, 0.9).setDepth(3);
        this.roomGroup.add(impact);
        this.tweens.add({
          targets: impact,
          scale: 1.6,
          alpha: 0,
          duration: 220,
          ease: 'Quad.Out',
          onComplete: () => impact.destroy(),
        });

        const dragTrail = this.add.graphics().setDepth(3);
        this.roomGroup.add(dragTrail);

        // Phase 2: Slowly drag the axe back to the player
        const dragState = { t: 0 };
        this.tweens.add({
          targets: dragState,
          t: 1,
          duration: 370,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            const px = ownerSprite && ownerSprite.active ? ownerSprite.x : originX;
            const py = ownerSprite && ownerSprite.active ? ownerSprite.y : originY;
            const curX = Phaser.Math.Linear(slamX, px + cos * 6, dragState.t);
            const curY = Phaser.Math.Linear(slamY, py + sin * 6, dragState.t);
            if (axe.active) {
              axe.setPosition(curX, curY);
              axe.setAlpha(1 - dragState.t * 0.4);
            }
            if (dragTrail.active) {
              dragTrail.clear();
              dragTrail.lineStyle(2.5, 0x4a4e69, 0.6 * (1 - dragState.t * 0.5));
              dragTrail.lineBetween(slamX, slamY, curX, curY);
              dragTrail.lineStyle(1, 0xa855f7, 0.5 * (1 - dragState.t * 0.5));
              dragTrail.lineBetween(slamX, slamY, curX, curY);
            }
          },
          onComplete: () => {
            if (axe.active) {
              this.tweens.add({
                targets: [axe, dragTrail],
                alpha: 0,
                duration: 90,
                onComplete: () => {
                  axe.destroy();
                  dragTrail.destroy();
                },
              });
            } else {
              dragTrail.destroy();
            }
          },
        });
      },
    });
  }

  private spawnCrescentKatanaSwipe(
    originX: number,
    originY: number,
    angle: number,
    isLocal: boolean,
    textureKey = 'item_crescent_katana',
    trailColor = 0xc084fc,
    coreColor = 0xffffff
  ): void {
    const isScythe = textureKey === 'fx_vine_scythe';
    const isGreatsword = textureKey === 'item_astral_greatsword';
    const scale = isGreatsword ? 2.2 : isScythe ? 1.58 : 1.15;
    const radialOffset = isGreatsword ? 12 : isScythe ? 9 : 6;
    const trailInnerR = isGreatsword ? 42 : isScythe ? 30 : 20;
    const trailOuterR = isGreatsword ? 46 : isScythe ? 33 : 22;
    const rotOffset = isScythe ? Math.PI / 2 : Math.PI / 4;
    const swipeDuration = isGreatsword ? 145 : 105;
    const startA = angle - Math.PI / 8;
    const endA = angle + Math.PI / 8; // 45-degree clockwise arc
    const katana = this.add
      .image(originX, originY, textureKey)
      .setOrigin(isScythe ? 0.38 : 0.25, isScythe ? 0.92 : 0.75)
      .setScale(scale)
      .setRotation(startA + rotOffset)
      .setDepth(12);
    const trailGfx = this.add.graphics().setDepth(11);
    this.roomGroup.add(katana);
    this.roomGroup.add(trailGfx);

    const ownerSprite = isLocal ? this.playerSprite : null;
    const state = { a: startA, alpha: 1 };
    this.tweens.add({
      targets: state,
      a: endA,
      duration: swipeDuration,
      ease: 'Cubic.Out',
      onUpdate: () => {
        const px = ownerSprite && ownerSprite.active ? ownerSprite.x : originX;
        const py = ownerSprite && ownerSprite.active ? ownerSprite.y : originY;
        if (katana.active) {
          katana.setPosition(px + Math.cos(state.a) * radialOffset, py + Math.sin(state.a) * radialOffset);
          katana.setRotation(state.a + rotOffset);
        }
        if (trailGfx.active) {
          trailGfx.clear();
          trailGfx.lineStyle(3.5, trailColor, 0.75);
          trailGfx.beginPath();
          trailGfx.arc(px, py, trailInnerR, startA, state.a, false);
          trailGfx.strokePath();
          trailGfx.lineStyle(1.5, coreColor, 0.9);
          trailGfx.beginPath();
          trailGfx.arc(px, py, trailOuterR, startA, state.a, false);
          trailGfx.strokePath();
        }
      },
      onComplete: () => {
        if (katana.active) {
          this.tweens.add({
            targets: [katana, trailGfx],
            alpha: 0,
            duration: 75,
            onComplete: () => {
              katana.destroy();
              trailGfx.destroy();
            },
          });
        } else {
          trailGfx.destroy();
        }
      },
    });
  }

  private spawnThornWhipAnim(originX: number, originY: number, angle: number, range: number): void {
    const ownerSprite = this.playerSprite;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY = cos;
    const maxLen = range + 12;
    const gfx = this.add.graphics().setDepth(12);
    this.roomGroup.add(gfx);

    const drawWhip = (len: number, waveAmp: number, alpha: number) => {
      if (!gfx.active) return;
      gfx.clear();
      const px0 = ownerSprite.active ? ownerSprite.x : originX;
      const py0 = ownerSprite.active ? ownerSprite.y : originY;
      const segments = 8;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const along = 6 + len * t;
        const wave = Math.sin(t * Math.PI * 2) * waveAmp * (1 - t * 0.25);
        pts.push({
          x: px0 + cos * along + perpX * wave,
          y: py0 + sin * along + perpY * wave,
        });
      }

      gfx.lineStyle(3, 0x15803d, alpha);
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
      gfx.strokePath();

      gfx.lineStyle(1.4, 0x34d399, alpha);
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
      gfx.strokePath();

      // Thorns along the whip & tip
      gfx.fillStyle(0xa7f3d0, alpha);
      for (let i = 2; i < pts.length; i += 2) {
        const side = i % 4 === 0 ? 1 : -1;
        gfx.fillCircle(pts[i].x + perpX * side * 2, pts[i].y + perpY * side * 2, 1.1);
      }
      const tip = pts[pts.length - 1];
      gfx.fillStyle(0x6ee7b7, alpha);
      gfx.fillCircle(tip.x, tip.y, 2.2);
    };

    const whipState = { len: 4, wave: 5, alpha: 1 };
    this.tweens.add({
      targets: whipState,
      len: maxLen,
      wave: 0,
      duration: 85,
      ease: 'Cubic.Out',
      onUpdate: () => drawWhip(whipState.len, whipState.wave, whipState.alpha),
      onComplete: () => {
        if (!gfx.active) return;
        const tipX = (ownerSprite.active ? ownerSprite.x : originX) + cos * maxLen;
        const tipY = (ownerSprite.active ? ownerSprite.y : originY) + sin * maxLen;
        this.spawnParticles(tipX, tipY, 0x34d399, 3);
        this.tweens.add({
          targets: whipState,
          len: 6,
          alpha: 0,
          duration: 125,
          ease: 'Quad.In',
          onUpdate: () => drawWhip(whipState.len, 0, whipState.alpha),
          onComplete: () => gfx.destroy(),
        });
      },
    });
  }

  private spawnEchoSonicWave(originX: number, originY: number, angle: number, isLocal: boolean): void {
    const halfArc = Math.PI / 8; // 45-degree total arc centered on attack angle
    const maxRadius = 88;
    const startAngle = angle - halfArc;
    const endAngle = angle + halfArc;

    for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
      this.time.delayedCall(ringIdx * 90, () => {
        if (!this.scene.isActive('GameScene')) return;
        const gfx = this.add.graphics().setDepth(12);
        this.roomGroup.add(gfx);
        const state = { r: 14, alpha: 0.9 - ringIdx * 0.15 };
        this.tweens.add({
          targets: state,
          r: maxRadius,
          alpha: 0,
          duration: 480,
          ease: 'Cubic.Out',
          onUpdate: () => {
            if (!gfx.active) return;
            gfx.clear();
            gfx.lineStyle(2.5, 0xc084fc, state.alpha);
            gfx.beginPath();
            gfx.arc(originX, originY, state.r, startAngle, endAngle, false);
            gfx.strokePath();
            gfx.lineStyle(1.2, 0xe9d5ff, state.alpha);
            gfx.beginPath();
            gfx.arc(originX, originY, Math.max(4, state.r - 2), startAngle, endAngle, false);
            gfx.strokePath();
          },
          onComplete: () => gfx.destroy(),
        });
      });
    }

    if (isLocal) {
      const minX = this.isTestRoom ? 21 * 16 + 8 : 22;
      const maxX = Math.max(minX, this.roomWidthPx - 22);
      const maxY = Math.max(22, this.roomHeightPx - 22);
      for (const e of this.activeEnemies) {
        if (!e.sprite.active || e.isBoss) continue;
        const dist = Phaser.Math.Distance.Between(originX, originY, e.sprite.x, e.sprite.y);
        if (dist > maxRadius) continue;
        const enemyAngle = Phaser.Math.Angle.Between(originX, originY, e.sprite.x, e.sprite.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(enemyAngle - angle));
        if (diff <= halfArc) {
          const pushAngle = dist < 4 ? angle : enemyAngle;
          e.sprite.x = Phaser.Math.Clamp(e.sprite.x + Math.cos(pushAngle) * 11, minX, maxX);
          e.sprite.y = Phaser.Math.Clamp(e.sprite.y + Math.sin(pushAngle) * 11, 22, maxY);
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xc084fc, 3);
        }
      }
    }
  }

  private spawnCloudbreakerPulse(
    originX: number,
    originY: number,
    angle: number,
    isLocal: boolean,
    alreadyConsumed: boolean
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const perpX = -sin;
    const perpY = cos;
    const stepDist = 16;
    const maxSteps = 9;
    const pulseDmg = 2;
    const hitUids = new Set<string>();
    let consumed = alreadyConsumed;
    let stopped = false;

    const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((w) => w.active);
    this.cameras.main.shake(110, 0.006);
    SoundSystem.playWeaponFloorSlam();

    for (let step = 1; step <= maxSteps; step++) {
      const px = originX + cos * (step * stepDist);
      const py = originY + sin * (step * stepDist);

      if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) break;
      let hitsWall = false;
      for (const wall of walls) {
        if (Math.abs(px - wall.x) < 9 && Math.abs(py - wall.y) < 9) {
          hitsWall = true;
          break;
        }
      }
      if (hitsWall) break;

      this.time.delayedCall((step - 1) * 28, () => {
        if (!this.scene.isActive('GameScene') || stopped) return;

        // Underground fissure & ground tremor animation
        const tremor = this.add.circle(px, py, 8, 0x7c65d6, 0.38).setStrokeStyle(1.5, 0xb8a1ff, 0.9).setDepth(3);
        const crack = this.add.graphics().setDepth(3);
        crack.lineStyle(2, 0x1e1633, 0.95);
        crack.lineBetween(px - cos * 6 + perpX * 2, py - sin * 6 + perpY * 2, px + cos * 6 - perpX * 2, py + sin * 6 - perpY * 2);
        crack.lineStyle(1, 0xb8a1ff, 0.85);
        crack.lineBetween(px - perpX * 5, py - perpY * 5, px + perpX * 5, py + perpY * 5);

        this.roomGroup.add(tremor);
        this.roomGroup.add(crack);
        this.spawnParticles(px, py, step % 2 === 0 ? 0xb8a1ff : 0x94a3b8, 2);

        this.tweens.add({
          targets: tremor,
          scale: 1.55,
          alpha: 0,
          duration: 280,
          ease: 'Quad.easeOut',
          onComplete: () => tremor.destroy(),
        });
        this.tweens.add({
          targets: crack,
          alpha: 0,
          duration: 360,
          ease: 'Quad.easeOut',
          onComplete: () => crack.destroy(),
        });

        if (isLocal) {
          let hitPulse = false;
          for (const e of [...this.activeEnemies]) {
            if (!e.sprite.active || hitUids.has(e.uid)) continue;
            if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= (e.isBoss ? 18 : 15)) {
              hitUids.add(e.uid);
              this.damageEnemy(e, pulseDmg);
              hitPulse = true;
            }
          }
          if (this.hitNyarlathotepArm(px, py, 15, pulseDmg)) {
            hitPulse = true;
          }
          if (hitPulse && !consumed) {
            const activeItem = this.playerState.inventory[this.playerState.activeSlot];
            if (activeItem?.id === 'cloudbreaker') {
              consumed = true;
              const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
              if (broke) {
                SoundSystem.playBreak();
                this.ui.showToast('Cloudbreaker broke!', '#ffe066');
              }
            }
          }
        }
      });
    }
  }

  private drawLightningBolt(x1: number, y1: number, x2: number, y2: number): void {
    const gfx = this.add.graphics().setDepth(14);
    const segments = 5;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const points: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const jitter = (Math.random() - 0.5) * 10;
      points.push({
        x: x1 + dx * t + nx * jitter,
        y: y1 + dy * t + ny * jitter,
      });
    }
    points.push({ x: x2, y: y2 });

    gfx.lineStyle(3, 0x6ef3ff, 0.45);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();

    gfx.lineStyle(1.4, 0xffffff, 0.95);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) gfx.lineTo(points[i].x, points[i].y);
    gfx.strokePath();

    this.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 240,
      onComplete: () => gfx.destroy(),
    });
  }

  private updateBeamWeapon(delta: number): void {
    const isLocalCoopActor = Boolean(this.activeLocalActor);
    if (!isLocalCoopActor) {
      this.beamGfx.clear();
    }
    if (this.playerState.downed || this.dodgeMs > 0 || this.ui.isOverlayOpen()) {
      this.beamDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setLaserActive(this.witchLaserState === 'sweeping');
      return;
    }

    const activeItem = this.playerState.inventory[this.playerState.activeSlot];
    const w = activeItem?.category === 'weapon' ? WEAPONS[activeItem.id] : undefined;
    if (!activeItem || !w || w.style !== 'beam_prism') {
      this.beamDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setLaserActive(this.witchLaserState === 'sweeping');
      return;
    }

    const holdingShoot = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
        ? inputSystem.isPadActionHeld(this.activeLocalActor.padIndex, 'attack')
        : this.input.activePointer.leftButtonDown()
      : isMobileMode()
        ? mobileInput.dpadActive
        : inputSystem.controlType === 'gamepad'
          ? inputSystem.isActionHeld('attack')
          : this.input.activePointer.leftButtonDown();

    if (!holdingShoot) {
      this.beamDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setLaserActive(this.witchLaserState === 'sweeping');
      return;
    }

    if (this.beamDamageTickMs === 0) {
      SoundSystem.playLaserPowerup();
      if (isLocalCoopActor) {
        this.beamDamageTickMs = 1;
      }
    }
    if (!isLocalCoopActor) SoundSystem.setLaserActive(true);

    const angle = isMobileMode()
      ? mobileInput.dpadDirX !== 0 || mobileInput.dpadDirY !== 0
        ? mobileInput.dpadAngle
        : this.playerState.aimAngle
      : this.getAimAngle();
    this.playerState.aimAngle = angle;

    const startX = this.playerSprite.x;
    const startY = this.playerSprite.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const step = 3;
    let endX = startX + cos * w.range;
    let endY = startY + sin * w.range;
    let hitEnemy: ActiveEnemy | null = null;
    let hitCrate: Phaser.Physics.Arcade.Sprite | null = null;

    const maxWallDistSq = (w.range + 16) * (w.range + 16);
    const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wall) => {
      if (!wall.active) return false;
      const dx = wall.x - startX;
      const dy = wall.y - startY;
      return dx * dx + dy * dy <= maxWallDistSq;
    });
    const crates = (this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((c) => c.active);

    for (let dist = 8; dist <= w.range; dist += step) {
      const px = startX + cos * dist;
      const py = startY + sin * dist;

      if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
        endX = px;
        endY = py;
        break;
      }

      let hitWall = false;
      for (const wall of walls) {
        if (!wall.active) continue;
        if (Math.abs(px - wall.x) < 8.5 && Math.abs(py - wall.y) < 8.5) {
          hitWall = true;
          break;
        }
      }
      if (!hitWall) {
        for (const crate of crates) {
          if (!crate.active) continue;
          if (Math.abs(px - crate.x) < 8.5 && Math.abs(py - crate.y) < 8.5) {
            hitWall = true;
            hitCrate = crate;
            break;
          }
        }
      }
      if (hitWall) {
        endX = px;
        endY = py;
        break;
      }

      for (const e of this.activeEnemies) {
        if (!e.sprite.active) continue;
        if (Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) < (e.isBoss ? 14 : 9)) {
          hitEnemy = e;
          endX = px;
          endY = py;
          break;
        }
      }
      if (hitEnemy) break;
    }

    // Draw continuous solid glowing beam
    this.beamGfx.lineStyle(9, 0xff8c1a, 0.32);
    this.beamGfx.lineBetween(startX, startY, endX, endY);
    this.beamGfx.lineStyle(4.8, 0xffe066, 0.85);
    this.beamGfx.lineBetween(startX, startY, endX, endY);
    this.beamGfx.lineStyle(2.1, 0xffffff, 1);
    this.beamGfx.lineBetween(startX, startY, endX, endY);
    this.beamGfx.fillStyle(0xffe066, 0.8);
    this.beamGfx.fillCircle(endX, endY, 5.25);
    this.beamGfx.fillStyle(0xffffff, 1);
    this.beamGfx.fillCircle(endX, endY, 2.7);

    this.beamFxAccumMs += delta;
    if (this.beamFxAccumMs >= 95) {
      this.beamFxAccumMs = 0;
      this.spawnFireParticles(endX, endY, 1);
    }

    if (hitCrate) {
      this.smashCrate(hitCrate);
      this.cameras.main.shake(100, 0.008);
    }

    if (hitEnemy) {
      hitEnemy.burningMs = 3000;
      this.beamDamageTickMs += delta;
      if (this.beamDamageTickMs >= 180) {
        this.beamDamageTickMs -= 180;
        this.damageEnemy(hitEnemy, w.damage);
        if (!hitEnemy.sprite.active || hitEnemy.hp <= 0) {
          this.cameras.main.shake(100, 0.008);
        }
      }
    } else {
      this.beamDamageTickMs = 120;
      if (!this.currentRoom.secretRevealed) {
        const midX = this.roomWidthPx / 2;
        const midY = this.roomHeightPx / 2;
        const hitSecretNorth =
          this.currentRoom.connections.secretNorth && Math.abs(endX - midX) <= 12 && endY <= 20;
        const hitSecretSouth =
          this.currentRoom.connections.secretSouth &&
          Math.abs(endX - midX) <= 12 &&
          endY >= this.roomHeightPx - 20;
        const hitSecretWest =
          this.currentRoom.connections.secretWest && Math.abs(endY - midY) <= 12 && endX <= 20;
        const hitSecretEast =
          this.currentRoom.connections.secretEast &&
          Math.abs(endY - midY) <= 12 &&
          endX >= this.roomWidthPx - 20;
        if (hitSecretNorth || hitSecretSouth || hitSecretWest || hitSecretEast) {
          if (this.tryOpenAdjacentSecretWall(endX, endY)) {
            this.cameras.main.shake(100, 0.008);
          }
        }
      }
    }

    this.beamDrainAccumMs += delta;
    while (this.beamDrainAccumMs >= 100) {
      this.beamDrainAccumMs -= 100;
      const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
      if (broke) {
        this.beamGfx.clear();
        SoundSystem.playBreak();
        this.ui.showToast(`${w.name} broke!`, '#ffe066');
        break;
      }
    }
  }

  private updatePrismBeams(delta: number): void {
    for (let i = this.prismBeams.length - 1; i >= 0; i--) {
      const b = this.prismBeams[i];
      if (!b.gfx.active) {
        this.prismBeams.splice(i, 1);
        continue;
      }

      let startX = this.playerSprite.x;
      let startY = this.playerSprite.y;
      if (!b.isLocal) {
        const remote = this.remoteSprites.get(b.ownerId);
        if (!remote?.sprite.active) {
          b.gfx.destroy();
          this.prismBeams.splice(i, 1);
          continue;
        }
        startX = remote.sprite.x;
        startY = remote.sprite.y;
      } else {
        const localOwner =
          localCoopSession.active && this.localPlayers.length > 0
            ? this.localPlayers.find((lp) => lp.state.id === b.ownerId)
            : undefined;
        const ownerSprite = localOwner ? localOwner.sprite : this.playerSprite;
        const ownerDowned = localOwner ? localOwner.state.downed : this.playerState.downed;
        if (!ownerSprite.active || ownerDowned) {
          b.gfx.destroy();
          this.prismBeams.splice(i, 1);
          continue;
        }
        startX = ownerSprite.x;
        startY = ownerSprite.y;
      }

      const cos = Math.cos(b.angle);
      const sin = Math.sin(b.angle);

      // Raycast against walls & room bounds only (pierces straight through enemies)
      let endX = startX + cos * b.range;
      let endY = startY + sin * b.range;
      const maxWallDistSq = (b.range + 16) * (b.range + 16);
      const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wall) => {
        if (!wall.active) return false;
        const dx = wall.x - startX;
        const dy = wall.y - startY;
        return dx * dx + dy * dy <= maxWallDistSq;
      });
      for (let dist = 8; dist <= b.range; dist += 3) {
        const px = startX + cos * dist;
        const py = startY + sin * dist;
        if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
          endX = px;
          endY = py;
          break;
        }
        if (walls.some((wall) => Math.abs(px - wall.x) < 8.5 && Math.abs(py - wall.y) < 8.5)) {
          endX = px;
          endY = py;
          break;
        }
      }

      b.gfx.clear();

      if (b.chargeMs > 0) {
        b.chargeMs -= delta;
        const chargeProgress = 1 - Math.max(0, b.chargeMs) / 500;
        b.gfx.lineStyle(1, 0xffffff, 0.25 + chargeProgress * 0.35);
        b.gfx.lineBetween(startX, startY, endX, endY);
        b.gfx.fillStyle(0xffffff, 0.4 + chargeProgress * 0.5);
        b.gfx.fillCircle(startX + cos * 8, startY + sin * 8, 2 + chargeProgress * 2.5);
        continue;
      }

      b.activeMs -= delta;
      if (b.activeMs <= 0) {
        b.gfx.destroy();
        this.prismBeams.splice(i, 1);
        continue;
      }

      // White laser beam (half width of Haunter's Eye)
      b.gfx.lineStyle(4.5, 0xffffff, 0.28);
      b.gfx.lineBetween(startX, startY, endX, endY);
      b.gfx.lineStyle(2.4, 0xf8fafc, 0.85);
      b.gfx.lineBetween(startX, startY, endX, endY);
      b.gfx.lineStyle(1.05, 0xffffff, 1);
      b.gfx.lineBetween(startX, startY, endX, endY);
      b.gfx.fillStyle(0xffffff, 0.8);
      b.gfx.fillCircle(endX, endY, 2.6);
      b.gfx.fillStyle(0xffffff, 1);
      b.gfx.fillCircle(endX, endY, 1.35);

      b.fxAccumMs += delta;
      if (b.fxAccumMs >= 95) {
        b.fxAccumMs = 0;
        this.spawnParticles(endX, endY, 0xffffff, 2);
      }

      if (b.isLocal) {
        const beamLen = Phaser.Math.Distance.Between(startX, startY, endX, endY);
        for (const e of [...this.activeEnemies]) {
          if (!e.sprite.active || b.hitUids.has(e.uid)) continue;
          const dx = e.sprite.x - startX;
          const dy = e.sprite.y - startY;
          const along = dx * cos + dy * sin;
          const pad = e.isBoss ? 14 : 9;
          if (along < 0 || along > beamLen + pad) continue;
          const perp = Math.abs(-sin * dx + cos * dy);
          if (perp <= pad) {
            b.hitUids.add(e.uid);
            this.damageEnemy(e, b.damage);
          }
        }
        for (const obj of [...this.crateGroup.getChildren()]) {
          const cs = obj as Phaser.Physics.Arcade.Sprite;
          if (!cs.active) continue;
          const dx = cs.x - startX;
          const dy = cs.y - startY;
          const along = dx * cos + dy * sin;
          if (along < 0 || along > beamLen + 9) continue;
          const perp = Math.abs(-sin * dx + cos * dy);
          if (perp <= 9) {
            this.smashCrate(cs);
          }
        }
      }
    }
  }

  private updateAuroraHarpHoldFire(): void {
    if (this.playerState.downed || this.dodgeMs > 0 || this.ui.isOverlayOpen() || this.attackCooldownMs > 0) {
      return;
    }
    const activeItem = this.playerState.inventory[this.playerState.activeSlot];
    if (!activeItem || activeItem.id !== 'aurora_harp') return;
    const holdingShoot = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
        ? inputSystem.isPadActionHeld(this.activeLocalActor.padIndex, 'attack')
        : this.input.activePointer.leftButtonDown()
      : isMobileMode()
        ? mobileInput.dpadActive
        : inputSystem.controlType === 'gamepad'
          ? inputSystem.isActionHeld('attack')
          : this.input.activePointer.leftButtonDown();
    if (holdingShoot) {
      this.handlePrimaryAttack();
    }
  }

  private updateFlamethrowerWeapon(delta: number): void {
    const isLocalCoopActor = Boolean(this.activeLocalActor);
    if (this.playerState.downed || this.dodgeMs > 0 || this.ui.isOverlayOpen()) {
      this.flameDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setFlamethrowerActive(false);
      return;
    }

    const activeItem = this.playerState.inventory[this.playerState.activeSlot];
    const w = activeItem?.category === 'weapon' ? WEAPONS[activeItem.id] : undefined;
    if (!activeItem || !w || w.style !== 'flamethrower') {
      this.flameDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setFlamethrowerActive(false);
      return;
    }

    const holdingShoot = this.activeLocalActor
      ? this.activeLocalActor.inputType === 'gamepad'
        ? inputSystem.isPadActionHeld(this.activeLocalActor.padIndex, 'attack')
        : this.input.activePointer.leftButtonDown()
      : isMobileMode()
        ? mobileInput.dpadActive
        : inputSystem.controlType === 'gamepad'
          ? inputSystem.isActionHeld('attack')
          : this.input.activePointer.leftButtonDown();

    if (!holdingShoot) {
      this.flameDamageTickMs = 0;
      if (!isLocalCoopActor) SoundSystem.setFlamethrowerActive(false);
      return;
    }

    if (isLocalCoopActor && this.flameDamageTickMs === 0) {
      this.flameDamageTickMs = 1;
    }
    if (!isLocalCoopActor) SoundSystem.setFlamethrowerActive(true);

    const angle = isMobileMode()
      ? mobileInput.dpadDirX !== 0 || mobileInput.dpadDirY !== 0
        ? mobileInput.dpadAngle
        : this.playerState.aimAngle
      : this.getAimAngle();
    this.playerState.aimAngle = angle;

    const startX = this.playerSprite.x;
    const startY = this.playerSprite.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const maxWallDistSq = (w.range + 16) * (w.range + 16);
    const walls = (this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]).filter((wall) => {
      if (!wall.active) return false;
      const dx = wall.x - startX;
      const dy = wall.y - startY;
      return dx * dx + dy * dy <= maxWallDistSq;
    });
    const crates = (this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((c) => c.active);

    let maxReach = w.range;
    for (let dist = 8; dist <= w.range; dist += 4) {
      const px = startX + cos * dist;
      const py = startY + sin * dist;
      if (px < 17 || px > this.roomWidthPx - 17 || py < 17 || py > this.roomHeightPx - 17) {
        maxReach = dist;
        break;
      }
      let blocked = false;
      for (const wall of walls) {
        if (Math.abs(px - wall.x) < 8.5 && Math.abs(py - wall.y) < 8.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        for (const crate of crates) {
          if (Math.abs(px - crate.x) < 8.5 && Math.abs(py - crate.y) < 8.5) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        maxReach = dist;
        break;
      }
    }

    // Continuous visual stream of fire particles
    this.flameFxAccumMs += delta;
    if (this.flameFxAccumMs >= 38) {
      this.flameFxAccumMs = 0;
      const flameColors = [0xff4500, 0xff6b35, 0xff9f1c, 0xffe066];
      for (let i = 0; i < 2; i++) {
        const spread = Phaser.Math.FloatBetween(-0.2, 0.2);
        const a = angle + spread;
        const travel = Math.max(12, maxReach * Phaser.Math.FloatBetween(0.75, 1.0));
        const sx = startX + Math.cos(a) * 8;
        const sy = startY + Math.sin(a) * 8;
        const color = flameColors[Math.floor(Math.random() * flameColors.length)];
        const p = this.add
          .image(sx, sy, i === 0 ? 'particle_spark' : 'particle_star')
          .setTint(color)
          .setScale(Phaser.Math.FloatBetween(1.1, 1.5))
          .setDepth(13)
          .setAlpha(0.95);
        this.tweens.add({
          targets: p,
          x: startX + Math.cos(a) * travel,
          y: startY + Math.sin(a) * travel,
          scale: 0.45,
          alpha: 0,
          duration: Phaser.Math.Between(200, 310),
          ease: 'Quad.easeOut',
          onComplete: () => p.destroy(),
        });
      }
    }

    // Set enemies in the stream on fire and tick reduced continuous damage
    const hitEnemies: ActiveEnemy[] = [];
    for (const e of this.activeEnemies) {
      if (!e.sprite.active) continue;
      const dx = e.sprite.x - startX;
      const dy = e.sprite.y - startY;
      const along = dx * cos + dy * sin;
      const pad = e.isBoss ? 14 : 9;
      if (along < 0 || along > maxReach + pad) continue;
      const perp = Math.abs(-sin * dx + cos * dy);
      const halfWidth = (e.isBoss ? 18 : 13) + (along / w.range) * 8;
      if (perp <= halfWidth) {
        e.burningMs = 3000;
        hitEnemies.push(e);
      }
    }

    if (hitEnemies.length > 0) {
      this.flameDamageTickMs += delta;
      if (this.flameDamageTickMs >= 250) {
        this.flameDamageTickMs -= 250;
        for (const e of hitEnemies) {
          if (e.sprite.active) {
            this.damageEnemy(e, w.damage);
          }
        }
      }
    } else {
      this.flameDamageTickMs = 150;
    }

    // Drain 1 use per 100ms (maxUses: 150 = 15 seconds total)
    this.flameDrainAccumMs += delta;
    while (this.flameDrainAccumMs >= 100) {
      this.flameDrainAccumMs -= 100;
      const broke = consumeUse(this.playerState.inventory, this.playerState.activeSlot, 1);
      if (broke) {
        SoundSystem.playBreak();
        this.ui.showToast(`${w.name} broke!`, '#ffe066');
        break;
      }
    }
  }

  private damageSkeleton(sk: ActiveSkeleton, dmg: number): void {
    if (!sk.sprite.active) return;
    sk.hp -= dmg;
    sk.hitFlashMs = 140;
    sk.sprite.setTint(0xff5d8f);
    this.spawnParticles(sk.sprite.x, sk.sprite.y, 0xe2e8f0, 4);
    if (sk.hp <= 0) {
      this.spawnParticles(sk.sprite.x, sk.sprite.y, 0xc084fc, 8);
      sk.sprite.destroy();
      this.summonedSkeletons = this.summonedSkeletons.filter((s) => s !== sk);
    }
  }

  private hasClearSkeletonLine(x1: number, y1: number, x2: number, y2: number, avoidHazards = false): boolean {
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    if (dist <= 6) return true;
    const steps = Math.ceil(dist / 6);
    const walls = this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[];
    const crates = this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
    const maxX = this.roomWidthPx - 20;
    const maxY = this.roomHeightPx - 20;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      if (px < 20 || px > maxX || py < 20 || py > maxY) return false;
      for (const w of walls) {
        if (w.active && Math.abs(px - w.x) < 11 && Math.abs(py - w.y) < 11) return false;
      }
      for (const c of crates) {
        if (c.active && Math.abs(px - c.x) < 11 && Math.abs(py - c.y) < 11) return false;
      }
      for (const b of this.specialObjs.blocks) {
        if (b.sprite.active && Math.abs(px - b.sprite.x) < 11 && Math.abs(py - b.sprite.y) < 11) return false;
      }
      if (avoidHazards) {
        for (const h of this.hazards) {
          if (Math.abs(px - h.x) < 11 && Math.abs(py - h.y) < 11) return false;
        }
      }
    }
    return true;
  }

  private getSkeletonPathWaypoint(fromX: number, fromY: number, toX: number, toY: number, avoidHazards = false): { x: number; y: number } {
    if (this.hasClearSkeletonLine(fromX, fromY, toX, toY, avoidHazards)) {
      return { x: toX, y: toY };
    }

    const cols = Math.max(11, Math.round(this.roomWidthPx / 16));
    const rows = Math.max(11, Math.round(this.roomHeightPx / 16));
    const blocked: boolean[][] = Array.from({ length: rows }, (_, ty) =>
      Array.from({ length: cols }, (__, tx) => tx === 0 || tx === cols - 1 || ty === 0 || ty === rows - 1)
    );
    const markBlocked = (wx: number, wy: number) => {
      const tx = Phaser.Math.Clamp(Math.floor(wx / 16), 0, cols - 1);
      const ty = Phaser.Math.Clamp(Math.floor(wy / 16), 0, rows - 1);
      blocked[ty][tx] = true;
    };
    for (const w of this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]) {
      if (w.active) markBlocked(w.x, w.y);
    }
    for (const c of this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (c.active) markBlocked(c.x, c.y);
    }
    for (const b of this.specialObjs.blocks) {
      if (b.sprite.active) markBlocked(b.sprite.x, b.sprite.y);
    }
    if (avoidHazards) {
      for (const h of this.hazards) {
        markBlocked(h.x, h.y);
      }
    }

    const sx = Phaser.Math.Clamp(Math.floor(fromX / 16), 1, cols - 2);
    const sy = Phaser.Math.Clamp(Math.floor(fromY / 16), 1, rows - 2);
    const gx = Phaser.Math.Clamp(Math.floor(toX / 16), 1, cols - 2);
    const gy = Phaser.Math.Clamp(Math.floor(toY / 16), 1, rows - 2);
    if (sx === gx && sy === gy) {
      return { x: toX, y: toY };
    }

    const parent = new Int16Array(cols * rows).fill(-1);
    const startIdx = sy * cols + sx;
    const goalIdx = gy * cols + gx;
    parent[startIdx] = startIdx;
    const queue: number[] = [startIdx];
    let head = 0;
    let bestFallbackIdx = startIdx;
    let bestFallbackDist = Math.abs(sx - gx) + Math.abs(sy - gy);

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    let found = false;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === goalIdx) {
        found = true;
        break;
      }
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 1 || nx > cols - 2 || ny < 1 || ny > rows - 2) continue;
        // Allow stepping into the goal cell even if an obstacle/enemy overlaps its tile,
        // otherwise require unblocked tiles (and both cardinal neighbors for diagonals).
        const nIdx = ny * cols + nx;
        if ((nIdx !== goalIdx || avoidHazards) && blocked[ny][nx]) continue;
        if (dx !== 0 && dy !== 0 && (blocked[cy][nx] || blocked[ny][cx])) continue;
        if (parent[nIdx] !== -1) continue;
        parent[nIdx] = cur;
        queue.push(nIdx);
        const h = Math.abs(nx - gx) + Math.abs(ny - gy);
        if (h < bestFallbackDist) {
          bestFallbackDist = h;
          bestFallbackIdx = nIdx;
        }
      }
    }

    let trace = found ? goalIdx : bestFallbackIdx;
    if (trace === startIdx) {
      return avoidHazards ? { x: fromX, y: fromY } : { x: toX, y: toY };
    }
    while (parent[trace] !== startIdx && parent[trace] !== -1) {
      trace = parent[trace];
    }
    const nextX = (trace % cols) * 16 + 8;
    const nextY = Math.floor(trace / cols) * 16 + 8;
    return { x: nextX, y: nextY };
  }

  private updateSummonedSkeletons(time: number, delta: number): void {
    this.summonedSkeletons = this.summonedSkeletons.filter((s) => s.sprite.active);
    if (this.summonedSkeletons.length === 0) return;

    const frame = Math.floor(time / 240) % 2;
    const liveEnemies = this.activeEnemies.filter((e) => e.sprite.active);

    for (const sk of this.summonedSkeletons) {
      sk.attackCooldownMs = Math.max(0, sk.attackCooldownMs - delta);
      if (sk.hitFlashMs > 0) {
        sk.hitFlashMs -= delta;
        if (sk.hitFlashMs <= 0) sk.sprite.clearTint();
      }
      sk.sprite.setFrame(frame);

      const ownerActor =
        localCoopSession.active && sk.ownerId
          ? this.localPlayers.find((lp) => lp.state.id === sk.ownerId)
          : undefined;
      const ownerSprite = ownerActor ? ownerActor.sprite : this.playerSprite;
      const ownerDowned = ownerActor ? ownerActor.state.downed : this.playerState.downed;

      if (ownerDowned) {
        sk.sprite.setVelocity(0, 0);
        continue;
      }

      let moveVx = 0;
      let moveVy = 0;

      if (liveEnemies.length > 0) {
        let nearest = liveEnemies[0];
        let bestDist = Phaser.Math.Distance.Between(sk.sprite.x, sk.sprite.y, nearest.sprite.x, nearest.sprite.y);
        for (let i = 1; i < liveEnemies.length; i++) {
          const cand = liveEnemies[i];
          const d = Phaser.Math.Distance.Between(sk.sprite.x, sk.sprite.y, cand.sprite.x, cand.sprite.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = cand;
          }
        }

        const flankAngle = (sk.formationIndex * Math.PI) / 2;
        const desiredX = Phaser.Math.Clamp(nearest.sprite.x + Math.cos(flankAngle) * 11, 22, Math.max(22, this.roomWidthPx - 22));
        const desiredY = Phaser.Math.Clamp(nearest.sprite.y + Math.sin(flankAngle) * 11, 22, Math.max(22, this.roomHeightPx - 22));
        const waypoint = this.getSkeletonPathWaypoint(sk.sprite.x, sk.sprite.y, desiredX, desiredY);
        const moveAngle = Phaser.Math.Angle.Between(sk.sprite.x, sk.sprite.y, waypoint.x, waypoint.y);
        const attackAngle = Phaser.Math.Angle.Between(sk.sprite.x, sk.sprite.y, nearest.sprite.x, nearest.sprite.y);
        sk.sprite.setFlipX(Math.cos(attackAngle) < 0);

        if (bestDist > 12) {
          moveVx = Math.cos(moveAngle) * 72;
          moveVy = Math.sin(moveAngle) * 72;
        }

        if (bestDist <= (nearest.isBoss ? 22 : 17) && sk.attackCooldownMs <= 0) {
          sk.attackCooldownMs = 650;
          this.damageEnemy(nearest, 2, attackAngle);
          this.spawnParticles(nearest.sprite.x, nearest.sprite.y, 0xc084fc, 3);
        }
      } else {
        const orbitAngle = (sk.formationIndex * Math.PI) / 2;
        const targetX = Phaser.Math.Clamp(ownerSprite.x + Math.cos(orbitAngle) * 18, 22, Math.max(22, this.roomWidthPx - 22));
        const targetY = Phaser.Math.Clamp(ownerSprite.y + Math.sin(orbitAngle) * 18, 22, Math.max(22, this.roomHeightPx - 22));
        const dist = Phaser.Math.Distance.Between(sk.sprite.x, sk.sprite.y, targetX, targetY);
        if (dist > 6) {
          const waypoint = this.getSkeletonPathWaypoint(sk.sprite.x, sk.sprite.y, targetX, targetY);
          const angle = Phaser.Math.Angle.Between(sk.sprite.x, sk.sprite.y, waypoint.x, waypoint.y);
          sk.sprite.setFlipX(Math.cos(angle) < 0);
          const spd = Math.min(86, 38 + dist * 1.4);
          moveVx = Math.cos(angle) * spd;
          moveVy = Math.sin(angle) * spd;
        }
      }

      // Separation force so skeletons never overlap into a single sprite
      for (const other of this.summonedSkeletons) {
        if (other === sk || !other.sprite.active) continue;
        const dx = sk.sprite.x - other.sprite.x;
        const dy = sk.sprite.y - other.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d < 14) {
          const pushAngle = d > 0.01 ? Math.atan2(dy, dx) : (sk.formationIndex * Math.PI) / 2;
          const strength = ((14 - d) / 14) * 58;
          moveVx += Math.cos(pushAngle) * strength;
          moveVy += Math.sin(pushAngle) * strength;
        }
      }

      sk.sprite.setVelocity(moveVx, moveVy);
    }
  }

  private createActivePet(def: PetDef, x: number, y: number): ActivePet {
    const startX = Phaser.Math.Clamp(x - 14, 22, Math.max(22, this.roomWidthPx - 22));
    const startY = Phaser.Math.Clamp(y + 6, 22, Math.max(22, this.roomHeightPx - 22));
    const scale = def.scale ?? 1;
    const shadow = this.add.ellipse(startX, startY + 5, 9 * scale, 4 * scale, 0x0b0917, 0.45).setDepth(8);
    const sprite = this.add.sprite(startX, startY, `pet_${def.id}`, 0).setScale(scale).setDepth(9);
    if (def.id === 'phantom_kitty' || def.id === 'starlight_wisp') {
      sprite.setAlpha(0.86);
    }
    return {
      def,
      sprite,
      shadow,
      x: startX,
      y: startY,
      z: def.moveStyle === 'float' ? 5 : 0,
      animTimerMs: 0,
      hopTimerMs: 0,
      hopCooldownMs: 0,
      isFlying: false,
      facingLeft: false,
    };
  }

  private destroyPet(pet: ActivePet | null): void {
    if (!pet) return;
    if (pet.sprite?.active) pet.sprite.destroy();
    if (pet.shadow?.active) pet.shadow.destroy();
  }

  private spawnOrResetPlayerPet(spawnX: number, spawnY: number): void {
    const petId = this.playerState?.petId ?? net.localPetId ?? getSavedPetId();
    const petDef = steamSystem.isAvatarDlcUnlocked() ? getPetById(petId) : undefined;
    if (!petDef) {
      this.destroyPet(this.playerPet);
      this.playerPet = null;
      return;
    }

    if (!this.playerPet || !this.playerPet.sprite.active || this.playerPet.def.id !== petDef.id) {
      this.destroyPet(this.playerPet);
      this.playerPet = this.createActivePet(petDef, spawnX, spawnY);
    } else {
      const px = Phaser.Math.Clamp(spawnX - 14, 22, Math.max(22, this.roomWidthPx - 22));
      const py = Phaser.Math.Clamp(spawnY + 6, 22, Math.max(22, this.roomHeightPx - 22));
      this.playerPet.x = px;
      this.playerPet.y = py;
      this.playerPet.z = petDef.moveStyle === 'float' ? 5 : 0;
      this.playerPet.isFlying = false;
      this.playerPet.hopTimerMs = 0;
      this.playerPet.sprite.setPosition(px, py - this.playerPet.z).setVisible(true);
      this.playerPet.shadow.setPosition(px, py + 5).setVisible(true);
    }
  }

  private isPetOverFloor(x: number, y: number): boolean {
    if (x < 18 || x > this.roomWidthPx - 18 || y < 18 || y > this.roomHeightPx - 18) {
      return false;
    }
    for (const w of this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[]) {
      if (w.active && Math.abs(x - w.x) < 10 && Math.abs(y - w.y) < 10) return false;
    }
    for (const c of this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (c.active && Math.abs(x - c.x) < 10 && Math.abs(y - c.y) < 10) return false;
    }
    for (const b of this.specialObjs.blocks) {
      if (b.sprite.active && Math.abs(x - b.sprite.x) < 10 && Math.abs(y - b.sprite.y) < 10) return false;
    }
    for (const h of this.hazards) {
      if (Phaser.Math.Distance.Between(x, y, h.x, h.y) < 9) return false;
    }
    return true;
  }

  private updateSinglePet(pet: ActivePet, ownerX: number, ownerY: number, ownerFlipX: boolean, time: number, delta: number): void {
    if (!pet.sprite.active || !pet.shadow.active) return;

    const dt = delta / 1000;
    const trailOffsetX = ownerFlipX ? 16 : -16;
    const targetX = Phaser.Math.Clamp(ownerX + trailOffsetX, 22, Math.max(22, this.roomWidthPx - 22));
    const targetY = Phaser.Math.Clamp(ownerY + 6, 22, Math.max(22, this.roomHeightPx - 22));

    const style = pet.def.moveStyle;
    const isGroundPet = style === 'cat' || style === 'dog' || style === 'hop';
    let safeTargetX = targetX;
    let safeTargetY = targetY;
    let hasSafeTarget = true;
    if (isGroundPet && !this.isPetOverFloor(safeTargetX, safeTargetY)) {
      if (this.isPetOverFloor(ownerX, ownerY)) {
        safeTargetX = ownerX;
        safeTargetY = ownerY;
      } else {
        hasSafeTarget = false;
      }
    }

    const distToOwner = Phaser.Math.Distance.Between(pet.x, pet.y, ownerX, ownerY);
    if (distToOwner > 170 && (!isGroundPet || hasSafeTarget)) {
      pet.x = safeTargetX;
      pet.y = safeTargetY;
    }

    const dist = Phaser.Math.Distance.Between(pet.x, pet.y, safeTargetX, safeTargetY);
    let frame = 0;

    if (style === 'bird') {
      const onFloor = this.isPetOverFloor(pet.x, pet.y);
      const shouldFly = !onFloor || dist > 26 || (pet.isFlying && dist > 9);
      pet.isFlying = shouldFly;

      if (shouldFly) {
        const targetZ = 7 + Math.sin(time * 0.009) * 1.6;
        pet.z = Phaser.Math.Linear(pet.z, targetZ, Math.min(1, dt * 10));
        if (dist > 3) {
          const angle = Phaser.Math.Angle.Between(pet.x, pet.y, targetX, targetY);
          const spd = Math.min(pet.def.speed, 44 + dist * 1.7);
          const step = Math.min(dist, spd * dt);
          pet.x += Math.cos(angle) * step;
          pet.y += Math.sin(angle) * step;
          if (Math.abs(Math.cos(angle)) > 0.15) {
            pet.facingLeft = Math.cos(angle) < 0;
          }
        }
        pet.animTimerMs += delta;
        frame = Math.floor(pet.animTimerMs / 110) % 2 === 0 ? 1 : 2;
      } else {
        pet.z = Phaser.Math.Linear(pet.z, 0, Math.min(1, dt * 12));
        if (pet.z < 0.3) pet.z = 0;
        frame = 0;
      }
    } else if (style === 'float') {
      pet.z = 5 + Math.sin(time * 0.005 + pet.x * 0.05) * 2;
      if (dist > 8) {
        const angle = Phaser.Math.Angle.Between(pet.x, pet.y, targetX, targetY);
        const spd = Math.min(pet.def.speed, 34 + dist * 1.4);
        const step = Math.min(dist, spd * dt);
        pet.x += Math.cos(angle) * step;
        pet.y += Math.sin(angle) * step;
        if (Math.abs(Math.cos(angle)) > 0.15) {
          pet.facingLeft = Math.cos(angle) < 0;
        }
      }
      pet.animTimerMs += delta;
      frame = Math.floor(pet.animTimerMs / 220) % 3;
    } else if (style === 'hop') {
      if (pet.hopTimerMs > 0) {
        pet.hopTimerMs = Math.max(0, pet.hopTimerMs - delta);
        const progress = 1 - pet.hopTimerMs / 260;
        pet.z = Math.sin(progress * Math.PI) * 6;
        const waypoint = hasSafeTarget
          ? this.getSkeletonPathWaypoint(pet.x, pet.y, safeTargetX, safeTargetY, true)
          : { x: pet.x, y: pet.y };
        const wDist = Phaser.Math.Distance.Between(pet.x, pet.y, waypoint.x, waypoint.y);
        if (wDist > 2) {
          const angle = Phaser.Math.Angle.Between(pet.x, pet.y, waypoint.x, waypoint.y);
          const step = Math.min(wDist, pet.def.speed * dt);
          pet.x += Math.cos(angle) * step;
          pet.y += Math.sin(angle) * step;
          if (Math.abs(Math.cos(angle)) > 0.15) {
            pet.facingLeft = Math.cos(angle) < 0;
          }
        }
        frame = progress < 0.75 ? 1 : 2;
      } else {
        pet.z = 0;
        pet.hopCooldownMs = Math.max(0, pet.hopCooldownMs - delta);
        if (dist > 14 && pet.hopCooldownMs <= 0) {
          pet.hopTimerMs = 260;
          pet.hopCooldownMs = 170;
        }
        frame = 0;
      }
    } else {
      // 'cat' (brisk) or 'dog' (slightly slower) ground pathfinding
      if (dist > 10 && hasSafeTarget) {
        const waypoint = this.getSkeletonPathWaypoint(pet.x, pet.y, safeTargetX, safeTargetY, true);
        const wDist = Phaser.Math.Distance.Between(pet.x, pet.y, waypoint.x, waypoint.y);
        if (wDist > 1) {
          const angle = Phaser.Math.Angle.Between(pet.x, pet.y, waypoint.x, waypoint.y);
          const spd = Math.min(pet.def.speed, 32 + dist * 1.6);
          const step = Math.min(wDist, spd * dt);
          pet.x += Math.cos(angle) * step;
          pet.y += Math.sin(angle) * step;
          if (Math.abs(Math.cos(angle)) > 0.15) {
            pet.facingLeft = Math.cos(angle) < 0;
          }
        }
        const strideMs = style === 'cat' ? 120 : 155;
        pet.animTimerMs += delta;
        frame = Math.floor(pet.animTimerMs / strideMs) % 2 === 0 ? 1 : 2;
        pet.z = Math.abs(Math.sin(time * (style === 'cat' ? 0.016 : 0.012))) * 1.4;
      } else {
        pet.z = 0;
        frame = 0;
      }
    }

    pet.sprite.setFrame(frame);
    pet.sprite.setFlipX(pet.facingLeft);
    pet.sprite.setPosition(pet.x, pet.y - pet.z);
    pet.sprite.setDepth(pet.z > 3 ? 11 : 6 + (pet.y + 4) / 1000);

    const shadowScale = Math.max(0.55, 1 - pet.z * 0.045);
    pet.shadow.setPosition(pet.x, pet.y + 5);
    pet.shadow.setScale(shadowScale);
  }

  private updatePets(time: number, delta: number): void {
    if (this.playerPet) {
      const ownerActor = localCoopSession.active
        ? (this.localPlayers.find((lp) => !lp.state.downed) ?? this.localPlayers[0])
        : undefined;
      const ownerSprite = ownerActor ? ownerActor.sprite : this.playerSprite;
      const visible = ownerSprite.visible;
      this.playerPet.sprite.setVisible(visible);
      this.playerPet.shadow.setVisible(visible);
      if (visible) {
        this.updateSinglePet(this.playerPet, ownerSprite.x, ownerSprite.y, ownerSprite.flipX, time, delta);
      }
    }

    // Update remote co-op players' pets if they are in the same room
    const activeRemoteIds = new Set<string>();
    for (const [peerId, rState] of this.remotePlayers.entries()) {
      const inRoom = rState.gx === this.currentRoom.gx && rState.gy === this.currentRoom.gy;
      const petDef = inRoom ? getPetById(rState.petId) : undefined;
      if (!petDef) {
        const existing = this.remotePets.get(peerId);
        if (existing) {
          this.destroyPet(existing);
          this.remotePets.delete(peerId);
        }
        continue;
      }
      activeRemoteIds.add(peerId);
      let rp = this.remotePets.get(peerId);
      if (!rp || rp.def.id !== petDef.id || !rp.sprite.active) {
        if (rp) this.destroyPet(rp);
        rp = this.createActivePet(petDef, rState.x, rState.y);
        this.remotePets.set(peerId, rp);
      } else if (Phaser.Math.Distance.Between(rp.x, rp.y, rState.x, rState.y) > 48) {
        rp.x = rState.x;
        rp.y = rState.y;
        rp.sprite.setPosition(rp.x, rp.y - rp.z);
        rp.shadow.setPosition(rp.x, rp.y + 5);
      }
      rp.sprite.setVisible(true);
      rp.shadow.setVisible(true);
      this.updateSinglePet(rp, rState.x, rState.y, rState.flipX, time, delta);
    }

    for (const [peerId, rp] of this.remotePets.entries()) {
      if (!activeRemoteIds.has(peerId)) {
        this.destroyPet(rp);
        this.remotePets.delete(peerId);
      }
    }
  }

  private updateEnemies(time: number, delta: number): void {
    const hasBuzzingEnemy = this.activeEnemies.some(
      (e) =>
        e.sprite.active &&
        (e.defId === 'tiny_moth' ||
          e.defId === 'wisp_bat' ||
          e.defId === 'rot_moth' ||
          e.defId === 'velvet_moth' ||
          e.defId === 'echo_wisp')
    );
    SoundSystem.setCicadaActive(hasBuzzingEnemy);

    if (!this.isRoomAuthority()) {
      const lerpFactor = 1 - Math.exp(-delta * 0.022);
      const nowPerf = performance.now();
      for (const e of this.activeEnemies) {
        if (!e.sprite.active) continue;
        e.sprite.setVelocity(0, 0);
        e.sprite.setFrame(Math.floor(time / 280) % 2);
        e.sprite.setDepth(6 + (e.sprite.y + 4) / 1000);
        if (e.targetX !== undefined && e.targetY !== undefined) {
          const leadSec = Math.min(0.08, Math.max(0, (nowPerf - (e.lastSyncAt ?? nowPerf)) / 1000));
          const predX = e.targetX + (e.targetVx ?? 0) * leadSec;
          const predY = e.targetY + (e.targetVy ?? 0) * leadSec;
          const dx = predX - e.sprite.x;
          if (Math.abs(e.targetVx ?? 0) > 4) {
            e.sprite.setFlipX((e.targetVx ?? 0) < 0);
          } else if (Math.abs(dx) > 0.5) {
            e.sprite.setFlipX(dx < 0);
          }
          const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, predX, predY);
          if (dist > 48) {
            e.sprite.setPosition(predX, predY);
          } else if (dist > 0.15) {
            e.sprite.setPosition(
              Phaser.Math.Linear(e.sprite.x, predX, lerpFactor),
              Phaser.Math.Linear(e.sprite.y, predY, lerpFactor)
            );
          }
        }
        this.updateCrystalShields(e, delta);
        const playerDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.playerSprite.x, this.playerSprite.y);
        if (playerDist < (e.isBoss ? 20 : 12)) {
          this.damagePlayer(e.damage);
        }
        for (const sk of [...this.summonedSkeletons]) {
          if (!sk.sprite.active || sk.hitFlashMs > 0) continue;
          if (Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, sk.sprite.x, sk.sprite.y) < (e.isBoss ? 18 : 11)) {
            this.damageSkeleton(sk, e.damage);
          }
        }
      }
      return;
    }

    const hostX = this.playerSprite.x;
    const hostY = this.playerSprite.y;
    const roomAllies = localCoopSession.active
      ? this.localPlayers.filter((lp) => !lp.state.downed).map((lp) => lp.state)
      : Array.from(this.remotePlayers.values()).filter(
          (p) => !p.downed && p.gx === this.currentRoom.gx && p.gy === this.currentRoom.gy
        );

    for (const e of [...this.activeEnemies]) {
      if (!e.sprite.active) continue;
      e.sprite.setDepth(6 + (e.sprite.y + 4) / 1000);
      if (this.isTestRoom && e.sprite.x < 21 * 16 + 8) {
        e.sprite.x = 21 * 16 + 8;
      }

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
          if (e.defId === 'tutorial_dummy') e.sprite.setTint(0xd4a373);
          else if (e.slowedMs > 0) e.sprite.setTint(0x55ff88);
          else if (e.frostSlowMs && e.frostSlowMs > 0) e.sprite.setTint(0x7dd3fc);
          else if (e.isElite) e.sprite.setTint(0xffd275);
        }
      }

      if (e.defId === 'tutorial_dummy') {
        e.sprite.setVelocity(0, 0);
        e.sprite.setFrame(0);
        e.sprite.setDepth(6 + (e.sprite.y + 4) / 1000);
        continue;
      }

      if (e.burningMs > 0) {
        e.burningMs -= delta;
        e.burnFxMs += delta;
        if (e.burnFxMs >= 85) {
          e.burnFxMs = 0;
          this.spawnFireParticles(e.sprite.x, e.sprite.y, 2);
        }
        e.burnTickMs += delta;
        if (e.burnTickMs >= 1000) {
          e.burnTickMs = 0;
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xff6b35, 3);
          this.damageEnemy(e, 1);
          if (!e.sprite.active) continue;
        }
      } else {
        e.burnFxMs = 0;
      }

      if (e.frozenMs && e.frozenMs > 0) {
        e.frozenMs -= delta;
        if (!e.iceGfx || !e.iceGfx.active) {
          this.drawEnemyIceCube(e, (e.iceHits ?? 0) >= 1);
        }
        e.iceGfx?.setPosition(e.sprite.x, e.sprite.y);
        if (e.frozenMs <= 0) {
          this.shatterEnemyIce(e);
        } else {
          e.sprite.setVelocity(0, 0);
          continue;
        }
      }

      if (e.bubbledMs > 0) {
        e.bubbledMs -= delta;
        if (!e.bubbleGfx || !e.bubbleGfx.active) {
          e.bubbleGfx = this.add.graphics().setDepth(11);
          e.bubbleGfx.fillStyle(0x6ef3ff, 0.24);
          e.bubbleGfx.fillCircle(0, 0, e.isBoss ? 16 : 11);
          e.bubbleGfx.lineStyle(1.3, 0xa5f3fc, 0.9);
          e.bubbleGfx.strokeCircle(0, 0, e.isBoss ? 16 : 11);
          e.bubbleGfx.fillStyle(0xffffff, 0.75);
          e.bubbleGfx.fillCircle(-3, -4, 2);
          this.roomGroup.add(e.bubbleGfx);
        }
        e.bubbleGfx.setPosition(e.sprite.x, e.sprite.y);
        if (e.bubbledMs <= 0) {
          this.popEnemyBubble(e);
        } else {
          e.sprite.setVelocity(e.bubbleDriftVx ?? 0, e.bubbleDriftVy ?? 0);
          continue;
        }
      }

      let slowFactor = e.slowedMs > 0 ? 0.5 : 1;
      if (e.windSlowMs && e.windSlowMs > 0) {
        e.windSlowMs -= delta;
        if (e.windSlowMs <= 0) {
          e.windSlowMs = 0;
          if (e.hitFlashMs <= 0 && e.slowedMs <= 0 && (!e.frostSlowMs || e.frostSlowMs <= 0)) {
            e.sprite.clearTint();
            if (e.isElite) e.sprite.setTint(0xffd275);
          }
        } else {
          slowFactor *= 0.35;
          if (e.hitFlashMs <= 0 && e.windupMs <= 0 && e.slowedMs <= 0) {
            e.sprite.setTint(0x7dd3fc);
          }
        }
      }
      if (e.frostSlowMs && e.frostSlowMs > 0) {
        e.frostSlowMs -= delta;
        if (e.frostSlowMs <= 0) {
          e.frostSlowMs = 0;
          if (e.hitFlashMs <= 0 && e.slowedMs <= 0) {
            e.sprite.clearTint();
            if (e.isElite) e.sprite.setTint(0xffd275);
          }
        } else {
          slowFactor *= 0.5;
          if (e.hitFlashMs <= 0 && e.windupMs <= 0 && e.slowedMs <= 0) {
            e.sprite.setTint(0x7dd3fc);
          }
        }
      }
      if (e.slowedMs > 0) {
        e.slowedMs -= delta;
        if (e.slowedMs <= 0) {
          e.slowedMs = 0;
          e.slowFxMs = 0;
          if (e.hitFlashMs <= 0) {
            e.sprite.clearTint();
            if (e.isElite) e.sprite.setTint(0xffd275);
          }
        } else {
          if (e.hitFlashMs <= 0 && e.windupMs <= 0) {
            e.sprite.setTint(0x55ff88);
          }
          const body = e.sprite.body as Phaser.Physics.Arcade.Body | null;
          const isMoving =
            e.dashingMs > 0 || (body !== null && (Math.abs(body.velocity.x) > 4 || Math.abs(body.velocity.y) > 4));
          if (isMoving) {
            e.slowFxMs = (e.slowFxMs ?? 0) + delta;
            if (e.slowFxMs >= 140) {
              e.slowFxMs = 0;
              this.spawnSlimeDropParticle(e.sprite.x, e.sprite.y);
            }
          }
        }
      }

      e.sprite.setFrame(Math.floor(time / 280) % 2);

      const dist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, px, py);
      const angle = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, px, py);

      // Contact damage against local player(s)
      const hitDist = e.isBoss ? 20 : 12;
      if (localCoopSession.active && this.localPlayers.length > 0) {
        for (const lp of this.localPlayers) {
          if (lp.state.downed) continue;
          const lpDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, lp.sprite.x, lp.sprite.y);
          if (lpDist < hitDist && !StatusEffectManager.has(lp.state.statusEffects, 'giant')) {
            this.withLocalPlayer(lp, () => {
              if (e.defId === 'mycelium_mite' && this.invulnMs <= 0 && this.dodgeMs <= 0 && !this.playerState.downed) {
                StatusEffectManager.addEffect(this.playerState.statusEffects, 'poisoned', 2500);
                this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x9ef01a, 4);
              }
              this.damagePlayer(e.damage);
            });
          }
        }
      } else {
        const hostDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, hostX, hostY);
        if (hostDist < hitDist && !StatusEffectManager.has(this.playerState.statusEffects, 'giant')) {
          if (e.defId === 'mycelium_mite' && this.invulnMs <= 0 && this.dodgeMs <= 0 && !this.playerState.downed) {
            StatusEffectManager.addEffect(this.playerState.statusEffects, 'poisoned', 2500);
            this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x9ef01a, 4);
          }
          this.damagePlayer(e.damage);
        }
      }

      // Contact damage against summoned skeletons
      for (const sk of [...this.summonedSkeletons]) {
        if (!sk.sprite.active || sk.hitFlashMs > 0) continue;
        const skDist = Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, sk.sprite.x, sk.sprite.y);
        if (skDist < (e.isBoss ? 18 : 11)) {
          this.damageSkeleton(sk, e.damage);
        }
      }

      // Windup / Charge telegraph
      if (e.windupMs > 0) {
        e.windupMs -= delta;
        e.sprite.setVelocity(0, 0);
        if (e.windupMs <= 0) {
          e.sprite.clearTint();
          if (e.isElite) e.sprite.setTint(0xffd275);
          if (e.defId === 'cave_crawler') {
            e.dashingMs = 260;
            e.dashVx = Math.cos(angle) * 195 * slowFactor;
            e.dashVy = Math.sin(angle) * 195 * slowFactor;
          } else if (e.defId === 'haunted_armour') {
            e.dashingMs = 340;
            e.dashVx = Math.cos(angle) * 190 * slowFactor;
            e.dashVy = Math.sin(angle) * 190 * slowFactor;
            e.dashRingOnEnd = true;
          } else if (e.defId === 'moss_hulk') {
            e.dashingMs = 360;
            e.dashVx = Math.cos(angle) * 150 * slowFactor;
            e.dashVy = Math.sin(angle) * 150 * slowFactor;
            e.dashRingOnEnd = true;
          } else if (e.defId === 'pendulum_knight') {
            e.dashingMs = 380;
            e.dashVx = Math.cos(angle) * 185 * slowFactor;
            e.dashVy = Math.sin(angle) * 185 * slowFactor;
            for (const off of [-0.35, 0.35]) {
              this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 125, e.damage, 0xffd275, false, e.uid, {
                textureKey: 'proj_needle',
                rotateToVelocity: true,
                lifeMs: 1400,
              });
            }
          } else if (e.defId === 'dread_knight') {
            e.dashingMs = 360;
            e.dashVx = Math.cos(angle) * 195 * slowFactor;
            e.dashVy = Math.sin(angle) * 195 * slowFactor;
            const rangedDmg = Math.max(1, e.damage - 2);
            for (const off of [-0.28, 0, 0.28]) {
              this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 145, rangedDmg, 0xc084fc, false, e.uid, {
                textureKey: 'proj_void_bolt',
                rotateToVelocity: true,
                lifeMs: 1500,
              });
            }
          } else {
            e.dashingMs = 340;
            e.dashVx = Math.cos(angle) * 165 * slowFactor;
            e.dashVy = Math.sin(angle) * 165 * slowFactor;
          }
        }
        continue;
      }

      if (e.dashingMs > 0) {
        e.dashingMs -= delta;
        e.sprite.setVelocity(e.dashVx, e.dashVy);
        if (e.dashingMs <= 0) {
          if (e.defId === 'hollow_stag') {
            e.sprite.setVelocity(0, 0);
            e.sprite.clearTint();
            e.idleMs = 3000;
          } else if (e.dashRingOnEnd) {
            e.dashRingOnEnd = false;
            if (e.defId === 'haunted_armour') {
              const dashA = Math.atan2(e.dashVy, e.dashVx);
              for (const off of [-Math.PI / 2, Math.PI / 2]) {
                this.createEnemyProjectile(e.sprite.x, e.sprite.y, dashA + off, 120, e.damage, 0xfbbf24, false, e.uid, {
                  textureKey: 'proj_shard',
                  rotateToVelocity: true,
                  lifeMs: 1300,
                });
              }
              this.spawnParticles(e.sprite.x, e.sprite.y, 0xfbbf24, 6);
            } else if (e.defId === 'moss_hulk') {
              this.spawnParticles(e.sprite.x, e.sprite.y, 0x66ffd9, 8);
              for (let k = 0; k < 6; k++) {
                const a = (Math.PI * 2 * k) / 6;
                this.createEnemyProjectile(e.sprite.x, e.sprite.y, a, 95, e.damage, 0x66ffd9, false, e.uid, {
                  textureKey: 'proj_spore',
                  lifeMs: 900,
                  spinSpeed: 0.2,
                });
              }
            }
          } else if (e.defId === 'cave_crawler') {
            e.idleMs = 450;
            e.sprite.setVelocity(0, 0);
          }
        }
        continue;
      }

      // Ranged telegraph windup (spore_eye, abyss_watcher)
      if (e.telegraphMs && e.telegraphMs > 0) {
        e.telegraphMs -= delta;
        e.sprite.setVelocity(0, 0);
        if (e.telegraphMs <= 0) {
          e.sprite.clearTint();
          if (e.isElite) e.sprite.setTint(0xffd275);
          if (e.defId === 'spore_eye') {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 65, e.damage, 0x34d399, false, e.uid, {
              textureKey: 'proj_spore',
              accel: 120,
              spinSpeed: 0.3,
              lifeMs: 2200,
            });
          } else if (e.defId === 'abyss_watcher') {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 185, e.damage, 0xc084fc, false, e.uid, {
              textureKey: 'proj_void_bolt',
              rotateToVelocity: true,
              lifeMs: 2200,
            });
          }
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
      } else if (e.defId === 'prism_mite') {
        // Skittering zig-zag pursuit with micro-lunge close-up
        const zig = Math.sin(time * 0.011 + e.sprite.x * 0.05) * 0.75;
        const moveA = angle + zig;
        const mult = dist < 48 ? 1.35 : 1;
        e.sprite.setVelocity(Math.cos(moveA) * spd * mult, Math.sin(moveA) * spd * mult);
      } else if (e.defId === 'copper_scarab') {
        // Dart-and-pause scuttling
        const cycle = (time + e.uid.charCodeAt(e.uid.length - 1) * 90) % 900;
        const mult = cycle < 550 ? 1.4 : 0.15;
        e.sprite.setVelocity(Math.cos(angle) * spd * mult, Math.sin(angle) * spd * mult);
      } else if (e.defId === 'clockwork_tick') {
        // Rhythmic tick-tock steps
        const cycle = time % 400;
        const mult = cycle < 180 ? 1.55 : 0.25;
        e.sprite.setVelocity(Math.cos(angle) * spd * mult, Math.sin(angle) * spd * mult);
      } else if (e.defId === 'pendulum_knight') {
        // Swings in wide pendulum arcs before charging
        const swing = Math.sin(time * 0.005) * 0.85;
        e.sprite.setVelocity(Math.cos(angle + swing) * spd * 0.8, Math.sin(angle + swing) * spd * 0.8);
        if (e.aiTimerMs <= 0 && dist < 135) {
          e.aiTimerMs = e.attackCooldownMs;
          e.windupMs = 450;
          e.sprite.setTint(0xffd275);
        }
      } else if (e.defId === 'ooze_ling') {
        e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        e.oozeTrailMs = (e.oozeTrailMs ?? 0) + delta;
        if (e.oozeTrailMs >= 1600) {
          e.oozeTrailMs = 0;
          this.spawnSlimeSplatter(e.sprite.x, e.sprite.y, true);
        }
      } else if (e.defId === 'cave_crawler') {
        if (dist < 115) {
          e.sprite.setVelocity(Math.cos(angle) * spd * 0.75, Math.sin(angle) * spd * 0.75);
          if (e.aiTimerMs <= 0) {
            e.aiTimerMs = e.attackCooldownMs;
            e.windupMs = 280;
            e.sprite.setTint(0x6ef3ff);
          }
        } else {
          e.sprite.setVelocity(0, 0);
        }
      } else if (e.defId === 'button_doll') {
        if (dist < 115) {
          e.sprite.setVelocity(Math.cos(angle) * spd * 1.1, Math.sin(angle) * spd * 1.1);
          if (e.aiTimerMs <= 0 && dist > 38) {
            e.aiTimerMs = e.attackCooldownMs;
            this.spawnParticles(e.sprite.x, e.sprite.y, 0xc084fc, 5);
            const flankA = angle + (Math.random() < 0.5 ? 0.9 : -0.9);
            const bx = Phaser.Math.Clamp(e.sprite.x + Math.cos(flankA) * 32, 22, Math.max(22, this.roomWidthPx - 22));
            const by = Phaser.Math.Clamp(e.sprite.y + Math.sin(flankA) * 32, 22, Math.max(22, this.roomHeightPx - 22));
            e.sprite.setPosition(bx, by);
            this.spawnParticles(bx, by, 0xffd275, 5);
          }
        } else {
          e.sprite.setVelocity(0, 0);
        }
      } else if (e.defId === 'night_weaver') {
        if (dist < 130) {
          const strafeA = dist < 60 ? angle + Math.PI : angle + (Math.sin(time * 0.004) > 0 ? 1.15 : -1.15);
          e.sprite.setVelocity(Math.cos(strafeA) * spd, Math.sin(strafeA) * spd);
          if (e.aiTimerMs <= 0) {
            e.aiTimerMs = e.attackCooldownMs;
            for (const off of [-0.26, 0, 0.26]) {
              this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 125, e.damage, 0xc084fc, false, e.uid, {
                textureKey: 'proj_needle',
                rotateToVelocity: true,
                inflictEffect: 'sluggish',
                inflictDurationMs: 2500,
                lifeMs: 1700,
              });
            }
          }
        } else {
          e.sprite.setVelocity(0, 0);
        }
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
          e.windupMs = e.defId === 'moss_hulk' ? 500 : e.defId === 'haunted_armour' || e.defId === 'dread_knight' ? 450 : 420;
          e.sprite.setTint(e.defId === 'dread_knight' ? 0xc084fc : e.defId === 'moss_hulk' ? 0x66ffd9 : 0xffe066);
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

      // Multi-shot burst follow-ups (wisp_bat, velvet_moth)
      if (e.attackBurstLeft && e.attackBurstLeft > 0) {
        e.attackBurstTimerMs = (e.attackBurstTimerMs ?? 0) - delta;
        if (e.attackBurstTimerMs <= 0) {
          e.attackBurstLeft--;
          e.attackBurstTimerMs = e.defId === 'velvet_moth' ? 130 : 160;
          const isVelvet = e.defId === 'velvet_moth';
          const spread = isVelvet ? (e.attackBurstLeft - 0.5) * 0.14 : 0;
          this.createEnemyProjectile(
            e.sprite.x,
            e.sprite.y,
            angle + spread,
            isVelvet ? 135 : 145,
            e.damage,
            isVelvet ? 0xf49ac1 : 0x6ef3ff,
            false,
            e.uid,
            {
              textureKey: 'proj_needle',
              rotateToVelocity: true,
              lifeMs: 1800,
            }
          );
        }
      }

      // Shielded heavy special attacks (shard_golem, brass_sentinel, gear_golem)
      if (!e.isBoss && e.aiTimerMs <= 0 && (e.defId === 'shard_golem' || e.defId === 'brass_sentinel' || e.defId === 'gear_golem')) {
        e.aiTimerMs = e.attackCooldownMs;
        e.attackPhase = (e.attackPhase ?? 0) + 1;
        if (e.defId === 'shard_golem') {
          const baseA = (e.attackPhase % 2) * (Math.PI / 4);
          this.spawnParticles(e.sprite.x, e.sprite.y, 0x7dd3fc, 5);
          for (let k = 0; k < 4; k++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, baseA + (Math.PI / 2) * k, 95, e.damage, 0x7dd3fc, false, e.uid, {
              textureKey: 'proj_shard',
              scale: 1.2,
              rotateToVelocity: true,
              lifeMs: 1900,
            });
          }
        } else if (e.defId === 'brass_sentinel') {
          const perp = angle + Math.PI / 2;
          for (const off of [-5, 5]) {
            this.createEnemyProjectile(
              e.sprite.x + Math.cos(perp) * off,
              e.sprite.y + Math.sin(perp) * off,
              angle,
              125,
              e.damage,
              0xffd275,
              false,
              e.uid,
              {
                textureKey: 'proj_gear',
                spinSpeed: 0.5,
                lifeMs: 2000,
              }
            );
          }
        } else if (e.defId === 'gear_golem') {
          const baseA = e.attackPhase * (Math.PI / 4);
          for (let k = 0; k < 4; k++) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, baseA + (Math.PI / 2) * k, 105, e.damage, 0xffd275, false, e.uid, {
              textureKey: 'proj_gear',
              scale: 1.2,
              spinSpeed: 0.55,
              lifeMs: 2000,
            });
          }
        }
      }

      // Ranged / Spore attacks
      const def = ENEMIES[e.defId];
      if (def?.projectileColor && e.aiTimerMs <= 0) {
        e.aiTimerMs = e.attackCooldownMs;
        if (e.defId === 'slimelet' || e.defId === 'acid_blob' || e.defId === 'ooze_ling') {
          SoundSystem.playSlimeJump();
        }
        if (e.defId === 'tiny_moth' || e.defId === 'glimmer_eye' || e.defId === 'puffcap') {
          if (e.defId === 'puffcap') SoundSystem.playSporePoof();
          // Level 1 & Level 1 Elite Pool: keep original behavior untouched
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 115, e.damage, def.projectileColor, false, e.uid);
        } else if (e.defId === 'wisp_bat') {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 145, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_needle',
            rotateToVelocity: true,
            lifeMs: 1800,
          });
          e.attackBurstLeft = 1;
          e.attackBurstTimerMs = 160;
        } else if (e.defId === 'echo_wisp') {
          for (const off of [-0.22, 0.22]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 120, e.damage, def.projectileColor, false, e.uid, {
              textureKey: 'proj_shard',
              rotateToVelocity: true,
              bouncesLeft: 1,
              lifeMs: 2200,
            });
          }
        } else if (e.defId === 'spore_spirit') {
          SoundSystem.playSporePoof();
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 105, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_spore',
            wobbleAmp: 1.4,
            wobbleFreq: 0.012,
            spinSpeed: 0.2,
            inflictEffect: 'sluggish',
            inflictDurationMs: 2000,
          });
        } else if (e.defId === 'glow_toadstool') {
          SoundSystem.playSporePoof();
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 75, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_spore',
            scale: 1.25,
            lifeMs: 1100,
            spinSpeed: 0.18,
            sporeBurst: true,
          });
        } else if (e.defId === 'rot_moth') {
          SoundSystem.playSporePoof();
          for (const off of [-0.28, 0, 0.28]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 100, e.damage, def.projectileColor, false, e.uid, {
              textureKey: 'proj_spore',
              spinSpeed: 0.25,
              inflictEffect: 'poisoned',
              inflictDurationMs: 3000,
              lifeMs: 1800,
            });
          }
        } else if (e.defId === 'spore_eye') {
          e.telegraphMs = 280;
          e.sprite.setTint(0x34d399);
        } else if (e.defId === 'corrupted_flower') {
          e.attackPhase = (e.attackPhase ?? 0) + 1;
          if (e.attackPhase % 2 === 1) {
            for (let k = 0; k < 5; k++) {
              const a = angle + (Math.PI * 2 * k) / 5;
              this.createEnemyProjectile(e.sprite.x, e.sprite.y, a, 100, e.damage, def.projectileColor, false, e.uid, {
                textureKey: 'proj_glob',
                spinSpeed: 0.3,
                lifeMs: 2000,
              });
            }
          } else {
            for (const off of [-0.25, 0, 0.25]) {
              this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 120, e.damage, def.projectileColor, false, e.uid, {
                textureKey: 'proj_glob',
                spinSpeed: 0.35,
                lifeMs: 2000,
              });
            }
          }
        } else if (e.defId === 'acid_blob') {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 105, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_glob',
            scale: 1.15,
            spinSpeed: 0.3,
            slimeSplatter: true,
            lifeMs: 1700,
          });
        } else if (e.defId === 'brine_wraith') {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 95, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_glob',
            homing: true,
            spinSpeed: 0.35,
            inflictEffect: 'fragile',
            inflictDurationMs: 3000,
            lifeMs: 2400,
          });
        } else if (e.defId === 'porcelain_mask') {
          for (const off of [-0.22, 0.22]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 125, e.damage, def.projectileColor, false, e.uid, {
              textureKey: 'proj_gear',
              bouncesLeft: 1,
              spinSpeed: 0.5,
              lifeMs: 2100,
            });
          }
        } else if (e.defId === 'velvet_moth') {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 135, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_needle',
            rotateToVelocity: true,
            lifeMs: 1800,
          });
          e.attackBurstLeft = 2;
          e.attackBurstTimerMs = 130;
        } else if (e.defId === 'voidling') {
          for (const off of [-0.24, 0, 0.24]) {
            this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle + off, 125, e.damage, def.projectileColor, true, e.uid, {
              textureKey: 'proj_void_bolt',
              rotateToVelocity: true,
              lifeMs: 2000,
            });
          }
        } else if (e.defId === 'shadow_mote') {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle - 0.3, 115, e.damage, def.projectileColor, false, e.uid, {
            textureKey: 'proj_shadow_wisp',
            curveRate: 0.55,
            spinSpeed: 0.45,
            inflictEffect: 'blinded',
            inflictDurationMs: 2000,
            lifeMs: 2200,
          });
        } else if (e.defId === 'abyss_watcher') {
          e.telegraphMs = 350;
          e.sprite.setTint(0xc084fc);
        } else {
          this.createEnemyProjectile(e.sprite.x, e.sprite.y, angle, 115, e.damage, def.projectileColor, false, e.uid);
        }
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

  private countClearedLevel7Chambers(): number {
    if (this.levelIndex !== 6) return 0;
    let count = 0;
    for (const gx of [1, 2, 3, 4]) {
      for (const gy of [0, 2]) {
        const r = this.floor.rooms[gy]?.[gx];
        if (r && r.visited && r.cleared) count++;
      }
    }
    return count;
  }

  private areAllLevel7ChambersCleared(): boolean {
    if (this.levelIndex !== 6) return false;
    if (
      this.playerState.name === 'ADMIN' ||
      this.playerState.name === 'ADMIN2' ||
      net.localName === 'ADMIN' ||
      net.localName === 'ADMIN2'
    ) {
      return true;
    }
    return this.countClearedLevel7Chambers() >= 8;
  }

  private areAllPlayersInBossRoom(): boolean {
    if (net.mode === 'solo') return true;
    const bossGx = this.currentRoom.gx;
    const bossGy = this.currentRoom.gy;
    for (const peerId of net.players.keys()) {
      if (peerId === this.playerState.id) continue;
      const st = this.remotePlayers.get(peerId);
      if (!st) return false;
      if (!st.downed && (st.gx !== bossGx || st.gy !== bossGy)) return false;
    }
    return true;
  }

  private updateLevel7Events(delta: number): void {
    if (this.levelIndex !== 6) return;
    if (this.nyarWaitToastCooldownMs > 0) {
      this.nyarWaitToastCooldownMs = Math.max(0, this.nyarWaitToastCooldownMs - delta);
    }

    // Hallway mystery whispers as any alive player walks further right
    if (this.currentRoom.gx === 0 && this.currentRoom.gy === 1) {
      const px =
        localCoopSession.active && this.localPlayers.length > 0
          ? Math.max(
              ...this.localPlayers.filter((lp) => !lp.state.downed).map((lp) => lp.sprite.x),
              this.playerSprite.x
            )
          : this.playerSprite.x;
      if (px > 140 && this.l7WhisperStep < 1) {
        this.l7WhisperStep = 1;
        SoundSystem.playBossAwaken();
        this.ui.showToast('Something ancient shifts behind the far gate...', '#b8a1ff');
      } else if (px > 290 && this.l7WhisperStep < 2) {
        this.l7WhisperStep = 2;
        this.ui.showToast('Hundreds of unseen eyes follow your steps...', '#ff8c1a');
      } else if (px > 440 && this.l7WhisperStep < 3) {
        this.l7WhisperStep = 3;
        this.ui.showToast('The Crawling Chaos waits in the dark...', '#ff47b6');
      }
      return;
    }

    // Trigger Nyarlathotep summoning when entering the empty boss arena
    if (
      this.currentRoom.type === 'boss' &&
      this.nyarlathotepSummonPending &&
      !this.nyarlathotepSummoning &&
      !this.currentRoom.bossDefeated
    ) {
      const localTriggered =
        localCoopSession.active && this.localPlayers.length > 0
          ? this.localPlayers.some((lp) => !lp.state.downed && lp.sprite.x >= 68)
          : !this.playerState.downed && this.playerSprite.x >= 68;
      const remoteTriggered =
        net.mode !== 'solo' &&
        Array.from(this.remotePlayers.values()).some(
          (p) =>
            !p.downed &&
            p.gx === this.currentRoom.gx &&
            p.gy === this.currentRoom.gy &&
            p.x >= 68
        );

      if (localTriggered || remoteTriggered) {
        if (this.areAllPlayersInBossRoom()) {
          this.startNyarlathotepSummon(true);
        } else if (localTriggered && this.nyarWaitToastCooldownMs <= 0) {
          this.nyarWaitToastCooldownMs = 3000;
          this.ui.showToast('Waiting for teammates in Boss Room!', '#ffe066');
        }
      }
    }
  }

  private getNyarHistory(): { fought: number; beaten: number } {
    try {
      const raw = localStorage.getItem('glimmerdeep_nyar_history_v1');
      if (!raw) return { fought: 0, beaten: 0 };
      const parsed = JSON.parse(raw) as { fought?: number; beaten?: number };
      return {
        fought: typeof parsed.fought === 'number' ? parsed.fought : 0,
        beaten: typeof parsed.beaten === 'number' ? parsed.beaten : 0,
      };
    } catch {
      return { fought: 0, beaten: 0 };
    }
  }

  private saveNyarHistory(history: { fought: number; beaten: number }): void {
    try {
      localStorage.setItem('glimmerdeep_nyar_history_v1', JSON.stringify(history));
      steamSystem.scheduleCloudSync();
    } catch {
      // ignore storage errors
    }
  }

  private recordNyarVictory(): void {
    const cur = this.getNyarHistory();
    this.saveNyarHistory({ fought: Math.max(1, cur.fought), beaten: cur.beaten + 1 });
  }

  private buildNyarDialogue(prev: { fought: number; beaten: number }): { opening: string; taunts: string[] } {
    const name = (localCoopSession.active ? net.localName : this.playerState.name) || 'Wanderer';
    const playerCount = localCoopSession.active
      ? Math.max(1, this.localPlayers.length)
      : net.mode === 'solo'
        ? 1
        : Math.max(1, net.players.size);
    const isSolo = playerCount === 1;

    let opening = isSolo
      ? `You walked so far into the dark, ${name}, only to find me waiting.`
      : `How comforting it must feel to bring others into the dark with you.`;
    if (prev.beaten > 0) {
      opening =
        prev.beaten === 1
          ? `You thought ending a shadow meant you were free of me, ${name}?`
          : `You keep tearing open the same wound, expecting the dark to let you go.`;
    } else if (prev.fought > 0) {
      opening =
        prev.fought === 1
          ? `I still remember the way you broke the last time you stood here, ${name}.`
          : `The enjoyment of seeing you die so many times never truly dulls, ${name}.`;
    }

    const taunts = [
      `I have no reason to hate you, ${name}. Watching you suffer is simply amusing.`,
      `Every time you flinch, every time you hesitate... I taste it.`,
      `Do you feel how small you are against something older than light?`,
      `You believe you are the one choosing to be here. How adorable.`,
      `There is no grand purpose to your pain. Only my amusement.`,
      `Struggle harder, ${name}. Hope makes the breaking so much sweeter.`,
      `Let the light rain down for all the good it will do you.`,
    ];

    if (isSolo) {
      taunts.push(
        `No one else is here to hear you scream, ${name}.`,
        `You came alone into a place that devours light.`
      );
    } else {
      taunts.push(
        `Tell me, ${name}... which of your companions will you let die first?`,
        `Huddled together in the dark, pretending numbers mean safety.`
      );
    }

    if (prev.beaten > 0) {
      taunts.push(`That hollow triumph you felt before... it was mine to give, and mine to take.`);
    } else if (prev.fought > 0) {
      taunts.push(`You already know how this ends, ${name}. Why return to be broken again?`);
    }
    return { opening, taunts };
  }

  private startNyarlathotepSummon(broadcast = true): void {
    this.nyarlathotepSummonPending = false;
    this.nyarlathotepSummoning = true;
    if (broadcast && net.mode !== 'solo') {
      net.broadcastInteract({
        peerId: this.playerState.id,
        gx: this.currentRoom.gx,
        gy: this.currentRoom.gy,
        kind: 'boss_summon',
      });
    }
    this.currentRoom.doorsLocked = true;
    this.updateDoorVisuals();
    SoundSystem.playBossSpawn();
    this.cameras.main.shake(1100, 0.01);

    const prevHistory = this.getNyarHistory();
    this.saveNyarHistory({ fought: prevHistory.fought + 1, beaten: prevHistory.beaten });
    const dialogue = this.buildNyarDialogue(prevHistory);
    this.nyarDialoguePool = dialogue.taunts;
    this.nyarDialogueIdx = 0;
    this.nyarDialogueTimerMs = 6500;

    const cx = Math.round(this.roomWidthPx / 2);
    const cy = Math.round(this.roomHeightPx / 2);
    const circleGfx = this.add.graphics().setDepth(7);
    this.roomGroup.add(circleGfx);

    let elapsed = 0;
    const timer = this.time.addEvent({
      delay: 50,
      repeat: 27,
      callback: () => {
        elapsed += 50;
        if (!circleGfx.active || this.currentRoom.type !== 'boss') {
          timer.remove();
          return;
        }
        const t = Math.min(1, elapsed / 1400);
        circleGfx.clear();
        circleGfx.lineStyle(2.5, 0x7e22ce, 0.8 * t);
        circleGfx.strokeCircle(cx, cy, 42 * t);
        circleGfx.lineStyle(1.8, 0xff8c1a, 0.9 * t);
        circleGfx.strokeCircle(cx, cy, 26 * (1 - t * 0.35));
        for (let i = 0; i < 6; i++) {
          const a = t * Math.PI * 3 + (Math.PI * 2 * i) / 6;
          circleGfx.fillStyle(0xff8c1a, 0.9);
          circleGfx.fillCircle(cx + Math.cos(a) * 34 * t, cy + Math.sin(a) * 34 * t, 2.5);
        }
        this.spawnParticles(cx + Phaser.Math.Between(-24, 24), cy + Phaser.Math.Between(-24, 24), 0x7e22ce, 1);

        if (elapsed >= 1400) {
          circleGfx.destroy();
          this.nyarlathotepSummoning = false;
          const bossDef = BOSSES.nyarlathotep;
          const playerScale = 1 + Math.max(0, net.players.size - 1) * 0.45;
          const bHp = Math.round(bossDef.hp * playerScale);
          this.spawnEnemyEntity('boss', 'nyarlathotep', cx, cy, bHp, bHp, false, true);
          const spawned = this.activeEnemies.find((e) => e.defId === 'nyarlathotep');
          if (spawned) {
            spawned.sprite.setScale(2.1);
            spawned.sprite.setDepth(9);
          }
          this.cameras.main.shake(450, 0.018);
          this.spawnParticles(cx, cy, 0xff8c1a, 24);
          this.spawnParticles(cx, cy, 0x7e22ce, 20);
          SoundSystem.playExplosion();
          SoundSystem.setMusicTrack('nyar_boss');
          SoundSystem.startBossEvilLaughLoop();
          this.ui.showToast(dialogue.opening, '#ff8c1a');
        }
      },
    });
  }

  private hitNyarlathotepArm(x: number, y: number, radius: number, dmg: number): boolean {
    if (this.nyarArmState !== 'extending' && this.nyarArmState !== 'holding') return false;
    const boss = this.activeEnemies.find((e) => e.sprite.active && e.defId === 'nyarlathotep');
    if (!boss) return false;
    const tipX = boss.sprite.x + Math.cos(this.nyarArmAngle) * this.nyarArmLength;
    const tipY = boss.sprite.y + Math.sin(this.nyarArmAngle) * this.nyarArmLength;
    const midX = boss.sprite.x + Math.cos(this.nyarArmAngle) * (this.nyarArmLength * 0.65);
    const midY = boss.sprite.y + Math.sin(this.nyarArmAngle) * (this.nyarArmLength * 0.65);
    if (
      Phaser.Math.Distance.Between(x, y, tipX, tipY) <= radius + 12 ||
      Phaser.Math.Distance.Between(x, y, midX, midY) <= radius + 10
    ) {
      this.damageEnemy(boss, dmg);
      if (this.nyarArmState === 'extending') {
        this.nyarArmState = 'recoiling';
        this.spawnParticles(tipX, tipY, 0xff8c1a, 8);
      }
      return true;
    }
    return false;
  }

  private updateNyarlathotepBoss(
    e: ActiveEnemy,
    angle: number,
    _dist: number,
    delta: number,
    slowFactor: number
  ): void {
    e.sprite.setScale(2.3);
    e.sprite.setAlpha(0.01); // Use procedural organic eldritch graphics instead of square sprite
    if (!this.nyarGfx || !this.nyarGfx.active) {
      this.nyarGfx = this.add.graphics().setDepth(9);
    }
    const gfx = this.nyarGfx;
    gfx.clear();

    const bx = e.sprite.x;
    const by = e.sprite.y;
    const now = this.time.now;
    const spd = e.speed * slowFactor * (e.phase === 2 ? 1.25 : 1);
    const isHit = e.hitFlashMs > 0;

    // Drift menacingly toward the player while staying near the center arena
    if (this.nyarBeamState === 'idle' && this.nyarArmState === 'idle') {
      e.sprite.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
    } else {
      e.sprite.setVelocity(0, 0);
    }

    // 1. Draw 12 whip-like undulating black tentacles radiating in every direction
    for (let t = 0; t < 12; t++) {
      const baseA = (Math.PI * 2 * t) / 12 + Math.sin(now * 0.0011 + t * 0.7) * 0.22;
      const totalLen = 44 + Math.sin(now * 0.0026 + t * 1.4) * 12;
      let prevX = bx + Math.cos(baseA) * 16;
      let prevY = by + Math.sin(baseA) * 14;
      const segs = 6;
      for (let s = 1; s <= segs; s++) {
        const frac = s / segs;
        const wave = Math.sin(now * 0.0042 + t * 1.3 - s * 0.9) * (0.45 * frac);
        const segA = baseA + wave;
        const r = 16 + totalLen * frac;
        const nx = bx + Math.cos(segA) * r;
        const ny = by + Math.sin(segA) * r;
        const thick = Math.max(1.5, (1 - frac * 0.78) * 7.5);
        gfx.lineStyle(thick + 2.5, isHit ? 0xffffff : 0x3b0764, 0.5);
        gfx.lineBetween(prevX, prevY, nx, ny);
        gfx.lineStyle(thick, isHit ? 0xffffff : 0x030206, 0.98);
        gfx.lineBetween(prevX, prevY, nx, ny);
        prevX = nx;
        prevY = ny;
      }
    }

    // 2. Wide, somewhat-humanoid gaunt shadowy arms (2 pairs) extending from broad hunched shoulders
    const shoulderY = by - 12;
    for (const side of [-1, 1]) {
      for (let armIdx = 0; armIdx < 2; armIdx++) {
        const shX = bx + side * (16 + armIdx * 4);
        const shY = shoulderY + armIdx * 9;
        const sway = Math.sin(now * 0.0025 + armIdx * 1.4 + side) * 6;
        const elbowX = shX + side * (16 + armIdx * 4);
        const elbowY = shY - 4 + sway * 0.5;
        const handX = elbowX + side * (13 + armIdx * 3);
        const handY = elbowY + 12 + sway;

        gfx.lineStyle(6.5, isHit ? 0xffffff : 0x3b0764, 0.55);
        gfx.lineBetween(shX, shY, elbowX, elbowY);
        gfx.lineBetween(elbowX, elbowY, handX, handY);
        gfx.lineStyle(4, isHit ? 0xffffff : 0x030206, 0.98);
        gfx.lineBetween(shX, shY, elbowX, elbowY);
        gfx.lineBetween(elbowX, elbowY, handX, handY);
        // Elongated shadow claws
        for (let c = -1; c <= 1; c++) {
          gfx.lineStyle(1.4, isHit ? 0xffffff : 0x6b21a8, 0.85);
          gfx.lineBetween(handX, handY, handX + side * 6 + c * 2, handY + 7 + Math.abs(c) * 2);
        }
      }
    }

    // 3. Towering broad-shouldered gaunt torso tapering into shredded void-cloak tendrils
    const col = isHit ? 0xffffff : 0x030206;
    const rim = isHit ? 0xffffff : 0x4c1d95;
    // Outer violet nightmare rim
    gfx.fillStyle(rim, 0.55);
    gfx.fillTriangle(bx - 27, shoulderY - 3, bx + 27, shoulderY - 3, bx, by + 30);
    gfx.fillEllipse(bx, shoulderY, 52, 20);
    // Inner pitch-black torso & broad shoulders
    gfx.fillStyle(col, 0.99);
    gfx.fillTriangle(bx - 24, shoulderY - 2, bx + 24, shoulderY - 2, bx, by + 27);
    gfx.fillEllipse(bx, shoulderY, 46, 17);
    // Shredded lower void-cloak tendrils
    for (let k = -3; k <= 3; k++) {
      const tx = bx + k * 5;
      const sway = Math.sin(now * 0.004 + k) * 4;
      gfx.fillStyle(col, 0.95);
      gfx.fillTriangle(tx - 3, by + 12, tx + 3, by + 12, tx + sway, by + 32 + (k % 2) * 5);
    }

    // 4. Menacing elongated eldritch head, jagged crown-horns & piercing slit eyes (no cartoon face!)
    const headX = bx + Math.sin(now * 0.0018) * 1.5;
    const headY = by - 28 + Math.cos(now * 0.0022) * 1.2;
    // Tall jagged backward-sweeping horns
    gfx.lineStyle(4, rim, 0.85);
    gfx.lineBetween(headX - 6, headY - 7, headX - 15, headY - 23);
    gfx.lineBetween(headX + 6, headY - 7, headX + 15, headY - 23);
    gfx.lineBetween(headX - 3, headY - 9, headX - 6, headY - 20);
    gfx.lineBetween(headX + 3, headY - 9, headX + 6, headY - 20);
    gfx.lineStyle(2, col, 1);
    gfx.lineBetween(headX - 6, headY - 7, headX - 15, headY - 23);
    gfx.lineBetween(headX + 6, headY - 7, headX + 15, headY - 23);

    // Narrow, tall faceless/cowl silhouette
    gfx.fillStyle(rim, 0.65);
    gfx.fillTriangle(headX - 10, headY - 6, headX + 10, headY - 6, headX, headY + 14);
    gfx.fillEllipse(headX, headY - 4, 20, 16);
    gfx.fillStyle(col, 1);
    gfx.fillTriangle(headX - 8, headY - 5, headX + 8, headY - 5, headX, headY + 12);
    gfx.fillEllipse(headX, headY - 4, 16, 13);

    // Piercing narrow slit eyes inside the cowl (no round cartoon eyes or pink mouth)
    const eyeGlow = Math.sin(now * 0.006) > -0.7 ? 0.95 : 0.35;
    gfx.fillStyle(0xff8c1a, eyeGlow);
    gfx.fillRect(headX - 5, headY - 5, 3, 1.4);
    gfx.fillRect(headX + 2, headY - 5, 3, 1.4);
    gfx.fillStyle(0xffe066, eyeGlow);
    gfx.fillRect(headX - 4, headY - 5, 1.5, 1.4);
    gfx.fillRect(headX + 2.5, headY - 5, 1.5, 1.4);
    // Third vertical fissure eye in forehead
    gfx.fillStyle(0xff47b6, 0.9);
    gfx.fillRect(headX - 0.7, headY - 9, 1.4, 3);

    // 5. Pinprick slit-eyes opening/closing across the dark shoulders & shroud
    for (let i = 0; i < 16; i++) {
      const ea = (Math.PI * 2 * i) / 16 + 0.15;
      const ex = bx + Math.cos(ea) * (10 + (i % 3) * 4);
      const ey = shoulderY + 4 + Math.sin(ea) * (6 + (i % 2) * 5);
      const open = Math.sin(now * 0.004 + i * 2.1);
      if (open > -0.45) {
        gfx.fillStyle(i % 3 === 0 ? 0xff8c1a : 0xe9d5ff, 0.85);
        gfx.fillRect(ex - 1.5, ey, 3, 1);
      }
    }

    // Searing cracked glowing orange heart in the center of the gaunt chest
    const heartPulse = 5.5 + Math.sin(now * 0.008) * 1.4;
    gfx.fillStyle(0xff6b1a, 0.35);
    gfx.fillCircle(bx, by - 2, heartPulse + 5);
    gfx.fillStyle(0xff8c1a, 0.95);
    gfx.fillCircle(bx, by - 2, heartPulse);
    gfx.fillStyle(0xffe066, 0.95);
    gfx.fillCircle(bx, by - 2, heartPulse * 0.45);

    // 5. Enormous Curving Grabbing Tentacle-Arm attack
    this.nyarArmCooldownMs = Math.max(0, this.nyarArmCooldownMs - delta);
    if (this.nyarArmState === 'idle' && this.nyarArmCooldownMs <= 0 && this.nyarBeamState === 'idle') {
      this.nyarArmState = 'extending';
      this.nyarArmAngle = angle;
      this.nyarArmLength = 24;
    } else if (this.nyarArmState === 'extending') {
      this.nyarArmAngle = Phaser.Math.Angle.RotateTo(this.nyarArmAngle, angle, 0.9 * (delta / 1000));
      this.nyarArmLength += (e.phase === 2 ? 185 : 150) * (delta / 1000);
      const tipX = bx + Math.cos(this.nyarArmAngle) * this.nyarArmLength;
      const tipY = by + Math.sin(this.nyarArmAngle) * this.nyarArmLength;
      if (
        !this.playerState.downed &&
        Phaser.Math.Distance.Between(tipX, tipY, this.playerSprite.x, this.playerSprite.y) < 15
      ) {
        this.nyarArmState = 'holding';
        this.nyarGrabbedMs = 1500;
        this.damagePlayer(1);
      } else if (this.nyarArmLength >= this.nyarArmMaxLength) {
        this.nyarArmState = 'recoiling';
      }
    } else if (this.nyarArmState === 'holding') {
      if (this.nyarGrabbedMs <= 0 || this.playerState.downed) {
        // Throw the player away
        const throwA = this.nyarArmAngle;
        this.nyarThrowVx = Math.cos(throwA) * 230;
        this.nyarThrowVy = Math.sin(throwA) * 230;
        this.nyarThrowMs = 360;
        this.damagePlayer(2);
        this.cameras.main.shake(180, 0.012);
        this.nyarArmState = 'recoiling';
      }
    } else if (this.nyarArmState === 'recoiling') {
      this.nyarArmLength -= 220 * (delta / 1000);
      if (this.nyarArmLength <= 20) {
        this.nyarArmLength = 0;
        this.nyarArmState = 'idle';
        this.nyarArmCooldownMs = e.phase === 2 ? 1750 : 2400;
      }
    }

    if (this.nyarArmState !== 'idle' && this.nyarArmLength > 0) {
      const armSegs = 6;
      const perpA = this.nyarArmAngle + Math.PI / 2;
      let prevX = bx;
      let prevY = by;
      for (let s = 1; s <= armSegs; s++) {
        const frac = s / armSegs;
        const curve = Math.sin(frac * Math.PI + now * 0.01) * 10 * (1 - frac * 0.4);
        const ax = bx + Math.cos(this.nyarArmAngle) * (this.nyarArmLength * frac) + Math.cos(perpA) * curve;
        const ay = by + Math.sin(this.nyarArmAngle) * (this.nyarArmLength * frac) + Math.sin(perpA) * curve;
        const thick = Math.max(4, (1 - frac * 0.5) * 11);
        gfx.lineStyle(thick + 3, 0x7e22ce, 0.6);
        gfx.lineBetween(prevX, prevY, ax, ay);
        gfx.lineStyle(thick, 0x05030a, 0.98);
        gfx.lineBetween(prevX, prevY, ax, ay);
        prevX = ax;
        prevY = ay;
      }
      // Grasping claw / tentacle tip
      gfx.fillStyle(0xff8c1a, 0.9);
      gfx.fillCircle(prevX, prevY, 6.5);
      gfx.fillStyle(0x05030a, 1);
      gfx.fillCircle(prevX, prevY, 3.5);
    }

    // 4. Sweeping Orange Heart Beam (blocked by the 4 Greek/Roman pillars & deflectable!)
    this.nyarBeamCooldownMs = Math.max(0, this.nyarBeamCooldownMs - delta);
    this.nyarBeamHitCooldownMs = Math.max(0, this.nyarBeamHitCooldownMs - delta);

    if (this.nyarBeamState === 'idle' && this.nyarBeamCooldownMs <= 0 && this.nyarArmState === 'idle') {
      this.nyarBeamState = 'telegraph';
      this.nyarBeamTimerMs = 580;
      this.nyarBeamSweepDir = Math.random() < 0.5 ? 1 : -1;
      this.nyarBeamAngle = angle - this.nyarBeamSweepDir * 0.68;
    } else if (this.nyarBeamState === 'telegraph') {
      this.nyarBeamTimerMs -= delta;
      const warnX = bx + Math.cos(this.nyarBeamAngle) * 260;
      const warnY = by + Math.sin(this.nyarBeamAngle) * 260;
      gfx.lineStyle(2, 0xff8c1a, 0.45);
      gfx.lineBetween(bx, by, warnX, warnY);
      if (this.nyarBeamTimerMs <= 0) {
        this.nyarBeamState = 'sweeping';
        this.nyarBeamTimerMs = 1950;
      }
    } else if (this.nyarBeamState === 'sweeping') {
      this.nyarBeamTimerMs -= delta;
      this.nyarBeamAngle += this.nyarBeamSweepDir * (e.phase === 2 ? 1.15 : 0.95) * (delta / 1000);

      // Raycast beam against walls and the 4 Greek/Roman pillars
      const cos = Math.cos(this.nyarBeamAngle);
      const sin = Math.sin(this.nyarBeamAngle);
      const maxLen = 320;
      let endX = bx + cos * maxLen;
      let endY = by + sin * maxLen;
      const walls = this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[];

      for (let d = 16; d <= maxLen; d += 4) {
        const rx = bx + cos * d;
        const ry = by + sin * d;
        if (rx < 16 || rx > this.roomWidthPx - 16 || ry < 16 || ry > this.roomHeightPx - 16) {
          endX = rx;
          endY = ry;
          break;
        }
        let blocked = false;
        for (const w of walls) {
          if (!w.active) continue;
          const hw = (w.width || 16) * 0.5;
          const hh = (w.height || 16) * 0.5;
          if (Math.abs(rx - w.x) < hw && Math.abs(ry - w.y) < hh) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          endX = rx;
          endY = ry;
          break;
        }

        if (this.nyarBeamHitCooldownMs <= 0) {
          const beamTargets =
            localCoopSession.active && this.localPlayers.length > 0
              ? this.localPlayers.filter((lp) => !lp.state.downed)
              : !this.playerState.downed
                ? [null]
                : [];
          let hitTarget: LocalPlayerActor | null | undefined = undefined;
          for (const cand of beamTargets) {
            const cx = cand ? cand.sprite.x : this.playerSprite.x;
            const cy = cand ? cand.sprite.y : this.playerSprite.y;
            if (Phaser.Math.Distance.Between(rx, ry, cx, cy) < 9) {
              hitTarget = cand;
              break;
            }
          }
          if (hitTarget !== undefined) {
            const applyBeamHit = () => {
              const activeItem = this.playerState.inventory[this.playerState.activeSlot];
              const canDeflect =
                StatusEffectManager.has(this.playerState.statusEffects, 'starward') ||
                activeItem?.id === 'starcleaver' ||
                activeItem?.id === 'astral_greatsword' ||
                hasArtifact(this.playerState.inventory, 'disco_prism') !== -1;
              this.nyarBeamHitCooldownMs = 450;
              if (canDeflect) {
                SoundSystem.playSwing();
                this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x6ef3ff, 8);
              } else {
                this.damagePlayer(2);
              }
            };
            if (hitTarget) {
              this.withLocalPlayer(hitTarget, applyBeamHit);
            } else {
              applyBeamHit();
            }
            endX = rx;
            endY = ry;
            break;
          }
        }
      }

      gfx.lineStyle(8, 0xff8c1a, 0.35);
      gfx.lineBetween(bx, by, endX, endY);
      gfx.lineStyle(4, 0xffe066, 0.9);
      gfx.lineBetween(bx, by, endX, endY);
      gfx.lineStyle(1.8, 0xffffff, 1);
      gfx.lineBetween(bx, by, endX, endY);
      gfx.fillStyle(0xff8c1a, 0.9);
      gfx.fillCircle(endX, endY, 4.5);

      if (this.nyarBeamTimerMs <= 0) {
        this.nyarBeamState = 'idle';
        this.nyarBeamCooldownMs = e.phase === 2 ? 2900 : 3900;
      }
    }

    // 6. Tear off dark chunks from its body to create eldritch spawns
    this.nyarSpawnTimerMs -= delta;
    if (this.nyarSpawnTimerMs <= 0) {
      this.nyarSpawnTimerMs = e.phase === 2 ? 7200 : 9600;
      const minionCount = this.activeEnemies.filter((m) => !m.isBoss && m.sprite.active).length;
      if (minionCount < 6) {
        const count = e.phase === 2 ? 3 : 2;
        const spawnDef = ENEMIES.eldritch_spawn;
        this.cameras.main.shake(120, 0.006);
        for (let i = 0; i < count; i++) {
          const sa = angle + (i - 0.5) * 1.1;
          const sx = Phaser.Math.Clamp(bx + Math.cos(sa) * 34, 28, this.roomWidthPx - 28);
          const sy = Phaser.Math.Clamp(by + Math.sin(sa) * 34, 28, this.roomHeightPx - 28);
          const chunk = this.add.circle(bx, by, 6, 0x05030a, 0.95).setStrokeStyle(1.5, 0x7e22ce, 0.9).setDepth(10);
          this.tweens.add({
            targets: chunk,
            x: sx,
            y: sy,
            scale: 0.7,
            duration: 240,
            ease: 'Quad.easeOut',
            onComplete: () => {
              chunk.destroy();
              if (!this.currentRoom || this.currentRoom.type !== 'boss') return;
              this.spawnEnemyEntity(
                `nyar_sp_${Date.now()}_${i}`,
                'eldritch_spawn',
                sx,
                sy,
                spawnDef.hp,
                spawnDef.hp,
                false,
                false
              );
              this.spawnParticles(sx, sy, 0x7e22ce, 8);
              this.spawnParticles(sx, sy, 0xff8c1a, 4);
            },
          });
        }
      }
    }

    // 7. Rain Common-to-Rare combat items from the sky every 7s (X = player count, max 10 uncollected items on floor)
    if (this.isRoomAuthority()) {
      this.nyarRainTimerMs -= delta;
      if (this.nyarRainTimerMs <= 0) {
        this.nyarRainTimerMs = 4000;
        let floorItemCount = this.currentRoom.loot.filter((l) => !l.collected && l.kind === 'item').length;
        const playerCount = localCoopSession.active
          ? Math.max(1, this.localPlayers.length)
          : net.mode === 'solo'
            ? 1
            : Math.max(1, net.players.size);
        const anyLowHp = localCoopSession.active
          ? this.localPlayers.some((lp) => !lp.state.downed && lp.state.hp < 8)
          : (!this.playerState.downed && this.playerState.hp < 8) ||
            Array.from(this.remotePlayers.values()).some((p) => !p.downed && p.hp < 8);
        const heartdewOnFloor = this.currentRoom.loot.some(
          (l) => !l.collected && l.kind === 'item' && l.itemId === 'heartdew_potion'
        );
        const heartdewHeld = localCoopSession.active
          ? this.localPlayers.some((lp) =>
              lp.state.inventory.some((it) => it && it.id === 'heartdew_potion' && it.uses > 0)
            )
          : this.playerState.inventory.some((it) => it && it.id === 'heartdew_potion' && it.uses > 0) ||
            Array.from(this.remotePlayers.values()).some((p) =>
              p.inventory.some((it) => it && it.id === 'heartdew_potion' && it.uses > 0)
            );
        let forceHeartdew = false;
        if (anyLowHp && !heartdewOnFloor && !heartdewHeld) {
          if (playerCount >= 2) {
            forceHeartdew = true;
          } else {
            this.nyarRainHeartAlt = !this.nyarRainHeartAlt;
            forceHeartdew = this.nyarRainHeartAlt;
          }
        } else {
          this.nyarRainHeartAlt = false;
        }

        const rng = new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
        for (let i = 0; i < playerCount && floorItemCount < 10; i++) {
          let tx = Phaser.Math.Between(36, Math.max(40, this.roomWidthPx - 36));
          let ty = Phaser.Math.Between(36, Math.max(40, this.roomHeightPx - 36));
          for (let tries = 0; tries < 8; tries++) {
            const cx = Phaser.Math.Between(36, Math.max(40, this.roomWidthPx - 36));
            const cy = Phaser.Math.Between(36, Math.max(40, this.roomHeightPx - 36));
            if (!this.isPointInSolidWall(cx, cy)) {
              tx = cx;
              ty = cy;
              break;
            }
          }
          const itemId = i === 0 && forceHeartdew ? 'heartdew_potion' : rollBossCombatItemId(rng);
          const uid = `nyar_rain_${Date.now()}_${i}_${Math.floor(Math.random() * 9999)}`;
          floorItemCount++;

          const shadow = this.add.ellipse(tx, ty + 4, 10, 4, 0x05030a, 0.7).setDepth(5);
          const falling = this.add
            .image(tx, ty - 54, this.textures.exists(`item_${itemId}`) ? `item_${itemId}` : 'item_shard')
            .setDepth(14);
          this.tweens.add({
            targets: falling,
            y: ty,
            duration: 360,
            ease: 'Quad.easeIn',
            onComplete: () => {
              shadow.destroy();
              falling.destroy();
              if (!this.currentRoom || this.currentRoom.type !== 'boss' || this.currentRoom.bossDefeated) return;
              this.spawnParticles(tx, ty, 0x6ef3ff, 5);
              this.spawnRoomLoot(uid, 'item', tx, ty, itemId, undefined, undefined, true);
            },
          });
        }
      }
    }

    // 8. Eerie 4th-wall-breaking taunts from Nyarlathotep
    this.nyarDialogueTimerMs -= delta;
    if (this.nyarDialogueTimerMs <= 0 && this.nyarDialoguePool.length > 0) {
      this.nyarDialogueTimerMs = 8500;
      const line = this.nyarDialoguePool[this.nyarDialogueIdx % this.nyarDialoguePool.length];
      this.nyarDialogueIdx++;
      this.ui.showToast(line, '#ff47b6');
    }
  }

  private updateBossAI(e: ActiveEnemy, angle: number, dist: number, delta: number, slowFactor: number): void {
    if (e.defId === 'nyarlathotep') {
      this.updateNyarlathotepBoss(e, angle, dist, delta, slowFactor);
      return;
    }
    const bossDef = BOSSES[e.defId];
    if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
      e.phase = 2;
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
        e.aiTimerMs = e.phase === 2 ? 3250 : 4250;
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
          // 2-way burst aimed at player
          for (const off of [-0.2, 0.2]) {
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
        e.aiTimerMs = e.phase === 2 ? 2600 : 3500;
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

    // Floor 4: The Sludge Empress — slow crawl, lunging jumps & mini slime swarms (no shooting)
    if (e.defId === 'sludge_empress') {
      e.sprite.setVelocity(Math.cos(angle) * spd * 0.3, Math.sin(angle) * spd * 0.3);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 1400 : 1850;
        const minionCount = this.activeEnemies.filter((m) => !m.isBoss && m.sprite.active).length;
        if (step % 3 === 1 && minionCount < 5) {
          const count = e.phase === 2 ? 2 : 1;
          const addDef = ENEMIES.ooze_ling;
          for (let i = 0; i < count; i++) {
            const sa = angle + (i === 0 ? -0.6 : 0.6);
            const sx = Phaser.Math.Clamp(e.sprite.x + Math.cos(sa) * 22, 26, this.roomWidthPx - 26);
            const sy = Phaser.Math.Clamp(e.sprite.y + Math.sin(sa) * 22, 26, this.roomHeightPx - 26);
            this.spawnEnemyEntity(`boss_add_${Date.now()}_${step}_${i}`, 'ooze_ling', sx, sy, addDef.hp, addDef.hp, false, false);
            this.spawnParticles(sx, sy, bossDef.accentColor, 6);
          }
        } else {
          // Jump / lunge attack at the player
          e.windupMs = 260;
          e.sprite.setTint(0xa6ff4d);
        }
      }
      return;
    }

    // Floor 5: The Clockwork Witch — very slow movement, corner teleports & 45-degree sweeping laser
    if (e.defId === 'clockwork_witch') {
      if (!this.witchGfx || !this.witchGfx.active) {
        this.witchGfx = this.add.graphics().setDepth(11);
      }
      this.witchGfx.clear();
      this.witchLaserHitCooldownMs = Math.max(0, this.witchLaserHitCooldownMs - delta);

      const bx = e.sprite.x;
      const by = e.sprite.y;

      if (this.witchLaserState === 'telegraph') {
        e.sprite.setVelocity(0, 0);
        this.witchLaserTimerMs -= delta;
        const wx = bx + Math.cos(this.witchLaserAngle) * 200;
        const wy = by + Math.sin(this.witchLaserAngle) * 200;
        this.witchGfx.lineStyle(1.5, 0xffd275, 0.55);
        this.witchGfx.lineBetween(bx, by, wx, wy);
        if (this.witchLaserTimerMs <= 0) {
          this.witchLaserState = 'sweeping';
          this.witchLaserTimerMs = e.phase === 2 ? 1900 : 2300;
        }
        return;
      }

      if (this.witchLaserState === 'sweeping') {
        e.sprite.setVelocity(0, 0);
        this.witchLaserTimerMs -= delta;
        const totalDuration = e.phase === 2 ? 1900 : 2300;
        const angularSpeed = (Math.PI / 4) / (totalDuration / 1000); // 45-degree arc
        this.witchLaserAngle += this.witchLaserSweepDir * angularSpeed * (delta / 1000);

        const cos = Math.cos(this.witchLaserAngle);
        const sin = Math.sin(this.witchLaserAngle);
        let endX = bx + cos * 220;
        let endY = by + sin * 220;
        const walls = this.wallGroup.getChildren() as Phaser.GameObjects.Rectangle[];

        for (let d = 10; d <= 220; d += 3) {
          const rx = bx + cos * d;
          const ry = by + sin * d;
          if (rx < 16 || rx > this.roomWidthPx - 16 || ry < 16 || ry > this.roomHeightPx - 16) {
            endX = rx;
            endY = ry;
            break;
          }
          let hitWall = false;
          for (const w of walls) {
            if (!w.active) continue;
            if (Math.abs(rx - w.x) < 8 && Math.abs(ry - w.y) < 8) {
              hitWall = true;
              break;
            }
          }
          if (hitWall) {
            endX = rx;
            endY = ry;
            break;
          }
          if (this.witchLaserHitCooldownMs <= 0) {
            const laserTargets =
              localCoopSession.active && this.localPlayers.length > 0
                ? this.localPlayers.filter((lp) => !lp.state.downed)
                : !this.playerState.downed
                  ? [null]
                  : [];
            let hitLaserTarget: LocalPlayerActor | null | undefined = undefined;
            for (const cand of laserTargets) {
              const cx = cand ? cand.sprite.x : this.playerSprite.x;
              const cy = cand ? cand.sprite.y : this.playerSprite.y;
              if (Phaser.Math.Distance.Between(rx, ry, cx, cy) < 9) {
                hitLaserTarget = cand;
                break;
              }
            }
            if (hitLaserTarget !== undefined) {
              this.witchLaserHitCooldownMs = 450;
              if (hitLaserTarget) {
                this.withLocalPlayer(hitLaserTarget, () => this.damagePlayer(e.damage));
              } else {
                this.damagePlayer(e.damage);
              }
              endX = rx;
              endY = ry;
              break;
            }
          }
        }

        this.witchGfx.lineStyle(6, 0xffd275, 0.35);
        this.witchGfx.lineBetween(bx, by, endX, endY);
        this.witchGfx.lineStyle(3, 0xffe066, 0.9);
        this.witchGfx.lineBetween(bx, by, endX, endY);
        this.witchGfx.lineStyle(1.3, 0xffffff, 1);
        this.witchGfx.lineBetween(bx, by, endX, endY);
        this.witchGfx.fillStyle(0xffe066, 0.9);
        this.witchGfx.fillCircle(endX, endY, 3);

        if (this.witchLaserTimerMs <= 0) {
          this.witchLaserState = 'idle';
          e.aiTimerMs = e.phase === 2 ? 1500 : 2100;
        }
        return;
      }

      e.sprite.setVelocity(Math.cos(angle) * spd * 0.22, Math.sin(angle) * spd * 0.22);
      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        if (step % 3 === 0) {
          // Blink to another corner away from the player
          this.spawnParticles(e.sprite.x, e.sprite.y, bossDef.accentColor, 10);
          const nx = this.playerSprite.x < 88 ? Phaser.Math.Between(108, 144) : Phaser.Math.Between(32, 68);
          const ny = this.playerSprite.y < 88 ? Phaser.Math.Between(108, 144) : Phaser.Math.Between(32, 68);
          e.sprite.setPosition(nx, ny);
          this.spawnParticles(nx, ny, bossDef.accentColor, 10);
        }
        const aimToPlayer = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, this.playerSprite.x, this.playerSprite.y);
        this.witchLaserSweepDir = Math.random() < 0.5 ? 1 : -1;
        this.witchLaserAngle = aimToPlayer - this.witchLaserSweepDir * (Math.PI / 8); // Start -22.5 deg for a 45-deg sweep
        this.witchLaserState = 'telegraph';
        this.witchLaserTimerMs = 450;
      }
      return;
    }

    // Floor 6: The Withered Everheart — slow pulsing heart with thorn eruptions, heartbeat shockwaves & life-drain tether
    if (e.defId === 'withered_everheart') {
      if (!this.everheartGfx || !this.everheartGfx.active) {
        this.everheartGfx = this.add.graphics().setDepth(8);
      }
      const gfx = this.everheartGfx;
      gfx.clear();

      const bx = e.sprite.x;
      const by = e.sprite.y;
      e.sprite.setVelocity(Math.cos(angle) * spd * 0.65, Math.sin(angle) * spd * 0.65);

      // Update & draw thorn eruptions underfoot
      for (let i = this.everheartThorns.length - 1; i >= 0; i--) {
        const th = this.everheartThorns[i];
        th.timerMs -= delta;
        if (!th.erupted) {
          gfx.lineStyle(1.5, 0xff47b6, 0.75);
          gfx.strokeCircle(th.x, th.y, 14);
          gfx.fillStyle(0xff47b6, 0.18);
          gfx.fillCircle(th.x, th.y, 14 * (1 - Math.max(0, th.timerMs) / 700));
          if (th.timerMs <= 0) {
            th.erupted = true;
            th.timerMs = 450;
            this.spawnParticles(th.x, th.y, 0xff47b6, 8);
            SoundSystem.playHit();
          }
        } else {
          const fade = Math.max(0, th.timerMs / 450);
          gfx.fillStyle(0x4c1d95, 0.75 * fade);
          gfx.fillCircle(th.x, th.y, 14);
          gfx.lineStyle(2, 0xff47b6, 0.9 * fade);
          gfx.strokeCircle(th.x, th.y, 14);
          if (!th.hit) {
            if (localCoopSession.active && this.localPlayers.length > 0) {
              for (const lp of this.localPlayers) {
                if (!lp.state.downed && Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, th.x, th.y) <= 14) {
                  th.hit = true;
                  this.withLocalPlayer(lp, () => this.damagePlayer(e.damage));
                }
              }
            } else if (!this.playerState.downed && Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, th.x, th.y) <= 14) {
              th.hit = true;
              this.damagePlayer(e.damage);
            }
          }
          if (th.timerMs <= 0) {
            this.everheartThorns.splice(i, 1);
          }
        }
      }

      // Update & draw expanding heartbeat shockwave rings
      for (let i = this.everheartPulses.length - 1; i >= 0; i--) {
        const pulse = this.everheartPulses[i];
        pulse.radius += (e.phase === 2 ? 86 : 72) * (delta / 1000);
        const alpha = Math.max(0, 1 - pulse.radius / pulse.maxRadius);
        gfx.lineStyle(3, 0xff47b6, alpha * 0.85);
        gfx.strokeCircle(pulse.x, pulse.y, pulse.radius);
        gfx.lineStyle(1.2, 0xffffff, alpha * 0.7);
        gfx.strokeCircle(pulse.x, pulse.y, pulse.radius);

        if (!pulse.hit) {
          if (localCoopSession.active && this.localPlayers.length > 0) {
            for (const lp of this.localPlayers) {
              if (lp.state.downed || lp.dodgeMs > 0) continue;
              const pd = Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, pulse.x, pulse.y);
              if (Math.abs(pd - pulse.radius) < 6) {
                pulse.hit = true;
                this.withLocalPlayer(lp, () => this.damagePlayer(Math.max(1, e.damage - 1)));
              }
            }
          } else if (!this.playerState.downed && this.dodgeMs <= 0) {
            const pd = Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, pulse.x, pulse.y);
            if (Math.abs(pd - pulse.radius) < 6) {
              pulse.hit = true;
              this.damagePlayer(Math.max(1, e.damage - 1));
            }
          }
        }
        if (pulse.radius >= pulse.maxRadius) {
          this.everheartPulses.splice(i, 1);
        }
      }

      // Update & draw life-drain tether (breakable by moving > 82px away)
      if (this.everheartTetherMs > 0) {
        this.everheartTetherMs -= delta;
        const tetherDist = Phaser.Math.Distance.Between(bx, by, this.playerSprite.x, this.playerSprite.y);
        if (this.playerState.downed || tetherDist > 82) {
          this.everheartTetherMs = 0;
          if (tetherDist > 82) {
            this.ui.showToast('Snapped the Everheart tether!', '#66ffd9');
          }
        } else {
          gfx.lineStyle(3, 0x7e22ce, 0.55);
          gfx.lineBetween(bx, by, this.playerSprite.x, this.playerSprite.y);
          gfx.lineStyle(1.5, 0xff47b6, 0.95);
          gfx.lineBetween(bx, by, this.playerSprite.x, this.playerSprite.y);
          if (this.everheartTetherMs <= 0) {
            this.damagePlayer(2);
            e.hp = Math.min(e.maxHp, e.hp + 4);
            this.spawnParticles(bx, by, 0xff47b6, 10);
            this.ui.showToast('Everheart drained your vitality!', '#ff47b6');
          }
        }
      }

      if (e.aiTimerMs <= 0) {
        e.bossStep = step + 1;
        e.aiTimerMs = e.phase === 2 ? 5000 : 5800;
        const mode = step % 3;
        if (mode === 0) {
          // Corrupted root eruptions beneath the player + flanking spots
          this.everheartThorns.push({
            x: Phaser.Math.Clamp(this.playerSprite.x, 26, 150),
            y: Phaser.Math.Clamp(this.playerSprite.y, 26, 150),
            timerMs: 850,
            erupted: false,
            hit: false,
          });
          const extra = e.phase === 2 ? 3 : 2;
          for (let k = 0; k < extra; k++) {
            const ta = (Math.PI * 2 * k) / extra + Math.random() * 0.8;
            this.everheartThorns.push({
              x: Phaser.Math.Clamp(this.playerSprite.x + Math.cos(ta) * 34, 26, 150),
              y: Phaser.Math.Clamp(this.playerSprite.y + Math.sin(ta) * 34, 26, 150),
              timerMs: 850,
              erupted: false,
              hit: false,
            });
          }
        } else if (mode === 1) {
          // Lub-dub heartbeat shockwave pulse (2 spaced rings, dodgeable or outrangeable)
          this.everheartPulses.push({ x: bx, y: by, radius: 14, maxRadius: 96, hit: false });
          this.time.delayedCall(520, () => {
            if (e.sprite.active && this.currentRoom.type === 'boss') {
              this.everheartPulses.push({ x: e.sprite.x, y: e.sprite.y, radius: 14, maxRadius: 96, hit: false });
            }
          });
        } else {
          // Withering life-drain tether (if in range) or shadow mote summon
          if (dist <= 76 && !this.playerState.downed) {
            this.everheartTetherMs = 1800;
            this.ui.showToast('Everheart tether! Move away to break!', '#ff47b6');
          } else {
            const minionCount = this.activeEnemies.filter((m) => !m.isBoss && m.sprite.active).length;
            if (minionCount < 2) {
              const sx = Phaser.Math.Clamp(bx + (Math.random() < 0.5 ? -24 : 24), 28, 148);
              const sy = Phaser.Math.Clamp(by + (Math.random() < 0.5 ? -20 : 20), 28, 148);
              const addDef = ENEMIES.shadow_mote;
              this.spawnEnemyEntity(`boss_add_${Date.now()}_${step}`, 'shadow_mote', sx, sy, addDef.hp, addDef.hp, false, false);
              this.spawnParticles(sx, sy, bossDef.accentColor, 8);
            } else {
              this.everheartPulses.push({ x: bx, y: by, radius: 14, maxRadius: 96, hit: false });
            }
          }
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

  private tryEnemyProjectileHitLocal(p: ActiveProjectile): boolean {
    const tryHitActivePlayer = (): 'reflect' | 'hit' | 'miss' => {
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
        return 'reflect';
      }
      if (distToPlayer < 10) {
        if (p.shooterUid) {
          const shooter = this.activeEnemies.find((e) => e.uid === p.shooterUid);
          if (shooter) shooter.blockedShots = 0;
        }
        if (p.burns) {
          StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', 3000);
        }
        if (p.inflictEffect) {
          StatusEffectManager.addEffect(this.playerState.statusEffects, p.inflictEffect, p.inflictDurationMs ?? 2500);
        }
        if (p.slimeSplatter) {
          this.spawnSlimeSplatter(p.sprite.x, p.sprite.y, true);
        }
        if (p.sporeBurst) {
          this.spawnEnemySporeBurst(p.sprite.x, p.sprite.y, p.damage, p.color);
        }
        this.damagePlayer(p.damage);
        return 'hit';
      }
      return 'miss';
    };

    if (localCoopSession.active && this.localPlayers.length > 0) {
      for (const lp of this.localPlayers) {
        if (lp.state.downed) continue;
        let hitOrReflect: string = 'miss';
        this.withLocalPlayer(lp, () => {
          hitOrReflect = tryHitActivePlayer();
        });
        if (hitOrReflect === 'reflect') return false;
        if (hitOrReflect === 'hit') return true;
      }
      return false;
    }

    if (this.playerState.downed) return false;
    return tryHitActivePlayer() === 'hit';
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifeMs -= delta;
      if (p.lifeMs <= 0 || !p.sprite.active) {
        if (p.starBomb && p.sprite.active) {
          this.triggerStarBomb(p.sprite.x, p.sprite.y);
        } else if (p.sporeBurst && p.sprite.active) {
          this.spawnEnemySporeBurst(p.sprite.x, p.sprite.y, p.damage, p.color);
        } else if (p.slimeSplatter && !p.fromPlayer && p.sprite.active) {
          this.spawnSlimeSplatter(p.sprite.x, p.sprite.y, true);
        } else if (p.bubbled && p.sprite.active) {
          this.spawnParticles(p.sprite.x, p.sprite.y, 0x6ef3ff, 4);
        } else if (p.healsAlly && !p.fromRemoteEvent && p.sprite.active) {
          this.spawnPersistentFloorItem('syringe', p.sprite.x, p.sprite.y, 1);
        }
        p.bubbleGfx?.destroy();
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.bubbled && p.bubbleGfx) {
        p.bubbleGfx.setPosition(p.sprite.x, p.sprite.y);
      }

      if (p.homing && !p.fromPlayer && !p.bubbled && this.playerSprite.active) {
        const curSpd = Math.hypot(p.vx, p.vy) || 95;
        const targetA = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, this.playerSprite.x, this.playerSprite.y);
        p.vx = Phaser.Math.Linear(p.vx, Math.cos(targetA) * curSpd, 0.035);
        p.vy = Phaser.Math.Linear(p.vy, Math.sin(targetA) * curSpd, 0.035);
      }

      if (p.accel && !p.bubbled) {
        const curSpd = Math.hypot(p.vx, p.vy);
        if (curSpd > 0 && curSpd < 175) {
          const factor = (curSpd + p.accel * (delta / 1000)) / curSpd;
          p.vx *= factor;
          p.vy *= factor;
        }
      }

      if (p.curveRate && !p.bubbled) {
        const rot = p.curveRate * (delta / 1000);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const nvx = p.vx * c - p.vy * s;
        const nvy = p.vx * s + p.vy * c;
        p.vx = nvx;
        p.vy = nvy;
      }

      if (p.wobbleAmp && !p.bubbled) {
        p.wobblePhase = (p.wobblePhase ?? 0) + delta * (p.wobbleFreq ?? 0.012);
        const spd = Math.hypot(p.vx, p.vy) || 1;
        const perpX = -p.vy / spd;
        const perpY = p.vx / spd;
        const offset = Math.cos(p.wobblePhase) * p.wobbleAmp * (delta / 16.67);
        p.sprite.x += perpX * offset;
        p.sprite.y += perpY * offset;
      }

      if (p.spinSpeed) {
        p.sprite.angle += delta * p.spinSpeed;
      } else if (p.rotateToVelocity && (p.vx !== 0 || p.vy !== 0)) {
        p.sprite.setRotation(Math.atan2(p.vy, p.vx));
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
          const homingSpd = p.shockBlast ? 240 : 145;
          p.vx = Phaser.Math.Linear(p.vx, Math.cos(targetA) * homingSpd, 0.08);
          p.vy = Phaser.Math.Linear(p.vy, Math.sin(targetA) * homingSpd, 0.08);
        }
      }

      if (p.boomerang || p.starShatter || p.starBomb) {
        p.sprite.angle += delta * (p.boomerang ? 1.1 : 0.6);
      }
      if (p.lunarDisc) {
        p.lunarSliceMs = (p.lunarSliceMs ?? 0) + delta;
        if (p.lunarSliceMs >= 200) {
          p.lunarSliceMs = 0;
          p.hitUids.clear();
        }
      }
      if (p.isMusicNote) {
        p.floatPhase = (p.floatPhase ?? 0) + delta * 0.014;
        p.sprite.y += Math.cos(p.floatPhase) * 0.45;
      }
      if (p.boomerang && !p.returning && p.lifeMs < 600) {
        p.returning = true;
        p.hitUids.clear();
      }
      if (p.boomerang && p.returning) {
        const ownerActor =
          localCoopSession.active && this.localPlayers.length > 0
            ? this.localPlayers.find((lp) => lp.state.id === p.ownerId)
            : undefined;
        const ownerSprite = ownerActor ? ownerActor.sprite : this.playerSprite;
        const distToOwner = Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, ownerSprite.x, ownerSprite.y);
        if (distToOwner < 14) {
          p.sprite.destroy();
          this.projectiles.splice(i, 1);
          continue;
        }
        const retA = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, ownerSprite.x, ownerSprite.y);
        p.vx = Math.cos(retA) * 300;
        p.vy = Math.sin(retA) * 300;
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
      }

      // Wall & solid block bounce or destroy
      let hitSolid = false;
      const maxBoundX = Math.max(16, this.roomWidthPx - 16);
      const maxBoundY = Math.max(16, this.roomHeightPx - 16);
      const minB = p.boomerang ? 18 : 16;
      const maxBX = p.boomerang ? Math.max(18, this.roomWidthPx - 18) : maxBoundX;
      const maxBY = p.boomerang ? Math.max(18, this.roomHeightPx - 18) : maxBoundY;

      if (p.boomerang && p.returning) {
        // Returning boomerang homes straight back to the player without getting stuck on walls
      } else if (p.sprite.x < minB || p.sprite.x > maxBX || p.sprite.y < minB || p.sprite.y > maxBY) {
        if (p.splitSpore) {
          let rvx = p.vx;
          let rvy = p.vy;
          if (p.sprite.x < minB) {
            rvx = Math.abs(p.vx);
            p.sprite.x = minB;
          } else if (p.sprite.x > maxBX) {
            rvx = -Math.abs(p.vx);
            p.sprite.x = maxBX;
          }
          if (p.sprite.y < minB) {
            rvy = Math.abs(p.vy);
            p.sprite.y = minB;
          } else if (p.sprite.y > maxBY) {
            rvy = -Math.abs(p.vy);
            p.sprite.y = maxBY;
          }
          this.spawnMushroomSplitSpores(p.sprite.x, p.sprite.y, Math.atan2(rvy, rvx), p.color, p.ownerId);
          hitSolid = true;
        } else if (p.bouncesLeft > 0) {
          p.bouncesLeft--;
          if (p.sprite.x < minB) {
            p.vx = Math.abs(p.vx);
            p.sprite.x = minB;
          } else if (p.sprite.x > maxBX) {
            p.vx = -Math.abs(p.vx);
            p.sprite.x = maxBX;
          }
          if (p.sprite.y < minB) {
            p.vy = Math.abs(p.vy);
            p.sprite.y = minB;
          } else if (p.sprite.y > maxBY) {
            p.vy = -Math.abs(p.vy);
            p.sprite.y = maxBY;
          }
          if (p.boomerang && p.bouncesLeft <= 0) {
            p.returning = true;
            p.hitUids.clear();
          }
        } else if (p.boomerang) {
          p.returning = true;
          p.hitUids.clear();
        } else {
          hitSolid = true;
        }
      } else {
        for (const obj of this.wallGroup.getChildren()) {
          const w = obj as Phaser.GameObjects.Rectangle;
          if (!w.active) continue;
          const hw = (w.width || 16) * 0.5 + (p.boomerang ? 3 : 1);
          const hh = (w.height || 16) * 0.5 + (p.boomerang ? 3 : 1);
          const dx = p.sprite.x - w.x;
          const dy = p.sprite.y - w.y;
          if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            if (p.splitSpore) {
              const penX = hw - Math.abs(dx);
              const penY = hh - Math.abs(dy);
              let rvx = p.vx;
              let rvy = p.vy;
              if (penX < penY) {
                const dir = Math.sign(dx || (p.vx < 0 ? 1 : -1));
                rvx = dir * Math.abs(p.vx);
                p.sprite.x = w.x + dir * (hw + 1);
              } else {
                const dir = Math.sign(dy || (p.vy < 0 ? 1 : -1));
                rvy = dir * Math.abs(p.vy);
                p.sprite.y = w.y + dir * (hh + 1);
              }
              this.spawnMushroomSplitSpores(p.sprite.x, p.sprite.y, Math.atan2(rvy, rvx), p.color, p.ownerId);
              hitSolid = true;
            } else if (p.bouncesLeft > 0) {
              p.bouncesLeft--;
              const penX = hw - Math.abs(dx);
              const penY = hh - Math.abs(dy);
              if (penX < penY) {
                const dir = Math.sign(dx || (p.vx < 0 ? 1 : -1));
                p.vx = dir * Math.abs(p.vx);
                p.sprite.x = w.x + dir * (hw + 1);
              } else {
                const dir = Math.sign(dy || (p.vy < 0 ? 1 : -1));
                p.vy = dir * Math.abs(p.vy);
                p.sprite.y = w.y + dir * (hh + 1);
              }
              if (p.boomerang && p.bouncesLeft <= 0) {
                p.returning = true;
                p.hitUids.clear();
              }
            } else if (p.boomerang) {
              p.returning = true;
              p.hitUids.clear();
            } else {
              hitSolid = true;
              if (p.textureKey === 'proj_arrow') {
                SoundSystem.playArrowHit();
              }
              if (!p.fromPlayer && p.shooterUid && w.x >= 16 && w.x <= maxBoundX && w.y >= 16 && w.y <= maxBoundY) {
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
        if (!hitSolid) {
          for (const obj of this.crateGroup.getChildren()) {
            const crate = obj as Phaser.Physics.Arcade.Sprite;
            if (!crate.active) continue;
            const hw = (crate.width || 16) * 0.5 + (p.boomerang ? 3 : 1);
            const hh = (crate.height || 16) * 0.5 + (p.boomerang ? 3 : 1);
            const dx = p.sprite.x - crate.x;
            const dy = p.sprite.y - crate.y;
            if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
              if (p.fromPlayer && !p.fromRemoteEvent && !p.slimeSplatter) {
                this.smashCrate(crate);
              }
              if (p.bouncesLeft > 0) {
                p.bouncesLeft--;
                const penX = hw - Math.abs(dx);
                const penY = hh - Math.abs(dy);
                if (penX < penY) {
                  const dir = Math.sign(dx || (p.vx < 0 ? 1 : -1));
                  p.vx = dir * Math.abs(p.vx);
                  p.sprite.x = crate.x + dir * (hw + 1);
                } else {
                  const dir = Math.sign(dy || (p.vy < 0 ? 1 : -1));
                  p.vy = dir * Math.abs(p.vy);
                  p.sprite.y = crate.y + dir * (hh + 1);
                }
                if (p.boomerang && p.bouncesLeft <= 0) {
                  p.returning = true;
                  p.hitUids.clear();
                }
              } else if (p.boomerang) {
                p.returning = true;
                p.hitUids.clear();
              } else {
                hitSolid = true;
                if (!p.fromPlayer && p.shooterUid) {
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
      }

      if (!p.netSynced) {
        p.sprite.setVelocity(p.vx, p.vy);
      }

      if (hitSolid) {
        if (p.starBomb) {
          this.triggerStarBomb(p.sprite.x, p.sprite.y);
        } else if (p.starShatter) {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const sx = p.sprite.x - (p.vx / spd) * 4;
          const sy = p.sprite.y - (p.vy / spd) * 4;
          this.spawnStarShatterShards(sx, sy, p.ownerId);
        } else if (p.sporeBurst) {
          this.spawnEnemySporeBurst(p.sprite.x, p.sprite.y, p.damage, p.color);
        } else if (p.healsAlly) {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const dropX = p.sprite.x - (p.vx / spd) * 6;
          const dropY = p.sprite.y - (p.vy / spd) * 6;
          this.spawnParticles(dropX, dropY, 0x66ffd9, 4);
          if (!p.fromRemoteEvent) {
            this.spawnPersistentFloorItem('syringe', dropX, dropY, 1);
          }
        } else {
          if (p.slimeSplatter) {
            this.spawnSlimeSplatter(p.sprite.x, p.sprite.y, !p.fromPlayer);
          }
          this.spawnParticles(p.sprite.x, p.sprite.y, p.color, 3);
        }
        p.sprite.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer && p.healsAlly) {
        if (localCoopSession.active && this.localPlayers.length > 0) {
          let healedAlly = false;
          for (const lp of this.localPlayers) {
            if (lp.state.id === p.ownerId || lp.state.downed) continue;
            if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, lp.sprite.x, lp.sprite.y) < 14) {
              const heal = p.healAmount ?? 3;
              lp.state.hp = Math.min(lp.state.maxHp, lp.state.hp + heal);
              SoundSystem.playHeal();
              this.spawnParticles(lp.sprite.x, lp.sprite.y, 0x66ffd9, 10);
              this.ui.showToast(`Healed ${lp.state.name} (+${heal} HP)!`, '#66ffd9');
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              healedAlly = true;
              break;
            }
          }
          if (healedAlly) continue;
        } else if (p.ownerId === this.playerState.id) {
          let healedAlly = false;
          for (const ally of this.remotePlayers.values()) {
            if (ally.downed || ally.gx !== this.currentRoom.gx || ally.gy !== this.currentRoom.gy) continue;
            if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, ally.x, ally.y) < 14) {
              const heal = p.healAmount ?? 3;
              net.broadcastInteract({
                peerId: this.playerState.id,
                gx: this.currentRoom.gx,
                gy: this.currentRoom.gy,
                kind: 'heal',
                targetId: ally.id,
                amount: heal,
              });
              SoundSystem.playHeal();
              this.spawnParticles(ally.x, ally.y, 0x66ffd9, 10);
              this.ui.showToast(`Healed ${ally.name} (+${heal} HP)!`, '#66ffd9');
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              healedAlly = true;
              break;
            }
          }
          if (healedAlly) continue;
        }
        continue;
      }

      if (p.fromPlayer && (localCoopSession.active ? p.ownerId.startsWith('local_') : p.ownerId === this.playerState.id)) {
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

        if (p.bubbles) {
          let trappedBullet = false;
          for (const ep of this.projectiles) {
            if (ep.fromPlayer || !ep.sprite.active || ep.bubbled) continue;
            if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, ep.sprite.x, ep.sprite.y) < 12) {
              ep.bubbled = true;
              ep.vx = 0;
              ep.vy = 0;
              ep.lifeMs = 2000;
              ep.sprite.setVelocity(0, 0);
              const bgfx = this.add.graphics().setDepth(12);
              bgfx.fillStyle(0x6ef3ff, 0.28);
              bgfx.fillCircle(0, 0, 7);
              bgfx.lineStyle(1.2, 0xa5f3fc, 0.95);
              bgfx.strokeCircle(0, 0, 7);
              bgfx.fillStyle(0xffffff, 0.8);
              bgfx.fillCircle(-2, -2.5, 1.4);
              bgfx.setPosition(ep.sprite.x, ep.sprite.y);
              this.roomGroup.add(bgfx);
              ep.bubbleGfx = bgfx;
              this.spawnParticles(ep.sprite.x, ep.sprite.y, 0x6ef3ff, 4);
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              trappedBullet = true;
              break;
            }
          }
          if (trappedBullet) continue;
        }

        for (const e of [...this.activeEnemies]) {
          if (!e.sprite.active || p.hitUids.has(e.uid)) continue;
          if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, e.sprite.x, e.sprite.y) < (e.isBoss ? 18 : 11)) {
            p.hitUids.add(e.uid);
            if (p.textureKey === 'proj_arrow') {
              SoundSystem.playArrowHit();
            }
            if (p.slows) {
              e.slowedMs = 3000;
            }
            if (p.freezes) {
              if (e.isBoss) {
                e.frostSlowMs = 2500;
              } else {
                e.frozenMs = 1000;
                e.iceHits = 0;
                this.drawEnemyIceCube(e, false);
              }
            }
            if (p.bubbles && !e.isBoss) {
              e.bubbledMs = 1500;
              const pushA = Math.atan2(p.vy, p.vx);
              e.bubbleDriftVx = Math.cos(pushA) * 14;
              e.bubbleDriftVy = Math.sin(pushA) * 14;
            }
            if (p.burns) {
              e.burningMs = 3000;
              e.burnTickMs = 0;
              this.spawnParticles(e.sprite.x, e.sprite.y, 0xff6b35, 5);
            }
            if (p.slimeSplatter) {
              this.spawnSlimeSplatter(e.sprite.x, e.sprite.y);
            }
            let finalDmg = p.damage;
            if (p.cometBoost && p.startX !== undefined && p.startY !== undefined) {
              const traveled = Phaser.Math.Distance.Between(p.startX, p.startY, p.sprite.x, p.sprite.y);
              finalDmg += Math.floor(traveled / 45);
            }
            if (p.starBomb) {
              this.triggerStarBomb(p.sprite.x, p.sprite.y);
            } else {
              this.damageEnemy(e, finalDmg);
            }
            if (p.starShatter) {
              this.spawnStarShatterShards(p.sprite.x, p.sprite.y, p.ownerId, e.uid);
            }
            if (p.voidRift) {
              this.spawnVoidUnderneathAnim(e.sprite.x, e.sprite.y, e.isBoss ? 22 : 15);
            }
            if (p.shockBlast) {
              this.spawnCelestialShockExplosion(p.sprite.x, p.sprite.y, e.uid);
            }
            if (p.splitSpore) {
              const nx = p.sprite.x - e.sprite.x;
              const ny = p.sprite.y - e.sprite.y;
              const nLen = Math.hypot(nx, ny) || 1;
              const ux = nx / nLen;
              const uy = ny / nLen;
              const dot = p.vx * ux + p.vy * uy;
              const rvx = dot < 0 ? p.vx - 2 * dot * ux : -p.vx;
              const rvy = dot < 0 ? p.vy - 2 * dot * uy : -p.vy;
              this.spawnMushroomSplitSpores(p.sprite.x, p.sprite.y, Math.atan2(rvy, rvx), p.color, p.ownerId, e.uid);
            }
            if (!p.boomerang) {
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
        if (p.sprite.active && this.hitNyarlathotepArm(p.sprite.x, p.sprite.y, 10, p.damage)) {
          if (!p.boomerang) {
            p.sprite.destroy();
            this.projectiles.splice(i, 1);
            continue;
          }
        }
      } else if (!p.fromPlayer) {
        if (p.bubbled) continue;
        const targetActors: Array<LocalPlayerActor | null> = localCoopSession.active
          ? this.localPlayers.filter((lp) => !lp.state.downed)
          : [null];
        for (const actor of targetActors) {
          if (!p.sprite.active || p.fromPlayer) break;
          const hit = actor
            ? this.withLocalPlayer(actor, () => this.tryEnemyProjectileHitLocal(p))
            : this.tryEnemyProjectileHitLocal(p);
          if (hit) {
            p.sprite.destroy();
            this.projectiles.splice(i, 1);
            break;
          }
        }
        if (!p.fromPlayer && p.sprite.active) {
          for (const sk of [...this.summonedSkeletons]) {
            if (!sk.sprite.active) continue;
            if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, sk.sprite.x, sk.sprite.y) < 9) {
              this.damageSkeleton(sk, p.damage);
              p.sprite.destroy();
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }
  }

  private spawnEnemySporeBurst(x: number, y: number, damage: number, color: number): void {
    this.spawnParticles(x, y, color, 5);
    const baseAngle = Math.random() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const a = baseAngle + (Math.PI * 2 * k) / 3;
      this.createEnemyProjectile(x, y, a, 95, damage, color, false, undefined, {
        textureKey: 'proj_spore',
        scale: 0.78,
        lifeMs: 650,
        spinSpeed: 0.25,
      });
    }
  }

  private spawnSlimeSplatter(x: number, y: number, fromEnemy = false): void {
    const sx = Phaser.Math.Clamp(x, 24, Math.max(24, this.roomWidthPx - 24));
    const sy = Phaser.Math.Clamp(y, 24, Math.max(24, this.roomHeightPx - 24));
    const gfx = this.add.graphics().setDepth(2);
    gfx.fillStyle(fromEnemy ? 0x4d7c0f : 0x65a30d, 0.72);
    gfx.fillCircle(sx, sy, fromEnemy ? 11 : 13);
    gfx.fillCircle(sx - 6, sy + 3, fromEnemy ? 5 : 7);
    gfx.fillCircle(sx + 7, sy - 2, fromEnemy ? 5 : 6);
    gfx.fillCircle(sx + 2, sy + 7, fromEnemy ? 4 : 5);
    gfx.fillStyle(0xa6ff4d, 0.55);
    gfx.fillCircle(sx - 3, sy - 3, fromEnemy ? 4 : 6);
    gfx.fillCircle(sx + 4, sy + 2, fromEnemy ? 3 : 4);
    this.roomGroup.add(gfx);
    this.slimeSplatters.push({
      x: sx,
      y: sy,
      radius: fromEnemy ? 14 : 17,
      gfx,
      lifeMs: fromEnemy ? 3400 : 5000,
      fromEnemy,
    });
  }

  private updateSlimeSplatters(delta: number): void {
    for (let i = this.slimeSplatters.length - 1; i >= 0; i--) {
      const s = this.slimeSplatters[i];
      s.lifeMs -= delta;
      if (s.lifeMs <= 0) {
        s.gfx.destroy();
        this.slimeSplatters.splice(i, 1);
        continue;
      }
      if (s.lifeMs < 1000) {
        s.gfx.setAlpha(s.lifeMs / 1000);
      }
      if (s.fromEnemy) {
        if (localCoopSession.active && this.localPlayers.length > 0) {
          for (const lp of this.localPlayers) {
            if (
              lp.sprite.active &&
              !lp.state.downed &&
              Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, s.x, s.y) <= s.radius
            ) {
              StatusEffectManager.addEffect(lp.state.statusEffects, 'sluggish', 800);
            }
          }
        } else if (
          this.playerSprite.active &&
          !this.playerState.downed &&
          Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, s.x, s.y) <= s.radius
        ) {
          StatusEffectManager.addEffect(this.playerState.statusEffects, 'sluggish', 800);
        }
      } else {
        for (const e of this.activeEnemies) {
          if (!e.sprite.active) continue;
          if (Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, s.x, s.y) <= s.radius) {
            e.slowedMs = Math.max(e.slowedMs, 600);
          }
        }
      }
    }
  }

  private updateCometTrail(delta: number): void {
    for (let i = this.cometTrailNodes.length - 1; i >= 0; i--) {
      const node = this.cometTrailNodes[i];
      node.lifeMs -= delta;
      if (node.lifeMs <= 0 || !node.gfx.active) {
        node.gfx.destroy();
        this.cometTrailNodes.splice(i, 1);
        continue;
      }
      if (node.lifeMs < 400) {
        node.gfx.setAlpha(node.lifeMs / 400);
      }
      for (const e of [...this.activeEnemies]) {
        if (!e.sprite.active || node.hitUids.has(e.uid)) continue;
        if (Phaser.Math.Distance.Between(node.x, node.y, e.sprite.x, e.sprite.y) <= (e.isBoss ? 18 : 13)) {
          node.hitUids.add(e.uid);
          this.spawnParticles(e.sprite.x, e.sprite.y, 0xffe066, 3);
          this.damageEnemy(e, 2);
        }
      }
    }
  }

  private updateHazardsAndLoot(delta: number): void {
    const px = this.playerSprite.x;
    const py = this.playerSprite.y;
    if (this.isTutorial && this.currentRoom?.tutorialStep === 3 && px >= 94) {
      this.dodgeMs = 0;
      this.playerState.dodging = false;
      const safeY = Phaser.Math.Clamp(py, 28, 148);
      this.playerSprite.setPosition(76, safeY).setVelocity(0, 0);
      this.playerState.x = 76;
      this.playerState.y = safeY;
      this.playerState.statusEffects = this.playerState.statusEffects.filter((e) => e.id !== 'burning');
      this.spawnParticles(76, safeY, 0xffe066, 6);
      this.ui.showToast('Use your Bow to shoot across the lava!', '#ffe066');
    }
    const now = this.time.now;
    const lavaFrame = Math.floor(now / 260) % 3;
    const lavaFrameChanged = lavaFrame !== this.lastLavaFrame;
    this.lastLavaFrame = lavaFrame;

    for (const h of this.hazards) {
      if (lavaFrameChanged) {
        h.sprite.setTexture(this.isAcidLavaFloor() ? `tile_acid_${lavaFrame}` : `tile_lava_${lavaFrame}`);
      }
      h.glow.setAlpha(0.24 + Math.sin(now * 0.004 + h.phase) * 0.08);
      h.tickMs = Math.max(0, h.tickMs - delta);
      const shouldDmg = h.tickMs <= 0;
      let anyHit = false;
      if (localCoopSession.active && this.localPlayers.length > 0) {
        for (const lp of this.localPlayers) {
          if (lp.state.downed) continue;
          if (Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, h.x, h.y) < h.radius) {
            const existingBurn = lp.state.statusEffects.find((e) => e.id === 'burning');
            if (existingBurn) {
              existingBurn.remainingMs = 3000;
            } else {
              StatusEffectManager.addEffect(lp.state.statusEffects, 'burning', 3000);
            }
            if (shouldDmg) {
              anyHit = true;
              this.withLocalPlayer(lp, () => this.damagePlayer(1));
            }
          }
        }
      } else if (!this.playerState.downed && Phaser.Math.Distance.Between(px, py, h.x, h.y) < h.radius) {
        // Reset burning to 3 seconds every time player touches lava/hazard
        const existingBurn = this.playerState.statusEffects.find((e) => e.id === 'burning');
        if (existingBurn) {
          existingBurn.remainingMs = 3000;
        } else {
          StatusEffectManager.addEffect(this.playerState.statusEffects, 'burning', 3000);
        }
        if (shouldDmg) {
          anyHit = true;
          this.damagePlayer(1);
        }
      }
      if (anyHit) {
        h.tickMs = 900;
      }
    }

    for (const s of this.spikeTraps) {
      const onGrateLocal =
        localCoopSession.active && this.localPlayers.length > 0
          ? this.localPlayers.filter(
              (lp) =>
                !lp.state.downed &&
                lp.dodgeMs <= 0 &&
                Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, s.x, s.y) < 10
            )
          : [];
      const onGrateSingle =
        !localCoopSession.active &&
        !this.playerState.downed &&
        this.dodgeMs <= 0 &&
        Phaser.Math.Distance.Between(px, py, s.x, s.y) < 10;
      const onGrate = onGrateLocal.length > 0 || onGrateSingle;

      const stabPlayersOnGrate = (pinDuration: number) => {
        if (localCoopSession.active && this.localPlayers.length > 0) {
          for (const lp of onGrateLocal) {
            this.withLocalPlayer(lp, () => {
              this.spikePinnedMs = Math.max(this.spikePinnedMs, pinDuration);
              this.dodgeMs = 0;
              this.damagePlayer(1);
            });
          }
        } else if (onGrateSingle) {
          this.spikePinnedMs = Math.max(this.spikePinnedMs, pinDuration);
          this.dodgeMs = 0;
          this.damagePlayer(1);
        }
        if (!this.usedCheatsInRun) steamSystem.recordSpikeStab();
        this.ui.showToast('Stabbed by spikes!', '#ff5d8f');
      };

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
            stabPlayersOnGrate(1000);
          }
        }
      } else {
        s.activeMs -= delta;
        if (s.activeMs <= 140 && s.activeMs > 0) {
          s.sprite.setTexture('obj_spike_mid');
        }
        if (onGrate && !s.hitThisCycle) {
          s.hitThisCycle = true;
          stabPlayersOnGrate(s.activeMs);
        }
        if (s.activeMs <= 0) {
          s.state = 'idle';
          s.standMs = 0;
          s.hitThisCycle = false;
          s.sprite.setTexture('obj_spike_idle');
        }
      }
    }

    const attractors =
      localCoopSession.active && this.localPlayers.length > 0
        ? this.localPlayers.filter((lp) => !lp.state.downed && hasArtifact(lp.state.inventory, 'moth_crown') !== -1)
        : [];
    const attractSingle = !localCoopSession.active && hasArtifact(this.playerState.inventory, 'moth_crown') !== -1;

    for (const l of this.lootObjs) {
      if (l.collected) continue;
      if (l.kind === 'shard' || l.kind === 'heart') {
        if (localCoopSession.active) {
          let bestAttractor: LocalPlayerActor | null = null;
          let bestDist = 80;
          for (const lp of attractors) {
            const dist = Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, l.sprite.x, l.sprite.y);
            if (dist < bestDist) {
              bestDist = dist;
              bestAttractor = lp;
            }
          }
          if (bestAttractor) {
            const a = Phaser.Math.Angle.Between(l.sprite.x, l.sprite.y, bestAttractor.sprite.x, bestAttractor.sprite.y);
            l.sprite.x += Math.cos(a) * 1.8;
            l.sprite.y += Math.sin(a) * 1.8;
          }
        } else if (attractSingle) {
          const d = Phaser.Math.Distance.Between(px, py, l.sprite.x, l.sprite.y);
          if (d < 80) {
            const a = Phaser.Math.Angle.Between(l.sprite.x, l.sprite.y, px, py);
            l.sprite.x += Math.cos(a) * 1.8;
            l.sprite.y += Math.sin(a) * 1.8;
          }
        }
      }

      const collector = localCoopSession.active ? this.getNearestAliveLocalPlayer(l.sprite.x, l.sprite.y) : null;
      const cx = collector ? collector.sprite.x : px;
      const cy = collector ? collector.sprite.y : py;
      const lootDist = Phaser.Math.Distance.Between(cx, cy, l.sprite.x, l.sprite.y);
      if (lootDist < 14 && (l.kind === 'shard' || l.kind === 'heart')) {
        l.collected = true;
        l.sprite.destroy();
        const roomLoot = this.currentRoom.loot.find((rl) => rl.uid === l.uid);
        if (roomLoot) roomLoot.collected = true;
        const targetState = collector ? collector.state : this.playerState;
        net.broadcastInteract({
          peerId: targetState.id,
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          kind: 'pickup',
          targetId: l.uid,
        });
        if (l.kind === 'shard') {
          const amt = l.amount ?? 1;
          targetState.shards += amt;
          this.totalShardsCollected += amt;
          if (this.totalShardsCollected >= 50) void steamSystem.unlockAchievement('ACH_HOARDER');
          SoundSystem.playPickup();
        } else {
          targetState.hp = Math.min(targetState.maxHp, targetState.hp + 2);
          this.runFlags.healedAtAll = true;
          SoundSystem.playHeal();
        }
      }
    }
  }

  private playSimonSequence(): void {
    const simon = this.currentRoom.puzzleSimon;
    if (!simon || this.simonPlaying) return;
    this.simonPlaying = true;
    simon.progress = 0;
    this.ui.showToast('Watch & remember the 6-rune sequence!', '#ffe066');
    const stepMs = 460;
    simon.sequence.forEach((runeIdx, step) => {
      this.time.delayedCall(step * stepMs + 120, () => {
        if (!this.scene.isActive('GameScene') || this.currentRoom.puzzleSimon !== simon) return;
        const rVis = this.specialObjs.simonRunes.find((r) => r.idx === runeIdx);
        if (rVis && rVis.sprite.active) {
          rVis.sprite.setTexture('obj_plate_lit');
          SoundSystem.playPickup();
          this.spawnParticles(rVis.x, rVis.y, rVis.color, 6);
          this.time.delayedCall(260, () => {
            if (rVis.sprite.active) rVis.sprite.setTexture('obj_plate');
          });
        }
        if (step === simon.sequence.length - 1) {
          this.time.delayedCall(300, () => {
            this.simonPlaying = false;
          });
        }
      });
    });
  }

  private updatePuzzlePlates(): void {
    if ((this.currentRoom.type !== 'puzzle' && this.currentRoom.type !== 'secret') || this.currentRoom.puzzleSolved || this.plateCooldownMs > 0) return;
    const plates = this.currentRoom.puzzlePlates;
    if (!plates) return;

    const actors =
      localCoopSession.active && this.localPlayers.length > 0
        ? this.localPlayers.filter((lp) => !lp.state.downed).map((lp) => lp.sprite)
        : !this.playerState.downed
          ? [this.playerSprite]
          : [];
    if (actors.length === 0) return;

    for (const sp of this.specialObjs.plates) {
      if (actors.some((actor) => Phaser.Math.Distance.Between(actor.x, actor.y, sp.x, sp.y) < 12)) {
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
        break;
      }
    }
  }

  private solvePuzzle(message: string): void {
    if (this.currentRoom.puzzleSolved) return;
    this.currentRoom.puzzleSolved = true;
    this.currentRoom.cleared = true;
    SoundSystem.playPuzzleSuccess();
    this.ui.showToast(message, '#66ffd9');
    if (net.mode !== 'client') {
      const rng = new SeededRandom((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      if (this.currentRoom.type === 'secret') {
        const chestItemId = rollSecretChestItemId(rng);
        this.spawnRoomLoot(`sec_chest_${Date.now()}`, 'chest', 88, 88, chestItemId);
        this.spawnRoomLoot(`sec_shard_${Date.now()}_1`, 'shard', 64, 88, undefined, 5);
        this.spawnRoomLoot(`sec_shard_${Date.now()}_2`, 'shard', 112, 88, undefined, 5);
      } else {
        const itemId =
          this.isTutorial && this.currentRoom.tutorialStep === 6
            ? 'star_bomb'
            : rollRandomItemId(rng);
        this.spawnRoomLoot(`puz_${Date.now()}`, 'item', 88, 88, itemId);
      }
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
      this.ui.isOverlayOpen()
    ) {
      return;
    }
    const bp = this.currentRoom.puzzleBlock;
    if (!bp) return;

    const pushers: Array<{ x: number; y: number; moveX: number; moveY: number }> = [];
    if (localCoopSession.active && this.localPlayers.length > 0) {
      for (const lp of this.localPlayers) {
        if (lp.state.downed) continue;
        let mx = 0;
        let my = 0;
        if (lp.inputType === 'keyboard') {
          if (this.keys.a.isDown || this.keys.left.isDown) mx -= 1;
          if (this.keys.d.isDown || this.keys.right.isDown) mx += 1;
          if (this.keys.w.isDown || this.keys.up.isDown) my -= 1;
          if (this.keys.s.isDown || this.keys.down.isDown) my += 1;
        } else {
          const pm = inputSystem.getPadMoveVector(lp.padIndex);
          if (Math.abs(pm.x) > 0.25) mx = Math.sign(pm.x);
          if (Math.abs(pm.y) > 0.25) my = Math.sign(pm.y);
        }
        if (mx !== 0 || my !== 0) {
          pushers.push({ x: lp.sprite.x, y: lp.sprite.y, moveX: mx, moveY: my });
        }
      }
    } else if (!this.playerState.downed) {
      let mx = 0;
      let my = 0;
      if (this.keys.a.isDown || this.keys.left.isDown) mx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) mx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) my -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) my += 1;
      const padMove = inputSystem.getMoveVector();
      if (Math.abs(padMove.x) > 0.25) mx = Math.sign(padMove.x);
      if (Math.abs(padMove.y) > 0.25) my = Math.sign(padMove.y);
      if (isMobileMode()) {
        if (Math.abs(mobileInput.moveX) > 0.25) mx = Math.sign(mobileInput.moveX);
        if (Math.abs(mobileInput.moveY) > 0.25) my = Math.sign(mobileInput.moveY);
      }
      if (mx !== 0 || my !== 0) {
        pushers.push({ x: this.playerSprite.x, y: this.playerSprite.y, moveX: mx, moveY: my });
      }
    }
    if (pushers.length === 0) return;

    for (const pusher of pushers) {
      const { x: px, y: py, moveX, moveY } = pusher;
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
        const targetBlockY = nty * 16 + 8;
        bVis.sprite.setDepth(6 + (targetBlockY + 4) / 1000);
        this.tweens.add({
          targets: bVis.sprite,
          x: ntx * 16 + 8,
          y: targetBlockY,
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
        return;
      }
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

  private spawnCelestialShockExplosion(x: number, y: number, directHitUid: string): void {
    const shockRadius = 38;
    const ring = this.add.circle(x, y, 8, 0x6ef3ff, 0.35).setStrokeStyle(2, 0xffffff, 0.95).setDepth(13);
    this.roomGroup.add(ring);
    this.spawnParticles(x, y, 0x6ef3ff, 7);
    this.tweens.add({
      targets: ring,
      radius: shockRadius,
      alpha: 0,
      duration: 210,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });

    for (const other of [...this.activeEnemies]) {
      if (!other.sprite.active || other.uid === directHitUid) continue;
      if (Phaser.Math.Distance.Between(x, y, other.sprite.x, other.sprite.y) <= shockRadius) {
        this.spawnParticles(other.sprite.x, other.sprite.y, 0x6ef3ff, 3);
        this.damageEnemy(other, 1);
      }
    }
  }

  private spawnVoidUnderneathAnim(x: number, y: number, radius: number): void {
    const voidPool = this.add.circle(x, y + 3, radius, 0x070412, 0.92).setStrokeStyle(2, 0xff47b6, 0.9).setScale(0.15).setDepth(3);
    const innerRing = this.add.circle(x, y + 3, radius * 0.65, 0x3b0764, 0.55).setStrokeStyle(1.2, 0xc084fc, 0.85).setScale(0.15).setDepth(3);
    this.roomGroup.add(voidPool);
    this.roomGroup.add(innerRing);
    this.spawnParticles(x, y + 3, 0xff47b6, 6);

    // Open up beneath the enemy, hold briefly, then close shut
    this.tweens.add({
      targets: [voidPool, innerRing],
      scale: 1,
      duration: 110,
      ease: 'Back.Out',
      onComplete: () => {
        if (!voidPool.active) return;
        this.tweens.add({
          targets: innerRing,
          scale: 0.78,
          duration: 150,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: [voidPool, innerRing],
          scale: 0.05,
          alpha: 0,
          delay: 160,
          duration: 160,
          ease: 'Quad.In',
          onComplete: () => {
            voidPool.destroy();
            innerRing.destroy();
          },
        });
      },
    });
  }

  private spawnStarShatterShards(x: number, y: number, ownerId: string, excludeUid?: string): void {
    this.spawnStarShatterParticles(x, y);
    const baseAngle = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      const a = baseAngle + (Math.PI * 2 * k) / 6 + Phaser.Math.FloatBetween(-0.15, 0.15);
      this.createPlayerProjectile(x, y, a, 175, 1, 0xffe066, false, false, 0, false, false, ownerId, false, false, 340);
      const shard = this.projectiles[this.projectiles.length - 1];
      if (shard) {
        shard.sprite.setTexture('proj_shard').setTint(k % 2 === 0 ? 0xffe066 : 0xffd275).setScale(0.75);
        shard.rotateToVelocity = true;
        shard.sprite.setRotation(a);
        if (excludeUid) shard.hitUids.add(excludeUid);
      }
    }
  }

  private spawnStarShatterParticles(x: number, y: number): void {
    const colors = [0xffe066, 0xffd275, 0xffffff, 0xff9f1c];
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const dist = Phaser.Math.Between(14, 30);
      const p = this.add
        .image(x, y, i % 2 === 0 ? 'particle_star' : 'particle_spark')
        .setTint(colors[i % colors.length])
        .setScale(Phaser.Math.FloatBetween(0.9, 1.35))
        .setDepth(14);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        angle: Phaser.Math.Between(-180, 180),
        scale: 0.25,
        alpha: 0,
        duration: Phaser.Math.Between(240, 360),
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnMushroomSplitSpores(
    x: number,
    y: number,
    bounceAngle: number,
    color: number,
    ownerId: string,
    excludeUid?: string
  ): void {
    this.spawnParticles(x, y, color, 5);
    for (const offset of [-0.28, 0, 0.28]) {
      this.createPlayerProjectile(x, y, bounceAngle + offset, 175, 1, color, false, false, 1, false, false, ownerId, false, false, 900);
      const child = this.projectiles[this.projectiles.length - 1];
      if (child) {
        child.sprite.setScale(0.65);
        if (excludeUid) child.hitUids.add(excludeUid);
      }
    }
  }

  private drawEnemyIceCube(enemy: ActiveEnemy, cracked: boolean): void {
    if (!enemy.iceGfx || !enemy.iceGfx.active) {
      enemy.iceGfx = this.add.graphics().setDepth(11);
      this.roomGroup.add(enemy.iceGfx);
    }
    const g = enemy.iceGfx;
    const half = enemy.isBoss ? 15 : 10;
    g.clear();
    g.fillStyle(0x7dd3fc, 0.36);
    g.fillRect(-half, -half, half * 2, half * 2);
    g.lineStyle(1.4, 0xe0f2fe, 0.9);
    g.strokeRect(-half, -half, half * 2, half * 2);
    // Inner frost highlight
    g.lineStyle(1, 0xffffff, 0.65);
    g.lineBetween(-half + 2, -half + 2, -half + 6, -half + 2);
    g.lineBetween(-half + 2, -half + 2, -half + 2, -half + 6);
    if (cracked) {
      g.lineStyle(1.4, 0x0c4a6e, 0.9);
      g.lineBetween(-half + 2, -half + 2, 1, -1);
      g.lineBetween(1, -1, half - 2, half - 3);
      g.lineBetween(1, -1, -2, half - 2);
      g.lineStyle(1, 0xffffff, 0.85);
      g.lineBetween(-half + 3, -half + 2, 2, -1);
    }
    if (enemy.sprite.active) {
      g.setPosition(enemy.sprite.x, enemy.sprite.y);
    }
  }

  private shatterEnemyIce(enemy: ActiveEnemy): void {
    enemy.frozenMs = 0;
    enemy.iceHits = 0;
    if (enemy.iceGfx) {
      enemy.iceGfx.destroy();
      enemy.iceGfx = undefined;
    }
    if (enemy.sprite.active) {
      this.spawnParticles(enemy.sprite.x, enemy.sprite.y, 0xbae6fd, 8);
    }
  }

  private popEnemyBubble(enemy: ActiveEnemy): void {
    enemy.bubbledMs = 0;
    enemy.bubbleDriftVx = 0;
    enemy.bubbleDriftVy = 0;
    SoundSystem.playBubblePop();
    if (enemy.bubbleGfx) {
      enemy.bubbleGfx.destroy();
      enemy.bubbleGfx = undefined;
    }
    if (enemy.sprite.active) {
      this.spawnParticles(enemy.sprite.x, enemy.sprite.y, 0x6ef3ff, 6);
    }
  }

  private despawnAllTestEnemies(): void {
    for (const e of this.activeEnemies) {
      if (e.shieldOrbs) {
        for (const orb of e.shieldOrbs) orb.destroy();
        e.shieldOrbs = undefined;
      }
      if (e.bubbleGfx) {
        e.bubbleGfx.destroy();
        e.bubbleGfx = undefined;
      }
      if (e.iceGfx) {
        e.iceGfx.destroy();
        e.iceGfx = undefined;
      }
      if (e.sprite.active) e.sprite.destroy();
    }
    this.activeEnemies = [];
    this.enemyGroup?.clear(true, true);
    if (this.currentRoom) {
      this.currentRoom.enemies = [];
    }
  }

  private updateTestRoomDungeon(delta: number): void {
    if (!this.isTestRoom || !this.currentRoom?.isTestRoom) return;

    // Respawn broken test crates after 3.5 seconds
    const crateChildren = this.crateGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const tx of [3, 4, 5]) {
      const ck = `${tx},26`;
      const isPresent = crateChildren.some((c) => c.active && c.getData('crateKey') === ck);
      if (isPresent) {
        this.testCrateRespawnTimers.delete(ck);
        continue;
      }
      const remaining = this.testCrateRespawnTimers.get(ck);
      if (remaining === undefined) {
        this.testCrateRespawnTimers.set(ck, 3500);
      } else if (remaining - delta <= 0) {
        this.testCrateRespawnTimers.delete(ck);
        if (this.currentRoom.brokenCrates) {
          this.currentRoom.brokenCrates = this.currentRoom.brokenCrates.filter((k) => k !== ck);
        }
        const cx = tx * 16 + 8;
        const cy = 26 * 16 + 8;
        const crate = this.crateGroup.create(cx, cy, 'obj_crate') as Phaser.Physics.Arcade.Sprite;
        crate.setData('crateKey', ck);
        crate.setDepth(6 + (cy + 4) / 1000);
        this.roomGroup.add(crate);
        this.spawnParticles(cx, cy, 0xb08968, 4);
      } else {
        this.testCrateRespawnTimers.set(ck, remaining - delta);
      }
    }

    // Healing pad outside the dungeon section
    if (this.testHealingPad) {
      if (this.testHealingPad.cooldownMs > 0) {
        this.testHealingPad.cooldownMs -= delta;
      }
      if (localCoopSession.active && this.localPlayers.length > 0) {
        for (const lp of this.localPlayers) {
          if (
            !lp.state.downed &&
            Phaser.Math.Distance.Between(lp.sprite.x, lp.sprite.y, this.testHealingPad.x, this.testHealingPad.y) <= 14 &&
            lp.state.hp < lp.state.maxHp
          ) {
            lp.state.hp = lp.state.maxHp;
            if (this.testHealingPad.cooldownMs <= 0) {
              this.testHealingPad.cooldownMs = 800;
              SoundSystem.playHeal();
              this.spawnParticles(lp.sprite.x, lp.sprite.y, 0x66ffd9, 10);
              this.ui.showToast('Fully healed!', '#66ffd9');
            }
          }
        }
      } else if (
        !this.playerState.downed &&
        Phaser.Math.Distance.Between(this.playerSprite.x, this.playerSprite.y, this.testHealingPad.x, this.testHealingPad.y) <= 14 &&
        this.playerState.hp < this.playerState.maxHp
      ) {
        this.playerState.hp = this.playerState.maxHp;
        if (this.testHealingPad.cooldownMs <= 0) {
          this.testHealingPad.cooldownMs = 800;
          SoundSystem.playHeal();
          this.spawnParticles(this.playerSprite.x, this.playerSprite.y, 0x66ffd9, 10);
          this.ui.showToast('Fully healed!', '#66ffd9');
        }
      }
    }

    const anyAliveLocal = localCoopSession.active
      ? this.localPlayers.some((lp) => !lp.state.downed)
      : !this.playerState.downed;
    if (!anyAliveLocal) return;
    if (!this.isRoomAuthority()) return;

    const allOutsideDungeon = localCoopSession.active
      ? this.localPlayers.every((lp) => lp.state.downed || lp.sprite.x < 20 * 16)
      : this.playerSprite.x < 20 * 16;
    if (allOutsideDungeon) {
      this.testSpawnCooldownMs = 0;
      this.testWaveCount = 4;
      if (this.activeEnemies.length > 0) {
        this.despawnAllTestEnemies();
      }
      return;
    }

    const anyInDungeon = localCoopSession.active
      ? this.localPlayers.some((lp) => !lp.state.downed && lp.sprite.x >= 21 * 16)
      : this.playerSprite.x >= 21 * 16;
    if (!anyInDungeon) {
      return;
    }

    if (this.activeEnemies.length > 0) return;

    if (this.testSpawnCooldownMs > 0) {
      this.testSpawnCooldownMs -= delta;
      if (this.testSpawnCooldownMs > 0) return;
    }

    const enemyKeys = Object.keys(ENEMIES);
    if (enemyKeys.length === 0) return;
    const defId = enemyKeys[Math.floor(Math.random() * enemyKeys.length)];
    const def = ENEMIES[defId];

    const spawnCount = this.testWaveCount;
    for (let i = 0; i < spawnCount; i++) {
      let sx = Phaser.Math.Between(22 * 16 + 8, 30 * 16 + 8);
      let sy = Phaser.Math.Between(3 * 16 + 8, 29 * 16 + 8);
      for (let attempt = 0; attempt < 15; attempt++) {
        const candX = Phaser.Math.Between(22 * 16 + 8, 30 * 16 + 8);
        const candY = Phaser.Math.Between(3 * 16 + 8, 29 * 16 + 8);
        const farFromPlayer = Phaser.Math.Distance.Between(candX, candY, this.playerSprite.x, this.playerSprite.y) >= 48;
        const clearOfPillars = this.pillarObjs.every((p) => Phaser.Math.Distance.Between(candX, candY, p.x, p.y) >= 24);
        const clearOfLava = this.hazards.every((h) => Phaser.Math.Distance.Between(candX, candY, h.x, h.y) >= 16);
        if (farFromPlayer && clearOfPillars && clearOfLava) {
          sx = candX;
          sy = candY;
          break;
        }
      }
      const uid = `test_en_${Date.now()}_${i}_${Math.floor(Math.random() * 9999)}`;
      this.spawnEnemyEntity(uid, defId, sx, sy, def.hp, def.hp, false, false);
    }

    this.ui.showToast(`Dungeon Wave: ${spawnCount}x ${def.name}`, '#ff8fab');
    this.testWaveCount += 1;
    this.testSpawnCooldownMs = 450;
  }

  private checkDoorTransitions(): void {
    if (this.doorCooldownMs > 0 || this.currentRoom.doorsLocked) return;

    const candidates = localCoopSession.active
      ? this.localPlayers.filter((lp) => !lp.state.downed).map((lp) => ({ x: lp.sprite.x, y: lp.sprite.y }))
      : [{ x: this.playerSprite.x, y: this.playerSprite.y }];

    for (const pos of candidates) {
      const px = pos.x;
      const py = pos.y;
      for (const d of this.doorZones) {
        if (Phaser.Geom.Rectangle.Contains(d.rect, px, py)) {
          if (d.isTestExit) {
            this.despawnAllTestEnemies();
            this.isTestRoom = false;
            SoundSystem.playUnlock();
            this.scene.restart({
              levelIndex: 0,
              floorSeed: getDailySeed(0),
              carryPlayer: this.playerState,
              carryLocalPlayers: localCoopSession.active ? this.localPlayers.map((lp) => lp.state) : undefined,
              carrySkeletons: this.getCarriedSkeletons(),
              exitedTestRoom: true,
            });
            return;
          }
          if (d.isTutorialExit) {
            if (this.currentRoom.doorsLocked) return;
            this.skipTutorial();
            return;
          }
          if (d.targetGx !== undefined && d.targetGy !== undefined && d.spawnX !== undefined && d.spawnY !== undefined) {
            if (this.floor.rooms[d.targetGy]?.[d.targetGx]) {
              this.loadRoom(d.targetGx, d.targetGy, d.spawnX, d.spawnY);
            }
            return;
          }
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
  }

  private updateFireflies(delta: number): void {
    const dt = delta / 1000;
    const maxX = Math.max(24, this.roomWidthPx - 20);
    const maxY = Math.max(24, this.roomHeightPx - 20);
    for (const f of this.fireflies) {
      f.phase += dt * 3;
      f.sprite.x += f.vx * dt;
      f.sprite.y += f.vy * dt;
      const baseAlpha = this.levelIndex === 6 ? 0.55 : 0.3;
      const pulse = Math.abs(Math.sin(f.phase));
      f.sprite.setAlpha(baseAlpha + 0.4 * pulse);
      if (f.sprite.x < 20) f.sprite.x = maxX;
      if (f.sprite.x > maxX) f.sprite.x = 20;
      if (f.sprite.y < 20) f.sprite.y = maxY;
      if (f.sprite.y > maxY) f.sprite.y = 20;
      if (f.glow) {
        f.glow.setPosition(f.sprite.x, f.sprite.y);
        f.glow.setAlpha(0.22 + 0.25 * pulse);
      }
    }
  }

  private isAcidLavaFloor(): boolean {
    return this.levelIndex === 2 || this.levelIndex === 3;
  }

  private initFloorWeather(): void {
    this.floorWeatherElapsedMs = 0;
    this.roomWeatherOffsets.clear();
    this.acidRainDmgTimerMs = 3500;
    this.roomWindTimers.clear();
    this.rainDrops = [];
    this.rainSplashes = [];
    this.windStreaks = [];

    const rooms = this.floor.rooms.flat().filter((rm) => Boolean(rm));
    const rng = new SeededRandom(this.floorSeed + this.levelIndex * 997 + 17);

    if (this.levelIndex === 5 && rooms.length > 0) {
      // Level 6: 1/4 of all rooms start in acid rain (15s on, 45s off = 60s cycle)
      const shuffled = [...rooms];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      const rainyCount = Math.max(1, Math.round(shuffled.length / 4));
      shuffled.forEach((rm, idx) => {
        const key = `${rm.gx},${rm.gy}`;
        if (idx < rainyCount) {
          this.roomWeatherOffsets.set(key, rng.int(0, 12000));
        } else {
          this.roomWeatherOffsets.set(key, rng.int(15000, 59000));
        }
      });
    }

    if (this.levelIndex === 1) {
      // Level 2: initial gust timer per room is random 10..30s so rooms aren't synchronized
      for (const rm of rooms) {
        this.roomWindTimers.set(`${rm.gx},${rm.gy}`, rng.int(10000, 30000));
      }
    }
  }

  private isRoomAcidRainActive(gx: number, gy: number): boolean {
    if (this.levelIndex !== 5) return false;
    const offset = this.roomWeatherOffsets.get(`${gx},${gy}`) ?? 15000;
    const phase = (this.floorWeatherElapsedMs + offset) % 60000;
    return phase < 15000;
  }

  private spawnWindGustVisuals(): void {
    const w = Math.max(176, this.roomWidthPx);
    const h = Math.max(176, this.roomHeightPx);
    for (let i = 0; i < 24; i++) {
      this.windStreaks.push({
        x: Phaser.Math.FloatBetween(-24, w * 0.6),
        y: Phaser.Math.FloatBetween(12, h - 12),
        vx: Phaser.Math.FloatBetween(240, 340),
        len: Phaser.Math.FloatBetween(14, 28),
        lifeMs: 0,
        maxLifeMs: Phaser.Math.Between(550, 900),
      });
    }
  }

  private updateFloorWeather(delta: number): void {
    this.floorWeatherElapsedMs += delta;

    // Level 2: advance gust-of-wind timers for every room on the floor
    if (this.levelIndex === 1) {
      const curKey = this.currentRoom ? `${this.currentRoom.gx},${this.currentRoom.gy}` : '';
      for (const [key, remaining] of this.roomWindTimers.entries()) {
        const next = remaining - delta;
        if (next <= 0) {
          this.roomWindTimers.set(key, Phaser.Math.Between(20000, 40000));
          if (key === curKey) {
            this.spawnWindGustVisuals();
            SoundSystem.playWindGust();
            if (localCoopSession.active) {
              for (const lp of this.localPlayers) {
                if (!lp.state.downed) {
                  lp.windSlowMs = Math.max(lp.windSlowMs, 4000);
                }
              }
            } else if (!this.playerState.downed) {
              this.playerWindSlowMs = Math.max(this.playerWindSlowMs, 4000);
            }
            for (const e of this.activeEnemies) {
              if (e.sprite.active) {
                e.windSlowMs = Math.max(e.windSlowMs ?? 0, 4000);
              }
            }
          }
        } else {
          this.roomWindTimers.set(key, next);
        }
      }
    }

    const isNormalRain = this.levelIndex === 0;
    const isAcidRain =
      this.levelIndex === 5 &&
      this.currentRoom !== undefined &&
      this.isRoomAcidRainActive(this.currentRoom.gx, this.currentRoom.gy);

    // Level 6 acid rain damage: half a heart (1 HP) every 3.5 seconds
    if (isAcidRain) {
      this.acidRainDmgTimerMs -= delta;
      if (this.acidRainDmgTimerMs <= 0) {
        this.acidRainDmgTimerMs = 3500;
        if (localCoopSession.active) {
          for (const lp of this.localPlayers) {
            if (!lp.state.downed) {
              this.withLocalPlayer(lp, () => this.damagePlayer(1));
            }
          }
        } else if (!this.playerState.downed) {
          this.damagePlayer(1);
        }
      }
    } else {
      this.acidRainDmgTimerMs = 3500;
    }

    const showRain = isNormalRain || isAcidRain;
    SoundSystem.setRainActive(showRain);
    const showSplashes = this.rainSplashes.length > 0;
    const showWind = this.windStreaks.length > 0;

    if (!showRain && !showSplashes && !showWind) {
      if (this.weatherGfx) {
        this.weatherGfx.clear();
      }
      if (this.rainDrops.length > 0) this.rainDrops = [];
      return;
    }

    if (!this.weatherGfx || !this.weatherGfx.active) {
      this.weatherGfx = this.add.graphics().setDepth(18);
    }
    this.weatherGfx.clear();

    const w = Math.max(176, this.roomWidthPx);
    const h = Math.max(176, this.roomHeightPx);
    const dt = delta / 1000;
    const pickTargetY = () => (Math.random() < 0.55 ? Phaser.Math.FloatBetween(22, h - 18) : h + 10);

    if (showRain) {
      const targetDrops = isAcidRain ? 42 : 34;
      while (this.rainDrops.length < targetDrops) {
        const ty = pickTargetY();
        this.rainDrops.push({
          x: Phaser.Math.FloatBetween(0, w),
          y: Phaser.Math.FloatBetween(-12, Math.min(h, ty)),
          vx: -26,
          vy: isAcidRain ? 185 : 165,
          len: isAcidRain ? 6 : 5,
          targetY: ty,
        });
      }
      const rainColor = isAcidRain ? 0x86efac : 0x93c5fd;
      const rainAlpha = isAcidRain ? 0.55 : 0.42;
      this.weatherGfx.lineStyle(1, rainColor, rainAlpha);
      for (const d of this.rainDrops) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y >= d.targetY) {
          if (d.targetY <= h - 18 && d.x >= 18 && d.x <= w - 18) {
            this.rainSplashes.push({
              x: d.x,
              y: d.targetY + d.len,
              lifeMs: 0,
              maxLifeMs: 500,
              color: rainColor,
            });
          }
          d.y = Phaser.Math.FloatBetween(-14, -2);
          d.x = Phaser.Math.FloatBetween(0, w + 16);
          d.targetY = pickTargetY();
        }
        if (d.x < -8) d.x += w + 12;
        this.weatherGfx.beginPath();
        this.weatherGfx.moveTo(d.x, d.y);
        this.weatherGfx.lineTo(d.x - 1.5, d.y + d.len);
        this.weatherGfx.strokePath();
      }
    } else if (this.rainDrops.length > 0) {
      this.rainDrops = [];
    }

    if (this.rainSplashes.length > 0) {
      for (let i = this.rainSplashes.length - 1; i >= 0; i--) {
        const sp = this.rainSplashes[i];
        sp.lifeMs += delta;
        if (sp.lifeMs >= sp.maxLifeMs) {
          this.rainSplashes.splice(i, 1);
          continue;
        }
        const t = sp.lifeMs / sp.maxLifeMs;
        const alpha = (1 - t) * 0.48;
        const rx = 1 + t * 2.5;
        const ry = 0.6 + t * 1.2;
        this.weatherGfx.lineStyle(1, sp.color, alpha);
        this.weatherGfx.strokeEllipse(sp.x, sp.y, rx * 2, ry * 2);
      }
    }

    if (showWind) {
      for (let i = this.windStreaks.length - 1; i >= 0; i--) {
        const s = this.windStreaks[i];
        s.lifeMs += delta;
        if (s.lifeMs >= s.maxLifeMs) {
          this.windStreaks.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        const t = s.lifeMs / s.maxLifeMs;
        const alpha = Math.sin(t * Math.PI) * 0.65;
        this.weatherGfx.lineStyle(1, 0xbae6fd, alpha);
        this.weatherGfx.beginPath();
        this.weatherGfx.moveTo(s.x, s.y);
        this.weatherGfx.lineTo(s.x + s.len, s.y);
        this.weatherGfx.strokePath();
      }
    }
  }

  private syncMultiplayer(delta: number): void {
    if (net.mode === 'solo') return;

    // Prune any disconnected peers whose sprites/snapshots may still be around
    for (const peerId of Array.from(this.remotePlayers.keys())) {
      if (!net.players.has(peerId)) {
        this.remotePlayers.delete(peerId);
        this.remotePlayerLastDirectAt.delete(peerId);
        const vis = this.remoteSprites.get(peerId);
        if (vis) {
          vis.sprite.destroy();
          vis.label.destroy();
          this.remoteSprites.delete(peerId);
        }
      }
    }

    // Render remote players in current room with client-side velocity prediction & interpolation
    const nowPerf = performance.now();
    for (const [peerId, st] of this.remotePlayers.entries()) {
      const sameRoom = st.gx === this.currentRoom.gx && st.gy === this.currentRoom.gy;
      let vis = this.remoteSprites.get(peerId);
      if (sameRoom) {
        if (!vis) {
          const sp = this.add.sprite(st.x, st.y, `player_${st.paletteId}`, 0).setDepth(6 + (st.y + 6) / 1000);
          const lb = addPixelText(this, st.x, st.y - 16, st.name, 8, 0xffe066, 0.5, 0.5).setDepth(11);
          vis = {
            sprite: sp,
            label: lb,
            targetX: st.x,
            targetY: st.y,
            vx: st.vx ?? 0,
            vy: st.vy ?? 0,
            lastRecvAt: nowPerf,
          };
          this.remoteSprites.set(peerId, vis);
        } else if (vis.targetX !== st.x || vis.targetY !== st.y) {
          vis.targetX = st.x;
          vis.targetY = st.y;
          vis.vx = st.vx ?? 0;
          vis.vy = st.vy ?? 0;
          vis.lastRecvAt = nowPerf;
        }
        const now = this.time.now;
        const isRipAnimating = (this.remoteReviveAnimUntil.get(peerId) ?? 0) > now;
        if (!isRipAnimating) {
          const leadSec = Math.min(0.08, Math.max(0, (nowPerf - vis.lastRecvAt) / 1000));
          const predX = vis.targetX + vis.vx * leadSec;
          const predY = vis.targetY + vis.vy * leadSec;
          const playerLerp = 1 - Math.exp(-delta * 0.022);
          const pDist = Phaser.Math.Distance.Between(vis.sprite.x, vis.sprite.y, predX, predY);
          if (pDist > 48) {
            vis.sprite.setPosition(predX, predY);
          } else if (pDist > 0.15) {
            vis.sprite.setPosition(
              Phaser.Math.Linear(vis.sprite.x, predX, playerLerp),
              Phaser.Math.Linear(vis.sprite.y, predY, playerLerp)
            );
          }
          vis.sprite.setFlipX(st.flipX);
          vis.sprite.setDepth(st.downed ? 3 : 6 + (vis.sprite.y + 6) / 1000);
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
    if (this.netSyncTimerMs >= 45) {
      this.netSyncTimerMs = 0;
      net.broadcastPlayerState(this.playerState);

      if (this.isRoomAuthority()) {
        net.broadcastRoomSync({
          gx: this.currentRoom.gx,
          gy: this.currentRoom.gy,
          cleared: this.currentRoom.cleared,
          doorsLocked: this.currentRoom.doorsLocked,
          bossDefeated: this.currentRoom.bossDefeated,
          enemies: this.activeEnemies.map((e) => {
            const b = e.sprite.body as Phaser.Physics.Arcade.Body | null;
            return {
              uid: e.uid,
              x: e.sprite.x,
              y: e.sprite.y,
              vx: b ? Math.round(b.velocity.x) : 0,
              vy: b ? Math.round(b.velocity.y) : 0,
              hp: e.hp,
              alive: e.hp > 0,
            };
          }),
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
              textureKey: p.textureKey,
              scale: p.sprite.scaleX !== 1 ? p.sprite.scaleX : undefined,
              spinSpeed: p.spinSpeed,
              rotateToVelocity: p.rotateToVelocity,
            })),
        });
      }
    }

    this.worldSyncTimerMs += delta;
    if (this.worldSyncTimerMs >= 250) {
      this.worldSyncTimerMs = 0;
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
          roomStates,
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

  private getPromptForActor(px: number, py: number, inventory: PlayerStateSnapshot['inventory']): string {
    if (this.specialObjs.merchant && Phaser.Math.Distance.Between(px, py, this.specialObjs.merchant.x, this.specialObjs.merchant.y) < 34) {
      return `[${getControlActionText('interact')}] Talk to Mimi`;
    }
    if (this.specialObjs.shrine && !this.currentRoom.healingUsed && Phaser.Math.Distance.Between(px, py, this.specialObjs.shrine.x, this.specialObjs.shrine.y) < 32) {
      return `[${getControlActionText('interact')}] Drink from Healing Shrine`;
    }
    if (this.specialObjs.altar && !this.currentRoom.eventUsed && Phaser.Math.Distance.Between(px, py, 88, 84) < 32) {
      return '[E] Inspect Altar';
    }
    if (
      this.specialObjs.portal &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.portal.x, this.specialObjs.portal.y) < 32
    ) {
      return '[E] Enter Portal';
    }
    if (
      this.currentRoom.pillars &&
      this.pillarObjs.some(
        (po) => !this.currentRoom.pillars![po.idx]?.used && Phaser.Math.Distance.Between(px, py, po.x, po.y) < 32
      )
    ) {
      return net.mode === 'solo' && !localCoopSession.active ? '[E] Pillar Blessing (+2 Hearts)' : '[E] Pillar Revive';
    }
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.resetRune &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.resetRune.x, this.specialObjs.resetRune.y) < 26
    ) {
      return '[E] Reset Blocks';
    }
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.mirrors.some((m) => Phaser.Math.Distance.Between(px, py, m.x, m.y) < 24)
    ) {
      return '[E] Rotate Mirror';
    }
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.lights.some((l) => Phaser.Math.Distance.Between(px, py, l.x, l.y) < 16)
    ) {
      return '[E] Toggle Rune';
    }
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.simonCenter &&
      Phaser.Math.Distance.Between(px, py, this.specialObjs.simonCenter.x, this.specialObjs.simonCenter.y) < 20
    ) {
      return '[E] Play Sequence';
    }
    if (
      (this.currentRoom.type === 'puzzle' || this.currentRoom.type === 'secret') &&
      !this.currentRoom.puzzleSolved &&
      this.specialObjs.simonRunes.some((r) => Phaser.Math.Distance.Between(px, py, r.x, r.y) < 20)
    ) {
      return '[E] Activate Rune';
    }
    if (
      hasArtifact(inventory, 'wandering_eye') !== -1 &&
      this.isNearClosedSecretWall(px, py)
    ) {
      return '[E] Open Secret Wall (Eye)';
    }
    for (const l of this.lootObjs) {
      if (!l.collected && (l.kind === 'chest' || l.kind === 'item') && Phaser.Math.Distance.Between(px, py, l.sprite.x, l.sprite.y) < 26) {
        return l.kind === 'chest' ? '[E] Open Chest' : `[E] Pick up ${l.itemId?.replace(/_/g, ' ')}`;
      }
    }
    return '';
  }

  private pushUIUpdate(): void {
    const isLocalCoop = localCoopSession.active && this.localPlayers.length > 0;
    const promptText = isLocalCoop
      ? ''
      : this.playerState.downed
        ? ''
        : this.getPromptForActor(this.playerSprite.x, this.playerSprite.y, this.playerState.inventory);
    const localPrompts = isLocalCoop
      ? this.localPlayers.map((lp) =>
          lp.state.downed ? '' : this.getPromptForActor(lp.sprite.x, lp.sprite.y, lp.state.inventory)
        )
      : undefined;
    const localInputTypes = isLocalCoop ? this.localPlayers.map((lp) => lp.inputType) : undefined;

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
      localPlayers: localCoopSession.active ? this.localPlayers.map((lp) => lp.state) : undefined,
      levelIndex: this.levelIndex,
      modifierId: this.floor.modifier as LevelModifierId,
      rooms: this.floor.rooms,
      currentRoom: this.currentRoom,
      bossInfo,
      promptText,
      localPrompts,
      localInputTypes,
      runElapsedMs: Math.max(0, Date.now() - this.runStartMs),
      spectating: spectateTarget
        ? { targetName: spectateTarget.name, count: this.getSpectateTargets().length }
        : null,
    });
  }
}
