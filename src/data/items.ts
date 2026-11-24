import Phaser from 'phaser';
import { ArtifactDef, ConsumableDef, ItemRarity, StatusEffectId } from '../types/game';

export const RARITY_COLORS: Record<ItemRarity, number> = {
  common: 0xffffff,
  uncommon: 0x55ff88,
  rare: 0x5eb8ff,
  super_rare: 0xc084fc,
  secret: 0xffb326,
};

export const RARITY_ORDER: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  super_rare: 3,
  secret: 4,
};

export function stopRarityGlow(textObj: Phaser.GameObjects.BitmapText): void {
  const existing = textObj.getData('rarityGlowTween') as Phaser.Tweens.Tween | undefined;
  if (existing) {
    existing.stop();
    textObj.setData('rarityGlowTween', undefined);
  }
  textObj.setAlpha(1);
}

export function applyRarityTextStyle(
  scene: Phaser.Scene,
  textObj: Phaser.GameObjects.BitmapText,
  rarity?: ItemRarity
): void {
  stopRarityGlow(textObj);
  if (!rarity) {
    textObj.setTint(0xffffff);
    return;
  }

  textObj.setTint(RARITY_COLORS[rarity]);

  if (rarity === 'secret') {
    const goldColor = Phaser.Display.Color.IntegerToColor(0xffe066);
    const orangeColor = Phaser.Display.Color.IntegerToColor(0xff8c1a);
    const tween = scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        if (!textObj.active) {
          tw.stop();
          return;
        }
        const value = tw.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(goldColor, orangeColor, 100, value);
        textObj.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        textObj.setAlpha(0.86 + 0.14 * (1 - value / 100));
      },
    });
    textObj.setData('rarityGlowTween', tween);
  }
}

