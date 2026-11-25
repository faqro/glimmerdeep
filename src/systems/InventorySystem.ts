import { ARTIFACTS, ARTIFACT_IDS, CONSUMABLES, CONSUMABLE_IDS } from '../data/items';
import { WEAPONS, WEAPON_IDS } from '../data/weapons';
import { InventoryItem, ItemRarity } from '../types/game';
import { SeededRandom } from '../utils/SeededGenerator';
import { JournalSystem } from './JournalSystem';

let nextInstanceSeq = 1;

export function createItemInstance(itemId: string): InventoryItem | null {
  const uid = `itm_${nextInstanceSeq++}_${Math.floor(Math.random() * 9999)}`;
  if (WEAPONS[itemId]) {
    const w = WEAPONS[itemId];
    return {
      instanceId: uid,
      id: w.id,
      name: w.name,
      category: 'weapon',
      rarity: w.rarity,
      description: w.description,
      uses: w.maxUses,
      maxUses: w.maxUses,
      iconKey: w.iconKey,
    };
  }
  if (CONSUMABLES[itemId]) {
    const c = CONSUMABLES[itemId];
    return {
      instanceId: uid,
      id: c.id,
      name: c.name,
      category: 'consumable',
      rarity: c.rarity,
      description: c.description,
      uses: c.maxUses,
      maxUses: c.maxUses,
      iconKey: c.iconKey,
    };
  }
  if (ARTIFACTS[itemId]) {
    const a = ARTIFACTS[itemId];
    return {
      instanceId: uid,
      id: a.id,
      name: a.name,
      category: 'artifact',
      rarity: a.rarity,
      description: a.description,
      uses: a.maxUses,
      maxUses: a.maxUses,
      iconKey: a.iconKey,
    };
  }
  return null;
}

export const SUPER_RARE_MERCHANT_IDS: string[] = [
  ...Object.values(WEAPONS).filter((w) => w.merchantOnly).map((w) => w.id),
  ...Object.values(CONSUMABLES).filter((c) => c.merchantOnly).map((c) => c.id),
  ...Object.values(ARTIFACTS).filter((a) => a.merchantOnly).map((a) => a.id),
];

export function rollSecretChestItemId(rng: SeededRandom): string {
  const secretPool: string[] = [
    ...WEAPON_IDS.filter((id) => WEAPONS[id].rarity === 'secret'),
    ...CONSUMABLE_IDS.filter((id) => CONSUMABLES[id].rarity === 'secret'),
    ...ARTIFACT_IDS.filter((id) => ARTIFACTS[id].rarity === 'secret'),
  ];
  const superRarePool: string[] = [
    ...WEAPON_IDS.filter((id) => WEAPONS[id].rarity === 'super_rare'),
    ...CONSUMABLE_IDS.filter((id) => CONSUMABLES[id].rarity === 'super_rare'),
    ...ARTIFACT_IDS.filter((id) => ARTIFACTS[id].rarity === 'super_rare'),
  ];
  if (secretPool.length > 0 && rng.chance(1 / 7)) {
    return rng.pick(secretPool);
  }
  if (superRarePool.length > 0) {
    return rng.pick(superRarePool);
  }
  return rollRandomItemId(rng);
}

export function rollRandomItemId(rng: SeededRandom, includeWeapons = true): string {
  const pool: string[] = [
    ...CONSUMABLE_IDS.filter((id) => !CONSUMABLES[id].merchantOnly && CONSUMABLES[id].rarity !== 'secret'),
    ...ARTIFACT_IDS.filter((id) => !ARTIFACTS[id].merchantOnly && ARTIFACTS[id].rarity !== 'secret'),
  ];
  if (includeWeapons) {
    pool.push(
      ...WEAPON_IDS.filter(
        (id) => id !== 'moonblade' && !WEAPONS[id].merchantOnly && WEAPONS[id].rarity !== 'secret'
      )
    );
  }
  return rng.pick(pool);
}

export function rollItemIdByRarities(rng: SeededRandom, rarities: ItemRarity[], includeWeapons = true): string {
  const allowed = new Set(rarities);
  const pool: string[] = [
    ...CONSUMABLE_IDS.filter((id) => !CONSUMABLES[id].merchantOnly && allowed.has(CONSUMABLES[id].rarity)),
    ...ARTIFACT_IDS.filter((id) => !ARTIFACTS[id].merchantOnly && allowed.has(ARTIFACTS[id].rarity)),
  ];
  if (includeWeapons) {
    pool.push(
      ...WEAPON_IDS.filter(
        (id) => id !== 'moonblade' && !WEAPONS[id].merchantOnly && allowed.has(WEAPONS[id].rarity)
      )
    );
  }
  return pool.length > 0 ? rng.pick(pool) : rollRandomItemId(rng, includeWeapons);
}

const NON_COMBAT_BOSS_DROP_IDS = new Set(['wandering_eye', 'lucky_acorn', 'moth_crown', 'starseed']);
const MELEE_WEAPON_STYLES = new Set([
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
]);

export function rollBossCombatItemId(rng: SeededRandom): string {
  const allowed = new Set(['common', 'uncommon', 'rare']);
  const pool: string[] = [];

  for (const id of CONSUMABLE_IDS) {
    if (!CONSUMABLES[id].merchantOnly && allowed.has(CONSUMABLES[id].rarity) && !NON_COMBAT_BOSS_DROP_IDS.has(id)) {
      for (let w = 0; w < 4; w++) pool.push(id);
    }
  }
  for (const id of ARTIFACT_IDS) {
    if (!ARTIFACTS[id].merchantOnly && allowed.has(ARTIFACTS[id].rarity) && !NON_COMBAT_BOSS_DROP_IDS.has(id)) {
      for (let w = 0; w < 2; w++) pool.push(id);
    }
  }
  for (const id of WEAPON_IDS) {
    if (id !== 'moonblade' && !WEAPONS[id].merchantOnly && allowed.has(WEAPONS[id].rarity) && !NON_COMBAT_BOSS_DROP_IDS.has(id)) {
      const weight = MELEE_WEAPON_STYLES.has(WEAPONS[id].style) ? 1 : 5;
      for (let w = 0; w < weight; w++) pool.push(id);
    }
  }
  return rng.pick(pool);
}

export function addItemToSlots(
  slots: (InventoryItem | null)[],
  activeSlot: number,
  item: InventoryItem
): { added: boolean; replaced: InventoryItem | null } {
  JournalSystem.discoverItem(item.id);
  const emptyIdx = slots.findIndex((s) => s === null);
  if (emptyIdx !== -1) {
    slots[emptyIdx] = item;
    return { added: true, replaced: null };
  }
  const replaced = slots[activeSlot];
  slots[activeSlot] = item;
  return { added: true, replaced };
}

export function consumeUse(slots: (InventoryItem | null)[], slotIdx: number, amount = 1): boolean {
  const item = slots[slotIdx];
  if (!item) return false;
  item.uses -= amount;
  if (item.uses <= 0) {
    slots[slotIdx] = null;
    return true; // broke / consumed
  }
  return false;
}

export function hasArtifact(slots: (InventoryItem | null)[], artifactId: string): number {
  return slots.findIndex((s) => s && s.category === 'artifact' && s.id === artifactId && s.uses > 0);
}
