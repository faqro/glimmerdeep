import { BIOMES, LEVEL_MODIFIERS } from '../data/biomes';
import { ARTIFACT_IDS, CONSUMABLES, CONSUMABLE_IDS, ARTIFACTS } from '../data/items';
import { ENEMIES } from '../data/enemies';
import { WEAPONS, WEAPON_IDS } from '../data/weapons';
import { SUPER_RARE_MERCHANT_IDS } from './InventorySystem';
import { LevelModifierId, RoomData, RoomType, ShopStockItem } from '../types/game';
import { deriveSeed, SeededRandom } from '../utils/SeededGenerator';

export interface GeneratedFloor {
  levelIndex: number;
  seed: number;
  modifier: LevelModifierId;
  rooms: RoomData[][];
}

export class DungeonGenerator {
  static generateFloor(levelIndex: number, floorSeed: number, playerCount = 1): GeneratedFloor {
    const rng = new SeededRandom(floorSeed);
    const biome = BIOMES[Math.min(levelIndex, BIOMES.length - 1)];

    // Pick a random global modifier (level 1 has higher chance of Quiet Night)
    const modPool = LEVEL_MODIFIERS.map((m) => m.id);
    const modifier: LevelModifierId =
      levelIndex === 0 && rng.chance(0.5) ? 'none' : rng.pick(modPool);

    if (levelIndex === 6) {
      return this.generateLevel7Floor(levelIndex, floorSeed, playerCount, rng, biome);
    }

    const grid: (RoomData | null)[][] = Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => null)
    );
    const activeSet = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;

    const ensureRoom = (gx: number, gy: number): RoomData => {
      if (!grid[gy][gx]) {
        const roomSeed = deriveSeed(floorSeed, gx + 1, gy + 1);
        grid[gy][gx] = {
          gx,
          gy,
          type: 'combat',
          seed: roomSeed,
          templateId: 0,
          connections: { north: false, south: false, east: false, west: false },
          visited: false,
          cleared: false,
          doorsLocked: false,
          secretRevealed: false,
          enemies: [],
          loot: [],
        };
        activeSet.add(key(gx, gy));
      }
      return grid[gy][gx]!;
    };

    const connect = (ax: number, ay: number, bx: number, by: number) => {
      const a = ensureRoom(ax, ay);
      const b = ensureRoom(bx, by);
      if (bx === ax + 1 && by === ay) {
        a.connections.east = true;
        b.connections.west = true;
      } else if (bx === ax - 1 && by === ay) {
        a.connections.west = true;
        b.connections.east = true;
      } else if (by === ay + 1 && bx === ax) {
        a.connections.south = true;
        b.connections.north = true;
      } else if (by === ay - 1 && bx === ax) {
        a.connections.north = true;
        b.connections.south = true;
      }
    };

    // Start (0,2), Exit/Boss (5,2)
    ensureRoom(0, 2);
    ensureRoom(5, 2);

    // Path A: upper route from (0,2) -> (5,2)
    let cx = 0;
    let cy = 2;
    const upperTargetY = rng.int(0, 1);
    while (cy > upperTargetY) {
      connect(cx, cy, cx, cy - 1);
      cy--;
    }
    while (cx < 5) {
      connect(cx, cy, cx + 1, cy);
      cx++;
    }
    while (cy < 2) {
      connect(cx, cy, cx, cy + 1);
      cy++;
    }

    // Path B: lower route from (0,2) -> (5,2)
    cx = 0;
    cy = 2;
    const lowerTargetY = rng.int(3, 5);
    while (cy < lowerTargetY) {
      connect(cx, cy, cx, cy + 1);
      cy++;
    }
    while (cx < 5) {
      connect(cx, cy, cx + 1, cy);
      cx++;
    }
    while (cy > 2) {
      connect(cx, cy, cx, cy - 1);
      cy--;
    }

    // Add optional branches for exploration variety until ~22-26 rooms
    const targetRooms = rng.int(21, 26);
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];
    let safety = 0;
    while (activeSet.size < targetRooms && safety < 200) {
      safety++;
      const coords = Array.from(activeSet).map((s) => s.split(',').map(Number));
      const [rx, ry] = rng.pick(coords);
      if (rx === 5 && ry === 2) continue;
      const d = rng.pick(dirs);
      const nx = rx + d.dx;
      const ny = ry + d.dy;
      if (nx >= 0 && nx < 6 && ny >= 0 && ny < 6) {
        if (nx === 5 && ny === 2) continue;
        const already = grid[ny][nx] !== null;
        if (!already || rng.chance(0.18)) {
          connect(rx, ry, nx, ny);
        }
      }
    }

    // Fill any remaining uncreated cells with empty/secret rooms if needed, or keep 6x6 sparse
    // We keep unused cells as null? Wait: GDD says 6x6 grid; let's make sure every cell in 6x6 is either reachable or a secret/unused room.
    // Let's convert 1-2 unreachable adjacent cells into Secret rooms connected via secret wall!
    const secretCandidates: Array<{ sx: number; sy: number; fromX: number; fromY: number; dir: 'north' | 'south' | 'east' | 'west' }> = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if (grid[y][x]) continue;
        const neighbors: Array<{ nx: number; ny: number; dir: 'north' | 'south' | 'east' | 'west' }> = [
          { nx: x, ny: y - 1, dir: 'south' },
          { nx: x, ny: y + 1, dir: 'north' },
          { nx: x + 1, ny: y, dir: 'west' },
          { nx: x - 1, ny: y, dir: 'east' },
        ];
        for (const n of neighbors) {
          if (n.nx >= 0 && n.nx < 6 && n.ny >= 0 && n.ny < 6 && grid[n.ny][n.nx]) {
            if (!(n.nx === 5 && n.ny === 2) && !(n.nx === 0 && n.ny === 2)) {
              secretCandidates.push({ sx: x, sy: y, fromX: n.nx, fromY: n.ny, dir: n.dir });
              break;
            }
          }
        }
      }
    }

    rng.shuffle(secretCandidates);
    const secretCount = Math.min(2, secretCandidates.length);
    for (let i = 0; i < secretCount; i++) {
      const c = secretCandidates[i];
      const secRoom = ensureRoom(c.sx, c.sy);
      secRoom.type = 'secret';
      const parent = grid[c.fromY][c.fromX]!;
      if (c.dir === 'north') {
        parent.connections.secretNorth = true;
        secRoom.connections.south = true;
      } else if (c.dir === 'south') {
        parent.connections.secretSouth = true;
        secRoom.connections.north = true;
      } else if (c.dir === 'east') {
        parent.connections.secretEast = true;
        secRoom.connections.west = true;
      } else if (c.dir === 'west') {
        parent.connections.secretWest = true;
        secRoom.connections.east = true;
      }
    }

    // Assign room types to non-start, non-boss, non-secret rooms
    const normalRooms: RoomData[] = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const r = grid[y][x];
        if (!r) continue;
        if (x === 0 && y === 2) {
          r.type = 'start';
          r.cleared = true;
          r.visited = true;
        } else if (x === 5 && y === 2) {
          r.type = 'boss';
        } else if (r.type !== 'secret') {
          normalRooms.push(r);
        }
      }
    }

    rng.shuffle(normalRooms);
    // Keep non-enemy special rooms to at most ~45% so >= 50% of all rooms have enemies
    const maxNonEnemy = Math.max(4, Math.floor(normalRooms.length * 0.42));
    const specialPool: RoomType[] = [
      'merchant',
      'healing',
      'treasure',
      'puzzle',
      'event',
      'treasure',
      'healing',
      'puzzle',
      'merchant',
    ];
    const nonEnemyTypes = specialPool.slice(0, maxNonEnemy);

    // Remaining rooms are combat, hazard, or elite (all have enemies!)
    const enemyRoomTypes: RoomType[] = [];
    const enemySlots = normalRooms.length - nonEnemyTypes.length;
    for (let i = 0; i < enemySlots; i++) {
      if (i % 3 === 1) enemyRoomTypes.push('hazard');
      else if (i % 7 === 4) enemyRoomTypes.push('elite');
      else enemyRoomTypes.push('combat');
    }

    const combinedTypes = [...nonEnemyTypes, ...enemyRoomTypes];
    rng.shuffle(combinedTypes);
    for (let i = 0; i < normalRooms.length; i++) {
      normalRooms[i].type = combinedTypes[i] ?? 'combat';
    }

    // Populate each room's contents deterministically
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const room = grid[y][x];
        if (!room) continue;
        this.populateRoom(room, biome, levelIndex, rng, playerCount);
      }
    }

    // Return 6x6 matrix (unused cells remain null; RoomData[][] typed with non-null or handled)
    return {
      levelIndex,
      seed: floorSeed,
      modifier,
      rooms: grid as RoomData[][],
    };
  }

  private static populateRoom(
    room: RoomData,
    biome: (typeof BIOMES)[number],
    levelIndex: number,
    floorRng: SeededRandom,
    playerCount: number
  ): void {
    const rng = new SeededRandom(room.seed);
    room.templateId = rng.int(0, 5);

    if (room.type === 'start') {
      room.cleared = true;
      return;
    }

    if (room.type === 'combat' || room.type === 'hazard') {
      // Pick 1 primary enemy type (60%) or 2 enemy types (40%) so rooms have cohesive enemy groups
      const primaryId = rng.pick(biome.enemyPool);
      const useTwoTypes = biome.enemyPool.length > 1 && rng.chance(0.4);
      const secondaryCandidates = biome.enemyPool.filter((id) => id !== primaryId);
      const secondaryId = useTwoTypes ? rng.pick(secondaryCandidates) : primaryId;

      const primaryDef = ENEMIES[primaryId];
      // Weaker/swarm enemies spawn in larger numbers; tougher enemies spawn in smaller numbers
      const strengthBase =
        primaryDef.hp <= 4 ? 4 : primaryDef.hp <= 6 ? 3 : primaryDef.hp <= 9 ? 2 : 1;
      const levelBonus = Math.floor(levelIndex / 2);
      const playerMult = 1 + (Math.max(1, playerCount) - 1) * 0.35; // 1p=1.0, 2p=1.35, 3p=1.7, 4p=2.05
      const rawCount = Math.round((strengthBase + rng.int(0, 1) + levelBonus) * playerMult);
      const count = Math.max(1, Math.min(9, rawCount));

      for (let i = 0; i < count; i++) {
        const defId = useTwoTypes && i % 2 === 1 ? secondaryId : primaryId;
        const def = ENEMIES[defId];
        const ex = rng.int(36, 140);
        const ey = rng.int(36, 140);
        room.enemies.push({
          uid: `e_${room.gx}_${room.gy}_${i}`,
          defId,
          x: ex,
          y: ey,
          hp: def.hp + Math.floor(levelIndex * 0.6),
          maxHp: def.hp + Math.floor(levelIndex * 0.6),
          alive: true,
        });
      }
      return;
    }

    if (room.type === 'elite') {
      const eliteId = rng.pick(biome.elitePool);
      const eliteDef = ENEMIES[eliteId];
      const hp = eliteDef.hp * 2 + levelIndex * 2;
      room.enemies.push({
        uid: `elite_${room.gx}_${room.gy}_0`,
        defId: eliteId,
        x: 88,
        y: 88,
        hp,
        maxHp: hp,
        alive: true,
        isElite: true,
      });
      const helperId = rng.pick(biome.enemyPool);
      const helperDef = ENEMIES[helperId];
      room.enemies.push({
        uid: `elite_${room.gx}_${room.gy}_1`,
        defId: helperId,
        x: 56,
        y: 88,
        hp: helperDef.hp,
        maxHp: helperDef.hp,
        alive: true,
      });
      return;
    }

    if (room.type === 'treasure' || room.type === 'secret') {
      room.cleared = true;
      const secretWeapons = WEAPON_IDS.filter((id) => WEAPONS[id].rarity === 'secret');
      const secretChestItemId =
        room.type === 'secret' && secretWeapons.length > 0 && rng.chance(1 / 7)
          ? rng.pick(secretWeapons)
          : undefined;
      room.loot.push({
        uid: `chest_${room.gx}_${room.gy}`,
        kind: 'chest',
        x: 88,
        y: 88,
        itemId: secretChestItemId,
        collected: false,
      });
      if (room.type === 'secret') {
        room.loot.push({
          uid: `sec_shard_${room.gx}_${room.gy}_1`,
          kind: 'shard',
          x: 64,
          y: 88,
          amount: 5,
          collected: false,
        });
        room.loot.push({
          uid: `sec_shard_${room.gx}_${room.gy}_2`,
          kind: 'shard',
          x: 112,
          y: 88,
          amount: 5,
          collected: false,
        });
      }
      return;
    }

    if (room.type === 'merchant') {
      room.cleared = true;
      const stock: ShopStockItem[] = [];
      const normalWeapons = WEAPON_IDS.filter(
        (id) => id !== 'moonblade' && !WEAPONS[id].merchantOnly && WEAPONS[id].rarity !== 'secret'
      );
      const normalConsumables = CONSUMABLE_IDS.filter(
        (id) => !CONSUMABLES[id].merchantOnly && CONSUMABLES[id].rarity !== 'secret'
      );
      const normalArtifacts = ARTIFACT_IDS.filter(
        (id) => !ARTIFACTS[id].merchantOnly && ARTIFACTS[id].rarity !== 'secret'
      );

      const wId = rng.pick(normalWeapons);
      const cId = rng.pick(normalConsumables);
      const aId = rng.pick(normalArtifacts);
      stock.push({ itemId: wId, price: rng.int(22, 34), sold: false });
      stock.push({ itemId: cId, price: CONSUMABLES[cId].price, sold: false });
      stock.push({ itemId: aId, price: ARTIFACTS[aId].price, sold: false });

      // ~1 in 10 merchants sells a single super rare merchant-only item (~46-55 shards)
      if (SUPER_RARE_MERCHANT_IDS.length > 0 && rng.chance(0.1)) {
        const srId = rng.pick(SUPER_RARE_MERCHANT_IDS);
        const srDef = WEAPONS[srId] ?? CONSUMABLES[srId] ?? ARTIFACTS[srId];
        const slotIdx = rng.int(0, 2);
        stock[slotIdx] = {
          itemId: srId,
          price: srDef?.price ?? 50,
          sold: false,
        };
      }

      room.shopStock = stock;
      return;
    }

    if (room.type === 'healing') {
      room.cleared = true;
      room.healingUsed = false;
      return;
    }

    if (room.type === 'event') {
      room.cleared = true;
      room.eventUsed = false;
      room.eventKind = floorRng.pick(['fairy_circle', 'wishing_well', 'cursed_altar', 'lore_stone']);
      return;
    }

    if (room.type === 'puzzle') {
      room.puzzleSolved = false;
      const kind = floorRng.pick(['plates', 'mirror_beam', 'block_push'] as const);
      room.puzzleKind = kind;
      const variant = floorRng.int(0, 3);

      if (kind === 'plates') {
        if (variant === 0) {
          room.puzzleObstacles = [
            { tx: 4, ty: 4 },
            { tx: 6, ty: 4 },
            { tx: 4, ty: 6 },
            { tx: 6, ty: 6 },
          ];
          room.puzzlePlates = [
            { id: 'p0', tx: 2, ty: 2, order: 1, activated: false },
            { id: 'p1', tx: 8, ty: 8, order: 2, activated: false },
            { id: 'p2', tx: 8, ty: 2, order: 3, activated: false },
            { id: 'p3', tx: 2, ty: 8, order: 4, activated: false },
          ];
        } else if (variant === 1) {
          room.puzzleObstacles = [
            { tx: 4, ty: 3 },
            { tx: 6, ty: 3 },
            { tx: 4, ty: 7 },
            { tx: 6, ty: 7 },
          ];
          room.puzzlePlates = [
            { id: 'p0', tx: 2, ty: 3, order: 1, activated: false },
            { id: 'p1', tx: 8, ty: 7, order: 2, activated: false },
            { id: 'p2', tx: 2, ty: 7, order: 3, activated: false },
            { id: 'p3', tx: 8, ty: 3, order: 4, activated: false },
          ];
        } else if (variant === 2) {
          room.puzzleObstacles = [
            { tx: 3, ty: 4 },
            { tx: 5, ty: 3 },
            { tx: 7, ty: 4 },
            { tx: 4, ty: 7 },
            { tx: 6, ty: 7 },
          ];
          room.puzzlePlates = [
            { id: 'p0', tx: 2, ty: 2, order: 1, activated: false },
            { id: 'p1', tx: 8, ty: 2, order: 2, activated: false },
            { id: 'p2', tx: 5, ty: 6, order: 3, activated: false },
            { id: 'p3', tx: 2, ty: 8, order: 4, activated: false },
            { id: 'p4', tx: 8, ty: 8, order: 5, activated: false },
          ];
        } else {
          room.puzzleObstacles = [
            { tx: 3, ty: 3 },
            { tx: 3, ty: 7 },
            { tx: 7, ty: 3 },
            { tx: 7, ty: 7 },
            { tx: 5, ty: 4 },
            { tx: 5, ty: 6 },
          ];
          room.puzzlePlates = [
            { id: 'p0', tx: 2, ty: 2, order: 1, activated: false },
            { id: 'p1', tx: 6, ty: 5, order: 2, activated: false },
            { id: 'p2', tx: 4, ty: 5, order: 3, activated: false },
            { id: 'p3', tx: 8, ty: 2, order: 4, activated: false },
            { id: 'p4', tx: 8, ty: 8, order: 5, activated: false },
          ];
        }
      } else if (kind === 'mirror_beam') {
        if (variant === 0) {
          room.puzzleObstacles = [
            { tx: 2, ty: 7 },
            { tx: 7, ty: 7 },
            { tx: 8, ty: 6 },
            { tx: 5, ty: 3 },
          ];
          room.puzzleBeam = {
            emitterTx: 2,
            emitterTy: 4,
            emitterDir: 'east',
            targetTx: 9,
            targetTy: 8,
            mirrors: [
              { id: 'm0', tx: 4, ty: 4, orientation: 'backslash' },
              { id: 'm1', tx: 4, ty: 2, orientation: 'backslash' },
              { id: 'm2', tx: 8, ty: 2, orientation: 'slash' },
              { id: 'm3', tx: 8, ty: 4, orientation: 'backslash' },
              { id: 'm4', tx: 6, ty: 4, orientation: 'backslash' },
              { id: 'm5', tx: 6, ty: 8, orientation: 'slash' },
              { id: 'm6', tx: 4, ty: 7, orientation: 'backslash' },
            ],
          };
        } else if (variant === 1) {
          room.puzzleObstacles = [
            { tx: 8, ty: 5 },
            { tx: 1, ty: 4 },
            { tx: 8, ty: 9 },
            { tx: 4, ty: 3 },
          ];
          room.puzzleBeam = {
            emitterTx: 2,
            emitterTy: 8,
            emitterDir: 'north',
            targetTx: 9,
            targetTy: 2,
            mirrors: [
              { id: 'm0', tx: 2, ty: 2, orientation: 'backslash' },
              { id: 'm1', tx: 6, ty: 2, orientation: 'slash' },
              { id: 'm2', tx: 6, ty: 7, orientation: 'backslash' },
              { id: 'm3', tx: 3, ty: 7, orientation: 'slash' },
              { id: 'm4', tx: 3, ty: 4, orientation: 'backslash' },
              { id: 'm5', tx: 8, ty: 4, orientation: 'backslash' },
              { id: 'm6', tx: 8, ty: 2, orientation: 'backslash' },
              { id: 'm7', tx: 8, ty: 7, orientation: 'slash' },
            ],
          };
        } else if (variant === 2) {
          room.puzzleObstacles = [
            { tx: 4, ty: 3 },
            { tx: 6, ty: 7 },
            { tx: 3, ty: 6 },
            { tx: 7, ty: 6 },
          ];
          room.puzzleBeam = {
            emitterTx: 1,
            emitterTy: 3,
            emitterDir: 'east',
            targetTx: 9,
            targetTy: 7,
            mirrors: [
              { id: 'm0', tx: 2, ty: 3, orientation: 'slash' },
              { id: 'm1', tx: 2, ty: 8, orientation: 'slash' },
              { id: 'm2', tx: 5, ty: 8, orientation: 'backslash' },
              { id: 'm3', tx: 5, ty: 2, orientation: 'backslash' },
              { id: 'm4', tx: 8, ty: 2, orientation: 'slash' },
              { id: 'm5', tx: 8, ty: 7, orientation: 'slash' },
              { id: 'm6', tx: 7, ty: 8, orientation: 'backslash' },
            ],
          };
        } else {
          room.puzzleObstacles = [
            { tx: 5, ty: 3 },
            { tx: 3, ty: 5 },
            { tx: 7, ty: 6 },
            { tx: 5, ty: 7 },
            { tx: 2, ty: 4 },
          ];
          room.puzzleBeam = {
            emitterTx: 9,
            emitterTy: 3,
            emitterDir: 'west',
            targetTx: 2,
            targetTy: 8,
            mirrors: [
              { id: 'm0', tx: 7, ty: 3, orientation: 'slash' },
              { id: 'm1', tx: 7, ty: 2, orientation: 'backslash' },
              { id: 'm2', tx: 3, ty: 2, orientation: 'backslash' },
              { id: 'm3', tx: 3, ty: 4, orientation: 'slash' },
              { id: 'm4', tx: 6, ty: 4, orientation: 'slash' },
              { id: 'm5', tx: 6, ty: 8, orientation: 'backslash' },
              { id: 'm6', tx: 4, ty: 8, orientation: 'slash' },
              { id: 'm7', tx: 4, ty: 6, orientation: 'slash' },
              { id: 'm8', tx: 2, ty: 6, orientation: 'backslash' },
            ],
          };
        }
      } else {
        if (variant === 0) {
          room.puzzleObstacles = [
            { tx: 3, ty: 4 },
            { tx: 5, ty: 4 },
            { tx: 7, ty: 4 },
            { tx: 5, ty: 6 },
          ];
          room.puzzleBlock = {
            goals: [
              { tx: 3, ty: 2 },
              { tx: 7, ty: 2 },
            ],
            blocks: [
              { id: 'b0', tx: 3, ty: 6, initialTx: 3, initialTy: 6 },
              { id: 'b1', tx: 7, ty: 6, initialTx: 7, initialTy: 6 },
            ],
            resetTx: 2,
            resetTy: 8,
          };
        } else if (variant === 1) {
          room.puzzleObstacles = [
            { tx: 4, ty: 3 },
            { tx: 6, ty: 3 },
            { tx: 4, ty: 6 },
            { tx: 6, ty: 6 },
            { tx: 5, ty: 4 },
          ];
          room.puzzleBlock = {
            goals: [
              { tx: 3, ty: 2 },
              { tx: 5, ty: 2 },
              { tx: 7, ty: 2 },
            ],
            blocks: [
              { id: 'b0', tx: 3, ty: 7, initialTx: 3, initialTy: 7 },
              { id: 'b1', tx: 5, ty: 7, initialTx: 5, initialTy: 7 },
              { id: 'b2', tx: 7, ty: 7, initialTx: 7, initialTy: 7 },
            ],
            resetTx: 2,
            resetTy: 8,
          };
        } else if (variant === 2) {
          room.puzzleObstacles = [
            { tx: 3, ty: 4 },
            { tx: 4, ty: 4 },
            { tx: 6, ty: 4 },
            { tx: 7, ty: 4 },
            { tx: 4, ty: 7 },
            { tx: 6, ty: 7 },
          ];
          room.puzzleBlock = {
            goals: [
              { tx: 2, ty: 2 },
              { tx: 5, ty: 2 },
              { tx: 8, ty: 2 },
            ],
            blocks: [
              { id: 'b0', tx: 3, ty: 6, initialTx: 3, initialTy: 6 },
              { id: 'b1', tx: 5, ty: 6, initialTx: 5, initialTy: 6 },
              { id: 'b2', tx: 7, ty: 6, initialTx: 7, initialTy: 6 },
            ],
            resetTx: 2,
            resetTy: 8,
          };
        } else {
          room.puzzleObstacles = [
            { tx: 3, ty: 3 },
            { tx: 4, ty: 3 },
            { tx: 6, ty: 5 },
            { tx: 7, ty: 5 },
            { tx: 3, ty: 7 },
            { tx: 4, ty: 7 },
          ];
          room.puzzleBlock = {
            goals: [
              { tx: 2, ty: 2 },
              { tx: 7, ty: 2 },
              { tx: 8, ty: 8 },
            ],
            blocks: [
              { id: 'b0', tx: 2, ty: 6, initialTx: 2, initialTy: 6 },
              { id: 'b1', tx: 5, ty: 4, initialTx: 5, initialTy: 4 },
              { id: 'b2', tx: 7, ty: 7, initialTx: 7, initialTy: 7 },
            ],
            resetTx: 2,
            resetTy: 8,
          };
        }
      }
      return;
    }

    if (room.type === 'boss') {
      room.bossDefeated = false;
      return;
    }
  }

  private static generateLevel7Floor(
    levelIndex: number,
    floorSeed: number,
    playerCount: number,
    rng: SeededRandom,
    biome: (typeof BIOMES)[number]
  ): GeneratedFloor {
    const grid: (RoomData | null)[][] = Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => null)
    );

    const makeRoom = (gx: number, gy: number, type: RoomType): RoomData => {
      const roomSeed = deriveSeed(floorSeed, gx + 1, gy + 1);
      const room: RoomData = {
        gx,
        gy,
        type,
        seed: roomSeed,
        templateId: (gx + gy) % 6,
        connections: { north: false, south: false, east: false, west: false },
        visited: false,
        cleared: false,
        doorsLocked: false,
        secretRevealed: false,
        enemies: [],
        loot: [],
      };
      grid[gy][gx] = room;
      return room;
    };

    const doorTxs = [7, 14, 21, 28];
    const hallway = makeRoom(0, 1, 'start');
    hallway.cleared = true;
    hallway.visited = true;
    hallway.widthTiles = 37;
    hallway.heightTiles = 9;
    hallway.connections.east = true;
    hallway.hallwayDoors = [];

    const bonusKinds = ['chest', 'chest', 'heart', 'heart', 'shards', 'shards', 'none', 'none'];
    rng.shuffle(bonusKinds);
    let bonusIdx = 0;

    for (let i = 0; i < 4; i++) {
      const tx = doorTxs[i];
      const doorCenterX = tx * 16 + 8;

      // Top room (gx: i+1, gy: 0)
      const topRoom = makeRoom(i + 1, 0, i % 2 === 1 ? 'hazard' : i === 3 ? 'elite' : 'combat');
      topRoom.connections.south = true;
      topRoom.hallwayDoors = [
        {
          dir: 'south',
          tx: 5,
          ty: 10,
          targetGx: 0,
          targetGy: 1,
          spawnX: doorCenterX,
          spawnY: 26,
          returnX: 88,
          returnY: 150,
        },
      ];
      this.populateRoom(topRoom, biome, levelIndex, rng, playerCount);
      if (topRoom.enemies.length === 0) {
        topRoom.enemies.push({
          uid: `l7_top_${i}_0`,
          defId: rng.pick(biome.enemyPool),
          x: 88,
          y: 72,
          hp: 10,
          maxHp: 10,
          isElite: false,
          alive: true,
        });
      }
      const topBonus = bonusKinds[bonusIdx++];
      if (topBonus === 'chest') {
        topRoom.loot.push({ uid: `l7_ch_${i}_0`, kind: 'chest', x: 88, y: 52, collected: false });
      } else if (topBonus === 'heart') {
        topRoom.loot.push({ uid: `l7_ht_${i}_0`, kind: 'heart', x: 88, y: 52, collected: false });
      } else if (topBonus === 'shards') {
        topRoom.loot.push({ uid: `l7_sh_${i}_0`, kind: 'shard', x: 88, y: 52, amount: 4, collected: false });
      }

      hallway.hallwayDoors.push({
        dir: 'north',
        tx,
        ty: 0,
        targetGx: i + 1,
        targetGy: 0,
        spawnX: 88,
        spawnY: 150,
        returnX: doorCenterX,
        returnY: 26,
      });

      // Bottom room (gx: i+1, gy: 2)
      const botRoom = makeRoom(i + 1, 2, i % 2 === 0 ? 'hazard' : i === 2 ? 'elite' : 'combat');
      botRoom.connections.north = true;
      botRoom.hallwayDoors = [
        {
          dir: 'north',
          tx: 5,
          ty: 0,
          targetGx: 0,
          targetGy: 1,
          spawnX: doorCenterX,
          spawnY: 118,
          returnX: 88,
          returnY: 26,
        },
      ];
      this.populateRoom(botRoom, biome, levelIndex, rng, playerCount);
      if (botRoom.enemies.length === 0) {
        botRoom.enemies.push({
          uid: `l7_bot_${i}_0`,
          defId: rng.pick(biome.enemyPool),
          x: 88,
          y: 104,
          hp: 10,
          maxHp: 10,
          isElite: false,
          alive: true,
        });
      }
      const botBonus = bonusKinds[bonusIdx++];
      if (botBonus === 'chest') {
        botRoom.loot.push({ uid: `l7_ch_${i}_2`, kind: 'chest', x: 88, y: 124, collected: false });
      } else if (botBonus === 'heart') {
        botRoom.loot.push({ uid: `l7_ht_${i}_2`, kind: 'heart', x: 88, y: 124, collected: false });
      } else if (botBonus === 'shards') {
        botRoom.loot.push({ uid: `l7_sh_${i}_2`, kind: 'shard', x: 88, y: 124, amount: 4, collected: false });
      }

      hallway.hallwayDoors.push({
        dir: 'south',
        tx,
        ty: 8,
        targetGx: i + 1,
        targetGy: 2,
        spawnX: 88,
        spawnY: 26,
        returnX: doorCenterX,
        returnY: 118,
      });
    }

    // Giant scrollable Boss Room (gx: 5, gy: 1), 23x23 tiles (368x368 px)
    const bossRoom = makeRoom(5, 1, 'boss');
    bossRoom.widthTiles = 23;
    bossRoom.heightTiles = 23;
    bossRoom.connections.west = true;
    bossRoom.bossDefeated = false;
    bossRoom.pillars = [
      { tx: 6, ty: 6 },
      { tx: 15, ty: 6 },
      { tx: 6, ty: 15 },
      { tx: 15, ty: 15 },
    ];
    bossRoom.hallwayDoors = [
      {
        dir: 'west',
        tx: 0,
        ty: 11,
        targetGx: 0,
        targetGy: 1,
        spawnX: 562,
        spawnY: 72,
        returnX: 28,
        returnY: 184,
      },
    ];

    hallway.hallwayDoors.push({
      dir: 'east',
      tx: 36,
      ty: 4,
      targetGx: 5,
      targetGy: 1,
      spawnX: 28,
      spawnY: 184,
      returnX: 562,
      returnY: 72,
      isBossGate: true,
    });

    return {
      levelIndex,
      seed: floorSeed,
      modifier: 'none',
      rooms: grid as RoomData[][],
    };
  }
}