export const CONSUMABLES: Record<string, ConsumableDef> = {
  heartdew_potion: {
    id: 'heartdew_potion',
    name: 'Heartdew Potion',
    rarity: 'common',
    description: 'Restores 4 HP. One use.',
    maxUses: 1,
    iconKey: 'item_heartdew_potion',
    price: 16,
  },
  syringe: {
    id: 'syringe',
    name: 'Syringe',
    rarity: 'common',
    description: 'Shoot to heal an ally 1.5 hearts (solo: heals self).',
    maxUses: 1,
    iconKey: 'item_syringe',
    price: 12,
  },
  star_bomb: {
    id: 'star_bomb',
    name: 'Star Bomb',
    rarity: 'common',
    description: 'Explodes for 5 AoE dmg & opens secret walls.',
    maxUses: 1,
    iconKey: 'item_star_bomb',
    price: 14,
  },
  fairy_dust: {
    id: 'fairy_dust',
    name: 'Fairy Dust',
    rarity: 'common',
    description: 'Restores 2 stamina & grants Moonblessed.',
    maxUses: 1,
    iconKey: 'item_fairy_dust',
    price: 12,
  },
  revive_totem: {
    id: 'revive_totem',
    name: 'Revive Totem',
    rarity: 'rare',
    description: 'Revives a downed ally (or saves you once).',
    maxUses: 1,
    iconKey: 'item_revive_totem',
    price: 28,
  },
  pocket_fireworks: {
    id: 'pocket_fireworks',
    name: 'Pocket Fireworks',
    rarity: 'uncommon',
    description: 'Fires 16 sparkling bolts around you.',
    maxUses: 1,
    iconKey: 'item_pocket_fireworks',
    price: 18,
  },
  moonmilk: {
    id: 'moonmilk',
    name: 'Moonmilk',
    rarity: 'uncommon',
    description: 'Grants a 3-damage shield.',
    maxUses: 1,
    iconKey: 'item_moonmilk',
    price: 20,
  },
  starlight_brew: {
    id: 'starlight_brew',
    name: 'Starlight Brew',
    rarity: 'uncommon',
    description: 'Deflects bolts 15s',
    maxUses: 1,
    iconKey: 'item_starlight_brew',
    price: 20,
  },
  everheart_elixir: {
    id: 'everheart_elixir',
    name: 'Everheart Elixir',
    rarity: 'rare',
    description: '+2 max hearts 2m',
    maxUses: 1,
    iconKey: 'item_everheart_elixir',
    price: 24,
  },
  blink_scroll: {
    id: 'blink_scroll',
    name: 'Blink Scroll',
    rarity: 'uncommon',
    description: 'Teleport forward through danger (2 uses).',
    maxUses: 2,
    iconKey: 'item_blink_scroll',
    price: 20,
  },
  grappling_hook: {
    id: 'grappling_hook',
    name: 'Grappling Hook',
    rarity: 'uncommon',
    description: 'Yank yourself to an enemy & slam it (3 uses).',
    maxUses: 3,
    iconKey: 'item_grappling_hook',
    price: 22,
  },
  gravity_jar: {
    id: 'gravity_jar',
    name: 'Gravity Jar',
    rarity: 'uncommon',
    description: 'Pulls all enemies inward & slows them.',
    maxUses: 1,
    iconKey: 'item_gravity_jar',
    price: 20,
  },
  chaos_dice: {
    id: 'chaos_dice',
    name: 'Chaos Dice',
    rarity: 'uncommon',
    description: 'Triggers a wild random arcane effect (2 uses).',
    maxUses: 2,
    iconKey: 'item_chaos_dice',
    price: 18,
  },
  decoy_plush: {
    id: 'decoy_plush',
    name: 'Decoy Plush',
    rarity: 'uncommon',
    description: 'Drops a ticking bomb plush + Featherlight (2 uses).',
    maxUses: 2,
    iconKey: 'item_decoy_plush',
    price: 20,
  },
  titan_shroom: {
    id: 'titan_shroom',
    name: 'Titan Shroom',
    rarity: 'rare',
    description: 'Grow giant for 8s and stomp enemies on contact!',
    maxUses: 1,
    iconKey: 'item_titan_shroom',
    price: 30,
  },
  chrono_hourglass: {
    id: 'chrono_hourglass',
    name: 'Chrono Hourglass',
    rarity: 'rare',
    description: 'Freezes enemies for 5s & boosts your speed.',
    maxUses: 1,
    iconKey: 'item_chrono_hourglass',
    price: 32,
  },
  swap_orb: {
    id: 'swap_orb',
    name: 'Swap Orb',
    rarity: 'rare',
    description: 'Swap places with the nearest enemy & shock it (2 uses).',
    maxUses: 2,
    iconKey: 'item_swap_orb',
    price: 26,
  },
  disco_prism: {
    id: 'disco_prism',
    name: 'Disco Prism',
    rarity: 'rare',
    description: 'Fires 16 bouncing rainbow bolts around you.',
    maxUses: 1,
    iconKey: 'item_disco_prism',
    price: 28,
  },
  meteor_whistle: {
    id: 'meteor_whistle',
    name: 'Meteor Whistle',
    rarity: 'rare',
    description: 'Calls down 3 explosive arcane meteors on foes.',
    maxUses: 1,
    iconKey: 'item_meteor_whistle',
    price: 30,
  },
  starlight_flask: {
    id: 'starlight_flask',
    name: 'Starlight Flask',
    rarity: 'super_rare',
    description: 'Full heal + 15s ward',
    maxUses: 2,
    iconKey: 'item_starlight_flask',
    price: 46,
    merchantOnly: true,
  },
  necromancy_altar: {
    id: 'necromancy_altar',
    name: 'Necromancy Altar',
    rarity: 'super_rare',
    description: 'Revives all allies/self',
    maxUses: 1,
    iconKey: 'item_necromancy_altar',
    price: 52,
    merchantOnly: true,
  },
  lucky_backpack: {
    id: 'lucky_backpack',
    name: 'Lucky Backpack',
    rarity: 'super_rare',
    description: 'Gives you what you need most.',
    maxUses: 1,
    iconKey: 'item_lucky_backpack',
    price: 48,
    merchantOnly: true,
  },
};

