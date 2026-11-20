export type Direction = 'north' | 'south' | 'east' | 'west';

export type RoomType =
  | 'start'
  | 'combat'
  | 'hazard'
  | 'treasure'
  | 'puzzle'
  | 'merchant'
  | 'healing'
  | 'event'
  | 'elite'
  | 'boss'
  | 'secret';

export type BiomeId =
  | 'moonlit_grove'
  | 'crystal_hollows'
  | 'fungal_kingdom'
  | 'verdigris_depths'
  | 'forgotten_reliquary'
  | 'the_evernight';

export type LevelModifierId =
  | 'none'
  | 'lunar_bloom'
  | 'mischievous_spirits'
  | 'starfall'
  | 'enchanted_floors'
  | 'greedy_shadows'
  | 'sleepy_night'
  | 'wild_magic';

export type ItemCategory = 'weapon' | 'consumable' | 'artifact';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'super_rare';

export interface InventoryItem {
  instanceId: string;
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  description: string;
  uses: number;
  maxUses: number;
  iconKey: string;
}

export type WeaponStyle =
  | 'melee_arc'
  | 'heavy_slam'
  | 'heavy_sword'
  | 'echo_blade'
  | 'whip_pull'
  | 'spin_flail'
  | 'honey_slam'
  | 'frost_blade'
  | 'venom_blade'
  | 'bow'
  | 'homing_staff'
  | 'fireball'
  | 'boomerang'
  | 'prism_bounce'
  | 'frost_needle'
  | 'bubble'
  | 'heavy_cannon'
  | 'bounce_spore'
  | 'comet_shot'
  | 'fan_spread';

export interface WeaponDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  description: string;
  style: WeaponStyle;
  damage: number;
  maxUses: number;
  cooldownMs: number;
  range: number;
  staminaCost: number;
  projectileSpeed?: number;
  iconKey: string;
  color: number;
  price?: number;
  merchantOnly?: boolean;
}

export interface ConsumableDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  description: string;
  maxUses: number;
  iconKey: string;
  price: number;
  merchantOnly?: boolean;
}

export interface ArtifactDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  description: string;
  maxUses: number;
  triggerType: 'dodge' | 'hit' | 'level' | 'room_clear' | 'elite_kill';
  iconKey: string;
  price: number;
  merchantOnly?: boolean;
}

export type StatusEffectId =
  | 'moonblessed'
  | 'starlit'
  | 'featherlight'
  | 'warmth'
  | 'sparkling'
  | 'starward'
  | 'vitality'
  | 'burning'
  | 'poisoned'
  | 'sluggish'
  | 'fragile'
  | 'blinded';

export interface ActiveStatusEffect {
  id: StatusEffectId;
  remainingMs: number;
  isPositive: boolean;
}

export type EnemyAIBehavior =
  | 'chase'
  | 'orbit'
  | 'strafe'
  | 'charge'
  | 'ambush'
  | 'zone'
  | 'shielded';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  behavior: EnemyAIBehavior;
  spriteKey: string;
  scale?: number;
  isElite?: boolean;
  projectileColor?: number;
  attackCooldownMs?: number;
  shardDrop: number;
}

export interface BossDef {
  id: string;
  name: string;
  subtitle: string;
  hp: number;
  speed: number;
  damage: number;
  spriteKey: string;
  accentColor: number;
}

export interface RoomConnection {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  secretNorth?: boolean;
  secretSouth?: boolean;
  secretEast?: boolean;
  secretWest?: boolean;
}

export interface EnemySpawnState {
  uid: string;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  isElite?: boolean;
}

export interface LootSpawnState {
  uid: string;
  kind: 'shard' | 'item' | 'heart' | 'chest';
  x: number;
  y: number;
  itemId?: string;
  uses?: number;
  amount?: number;
  collected: boolean;
}

export interface ShopStockItem {
  itemId: string;
  price: number;
  sold: boolean;
}

export interface PuzzlePlate {
  id: string;
  tx: number;
  ty: number;
  order: number;
  activated: boolean;
}

export interface RoomData {
  gx: number;
  gy: number;
  type: RoomType;
  seed: number;
  templateId: number;
  connections: RoomConnection;
  visited: boolean;
  cleared: boolean;
  doorsLocked: boolean;
  secretRevealed: boolean;
  enemies: EnemySpawnState[];
  loot: LootSpawnState[];
  shopStock?: ShopStockItem[];
  healingUsed?: boolean;
  eventUsed?: boolean;
  eventKind?: 'fairy_circle' | 'wishing_well' | 'cursed_altar' | 'lore_stone';
  puzzleSolved?: boolean;
  puzzlePlates?: PuzzlePlate[];
  bossDefeated?: boolean;
  brokenCrates?: string[];
}

export interface PlayerPalette {
  id: string;
  cloak: number;
  trim: number;
  skin: number;
  hat: number;
}

export interface PlayerStateSnapshot {
  id: string;
  name: string;
  paletteId: string;
  gx: number;
  gy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  stamina: number;
  maxStamina: number;
  shards: number;
  downed: boolean;
  downedTimerMs: number;
  dodging: boolean;
  activeSlot: number;
  inventory: (InventoryItem | null)[];
  statusEffects: ActiveStatusEffect[];
  inExitReady: boolean;
  animState: 'idle' | 'walk' | 'dodge' | 'attack' | 'downed';
  flipX: boolean;
}

export type GameMode = 'solo' | 'host' | 'client';

export interface LobbyPlayerInfo {
  peerId: string;
  name: string;
  paletteId: string;
  ready: boolean;
  isHost: boolean;
}
