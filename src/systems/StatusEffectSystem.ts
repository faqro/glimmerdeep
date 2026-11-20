import { STATUS_EFFECTS } from '../data/items';
import { ActiveStatusEffect, StatusEffectId } from '../types/game';

export class StatusEffectManager {
  static addEffect(effects: ActiveStatusEffect[], id: StatusEffectId, durationMs: number): void {
    const meta = STATUS_EFFECTS[id];
    const existing = effects.find((e) => e.id === id);
    if (existing) {
      existing.remainingMs = Math.max(existing.remainingMs, durationMs);
    } else {
      effects.push({
        id,
        remainingMs: durationMs,
        isPositive: meta.isPositive,
      });
    }
  }

  static has(effects: ActiveStatusEffect[], id: StatusEffectId): boolean {
    return effects.some((e) => e.id === id && e.remainingMs > 0);
  }

  static tick(effects: ActiveStatusEffect[], deltaMs: number): ActiveStatusEffect[] {
    for (const e of effects) {
      e.remainingMs -= deltaMs;
    }
    return effects.filter((e) => e.remainingMs > 0);
  }

  static getSpeedMultiplier(effects: ActiveStatusEffect[]): number {
    let mult = 1;
    if (this.has(effects, 'moonblessed')) mult *= 1.2;
    if (this.has(effects, 'sluggish')) mult *= 0.72;
    return mult;
  }

  static getDodgeDistanceMultiplier(effects: ActiveStatusEffect[]): number {
    return this.has(effects, 'featherlight') ? 1.3 : 1;
  }

  static getProjectileSpeedMultiplier(effects: ActiveStatusEffect[]): number {
    return this.has(effects, 'sparkling') ? 1.35 : 1;
  }
}