export const ARTIFACTS: Record<string, ArtifactDef> = {
  tiny_comet: {
    id: 'tiny_comet',
    name: 'Tiny Comet',
    rarity: 'uncommon',
    description: 'Dodging leaves a damaging star trail (5 dodges).',
    maxUses: 5,
    triggerType: 'dodge',
    iconKey: 'item_tiny_comet',
    price: 24,
  },
  glass_heart: {
    id: 'glass_heart',
    name: 'Glass Heart',
    rarity: 'rare',
    description: 'Negates the next hit completely (1 hit).',
    maxUses: 1,
    triggerType: 'hit',
    iconKey: 'item_glass_heart',
    price: 26,
  },
  wandering_eye: {
    id: 'wandering_eye',
    name: 'Wandering Eye',
    rarity: 'uncommon',
    description: 'Reveals secret rooms & opens cracked walls (2 uses).',
    maxUses: 2,
    triggerType: 'level',
    iconKey: 'item_wandering_eye',
    price: 22,
  },
  lucky_acorn: {
    id: 'lucky_acorn',
    name: 'Lucky Acorn',
    rarity: 'common',
    description: 'Bonus shards on room clears (5 rooms).',
    maxUses: 5,
    triggerType: 'room_clear',
    iconKey: 'item_lucky_acorn',
    price: 18,
  },
  moth_crown: {
    id: 'moth_crown',
    name: 'Moth Crown',
    rarity: 'uncommon',
    description: 'Attracts nearby shards & hearts (5 rooms).',
    maxUses: 5,
    triggerType: 'room_clear',
    iconKey: 'item_moth_crown',
    price: 20,
  },
  starseed: {
    id: 'starseed',
    name: 'Starseed',
    rarity: 'rare',
    description: 'Heals 1 HP after elite/boss kills (3 triggers).',
    maxUses: 3,
    triggerType: 'elite_kill',
    iconKey: 'item_starseed',
    price: 28,
  },
  everheart_core: {
    id: 'everheart_core',
    name: 'Everheart Core',
    rarity: 'super_rare',
    description: 'Blocks hit + heals 2',
    maxUses: 3,
    triggerType: 'hit',
    iconKey: 'item_everheart_core',
    price: 55,
    merchantOnly: true,
  },
};

export const CONSUMABLE_IDS = Object.keys(CONSUMABLES);
export const ARTIFACT_IDS = Object.keys(ARTIFACTS);

export interface StatusEffectMeta {
  id: StatusEffectId;
  label: string;
  isPositive: boolean;
  color: number;
}

export const STATUS_EFFECTS: Record<StatusEffectId, StatusEffectMeta> = {
  moonblessed: { id: 'moonblessed', label: 'Moonblessed', isPositive: true, color: 0xa0c4ff },
  starlit: { id: 'starlit', label: 'Starlit', isPositive: true, color: 0xffe066 },
  featherlight: { id: 'featherlight', label: 'Featherlight', isPositive: true, color: 0xd0f4de },
  warmth: { id: 'warmth', label: 'Warmth', isPositive: true, color: 0xffadad },
  sparkling: { id: 'sparkling', label: 'Sparkling', isPositive: true, color: 0x70f8ff },
  starward: { id: 'starward', label: 'Starward', isPositive: true, color: 0x6ef3ff },
  vitality: { id: 'vitality', label: 'Vitality', isPositive: true, color: 0xff75c3 },
  giant: { id: 'giant', label: 'Giant', isPositive: true, color: 0xff9f1c },
  burning: { id: 'burning', label: 'Burning', isPositive: false, color: 0xff6b35 },
  poisoned: { id: 'poisoned', label: 'Poisoned', isPositive: false, color: 0x9ef01a },
  sluggish: { id: 'sluggish', label: 'Sluggish', isPositive: false, color: 0x9d4edd },
  fragile: { id: 'fragile', label: 'Fragile', isPositive: false, color: 0xff758f },
  blinded: { id: 'blinded', label: 'Blinded', isPositive: false, color: 0x4a4e69 },
};
