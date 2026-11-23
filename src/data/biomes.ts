import { BiomeId, LevelModifierId } from '../types/game';

export interface BiomeConfig {
  id: BiomeId;
  level: number;
  name: string;
  subtitle: string;
  floorDark: number;
  floorLight: number;
  wallDark: number;
  wallTop: number;
  accent: number;
  ambientGlow: number;
  enemyPool: string[];
  elitePool: string[];
  bossId: string;
  hazardKind: 'bramble' | 'crystal_spike' | 'spore_pool' | 'acid_pool' | 'cursed_tile' | 'void_rift';
  loreSnippet: string;
}

export const BIOMES: BiomeConfig[] = [
  {
    id: 'moonlit_grove',
    level: 1,
    name: 'The Moonlit Grove',
    subtitle: 'Soft shadows & sleepy roots',
    floorDark: 0x16142c,
    floorLight: 0x1f1c3d,
    wallDark: 0x26214c,
    wallTop: 0x453b7a,
    accent: 0xf49ac1,
    ambientGlow: 0x3b2c66,
    enemyPool: ['slimelet', 'tiny_moth', 'sleepy_mushroom', 'glimmer_eye'],
    elitePool: ['crystal_beetle', 'puffcap'],
    bossId: 'hollow_stag',
    hazardKind: 'bramble',
    loreSnippet: 'Once, the Everheart sang to every root. Now only moths remember the tune.',
  },
  {
    id: 'crystal_hollows',
    level: 2,
    name: 'The Crystal Hollows',
    subtitle: 'Singing shards & deep echoes',
    floorDark: 0x0e1a33,
    floorLight: 0x15274a,
    wallDark: 0x1d3461,
    wallTop: 0x4a6fa5,
    accent: 0x6ef3ff,
    ambientGlow: 0x1b4f72,
    enemyPool: ['crystal_beetle', 'wisp_bat', 'glimmer_eye', 'prism_mite', 'echo_wisp', 'cave_crawler', 'shard_golem'],
    elitePool: ['crystal_beetle', 'shard_golem', 'haunted_armour'],
    bossId: 'crystal_guardian',
    hazardKind: 'crystal_spike',
    loreSnippet: 'The crystals grew around the fallen sap, trapping starlight inside stone.',
  },
  {
    id: 'fungal_kingdom',
    level: 3,
    name: 'The Fungal Kingdom',
    subtitle: 'Glowing caps & drifting spores',
    floorDark: 0x1e132b,
    floorLight: 0x2b1b3d,
    wallDark: 0x3e2554,
    wallTop: 0x6f438c,
    accent: 0x66ffd9,
    ambientGlow: 0x4a205c,
    enemyPool: ['puffcap', 'spore_spirit', 'sleepy_mushroom', 'mycelium_mite', 'glow_toadstool', 'rot_moth', 'spore_eye', 'moss_hulk'],
    elitePool: ['puffcap', 'moss_hulk', 'corrupted_flower'],
    bossId: 'mothercap',
    hazardKind: 'spore_pool',
    loreSnippet: 'The Mothercap whispers that rot is just another kind of bloom.',
  },
  {
    id: 'verdigris_depths',
    level: 4,
    name: 'The Verdigris Depths',
    subtitle: 'Bubbling pools & ancient copper',
    floorDark: 0x102124,
    floorLight: 0x183135,
    wallDark: 0x204245,
    wallTop: 0x38706e,
    accent: 0xa6ff4d,
    ambientGlow: 0x1d4d3e,
    enemyPool: ['acid_blob', 'corrupted_flower', 'copper_scarab', 'ooze_ling', 'brine_wraith', 'brass_sentinel'],
    elitePool: ['acid_blob', 'brass_sentinel', 'haunted_armour'],
    bossId: 'sludge_empress',
    hazardKind: 'acid_pool',
    loreSnippet: 'Even the brass pipes of the old wardens turned green beneath the weeping roots.',
  },
  {
    id: 'forgotten_reliquary',
    level: 5,
    name: 'The Forgotten Reliquary',
    subtitle: 'Ticking gears & dusty rose',
    floorDark: 0x221426,
    floorLight: 0x301d35,
    wallDark: 0x462945,
    wallTop: 0x82556b,
    accent: 0xffd275,
    ambientGlow: 0x522a47,
    enemyPool: ['haunted_armour', 'button_doll', 'clockwork_tick', 'porcelain_mask', 'pendulum_knight', 'velvet_moth', 'gear_golem'],
    elitePool: ['haunted_armour', 'pendulum_knight', 'gear_golem'],
    bossId: 'clockwork_witch',
    hazardKind: 'cursed_tile',
    loreSnippet: 'Someone locked the reliquary from the inside to keep time from spilling out.',
  },
  {
    id: 'the_evernight',
    level: 6,
    name: 'The Evernight',
    subtitle: 'Heart of the withered roots',
    floorDark: 0x0b0917,
    floorLight: 0x141029,
    wallDark: 0x1e1640,
    wallTop: 0x4b2a75,
    accent: 0xff47b6,
    ambientGlow: 0x2c124d,
    enemyPool: ['voidling', 'button_doll', 'shadow_mote', 'night_weaver', 'abyss_watcher', 'dread_knight'],
    elitePool: ['voidling', 'dread_knight', 'haunted_armour'],
    bossId: 'withered_everheart',
    hazardKind: 'void_rift',
    loreSnippet: 'At the bottom of the world, the Everheart waits—quiet, cold, and still dreaming.',
  },
  {
    id: 'the_crawling_chaos',
    level: 7,
    name: 'The Outer Threshold',
    subtitle: 'Where ancient shadows breathe',
    floorDark: 0x040308,
    floorLight: 0x090612,
    wallDark: 0x0e091b,
    wallTop: 0x1c1236,
    accent: 0xff6b1a,
    ambientGlow: 0x0a0414,
    enemyPool: ['voidling', 'shadow_mote', 'night_weaver', 'abyss_watcher', 'dread_knight'],
    elitePool: ['dread_knight', 'abyss_watcher'],
    bossId: 'nyarlathotep',
    hazardKind: 'void_rift',
    loreSnippet: 'Eight sealed chambers guard the threshold of the Crawling Chaos.',
  },
];

export interface LevelModifierDef {
  id: LevelModifierId;
  name: string;
  description: string;
}

export const LEVEL_MODIFIERS: LevelModifierDef[] = [
  { id: 'none', name: 'Quiet Night', description: 'A calm, undisturbed floor.' },
  { id: 'lunar_bloom', name: 'Lunar Bloom', description: 'Healing is 50% stronger.' },
  { id: 'mischievous_spirits', name: 'Mischievous Spirits', description: 'Enemies move slightly faster.' },
  { id: 'starfall', name: 'Starfall', description: 'Extra shards shimmer in chests.' },
  { id: 'enchanted_floors', name: 'Enchanted Floors', description: 'Player movement speed +15%.' },
  { id: 'greedy_shadows', name: 'Greedy Shadows', description: 'Enemies drop +1 shard.' },
  { id: 'sleepy_night', name: 'Sleepy Night', description: 'Enemies move 15% slower.' },
  { id: 'wild_magic', name: 'Wild Magic', description: 'Projectiles fly 20% faster.' },
];
