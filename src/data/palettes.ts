import { PlayerPalette } from '../types/game';

export const PLAYER_PALETTES: PlayerPalette[] = [
  { id: 'lavender', cloak: 0x9d7ce8, trim: 0xf49ac1, skin: 0xffe5d9, hat: 0x5c43a8 },
  { id: 'cyan', cloak: 0x4cc9f0, trim: 0xffe066, skin: 0xffd6ba, hat: 0x2b6cb0 },
  { id: 'rose', cloak: 0xf472b6, trim: 0xd0f4de, skin: 0xffe5d9, hat: 0x9d174d },
  { id: 'mint', cloak: 0x34d399, trim: 0xfde68a, skin: 0xffedd5, hat: 0x065f46 },
  { id: 'amber', cloak: 0xfbbf24, trim: 0xfda4af, skin: 0xfde2c8, hat: 0x92400e },
  { id: 'indigo', cloak: 0x6366f1, trim: 0x67e8f9, skin: 0xe2e8f0, hat: 0x312e81 },
  { id: 'coral', cloak: 0xfb7185, trim: 0xfef08a, skin: 0xffe4e6, hat: 0x9f1239 },
  { id: 'ghost', cloak: 0xcbd5e1, trim: 0xc084fc, skin: 0xf8fafc, hat: 0x475569 },
];

export function getPaletteById(id: string): PlayerPalette {
  return PLAYER_PALETTES.find((p) => p.id === id) ?? PLAYER_PALETTES[0];
}

export function pickRandomPaletteId(excludeIds?: Iterable<string>): string {
  const excluded = new Set(excludeIds ?? []);
  const available = PLAYER_PALETTES.filter((p) => !excluded.has(p.id));
  const pool = available.length > 0 ? available : PLAYER_PALETTES;
  return pool[Math.floor(Math.random() * pool.length)].id;
}
