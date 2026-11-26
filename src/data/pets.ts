export type PetMoveStyle = 'cat' | 'dog' | 'bird' | 'hop' | 'float';
export type PetCategory = 'cat' | 'dog' | 'bird' | 'special';

export interface PetDef {
  id: string;
  name: string;
  category: PetCategory;
  moveStyle: PetMoveStyle;
  description: string;
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  eyeColor: string;
  speed: number;
  scale?: number;
}

export const PET_STORAGE_KEY = 'glimmerdeep_selected_pet';

export const ALL_PETS: PetDef[] = [
  // Cats (brisk ground pathfinding)
  {
    id: 'tabby_cat',
    name: 'Tabby Cat',
    category: 'cat',
    moveStyle: 'cat',
    description: 'Brisk orange tabby that darts around obstacles.',
    primaryColor: 0xe68a2e,
    secondaryColor: 0xf7d08a,
    accentColor: 0x9c4d14,
    eyeColor: '#7ae582',
    speed: 96,
  },
  {
    id: 'tuxedo_cat',
    name: 'Tuxedo Cat',
    category: 'cat',
    moveStyle: 'cat',
    description: 'Dapper black-and-white kitty with golden eyes.',
    primaryColor: 0x222034,
    secondaryColor: 0xf4f4f6,
    accentColor: 0xf49ac1,
    eyeColor: '#ffe066',
    speed: 96,
  },
  {
    id: 'calico_cat',
    name: 'Calico Cat',
    category: 'cat',
    moveStyle: 'cat',
    description: 'Patchwork cream, ginger, and charcoal cat.',
    primaryColor: 0xf5ebe0,
    secondaryColor: 0xe76f51,
    accentColor: 0x3d3448,
    eyeColor: '#ffb703',
    speed: 96,
  },
  {
    id: 'siamese_cat',
    name: 'Siamese Cat',
    category: 'cat',
    moveStyle: 'cat',
    description: 'Sleek cream cat with cocoa points and blue eyes.',
    primaryColor: 0xf2e3c6,
    secondaryColor: 0x5c3d2e,
    accentColor: 0xd4b483,
    eyeColor: '#66ffd9',
    speed: 98,
  },
  {
    id: 'black_cat',
    name: 'Black Cat',
    category: 'cat',
    moveStyle: 'cat',
    description: 'Sleek midnight-black cat with bright golden eyes.',
    primaryColor: 0x262138,
    secondaryColor: 0x3b3355,
    accentColor: 0x1a1628,
    eyeColor: '#ffe066',
    speed: 97,
  },

  // Dogs (steady, slightly slower ground pathfinding)
  {
    id: 'golden_pup',
    name: 'Golden Pup',
    category: 'dog',
    moveStyle: 'dog',
    description: 'Loyal golden puppy that trots behind you.',
    primaryColor: 0xf4b942,
    secondaryColor: 0xfae1a5,
    accentColor: 0xc27d1c,
    eyeColor: '#100d24',
    speed: 74,
  },
  {
    id: 'corgi',
    name: 'Corgi',
    category: 'dog',
    moveStyle: 'dog',
    description: 'Stubby-legged corgi with big perky ears.',
    primaryColor: 0xe07a38,
    secondaryColor: 0xf8f9fa,
    accentColor: 0xa84b18,
    eyeColor: '#100d24',
    speed: 72,
  },
  {
    id: 'husky',
    name: 'Husky',
    category: 'dog',
    moveStyle: 'dog',
    description: 'Fluffy frost-coated pup with ice-blue eyes.',
    primaryColor: 0x6b7a8f,
    secondaryColor: 0xf1f5f9,
    accentColor: 0x3f4a5a,
    eyeColor: '#6ef3ff',
    speed: 76,
  },
  {
    id: 'shiba',
    name: 'Shiba Inu',
    category: 'dog',
    moveStyle: 'dog',
    description: 'Plucky fox-red pup with a curled tail.',
    primaryColor: 0xd96b27,
    secondaryColor: 0xfff1d6,
    accentColor: 0x9e4212,
    eyeColor: '#100d24',
    speed: 75,
  },
  {
    id: 'samoyed',
    name: 'Samoyed',
    category: 'dog',
    moveStyle: 'dog',
    description: 'Big fluffy cloud-white dog with a gentle trot.',
    primaryColor: 0xf8fafc,
    secondaryColor: 0xe2e8f0,
    accentColor: 0xcbd5e1,
    eyeColor: '#100d24',
    speed: 70,
    scale: 1.25,
  },

  // Birds (perch on floor, fly & flap wings when following)
  {
    id: 'bluejay',
    name: 'Bluejay',
    category: 'bird',
    moveStyle: 'bird',
    description: 'Crested songbird that flies and flaps to keep up.',
    primaryColor: 0x3b82f6,
    secondaryColor: 0xf1f5f9,
    accentColor: 0x1d4ed8,
    eyeColor: '#100d24',
    speed: 98,
  },
  {
    id: 'cardinal',
    name: 'Cardinal',
    category: 'bird',
    moveStyle: 'bird',
    description: 'Crimson bird that flutters overhead.',
    primaryColor: 0xe11d48,
    secondaryColor: 0xfda4af,
    accentColor: 0x1e1b2e,
    eyeColor: '#ffe066',
    speed: 98,
  },
  {
    id: 'barn_owl',
    name: 'Barn Owl',
    category: 'bird',
    moveStyle: 'bird',
    description: 'Silent nocturnal owl that glides above hazards.',
    primaryColor: 0xe7d8c9,
    secondaryColor: 0xa68a64,
    accentColor: 0x7f5539,
    eyeColor: '#100d24',
    speed: 94,
  },
  {
    id: 'parrot',
    name: 'Parrot',
    category: 'bird',
    moveStyle: 'bird',
    description: 'Tropical emerald macaw with bright plumage.',
    primaryColor: 0x10b981,
    secondaryColor: 0xfacc15,
    accentColor: 0xef4444,
    eyeColor: '#100d24',
    speed: 98,
  },
  {
    id: 'raven',
    name: 'Raven',
    category: 'bird',
    moveStyle: 'bird',
    description: 'Midnight-violet raven with a glossy sheen.',
    primaryColor: 0x2e294e,
    secondaryColor: 0x6d597a,
    accentColor: 0x18142c,
    eyeColor: '#c084fc',
    speed: 100,
  },

  // Out-there / Fantastical pets
  {
    id: 'pocket_dragon',
    name: 'Pocket Dragon',
    category: 'special',
    moveStyle: 'bird',
    description: 'Tiny emerald dragonet that flaps along beside you.',
    primaryColor: 0x059669,
    secondaryColor: 0xfbbf24,
    accentColor: 0x34d399,
    eyeColor: '#ffe066',
    speed: 96,
  },
  {
    id: 'starlight_wisp',
    name: 'Starlight Wisp',
    category: 'special',
    moveStyle: 'float',
    description: 'Cozy lantern-spirit of shimmering starlight.',
    primaryColor: 0x66ffd9,
    secondaryColor: 0xc4b5fd,
    accentColor: 0xffffff,
    eyeColor: '#100d24',
    speed: 88,
  },
  {
    id: 'mini_shoggoth',
    name: 'Mini Shoggoth',
    category: 'special',
    moveStyle: 'float',
    description: 'Friendly three-eyed eldritch blob from the deep.',
    primaryColor: 0x6d28d9,
    secondaryColor: 0xf472b6,
    accentColor: 0x3b0764,
    eyeColor: '#ffe066',
    speed: 80,
  },
  {
    id: 'clockwork_beetle',
    name: 'Brass Bot',
    category: 'special',
    moveStyle: 'cat',
    description: 'Wind-up clockwork scarab with a glowing core.',
    primaryColor: 0xd97706,
    secondaryColor: 0xfef08a,
    accentColor: 0x66ffd9,
    eyeColor: '#66ffd9',
    speed: 92,
  },
  {
    id: 'moss_frog',
    name: 'Moss Frog',
    category: 'special',
    moveStyle: 'hop',
    description: 'Chubby dungeon frog that leaps after you.',
    primaryColor: 0x65a30d,
    secondaryColor: 0xd9f99d,
    accentColor: 0x3f6212,
    eyeColor: '#ffe066',
    speed: 84,
  },
  {
    id: 'space_axolotl',
    name: 'Space Axolotl',
    category: 'special',
    moveStyle: 'float',
    description: 'Cosmic pink axolotl swimming through thin air.',
    primaryColor: 0xf49ac1,
    secondaryColor: 0xfde2e4,
    accentColor: 0xa855f7,
    eyeColor: '#100d24',
    speed: 86,
  },
  {
    id: 'phantom_kitty',
    name: 'Phantom Kitty',
    category: 'special',
    moveStyle: 'float',
    description: 'Spectral cyan cat that drifts effortlessly.',
    primaryColor: 0x38bdf8,
    secondaryColor: 0xe0f2fe,
    accentColor: 0x0284c7,
    eyeColor: '#ffffff',
    speed: 94,
  },
  {
    id: 'glimmer_slime',
    name: 'Glimmer Slime',
    category: 'special',
    moveStyle: 'hop',
    description: 'Bouncy amethyst crystal slime.',
    primaryColor: 0xa855f7,
    secondaryColor: 0xe9d5ff,
    accentColor: 0x7e22ce,
    eyeColor: '#ffffff',
    speed: 78,
  },
  {
    id: 'toadstool_pal',
    name: 'Sporeling',
    category: 'special',
    moveStyle: 'dog',
    description: 'Waddling spotted mushroom buddy.',
    primaryColor: 0xf43f5e,
    secondaryColor: 0xfef3c7,
    accentColor: 0xffffff,
    eyeColor: '#100d24',
    speed: 72,
  },
];

export function getPetById(id: string | null | undefined): PetDef | undefined {
  if (!id || id === 'none') return undefined;
  return ALL_PETS.find((p) => p.id === id);
}

export function getSavedPetId(): string | null {
  try {
    const saved = localStorage.getItem(PET_STORAGE_KEY);
    if (!saved || saved === 'none') return null;
    return ALL_PETS.some((p) => p.id === saved) ? saved : null;
  } catch {
    return null;
  }
}
