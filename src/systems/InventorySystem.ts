import { ARTIFACTS, ARTIFACT_IDS, CONSUMABLES, CONSUMABLE_IDS } from '../data/items';
import { WEAPONS, WEAPON_IDS } from '../data/weapons';
import { InventoryItem } from '../types/game';
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

export function rollRandomItemId(rng: SeededRandom, includeWeapons = true): string {
  const pool: string[] = [
    ...CONSUMABLE_IDS.filter((id) => !CONSUMABLES[id].merchantOnly),
    ...ARTIFACT_IDS.filter((id) => !ARTIFACTS[id].merchantOnly),
  ];
  if (includeWeapons) {
    pool.push(...WEAPON_IDS.filter((id) => id !== 'moonblade' && !WEAPONS[id].merchantOnly));
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
