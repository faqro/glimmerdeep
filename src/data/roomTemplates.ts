export interface RoomLayoutTemplate {
  id: number;
  pillars: Array<{ tx: number; ty: number }>;
  hazards: Array<{ tx: number; ty: number }>;
  spikes: Array<{ tx: number; ty: number }>;
  crates: Array<{ tx: number; ty: number }>;
  props: Array<{ tx: number; ty: number; kind: 'mushroom' | 'lantern' }>;
}

/**
 * 11 x 11 tile square room templates (9 x 9 walkable interior, 176 x 176 pixels).
 * Doors are centered at:
 *  - North/South: tx = 5
 *  - West/East: ty = 5
 * Walkable interior is tx = 1..9, ty = 1..9.
 * Doorway approaches (5,1), (5,9), (1,5), (9,5) and paths between all 4 doors are kept clear.
 * Hazards are placed in intentional, pre-determined lines.
 */
export const ROOM_TEMPLATES: RoomLayoutTemplate[] = [
  {
    // Template 0: Four corner pillars + clean center
    id: 0,
    pillars: [
      { tx: 3, ty: 3 },
      { tx: 7, ty: 3 },
      { tx: 3, ty: 7 },
      { tx: 7, ty: 7 },
    ],
    hazards: [
      // Two horizontal hazard lines flanking top and bottom
      { tx: 2, ty: 2 }, { tx: 3, ty: 2 }, { tx: 4, ty: 2 },
      { tx: 6, ty: 2 }, { tx: 7, ty: 2 }, { tx: 8, ty: 2 },
      { tx: 2, ty: 8 }, { tx: 3, ty: 8 }, { tx: 4, ty: 8 },
      { tx: 6, ty: 8 }, { tx: 7, ty: 8 }, { tx: 8, ty: 8 },
    ],
    spikes: [
      // Central cross-band of spike grates between the lava lines
      { tx: 3, ty: 5 }, { tx: 4, ty: 5 }, { tx: 6, ty: 5 }, { tx: 7, ty: 5 },
      { tx: 5, ty: 3 }, { tx: 5, ty: 7 },
    ],
    crates: [
      { tx: 2, ty: 4 },
      { tx: 8, ty: 6 },
    ],
    props: [
      { tx: 1, ty: 1, kind: 'lantern' },
      { tx: 9, ty: 1, kind: 'lantern' },
      { tx: 1, ty: 9, kind: 'mushroom' },
      { tx: 9, ty: 9, kind: 'mushroom' },
    ],
  },
  {
    // Template 1: Twin vertical hazard lines creating 3 lanes
    id: 1,
    pillars: [
      { tx: 5, ty: 3 },
      { tx: 5, ty: 7 },
    ],
    hazards: [
      { tx: 3, ty: 2 }, { tx: 3, ty: 3 }, { tx: 3, ty: 4 },
      { tx: 3, ty: 6 }, { tx: 3, ty: 7 }, { tx: 3, ty: 8 },
      { tx: 7, ty: 2 }, { tx: 7, ty: 3 }, { tx: 7, ty: 4 },
      { tx: 7, ty: 6 }, { tx: 7, ty: 7 }, { tx: 7, ty: 8 },
    ],
    spikes: [
      // Center lane spike gauntlet
      { tx: 5, ty: 2 }, { tx: 5, ty: 4 }, { tx: 5, ty: 5 }, { tx: 5, ty: 6 }, { tx: 5, ty: 8 },
    ],
    crates: [
      { tx: 2, ty: 7 },
      { tx: 8, ty: 3 },
    ],
    props: [
      { tx: 1, ty: 1, kind: 'mushroom' },
      { tx: 9, ty: 1, kind: 'lantern' },
      { tx: 1, ty: 9, kind: 'lantern' },
      { tx: 9, ty: 9, kind: 'mushroom' },
    ],
  },
  {
    // Template 2: Twin horizontal hazard lines with central bridge
    id: 2,
    pillars: [
      { tx: 3, ty: 5 },
      { tx: 7, ty: 5 },
    ],
    hazards: [
      { tx: 2, ty: 3 }, { tx: 3, ty: 3 }, { tx: 4, ty: 3 },
      { tx: 6, ty: 3 }, { tx: 7, ty: 3 }, { tx: 8, ty: 3 },
      { tx: 2, ty: 7 }, { tx: 3, ty: 7 }, { tx: 4, ty: 7 },
      { tx: 6, ty: 7 }, { tx: 7, ty: 7 }, { tx: 8, ty: 7 },
    ],
    spikes: [
      // Horizontal spike strip across the middle bridge
      { tx: 2, ty: 5 }, { tx: 4, ty: 5 }, { tx: 5, ty: 5 }, { tx: 6, ty: 5 }, { tx: 8, ty: 5 },
    ],
    crates: [
      { tx: 2, ty: 2 },
      { tx: 8, ty: 8 },
    ],
    props: [
      { tx: 1, ty: 2, kind: 'lantern' },
      { tx: 9, ty: 8, kind: 'lantern' },
      { tx: 2, ty: 8, kind: 'mushroom' },
      { tx: 8, ty: 2, kind: 'mushroom' },
    ],
  },
  {
    // Template 3: Central cross-moat with 4 corner safe islands
    id: 3,
    pillars: [
      { tx: 2, ty: 2 },
      { tx: 8, ty: 2 },
      { tx: 2, ty: 8 },
      { tx: 8, ty: 8 },
    ],
    hazards: [
      { tx: 4, ty: 4 }, { tx: 6, ty: 4 },
      { tx: 4, ty: 6 }, { tx: 6, ty: 6 },
      { tx: 3, ty: 4 }, { tx: 7, ty: 4 },
      { tx: 3, ty: 6 }, { tx: 7, ty: 6 },
    ],
    spikes: [
      // Four-way spike gates around the center moat
      { tx: 5, ty: 3 }, { tx: 5, ty: 4 },
      { tx: 5, ty: 6 }, { tx: 5, ty: 7 },
      { tx: 3, ty: 5 }, { tx: 7, ty: 5 },
    ],
    crates: [
      { tx: 1, ty: 8 },
      { tx: 9, ty: 2 },
    ],
    props: [
      { tx: 4, ty: 1, kind: 'lantern' },
      { tx: 6, ty: 9, kind: 'lantern' },
      { tx: 2, ty: 3, kind: 'mushroom' },
      { tx: 8, ty: 7, kind: 'mushroom' },
    ],
  },
  {
    // Template 4: L-shaped corner hazard trenches
    id: 4,
    pillars: [
      { tx: 4, ty: 5 },
      { tx: 6, ty: 5 },
    ],
    hazards: [
      { tx: 2, ty: 2 }, { tx: 3, ty: 2 }, { tx: 2, ty: 3 },
      { tx: 7, ty: 2 }, { tx: 8, ty: 2 }, { tx: 8, ty: 3 },
      { tx: 2, ty: 7 }, { tx: 2, ty: 8 }, { tx: 3, ty: 8 },
      { tx: 8, ty: 7 }, { tx: 7, ty: 8 }, { tx: 8, ty: 8 },
    ],
    spikes: [
      // Diamond spike ring in the middle
      { tx: 5, ty: 3 }, { tx: 5, ty: 4 },
      { tx: 5, ty: 6 }, { tx: 5, ty: 7 },
      { tx: 3, ty: 5 }, { tx: 7, ty: 5 },
    ],
    crates: [
      { tx: 3, ty: 3 },
      { tx: 7, ty: 7 },
    ],
    props: [
      { tx: 1, ty: 1, kind: 'mushroom' },
      { tx: 9, ty: 1, kind: 'mushroom' },
      { tx: 1, ty: 9, kind: 'lantern' },
      { tx: 9, ty: 9, kind: 'lantern' },
    ],
  },
  {
    // Template 5: Alternating vertical hazard columns
    id: 5,
    pillars: [],
    hazards: [
      { tx: 2, ty: 3 }, { tx: 2, ty: 4 }, { tx: 2, ty: 5 }, { tx: 2, ty: 6 }, { tx: 2, ty: 7 },
      { tx: 8, ty: 3 }, { tx: 8, ty: 4 }, { tx: 8, ty: 5 }, { tx: 8, ty: 6 }, { tx: 8, ty: 7 },
    ],
    spikes: [
      // Twin vertical spike lines parallel to the lava columns
      { tx: 4, ty: 4 }, { tx: 4, ty: 5 }, { tx: 4, ty: 6 },
      { tx: 6, ty: 4 }, { tx: 6, ty: 5 }, { tx: 6, ty: 6 },
    ],
    crates: [
      { tx: 4, ty: 3 },
      { tx: 6, ty: 7 },
    ],
    props: [
      { tx: 1, ty: 3, kind: 'lantern' },
      { tx: 9, ty: 3, kind: 'lantern' },
      { tx: 1, ty: 7, kind: 'mushroom' },
      { tx: 9, ty: 7, kind: 'mushroom' },
    ],
  },
];
