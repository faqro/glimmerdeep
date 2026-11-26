import Phaser from 'phaser';
import { DLC_CHARACTERS, DlcCharacterId, PLAYER_PALETTES } from '../data/palettes';
import { PlayerPalette } from '../types/game';

/**
 * Generates crisp 16-bit pixel art textures and spritesheets at boot.
 * Every sprite uses a dark outline (#100d24) and 16-bit shading/highlights.
 */
export class PixelArtGenerator {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  generateAll(): void {
    this.generateGlowsAndParticles();
    this.generateUIElements();
    this.generateControlIcons();
    this.generateEnvironmentSprites();
    this.generateItemIcons();
    this.generatePlayerSprites();
    this.generateEnemySprites();
    this.generateBossSprites();
  }

  private createCanvas(key: string, w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: Phaser.Textures.CanvasTexture } {
    if (this.scene.textures.exists(key)) {
      this.scene.textures.remove(key);
    }
    const tex = this.scene.textures.createCanvas(key, w, h)!;
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const canvas = tex.getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx, tex };
  }

  private px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string | number, w = 1, h = 1): void {
    ctx.fillStyle = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }

  private shade(hex: number, factor: number): string {
    const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 0xff) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 0xff) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((hex & 0xff) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  private drawGrid(ctx: CanvasRenderingContext2D, ox: number, oy: number, rows: string[], palette: Record<string, string>): void {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch !== '.' && palette[ch]) {
          ctx.fillStyle = palette[ch];
          ctx.fillRect(ox + x, oy + y, 1, 1);
        }
      }
    }
  }

  private generateGlowsAndParticles(): void {
    // Soft radial glow for additive lighting (64x64)
    const { ctx, tex } = this.createCanvas('glow_soft', 64, 64);
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    tex.refresh();

    // 4x4 pixel star particle
    const pStar = this.createCanvas('particle_star', 5, 5);
    this.drawGrid(pStar.ctx, 0, 0, [
      '..w..',
      '.www.',
      'wwwww',
      '.www.',
      '..w..',
    ], { w: '#ffffff' });
    pStar.tex.refresh();

    // 3x3 pixel spark
    const pSpark = this.createCanvas('particle_spark', 3, 3);
    this.px(pSpark.ctx, 0, 0, '#ffffff', 3, 3);
    pSpark.tex.refresh();

    // Projectile orb 8x8
    const orb = this.createCanvas('proj_orb', 8, 8);
    this.drawGrid(orb.ctx, 0, 0, [
      '..oooo..',
      '.owwwwo.',
      'owwwwwwo',
      'owwwwwwo',
      'owwwwwwo',
      'owwwwwwo',
      '.owwwwo.',
      '..oooo..',
    ], { o: '#d8b4fe', w: '#ffffff' });
    orb.tex.refresh();

    // Arrow projectile 10x6
    const arrow = this.createCanvas('proj_arrow', 10, 6);
    this.drawGrid(arrow.ctx, 0, 0, [
      '......oo..',
      '.ooooowwo.',
      'owwwwwwwwo',
      '.ooooowwo.',
      '......oo..',
    ], { o: '#100d24', w: '#ffe066' });
    arrow.tex.refresh();

    // Star projectile 10x10
    const starProj = this.createCanvas('proj_star', 10, 10);
    this.drawGrid(starProj.ctx, 0, 0, [
      '....oo....',
      '....YY....',
      '..ooYYoo..',
      '.oYYYYYYo.',
      'oYYwYYwYYo',
      '.oYYYYYYo.',
      '..oYYYYo..',
      '.oYYooYYo.',
      '.oo....oo.',
      '..........',
    ], { o: '#100d24', Y: '#ffe066', w: '#ffffff' });
    starProj.tex.refresh();

    // Musical note projectiles 10x10 (4 variations)
    const notePal = { o: '#100d24', w: '#ffffff', c: '#a5f3fc' };
    const note0 = this.createCanvas('proj_note_0', 10, 10);
    this.drawGrid(note0.ctx, 0, 0, [
      '.....oo...',
      '.....ow...',
      '.....ow...',
      '.....ow...',
      '.....ow...',
      '...ooow...',
      '..owwcwo..',
      '..owwwwo..',
      '...oooo...',
      '..........',
    ], notePal);
    note0.tex.refresh();

    const note1 = this.createCanvas('proj_note_1', 10, 10);
    this.drawGrid(note1.ctx, 0, 0, [
      '...oooo...',
      '..owwwwo..',
      '..owwcwo..',
      '..owooo...',
      '..ow......',
      '..ow......',
      '..ow......',
      '..ow......',
      '..oo......',
      '..........',
    ], notePal);
    note1.tex.refresh();

    const note2 = this.createCanvas('proj_note_2', 10, 10);
    this.drawGrid(note2.ctx, 0, 0, [
      '....ooo...',
      '....owwo..',
      '....ow.wo.',
      '....ow..o.',
      '....ow....',
      '..ooow....',
      '.owwcwo...',
      '.owwwwo...',
      '..oooo....',
      '..........',
    ], notePal);
    note2.tex.refresh();

    const note3 = this.createCanvas('proj_note_3', 10, 10);
    this.drawGrid(note3.ctx, 0, 0, [
      '..ooooooo.',
      '..owwwwwwo',
      '..ow....wo',
      '..ow....wo',
      '.oow...oow',
      'owwwo.owww',
      'owwwo.owww',
      '.ooo...ooo',
      '..........',
      '..........',
    ], notePal);
    note3.tex.refresh();

    // Lunar Chakram projectile (12x12 circular ring)
    const lunarChakram = this.createCanvas('proj_lunar_chakram', 12, 12);
    this.drawGrid(lunarChakram.ctx, 0, 0, [
      '...oooooo...',
      '.ooBBBBBBoo.',
      '.oBwoooowBo.',
      'oBBo....oBBo',
      'oBwo....oBBo',
      'oBBo....oBBo',
      'oBBo....oBBo',
      'oBBo....owBo',
      'oBBo....oBBo',
      '.oBwoooowBo.',
      '.ooBBBBBBoo.',
      '...oooooo...',
    ], { o: '#100d24', B: '#a0c4ff', w: '#e0f2fe' });
    lunarChakram.tex.refresh();

    // Enemy projectile: crystal shard 8x8 (pointing right)
    const shard = this.createCanvas('proj_shard', 8, 8);
    this.drawGrid(shard.ctx, 0, 0, [
      '........',
      '..oo....',
      '.owwwo..',
      'owwwwwwo',
      'owwwwwwo',
      '.owwwo..',
      '..oo....',
      '........',
    ], { o: '#bae6fd', w: '#ffffff' });
    shard.tex.refresh();

    // Enemy projectile: fuzzy spore puff 8x8
    const spore = this.createCanvas('proj_spore', 8, 8);
    this.drawGrid(spore.ctx, 0, 0, [
      '..o..o..',
      '.owwwwo.',
      'ow.ww.wo',
      '.owwwwo.',
      'ow.ww.wo',
      '.owwwwo.',
      '..o..o..',
      '........',
    ], { o: '#d9f99d', w: '#ffffff' });
    spore.tex.refresh();

    // Enemy projectile: bubbling acid/sludge glob 9x9
    const glob = this.createCanvas('proj_glob', 9, 9);
    this.drawGrid(glob.ctx, 0, 0, [
      '...ooo...',
      '..owwwo..',
      '.owwwww..',
      'owwwwwooo',
      'owwwwwwwo',
      '.owwwwwo.',
      '..ooooo..',
      '....oo...',
      '.........',
    ], { o: '#bef264', w: '#ffffff' });
    glob.tex.refresh();

    // Enemy projectile: clockwork gear 9x9
    const gear = this.createCanvas('proj_gear', 9, 9);
    this.drawGrid(gear.ctx, 0, 0, [
      '..o...o..',
      '.owowowo.',
      'owwwwwwo.',
      '.ow.o.wo.',
      'owwwwwwo.',
      '.owowowo.',
      '..o...o..',
      '.........',
      '.........',
    ], { o: '#fde68a', w: '#ffffff' });
    gear.tex.refresh();

    // Enemy projectile: sleek needle/dart 10x5 (pointing right)
    const needle = this.createCanvas('proj_needle', 10, 5);
    this.drawGrid(needle.ctx, 0, 0, [
      '......oo..',
      '.ooooowwo.',
      'owwwwwwwwo',
      '.ooooowwo.',
      '......oo..',
    ], { o: '#e2e8f0', w: '#ffffff' });
    needle.tex.refresh();

    // Enemy projectile: jagged void bolt 9x9 (pointing right)
    const voidBolt = this.createCanvas('proj_void_bolt', 9, 9);
    this.drawGrid(voidBolt.ctx, 0, 0, [
      '.oo......',
      '..owoo...',
      '.owwwwo..',
      'oowwwwwwo',
      '.owwwwo..',
      '..owoo...',
      '.oo......',
      '.........',
      '.........',
    ], { o: '#f5d0fe', w: '#ffffff' });
    voidBolt.tex.refresh();

    // Enemy projectile: crescent shadow wisp 8x8
    const shadowWisp = this.createCanvas('proj_shadow_wisp', 8, 8);
    this.drawGrid(shadowWisp.ctx, 0, 0, [
      '..oooo..',
      '.owwwwo.',
      'owwo..oo',
      'oww.....',
      'oww.....',
      'owwo..oo',
      '.owwwwo.',
      '..oooo..',
    ], { o: '#f0abfc', w: '#ffffff' });
    shadowWisp.tex.refresh();
  }

  private generateUIElements(): void {
    // 16-bit Heart Full (9x8), Half (9x8), Empty (9x8)
    const heartRows = [
      '.oo...oo.',
      'oHHo.oHHo',
      'oHHHoHHHo',
      'oHHHHHHHo',
      '.oHHHHHo.',
      '..oHHHo..',
      '...oHo...',
      '....o....',
    ];
    const hFull = this.createCanvas('ui_heart_full', 9, 8);
    this.drawGrid(hFull.ctx, 0, 0, heartRows, { o: '#100d24', H: '#ff5d8f' });
    this.px(hFull.ctx, 2, 2, '#ffc2d4', 1, 1);
    hFull.tex.refresh();

    const hEmpty = this.createCanvas('ui_heart_empty', 9, 8);
    this.drawGrid(hEmpty.ctx, 0, 0, heartRows, { o: '#100d24', H: '#2b2447' });
    hEmpty.tex.refresh();

    const hHalf = this.createCanvas('ui_heart_half', 9, 8);
    this.drawGrid(hHalf.ctx, 0, 0, [
      '.oo...oo.',
      'oHHo.oEEo',
      'oHHHoEEEo',
      'oHHHHEEEo',
      '.oHHHEEo.',
      '..oHHEo..',
      '...oHo...',
      '....o....',
    ], { o: '#100d24', H: '#ff5d8f', E: '#2b2447' });
    this.px(hHalf.ctx, 2, 2, '#ffc2d4', 1, 1);
    hHalf.tex.refresh();

    // Shield pip (7x8)
    const shPip = this.createCanvas('ui_shield', 7, 8);
    this.drawGrid(shPip.ctx, 0, 0, [
      '.ooooo.',
      'oSSSSSo',
      'oShSSSo',
      'oSSSSSo',
      'oSSSSSo',
      '.oSSSo.',
      '..oSo..',
      '...o...',
    ], { o: '#100d24', S: '#70f8ff', h: '#ffffff' });
    shPip.tex.refresh();

    // Stamina pip full & empty (7x7)
    const stamRows = [
      '..ooo..',
      '.oSSSo.',
      'oSShSSo',
      'oSSSSSo',
      'oSSSSSo',
      '.oSSSo.',
      '..ooo..',
    ];
    const sFull = this.createCanvas('ui_stam_full', 7, 7);
    this.drawGrid(sFull.ctx, 0, 0, stamRows, { o: '#100d24', S: '#66ffd9', h: '#ffffff' });
    sFull.tex.refresh();

    const sEmpty = this.createCanvas('ui_stam_empty', 7, 7);
    this.drawGrid(sEmpty.ctx, 0, 0, stamRows, { o: '#100d24', S: '#22203b', h: '#353159' });
    sEmpty.tex.refresh();

    // 16-bit Inventory Slot (22x22) normal and selected
    for (const selected of [false, true]) {
      const key = selected ? 'ui_slot_active' : 'ui_slot';
      const { ctx, tex } = this.createCanvas(key, 22, 22);
      this.px(ctx, 0, 0, '#100d24', 22, 22);
      this.px(ctx, 1, 1, selected ? '#ffe066' : '#534887', 20, 20);
      this.px(ctx, 2, 2, selected ? '#2c2352' : '#1b1736', 18, 18);
      if (selected) {
        this.px(ctx, 1, 1, '#ffffff', 2, 1);
        this.px(ctx, 1, 1, '#ffffff', 1, 2);
      }
      tex.refresh();
    }

    // 16-bit UI Panel (32x32 stretchable)
    const panel = this.createCanvas('ui_panel', 32, 32);
    this.px(panel.ctx, 0, 0, '#100d24', 32, 32);
    this.px(panel.ctx, 1, 1, '#5d4e9e', 30, 30);
    this.px(panel.ctx, 2, 2, '#181430', 28, 28);
    panel.tex.refresh();

    // 16-bit Button (96x20) normal and hover
    for (const hover of [false, true]) {
      const key = hover ? 'ui_btn_hover' : 'ui_btn';
      const { ctx, tex } = this.createCanvas(key, 96, 20);
      this.px(ctx, 0, 0, '#100d24', 96, 20);
      this.px(ctx, 1, 1, hover ? '#f49ac1' : '#6c5bb3', 94, 18);
      this.px(ctx, 2, 2, hover ? '#3b2b66' : '#261f47', 92, 16);
      this.px(ctx, 2, 2, hover ? '#ffc2e2' : '#9d8ce0', 92, 1);
      tex.refresh();
    }
  }

  private generateControlIcons(): void {
    const miniGlyphs: Record<string, string[]> = {
      A: ['.###.', '#...#', '#####', '#...#', '#...#'],
      B: ['####.', '#...#', '####.', '#...#', '####.'],
      C: ['.####', '#....', '#....', '#....', '.####'],
      D: ['####.', '#...#', '#...#', '#...#', '####.'],
      E: ['#####', '#....', '####.', '#....', '#####'],
      H: ['#...#', '#...#', '#####', '#...#', '#...#'],
      K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
      L: ['#....', '#....', '#....', '#....', '#####'],
      O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
      P: ['####.', '#...#', '####.', '#....', '#....'],
      Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'],
      R: ['####.', '#...#', '####.', '#.#..', '#..#.'],
      S: ['.####', '#....', '.###.', '....#', '####.'],
      T: ['#####', '..#..', '..#..', '..#..', '..#..'],
      W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
      X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
      Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
      '1': ['..#..', '.##..', '..#..', '..#..', '.###.'],
      '2': ['####.', '....#', '.###.', '#....', '#####'],
      '3': ['####.', '....#', '.###.', '....#', '####.'],
      '<': ['..#.', '.#..', '#...', '.#..', '..#.'],
      '>': ['.#..', '..#.', '...#', '..#.', '.#..'],
    };

    const drawMiniGlyph = (ctx: CanvasRenderingContext2D, ch: string, ox: number, oy: number, color: string) => {
      const g = miniGlyphs[ch];
      if (!g) return;
      for (let y = 0; y < g.length; y++) {
        for (let x = 0; x < g[y].length; x++) {
          if (g[y][x] === '#') {
            this.px(ctx, ox + x, oy + y, color, 1, 1);
          }
        }
      }
    };

    const makeKeycap = (key: string, label: string, width: number, textColor = '#ffffff') => {
      const h = 12;
      const { ctx, tex } = this.createCanvas(key, width, h);
      // Outer dark outline
      this.px(ctx, 1, 0, '#0b0917', width - 2, 1);
      this.px(ctx, 1, h - 1, '#0b0917', width - 2, 1);
      this.px(ctx, 0, 1, '#0b0917', 1, h - 2);
      this.px(ctx, width - 1, 1, '#0b0917', 1, h - 2);
      // 3D bottom skirt
      this.px(ctx, 1, h - 3, '#4a3b7d', width - 2, 2);
      // Keycap border & top bevel
      this.px(ctx, 1, 1, '#8b7bd8', width - 2, h - 4);
      // Keycap inner face
      this.px(ctx, 2, 2, '#241d42', width - 4, h - 6);
      // Top inner highlight
      this.px(ctx, 2, 2, '#3a2f66', width - 4, 1);

      // Draw centered characters (5px wide each + 1px spacing)
      const chars = label.split('');
      const totalW = chars.length * 5 + Math.max(0, chars.length - 1);
      let sx = Math.floor((width - totalW) / 2);
      const sy = 3;
      for (const ch of chars) {
        drawMiniGlyph(ctx, ch, sx, sy, textColor);
        sx += 6;
      }
      tex.refresh();
    };

    // Single-letter keycaps (11x12)
    makeKeycap('key_e', 'E', 11, '#66ffd9');
    makeKeycap('key_q', 'Q', 11, '#f49ac1');
    makeKeycap('key_w', 'W', 11, '#ffffff');
    makeKeycap('key_a', 'A', 11, '#ffffff');
    makeKeycap('key_s', 'S', 11, '#ffffff');
    makeKeycap('key_d', 'D', 11, '#ffffff');
    makeKeycap('key_1', '1', 11, '#b8a1ff');
    makeKeycap('key_2', '2', 11, '#b8a1ff');
    makeKeycap('key_3', '3', 11, '#b8a1ff');

    // Wide keycaps
    makeKeycap('key_tab', 'TAB', 21, '#ffe066');
    makeKeycap('key_esc', 'ESC', 21, '#f49ac1');
    makeKeycap('key_space', 'SPC', 23, '#66ffd9');

    // Mouse icons (10x13)
    const makeMouse = (key: string, highlight: 'left' | 'right' | 'scroll') => {
      const { ctx, tex } = this.createCanvas(key, 10, 13);
      this.drawGrid(
        ctx,
        0,
        0,
        [
          '..oooooo..',
          '.oLLooRRo.',
          'oLLLoRRRRo',
          'oLLLSSRRRo',
          'oLLLSSRRRo',
          'oooooooooo',
          'oBBBBBBBBo',
          'oBBBBBBBBo',
          'oBBBBBBBBo',
          'oBBBBBBBBo',
          '.oBBBBBBo.',
          '..oooooo..',
          '..........',
        ],
        {
          o: '#0b0917',
          L: highlight === 'left' ? '#ffe066' : '#3a2f66',
          R: highlight === 'right' ? '#66ffd9' : '#3a2f66',
          S: highlight === 'scroll' ? '#f49ac1' : '#8b7bd8',
          B: '#241d42',
        }
      );
      tex.refresh();
    };
    makeMouse('mouse_lmb', 'left');
    makeMouse('mouse_rmb', 'right');
    makeMouse('mouse_scroll', 'scroll');

    // Gamepad Face Buttons (11x11)
    const makePadFace = (key: string, ch: string, fill: string, rim: string) => {
      const { ctx, tex } = this.createCanvas(key, 11, 11);
      this.drawGrid(
        ctx,
        0,
        0,
        [
          '..ooooooo..',
          '.oRRRRRRRo.',
          'oRFFFFFFFRo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oRFFFFFFFRo',
          '.oRRRRRRRo.',
          '..ooooooo..',
        ],
        { o: '#0b0917', F: fill, R: rim }
      );
      drawMiniGlyph(ctx, ch, 3, 3, '#100d24');
      tex.refresh();
    };
    makePadFace('pad_a', 'A', '#4ade80', '#86efac');
    makePadFace('pad_b', 'B', '#ff5d8f', '#fda4af');
    makePadFace('pad_x', 'X', '#6ef3ff', '#bae6fd');
    makePadFace('pad_y', 'Y', '#ffe066', '#fef08a');

    // Gamepad Shoulder / Trigger / System Pills (15x11)
    const makePadPill = (key: string, label: string, fill: string, textCol: string) => {
      const w = label.length >= 3 ? 19 : 15;
      const h = 11;
      const { ctx, tex } = this.createCanvas(key, w, h);
      this.px(ctx, 1, 0, '#0b0917', w - 2, 1);
      this.px(ctx, 1, h - 1, '#0b0917', w - 2, 1);
      this.px(ctx, 0, 1, '#0b0917', 1, h - 2);
      this.px(ctx, w - 1, 1, '#0b0917', 1, h - 2);
      this.px(ctx, 1, 1, '#6c5bb3', w - 2, h - 2);
      this.px(ctx, 2, 2, fill, w - 4, h - 4);
      const chars = label.split('');
      const totalW = chars.length * 5 + Math.max(0, chars.length - 1);
      let sx = Math.floor((w - totalW) / 2);
      for (const ch of chars) {
        drawMiniGlyph(ctx, ch, sx, 3, textCol);
        sx += 6;
      }
      tex.refresh();
    };
    makePadPill('pad_lb', 'LB', '#261f47', '#b8a1ff');
    makePadPill('pad_rb', 'RB', '#261f47', '#b8a1ff');
    makePadPill('pad_lt', 'LT', '#2e2459', '#66ffd9');
    makePadPill('pad_rt', 'RT', '#2e2459', '#ffe066');
    makePadPill('pad_back', 'BK', '#1b1736', '#9d8ce0');
    makePadPill('pad_start', 'ST', '#1b1736', '#f49ac1');

    // PlayStation Face Buttons (11x11)
    const makePsFace = (key: string, symbolRows: string[], glyphColor: string) => {
      const { ctx, tex } = this.createCanvas(key, 11, 11);
      this.drawGrid(
        ctx,
        0,
        0,
        [
          '..ooooooo..',
          '.oRRRRRRRo.',
          'oRFFFFFFFRo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oFFFFFFFFFo',
          'oRFFFFFFFRo',
          '.oRRRRRRRo.',
          '..ooooooo..',
        ],
        { o: '#0b0917', F: '#1b1736', R: '#534887' }
      );
      this.drawGrid(ctx, 3, 3, symbolRows, { '#': glyphColor });
      tex.refresh();
    };
    makePsFace('ps_cross', ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], '#6ef3ff');
    makePsFace('ps_circle', ['.###.', '#...#', '#...#', '#...#', '.###.'], '#ff5d8f');
    makePsFace('ps_square', ['#####', '#...#', '#...#', '#...#', '#####'], '#f49ac1');
    makePsFace('ps_triangle', ['..#..', '.#.#.', '.#.#.', '#...#', '#####'], '#4ade80');

    // PlayStation Shoulder / Trigger / System Pills
    makePadPill('ps_l1', 'L1', '#261f47', '#b8a1ff');
    makePadPill('ps_r1', 'R1', '#261f47', '#b8a1ff');
    makePadPill('ps_l2', 'L2', '#2e2459', '#66ffd9');
    makePadPill('ps_r2', 'R2', '#2e2459', '#ffe066');
    makePadPill('ps_back', 'SH', '#1b1736', '#9d8ce0');
    makePadPill('ps_start', 'OP', '#1b1736', '#f49ac1');

    // Analog Sticks (12x12)
    const makeStick = (key: string, ch: string, accent: string) => {
      const { ctx, tex } = this.createCanvas(key, 12, 12);
      this.drawGrid(
        ctx,
        0,
        0,
        [
          '...oooooo...',
          '..oRRRRRRo..',
          '.oRFFFFFFRo.',
          'oRFFFFFFFFRo',
          'oFFFFFFFFFFo',
          'oFFFFFFFFFFo',
          'oFFFFFFFFFFo',
          'oFFFFFFFFFFo',
          'oRFFFFFFFFRo',
          '.oRFFFFFFRo.',
          '..oRRRRRRo..',
          '...oooooo...',
        ],
        { o: '#0b0917', F: '#241d42', R: accent }
      );
      drawMiniGlyph(ctx, ch, 4, 4, '#ffffff');
      tex.refresh();
    };
    makeStick('pad_ls', 'L', '#66ffd9');
    makeStick('pad_rs', 'R', '#ffe066');

    // D-pad icon (11x11)
    const dpad = this.createCanvas('pad_dpad', 11, 11);
    this.drawGrid(
      dpad.ctx,
      0,
      0,
      [
        '...ooooo...',
        '...oDDDo...',
        '...oDDDo...',
        'ooooDDDoooo',
        'oDDDDDDDDDo',
        'oDDDDDDDDDo',
        'oDDDDDDDDDo',
        'ooooDDDoooo',
        '...oDDDo...',
        '...oDDDo...',
        '...ooooo...',
      ],
      { o: '#0b0917', D: '#8b7bd8' }
    );
    dpad.tex.refresh();

    // Touch Icons (11x11)
    const makeTouchIcon = (key: string, grid: string[], palette: Record<string, string>) => {
      const { ctx, tex } = this.createCanvas(key, 11, 11);
      this.drawGrid(ctx, 0, 0, grid, palette);
      tex.refresh();
    };
    makeTouchIcon(
      'touch_interact',
      [
        '..ooooooo..',
        '.oBBBBBBBo.',
        'oBBBBHBBBBo',
        'oBBBHSHBBBo',
        'oBBHSSSHBBo',
        'oBHSSSSSHBo',
        'oBBHSSSHBBo',
        'oBBBHSHBBBo',
        'oBBBBHBBBBo',
        '.oBBBBBBBo.',
        '..ooooooo..',
      ],
      { o: '#0b0917', B: '#261f47', H: '#66ffd9', S: '#ffffff' }
    );
    makeTouchIcon(
      'touch_dodge',
      [
        '..ooooooo..',
        '.oBBBBBBBo.',
        'oBBBBHBBBBo',
        'oBBHHSHBBBo',
        'oBHHHHSHBBo',
        'oBBBBHSHBBo',
        'oBHHHHSHBBo',
        'oBBHHSHBBBo',
        'oBBBBHBBBBo',
        '.oBBBBBBBo.',
        '..ooooooo..',
      ],
      { o: '#0b0917', B: '#261f47', H: '#66ffd9', S: '#ffffff' }
    );
    makeTouchIcon(
      'touch_map',
      [
        '..ooooooo..',
        '.oBBBBBBBo.',
        'oBGGGGGGGBo',
        'oBGWGWGGGBo',
        'oBGGGGGGGBo',
        'oBGGWGWGGBo',
        'oBGGGGGGGBo',
        'oBGWGWGGGBo',
        'oBGGGGGGGBo',
        '.oBBBBBBBo.',
        '..ooooooo..',
      ],
      { o: '#0b0917', B: '#261f47', G: '#6c5bb3', W: '#ffe066' }
    );
    makeTouchIcon(
      'touch_drop',
      [
        '..ooooooo..',
        '.oBBBBBBBo.',
        'oBBBBPBBBBo',
        'oBBBBPBBBBo',
        'oBBBBPBBBBo',
        'oBBPPPPPBo.',
        'oBBBPPPBBBo',
        'oBBBBPBBBBo',
        'oBBBBBBBBBo',
        '.oBBBBBBBo.',
        '..ooooooo..',
      ],
      { o: '#0b0917', B: '#261f47', P: '#f49ac1' }
    );

    // 9x9 Pixelated Steam Icon (blue circle + white piston/gear emblem)
    const steamIc = this.createCanvas('ui_steam_icon', 9, 9);
    this.drawGrid(
      steamIc.ctx,
      0,
      0,
      [
        '..ooooo..',
        '.oBBBBBo.',
        'oBBBWWBBo',
        'oBBWBBWBo',
        'oBBWWWBBo',
        'oWWWBWBBo',
        '.oWWBBBo.',
        '..ooooo..',
        '.........',
      ],
      { o: '#0b0917', B: '#1b6496', W: '#e0f2fe' }
    );
    steamIc.tex.refresh();
  }

  private generateEnvironmentSprites(): void {
    // 16x16 Chest closed & open
    const chestClosed = this.createCanvas('obj_chest_closed', 16, 16);
    this.drawGrid(chestClosed.ctx, 0, 2, [
      '..oooooooooooo..',
      '.oWWWWWWWWWWWWo.',
      'oWWGGGGGGGGGGWWo',
      'oWGGGGGGGGGGGGWo',
      'oGGGGGGGGGGGGGG.',
      'oooooooooooooooo',
      'oWWWWWooooWWWWWo',
      'oWWWWWoYYoWWWWWo',
      'oWWWWWWooWWWWWWo',
      'oWWWWWWWWWWWWWWo',
      '.oooooooooooooo.',
    ], { o: '#100d24', W: '#8a5a44', G: '#ffd275', Y: '#ffe699' });
    chestClosed.tex.refresh();

    const chestOpen = this.createCanvas('obj_chest_open', 16, 16);
    this.drawGrid(chestOpen.ctx, 0, 2, [
      '..oooooooooooo..',
      '.oGGGGGGGGGGGGo.',
      '.oDDDDDDDDDDDDo.',
      'oooooooooooooooo',
      'oWWWWWooooWWWWWo',
      'oWWWWWoYYoWWWWWo',
      'oWWWWWWooWWWWWWo',
      'oWWWWWWWWWWWWWWo',
      '.oooooooooooooo.',
    ], { o: '#100d24', W: '#6b4230', G: '#d4a347', D: '#1b1429', Y: '#ffe699' });
    chestOpen.tex.refresh();

    // Healing Shrine (16x20)
    const shrine = this.createCanvas('obj_shrine', 16, 20);
    this.drawGrid(shrine.ctx, 0, 0, [
      '......oooo......',
      '.....oCCCCo.....',
      '....oCCCCCCo....',
      '....oCChCCCo....',
      '.....oCCCCo.....',
      '......oooo......',
      '....oooooooo....',
      '...oSSSSSSSSo...',
      '...oSSPPPPSSo...',
      '...oSPPPPPPSo...',
      '...oSSPPPPSSo...',
      '...oSSSSSSSSo...',
      '..oooooooooooo..',
      '.oSSSSSSSSSSSSo.',
      '.oSSSSSSSSSSSSo.',
      'oooooooooooooooo',
    ], { o: '#100d24', C: '#ff75c3', h: '#ffffff', S: '#6a5d9e', P: '#9bf6ff' });
    shrine.tex.refresh();

    // Merchant Mimi (16x22)
    const merch = this.createCanvas('obj_merchant', 16, 22);
    this.drawGrid(merch.ctx, 0, 0, [
      '.....oooooo.....',
      '....oHHHHHHo....',
      '...oHHHHHHHHo...',
      '..oHHHHHHHHHHo..',
      '.oTTTTTTTTTTTTo.',
      '..oSSSSSSSSSSo..',
      '..oSSeSSSSSeSo..',
      '..oSSSSSSSSSSo..',
      '...oCCCCCCCCo...',
      '..oCCCCCCCCCCo..',
      '..oCCGGGGGGCCo..',
      '..oCCCCCCCCCCo..',
      '..oCCCCCCCCCCo..',
      '...oCCooooCCo...',
      '...ooo....ooo...',
    ], { o: '#100d24', H: '#5b3a70', T: '#ffd275', S: '#ffe5d9', e: '#100d24', C: '#e0569c', G: '#ffd275' });
    merch.tex.refresh();

    // Event Altar / Lore Stone (16x20)
    const altar = this.createCanvas('obj_altar', 16, 20);
    this.drawGrid(altar.ctx, 0, 0, [
      '.....oooooo.....',
      '....oSSSSSSo....',
      '...oSSRRRRSSo...',
      '...oSRRRRRRSo...',
      '...oSSRRRRSSo...',
      '...oSSSSSSSSo...',
      '...oSSRRRRSSo...',
      '...oSSSSSSSSo...',
      '..oooooooooooo..',
      '.oSSSSSSSSSSSSo.',
      'oooooooooooooooo',
    ], { o: '#100d24', S: '#4a4375', R: '#80ffea' });
    altar.tex.refresh();

    // Exit Portal (24x24)
    const portal = this.createCanvas('obj_portal', 24, 24);
    const pCtx = portal.ctx;
    pCtx.fillStyle = '#100d24';
    pCtx.beginPath();
    pCtx.arc(12, 12, 11, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#9d4edd';
    pCtx.beginPath();
    pCtx.arc(12, 12, 9, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#66ffd9';
    pCtx.beginPath();
    pCtx.arc(12, 12, 6, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#ffffff';
    pCtx.beginPath();
    pCtx.arc(12, 12, 3, 0, Math.PI * 2);
    pCtx.fill();
    portal.tex.refresh();

    // Pressure plate (16x16) unlit and lit
    for (const lit of [false, true]) {
      const { ctx, tex } = this.createCanvas(lit ? 'obj_plate_lit' : 'obj_plate', 16, 16);
      this.px(ctx, 2, 2, '#100d24', 12, 12);
      this.px(ctx, 3, 3, lit ? '#66ffd9' : '#4a4375', 10, 10);
      this.px(ctx, 5, 5, lit ? '#ffffff' : '#2c254a', 6, 6);
      tex.refresh();
    }

    // Beam emitter (16x16)
    {
      const { ctx, tex } = this.createCanvas('obj_emitter', 16, 16);
      this.px(ctx, 2, 2, '#100d24', 12, 12);
      this.px(ctx, 3, 3, '#3b2d5e', 10, 10);
      this.px(ctx, 5, 5, '#ffe066', 6, 6);
      this.px(ctx, 6, 6, '#ffffff', 4, 4);
      tex.refresh();
    }

    // Beam target crystal (16x16) unlit and lit
    for (const lit of [false, true]) {
      const { ctx, tex } = this.createCanvas(lit ? 'obj_beam_target_lit' : 'obj_beam_target', 16, 16);
      this.px(ctx, 3, 2, '#100d24', 10, 12);
      this.px(ctx, 4, 3, lit ? '#66ffd9' : '#4a4375', 8, 10);
      this.px(ctx, 6, 5, lit ? '#ffffff' : '#8e7cc3', 4, 6);
      tex.refresh();
    }

    // Diagonal mirrors (16x16) slash '/' and backslash '\'
    for (const kind of ['slash', 'backslash'] as const) {
      const { ctx, tex } = this.createCanvas(`obj_mirror_${kind}`, 16, 16);
      this.px(ctx, 2, 2, '#100d24', 12, 12);
      this.px(ctx, 3, 3, '#2c254a', 10, 10);
      for (let i = 0; i < 8; i++) {
        const mx = kind === 'slash' ? 11 - i : 4 + i;
        const my = 4 + i;
        this.px(ctx, mx - 1, my, '#6ef3ff', 2, 2);
        this.px(ctx, mx, my, '#ffffff', 1, 1);
      }
      tex.refresh();
    }

    // Pushable rune block (16x16)
    {
      const { ctx, tex } = this.createCanvas('obj_push_block', 16, 16);
      this.px(ctx, 1, 1, '#100d24', 14, 14);
      this.px(ctx, 2, 2, '#5e508a', 12, 12);
      this.px(ctx, 3, 3, '#8e7cc3', 10, 8);
      this.px(ctx, 6, 5, '#66ffd9', 4, 4);
      this.px(ctx, 7, 6, '#ffffff', 2, 2);
      tex.refresh();
    }

    // Block goal socket (16x16) unlit and lit
    for (const lit of [false, true]) {
      const { ctx, tex } = this.createCanvas(lit ? 'obj_block_goal_lit' : 'obj_block_goal', 16, 16);
      this.px(ctx, 2, 2, '#100d24', 12, 12);
      this.px(ctx, 3, 3, lit ? '#66ffd9' : '#251e42', 10, 10);
      this.px(ctx, 5, 5, lit ? '#ffffff' : '#66ffd9', 6, 6);
      if (!lit) this.px(ctx, 6, 6, '#251e42', 4, 4);
      tex.refresh();
    }

    // Reset rune pedestal (16x16)
    {
      const { ctx, tex } = this.createCanvas('obj_reset_rune', 16, 16);
      this.px(ctx, 3, 3, '#100d24', 10, 10);
      this.px(ctx, 4, 4, '#4a2b4f', 8, 8);
      this.px(ctx, 6, 6, '#ff75c3', 4, 4);
      tex.refresh();
    }

    // Crystal Guardian rotating reflective shield (10x10)
    {
      const { ctx, tex } = this.createCanvas('obj_crystal_shield', 10, 10);
      this.px(ctx, 1, 2, '#100d24', 8, 6);
      this.px(ctx, 2, 3, '#38bdf8', 6, 4);
      this.px(ctx, 3, 3, '#6ef3ff', 4, 2);
      this.px(ctx, 4, 3, '#ffffff', 2, 1);
      tex.refresh();
    }

    // Glowing Mushroom prop (12x14)
    const mush = this.createCanvas('prop_mushroom', 12, 14);
    this.drawGrid(mush.ctx, 0, 0, [
      '...oooooo...',
      '..oPPPPPPo..',
      '.oPPwPPwPPo.',
      'oPPPPPPPPPPo',
      'oPPPPwPPPPPo',
      '.oooooooooo.',
      '....oSSo....',
      '....oSSo....',
      '....oSSo....',
      '....oooo....',
    ], { o: '#100d24', P: '#ff75c3', w: '#ffe5f4', S: '#f3e8ff' });
    mush.tex.refresh();

    // Torch / Crystal Lantern prop (10x14)
    const lantern = this.createCanvas('prop_lantern', 10, 14);
    this.drawGrid(lantern.ctx, 0, 0, [
      '....oo....',
      '...oYYo...',
      '..oYwwYo..',
      '..oYYYYo..',
      '...oYYo...',
      '...oooo...',
      '....oo....',
      '....oo....',
      '...oooo...',
    ], { o: '#100d24', Y: '#ffd275', w: '#ffffff' });
    lantern.tex.refresh();

    // Animated molten lava tiles (16x16 full-tile, seamless)
    for (let frame = 0; frame < 3; frame++) {
      const { ctx, tex } = this.createCanvas(`tile_lava_${frame}`, 16, 16);
      this.px(ctx, 0, 0, '#c93b14', 16, 16);

      // Flowing orange magma bands that wrap seamlessly across 16px
      const shift = frame * 5;
      for (let x = 0; x < 16; x++) {
        const wy1 = (Math.floor(Math.sin(((x + shift) / 16) * Math.PI * 2) * 2) + 4) & 15;
        const wy2 = (Math.floor(Math.cos(((x - shift + 16) / 16) * Math.PI * 2) * 2) + 12) & 15;
        this.px(ctx, x, wy1, '#e85d1a', 1, 3);
        this.px(ctx, x, (wy1 + 1) & 15, '#ff8c24', 1, 1);
        this.px(ctx, x, wy2, '#e85d1a', 1, 3);
        this.px(ctx, x, (wy2 + 1) & 15, '#ff8c24', 1, 1);
      }

      // Glowing magma hotspots / bubbles
      const spots = [
        [(2 + frame * 3) % 14, 3],
        [(10 + frame * 2) % 14, 7],
        [(5 + frame * 4) % 14, 11],
        [(12 - frame * 2 + 14) % 14, 14],
      ];
      for (const [sx, sy] of spots) {
        this.px(ctx, sx, sy, '#ffbb33', 2, 2);
        if (frame === 1 || (sx + frame) % 2 === 0) {
          this.px(ctx, sx, sy, '#ffe066', 1, 1);
        }
      }

      tex.refresh();
    }

    // Spike trap grate (16x16): idle (black grate) and active (spikes out)
    const spikeIdle = this.createCanvas('obj_spike_idle', 16, 16);
    this.px(spikeIdle.ctx, 1, 1, '#100d24', 14, 14);
    this.px(spikeIdle.ctx, 2, 2, '#1f1d2e', 12, 12);
    // Black grate bars
    for (let g = 3; g <= 11; g += 4) {
      this.px(spikeIdle.ctx, g, 2, '#0a0914', 2, 12);
      this.px(spikeIdle.ctx, 2, g, '#0a0914', 12, 2);
      this.px(spikeIdle.ctx, g + 1, 3, '#383452', 1, 1);
    }
    spikeIdle.tex.refresh();

    const spikeMid = this.createCanvas('obj_spike_mid', 16, 16);
    spikeMid.ctx.drawImage(spikeIdle.canvas, 0, 0);
    // Half-emerged 16-bit spike tips
    for (const [sx, sy] of [[3, 2], [9, 2], [3, 8], [9, 8]]) {
      this.px(spikeMid.ctx, sx + 1, sy + 2, '#100d24', 2, 3);
      this.px(spikeMid.ctx, sx + 1, sy + 3, '#cbd5e1', 1, 1);
    }
    spikeMid.tex.refresh();

    const spikeActive = this.createCanvas('obj_spike_active', 16, 16);
    spikeActive.ctx.drawImage(spikeIdle.canvas, 0, 0);
    // 4 sharp 16-bit spikes sticking out of the grate
    for (const [sx, sy] of [[3, 2], [9, 2], [3, 8], [9, 8]]) {
      this.px(spikeActive.ctx, sx + 1, sy, '#100d24', 2, 5);
      this.px(spikeActive.ctx, sx, sy + 2, '#100d24', 4, 3);
      this.px(spikeActive.ctx, sx + 1, sy + 1, '#ffffff', 1, 3);
      this.px(spikeActive.ctx, sx + 2, sy + 2, '#94a3b8', 1, 2);
    }
    spikeActive.tex.refresh();

    // Crate / Destructible (16x16)
    const crate = this.createCanvas('obj_crate', 16, 16);
    this.px(crate.ctx, 1, 1, '#100d24', 14, 14);
    this.px(crate.ctx, 2, 2, '#7f5539', 12, 12);
    this.px(crate.ctx, 3, 3, '#b08968', 10, 10);
    this.px(crate.ctx, 3, 7, '#7f5539', 10, 2);
    this.px(crate.ctx, 7, 3, '#7f5539', 2, 10);
    crate.tex.refresh();
  }

  private generateItemIcons(): void {
    // Crystal Shard (10x12)
    const shard = this.createCanvas('item_shard', 10, 12);
    this.drawGrid(shard.ctx, 0, 0, [
      '....oo....',
      '...oCCo...',
      '..oChCCo..',
      '.oCChCCCo.',
      '.oCCCCCCo.',
      '..oCCCCo..',
      '...oCCo...',
      '....oo....',
    ], { o: '#100d24', C: '#6ef3ff', h: '#ffffff' });
    shard.tex.refresh();

    // Heart pickup (10x10)
    const heart = this.createCanvas('item_heart', 10, 10);
    this.drawGrid(heart.ctx, 0, 1, [
      '.oo...oo.',
      'oHHo.oHHo',
      'oHhHoHHHo',
      'oHHHHHHHo',
      '.oHHHHHo.',
      '..oHHHo..',
      '...oHo...',
      '....o....',
    ], { o: '#100d24', H: '#ff5d8f', h: '#ffffff' });
    heart.tex.refresh();

    const icons: Record<string, { rows: string[]; pal: Record<string, string> }> = {
      item_moonblade: {
        rows: [
          '.........oooo...',
          '........oBBBo...',
          '.......oBBhBo...',
          '......oBBBo.....',
          '.....oBBBo......',
          '....oBBBo.......',
          '..ooGGGo........',
          '.oGGGo..........',
          'oGGo............',
          '.oo.............',
        ],
        pal: { o: '#100d24', B: '#f49ac1', h: '#ffffff', G: '#ffd275' },
      },
      item_starstring_bow: {
        rows: [
          '....oooo........',
          '..ooWWWWo.......',
          '.oWWo...oS......',
          'oWWo....oS......',
          'oWWo...oSSo.....',
          'oWWo....oS......',
          '.oWWo...oS......',
          '..ooWWWWo.......',
          '....oooo........',
        ],
        pal: { o: '#100d24', W: '#b08968', S: '#ffe066' },
      },
      item_wisp_staff: {
        rows: [
          '........oooo....',
          '.......oCCCwo...',
          '.......oCCCCo...',
          '........oooo....',
          '.......oWWo.....',
          '......oWWo......',
          '.....oWWo.......',
          '....oWWo........',
          '...oWWo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', C: '#80ffea', w: '#ffffff', W: '#8a5a44' },
      },
      item_ember_staff: {
        rows: [
          '........oooo....',
          '.......oFYYFo...',
          '.......oFFFFo...',
          '........oooo....',
          '.......oWWo.....',
          '......oWWo......',
          '.....oWWo.......',
          '....oWWo........',
          '...oWWo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', F: '#ff6b35', Y: '#ffe066', W: '#6b4230' },
      },
      item_flamethrower: {
        rows: [
          '..........oo....',
          '..oooo...oYYo...',
          '.oRRRRo..oRRo...',
          '.oRRRRooooSSo...',
          '.oRRRRSSSSSSSSo.',
          '..ooooooooSSoo..',
          '....oBBo..oo....',
          '....oooo........',
        ],
        pal: { o: '#100d24', R: '#ff4500', Y: '#ffe066', S: '#94a3b8', B: '#475569' },
      },
      item_cloudbreaker: {
        rows: [
          '....oooooooo....',
          '...oPPPPPPPPo...',
          '...oPPhPPPPPo...',
          '...oPPPPPPPPo...',
          '....oooooooo....',
          '......oWWo......',
          '......oWWo......',
          '......oWWo......',
          '......oWWo......',
          '......oooo......',
        ],
        pal: { o: '#100d24', P: '#b8a1ff', h: '#ffffff', W: '#6b4230' },
      },
      item_starcleaver: {
        rows: [
          '........ooooo...',
          '.......oGGGGGo..',
          '......oGGhGGGo..',
          '.....oGGhGGGo...',
          '....oGGhGGGo....',
          '...oGGhGGGo.....',
          '..ooGGGGGoo.....',
          '.oPPPPPPo.......',
          'oPPoWWo.........',
          '.oo.oo..........',
        ],
        pal: { o: '#100d24', G: '#ffd275', h: '#ffffff', P: '#9d7ce8', W: '#6b4230' },
      },
      item_dream_reaper: {
        rows: [
          '..oooooooooo....',
          '.oMMMMMMMMMMo...',
          'oMMhMMMMooMMo...',
          'oMMMo....oWWo...',
          '.ooo.....oWWo...',
          '........oWWo....',
          '.......oWWo.....',
          '......oWWo......',
          '.....oooo.......',
        ],
        pal: { o: '#100d24', M: '#ff75c3', h: '#ffffff', W: '#5c43a8' },
      },
      item_prism_wand: {
        rows: [
          '.......ooooo....',
          '......oCCYYYo...',
          '......oCMMMCo...',
          '.......ooooo....',
          '......oGGGo.....',
          '.....oGGGo......',
          '....oGGGo.......',
          '...oGGGo........',
          '..oooo..........',
        ],
        pal: { o: '#100d24', C: '#70f8ff', Y: '#ffe066', M: '#ff75c3', G: '#ffd275' },
      },
      item_frost_needle: {
        rows: [
          '..........ooo...',
          '.........oCCo...',
          '........oChCo...',
          '.......oCCCo....',
          '......oCCCo.....',
          '.....oCCCo......',
          '...ooBBBo.......',
          '..oBBo..........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', C: '#9bf6ff', h: '#ffffff', B: '#4cc9f0' },
      },
      item_bubble_wand: {
        rows: [
          '......oooooo....',
          '.....oPPwwPPo...',
          '....oPPooooPPo..',
          '....oPPo..oPPo..',
          '.....oPPooPPo...',
          '......oooooo....',
          '......oGGGo.....',
          '.....oGGGo......',
          '....oooo........',
        ],
        pal: { o: '#100d24', P: '#ffb3e6', w: '#ffffff', G: '#ffd275' },
      },
      item_thorn_whip: {
        rows: [
          '...oooooo.......',
          '..oGGGGGGGo.....',
          '.oGGo...oGGo....',
          '.oGGo....oGGo...',
          '..oGGo..oGGo....',
          '...oGGoGGGo.....',
          '....oWWo........',
          '...oWWo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', G: '#34d399', W: '#6b4230' },
      },
      item_lantern_flail: {
        rows: [
          '.......oooo.....',
          '......oYYYYo....',
          '......oYwwYo....',
          '.......oooo.....',
          '......oSSo......',
          '.....oWWo.......',
          '....oWWo........',
          '...oWWo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', Y: '#ffd275', w: '#ffffff', S: '#94a3b8', W: '#6b4230' },
      },
      item_echo_dagger: {
        rows: [
          '........ooo.....',
          '.......oPPPo....',
          '......oPPhPo....',
          '.....oPPPo......',
          '....oPPPo.......',
          '..ooGGGo........',
          '.oGGo...........',
          '.ooo............',
        ],
        pal: { o: '#100d24', P: '#c084fc', h: '#ffffff', G: '#9d7ce8' },
      },
      item_honey_hammer: {
        rows: [
          '....oooooooo....',
          '...oYYYYYYYYo...',
          '...oYYwYYYYYo...',
          '...oYYYYYYYYo...',
          '....oooooooo....',
          '......oWWo......',
          '......oWWo......',
          '......oWWo......',
          '......oooo......',
        ],
        pal: { o: '#100d24', Y: '#fbbf24', w: '#ffffff', W: '#7f5539' },
      },
      item_shadow_fork: {
        rows: [
          '....oo.oo.oo....',
          '....oPoPPoPo....',
          '....oPPPPPPo....',
          '.....oooooo.....',
          '......oPPo......',
          '......oPPo......',
          '......oPPo......',
          '......oooo......',
        ],
        pal: { o: '#100d24', P: '#8b5cf6' },
      },
      item_crescent_katana: {
        rows: [
          '.........oooo...',
          '........oPPPo...',
          '.......oPPhPo...',
          '......oPPPo.....',
          '.....oPPPo......',
          '....oPPPo.......',
          '...oGGGo........',
          '..oGGo..........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', P: '#f49ac1', h: '#ffffff', G: '#ffe066' },
      },
      item_vine_scythe: {
        rows: [
          '..oooooooooo....',
          '.oGGGGGGGGGGoo..',
          'oGGwGGGooGGGGGo.',
          'oGGGo....oWWo...',
          '.ooo.....oWWo...',
          '........oWWo....',
          '.......oWWo.....',
          '......oooo......',
        ],
        pal: { o: '#100d24', G: '#9ef01a', w: '#ffffff', W: '#6b4230' },
      },
      fx_vine_scythe: {
        rows: [
          '......ooooooo...',
          '.....oGGGGGGGo..',
          '....oGGwGGGGGGoo',
          '....oGGo..ooGGGo',
          '.....oWo....oGGo',
          '.....oWo.....oGo',
          '.....oWo......oo',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....oWo........',
          '.....ooo........',
        ],
        pal: { o: '#100d24', G: '#9ef01a', w: '#ffffff', W: '#6b4230' },
      },
      item_sun_rapier: {
        rows: [
          '..........ooo...',
          '.........oYYo...',
          '........oYYYo...',
          '.......oYYYo....',
          '......oYYYo.....',
          '.....oYYYo......',
          '...ooGGGo.......',
          '..oGGo..........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', Y: '#ffe066', G: '#ffd275' },
      },
      item_frost_fang: {
        rows: [
          '.........oooo...',
          '........oCCCo...',
          '.......oCChCo...',
          '......oCCCo.....',
          '.....oCCCo......',
          '....oCCCo.......',
          '..ooBBBo........',
          '.oBBo...........',
          '.ooo............',
        ],
        pal: { o: '#100d24', C: '#9bf6ff', h: '#ffffff', B: '#38bdf8' },
      },
      item_obsidian_axe: {
        rows: [
          '.....ooooooo....',
          '....oPPPPPPPo...',
          '...oPPPhPPPPo...',
          '...oPPPPPPPoo...',
          '....ooooWWo.....',
          '.......oWWo.....',
          '......oWWo......',
          '.....oWWo.......',
          '.....ooo........',
        ],
        pal: { o: '#100d24', P: '#a855f7', h: '#ffffff', W: '#4a4e69' },
      },
      item_crystal_glaive: {
        rows: [
          '.........oooo...',
          '........oCCCo...',
          '.......oCChCo...',
          '.......oCCCo....',
          '......oWWo......',
          '.....oWWo.......',
          '....oWWo........',
          '...oWWo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', C: '#6ef3ff', h: '#ffffff', W: '#6b4230' },
      },
      item_star_cannon: {
        rows: [
          '..oooooooooo....',
          '.oBBBBBBBBBYo...',
          '.oBYYYYYYYBBo...',
          '.oBBBBBBBBBYo...',
          '..oooooooooo....',
          '...oWWooWWo.....',
          '...ooo..ooo.....',
        ],
        pal: { o: '#100d24', B: '#4c1d95', Y: '#ffe066', W: '#6b4230' },
      },
      item_mushroom_staff: {
        rows: [
          '.......oooooo...',
          '......oPPPPPPo..',
          '......oPPwPPPo..',
          '.......oooooo...',
          '.......oWWo.....',
          '......oWWo......',
          '.....oWWo.......',
          '....oWWo........',
          '...ooo..........',
        ],
        pal: { o: '#100d24', P: '#f472b6', w: '#ffffff', W: '#8a5a44' },
      },
      item_comet_slingshot: {
        rows: [
          '..ooo....ooo....',
          '..oWWo..oWWo....',
          '...oWWooWWo.....',
          '....oWWWWo......',
          '.....oWWo.......',
          '.....oWWo.......',
          '.....oWWo.......',
          '.....oooo.......',
        ],
        pal: { o: '#100d24', W: '#67e8f9' },
      },
      item_lunar_chakram: {
        rows: [
          '...oooooooo.....',
          '..oBBBBBBBBo....',
          '.oBBo....oBBo...',
          '.oBBo....oBBo...',
          '..oBBBBBBBBo....',
          '...oooooooo.....',
        ],
        pal: { o: '#100d24', B: '#a0c4ff' },
      },
      item_spark_wand: {
        rows: [
          '.......oooo.....',
          '......oYYYYo....',
          '......oYwwYo....',
          '.......oooo.....',
          '......oWWo......',
          '.....oWWo.......',
          '....oWWo........',
          '...ooo..........',
        ],
        pal: { o: '#100d24', Y: '#fef08a', w: '#ffffff', W: '#8a5a44' },
      },
      item_void_orb: {
        rows: [
          '...oooooooo.....',
          '..oPPPPPPPoo....',
          '.oPPwPPPPPPPo...',
          '.oPPPPPPPPPPo...',
          '..oPPPPPPPoo....',
          '...oooooooo.....',
        ],
        pal: { o: '#100d24', P: '#ff47b6', w: '#ffffff' },
      },
      item_petal_fan: {
        rows: [
          '..oooooooooo....',
          '.oPPPPPPPPPPo...',
          '.oPPwPPwPPwPo...',
          '..oPPPPPPPPo....',
          '...ooGGGGGoo....',
          '.....oGGo.......',
          '.....oooo.......',
        ],
        pal: { o: '#100d24', P: '#ffb3e6', w: '#ffffff', G: '#ffd275' },
      },
      item_thunder_rod: {
        rows: [
          '.......oooo.....',
          '......oCCCo.....',
          '.....oCCCo......',
          '....oCCCCCo.....',
          '......oCCo......',
          '.....oWWo.......',
          '....oWWo........',
          '...ooo..........',
        ],
        pal: { o: '#100d24', C: '#70f8ff', W: '#4a4e69' },
      },
      item_acorn_blaster: {
        rows: [
          '..ooooooooo.....',
          '.oBBBBBBBBBo....',
          '.oBAAAAAAAo.....',
          '..ooooooooo.....',
          '...oWWo.........',
          '...ooo..........',
        ],
        pal: { o: '#100d24', B: '#7f5539', A: '#d97706', W: '#6b4230' },
      },
      item_aurora_harp: {
        rows: [
          '..oooooooo......',
          '.oGGGGGGGGoo....',
          '.oGCCCCCCCGo....',
          '.oGCCCCCCGo.....',
          '..oGGGGGGoo.....',
          '...ooooooo......',
        ],
        pal: { o: '#100d24', G: '#66ffd9', C: '#a5f3fc' },
      },
      item_slime_launcher: {
        rows: [
          '..ooooooooo.....',
          '.oGGGGGGGGGo....',
          '.oGGwGGGGGGGo...',
          '..ooooooooo.....',
          '...oWWo.........',
          '...ooo..........',
        ],
        pal: { o: '#100d24', G: '#a6ff4d', w: '#ffffff', W: '#4a4e69' },
      },
      item_astral_greatsword: {
        rows: [
          '.........ooooo..',
          '........oYYYYYo.',
          '.......oYYwYYYo.',
          '......oYYwYYYo..',
          '.....oYYwYYYo...',
          '....oYYwYYYo....',
          '..ooCCYYYYo.....',
          '.oCCCCYYoo......',
          'oCCoWWo.........',
          '.oo.oo..........',
        ],
        pal: { o: '#100d24', Y: '#ffe066', w: '#ffffff', C: '#6ef3ff', W: '#4c1d95' },
      },
      item_celestial_scepter: {
        rows: [
          '.......ooooo....',
          '......oCCCCCo...',
          '......oCYwYCo...',
          '......oCCCCCo...',
          '.......ooooo....',
          '......oYYo......',
          '.....oYYo.......',
          '....oYYo........',
          '...oYYo.........',
          '..ooo...........',
        ],
        pal: { o: '#100d24', C: '#6ef3ff', Y: '#ffe066', w: '#ffffff' },
      },
      item_eclipse_bow: {
        rows: [
          '....oooo........',
          '..ooPPPPo.......',
          '.oPPo...oY......',
          'oPPo....oY......',
          'oPPo...oYYo.....',
          'oPPo....oY......',
          '.oPPo...oY......',
          '..ooPPPPo.......',
          '....oooo........',
        ],
        pal: { o: '#100d24', P: '#ff47b6', Y: '#ffe066' },
      },
      item_shugorons_horn: {
        rows: [
          '.........oooo...',
          '.......ooYYYYo..',
          '.....ooYYCCYYo..',
          '....oYYCCYYoo...',
          '...oYYYYooo.....',
          '..oYYCYYo.......',
          '.oYYooYYo.......',
          '.oYo..ooo.......',
          '..o.............',
        ],
        pal: { o: '#100d24', Y: '#ffb326', C: '#6ef3ff' },
      },
      item_black_staff: {
        rows: [
          '.....oooo.......',
          '....oPPPPo......',
          '....oPwwPo......',
          '.....oooo.......',
          '......oBo.......',
          '......oBo.......',
          '......oBo.......',
          '......oBo.......',
          '......ooo.......',
        ],
        pal: { o: '#100d24', P: '#c084fc', w: '#ffffff', B: '#2a223d' },
      },
      item_haunters_eye: {
        rows: [
          '.....ooooo......',
          '...ooYYYYYoo....',
          '..oYYwwwwwYYo...',
          '.oYYwOOOOOwYYo..',
          '.oYYwOwwwOwYYo..',
          '..oYYwwwwwYYo...',
          '...ooYYYYYoo....',
          '.....ooooo......',
          '................',
        ],
        pal: { o: '#100d24', Y: '#ffe066', O: '#ff8c1a', w: '#ffffff' },
      },
      item_starlight_flask: {
        rows: [
          '.....oooo.......',
          '.....oYYo.......',
          '....oooooo......',
          '...oCCCCCCo.....',
          '..oCCwCCCCCo....',
          '..oCCPPPPCCo....',
          '..oCCCCCCCCo....',
          '...oCCCCCCo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', Y: '#ffe066', C: '#6ef3ff', P: '#ff47b6', w: '#ffffff' },
      },
      item_necromancy_altar: {
        rows: [
          '....oooooooo....',
          '...oPPPPPPPPo...',
          '..oPPwPPPPwPPo..',
          '..oPPPPPPPPPPo..',
          '...oPPooooPPo...',
          '..oooooooooooo..',
          '.oSSSSSSSSSSSSo.',
          '.oSSYYYYYYYYSSo.',
          'oooooooooooooooo',
        ],
        pal: { o: '#100d24', P: '#c084fc', w: '#ffffff', S: '#4a4375', Y: '#ff47b6' },
      },
      item_everheart_core: {
        rows: [
          '..ooo....ooo....',
          '.oPPPo..oPPPo...',
          'oPPwPPooPPPPPo..',
          'oPPPPYYYYPPPPo..',
          '.oPPPYYYYPPPo...',
          '..oPPPPPPPPo....',
          '...oPPPPPPo.....',
          '....oPPPPo......',
          '.....oooo.......',
        ],
        pal: { o: '#100d24', P: '#ff47b6', Y: '#ffe066', w: '#ffffff' },
      },
      item_heartdew_potion: {
        rows: [
          '.....oooo.......',
          '.....oCCo.......',
          '....oooooo......',
          '...oRRRRRRo.....',
          '..oRRwRRRRRo....',
          '..oRRRRRRRRo....',
          '..oRRRRRRRRo....',
          '...oRRRRRRo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', C: '#b08968', R: '#ff5d8f', w: '#ffffff' },
      },
      item_syringe: {
        rows: [
          '................',
          '..ooo...........',
          '..oPPooooooo....',
          '..oPwGGGGGGoo...',
          '..oPPGGGGGGooooo',
          '..oPPooooooo....',
          '..ooo...........',
          '................',
          '................',
        ],
        pal: { o: '#100d24', P: '#b8a1ff', G: '#66ffd9', w: '#ffffff' },
      },
      item_star_bomb: {
        rows: [
          '.......ooo......',
          '......oYYo......',
          '....oooo........',
          '..ooBBBBoo......',
          '.oBBwBBBBBo.....',
          '.oBBBBBBBBo.....',
          '.oBBBBBBBBo.....',
          '..oBBBBBBo......',
          '...oooooo.......',
        ],
        pal: { o: '#100d24', Y: '#ffe066', B: '#3b3363', w: '#ffffff' },
      },
      item_fairy_dust: {
        rows: [
          '.....oooo.......',
          '....oGGGGoo.....',
          '...oSSSSSSo.....',
          '..oSSwSSSSSo....',
          '..oSSSSSSSSo....',
          '...oSSSSSSo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', G: '#ffd275', S: '#66ffd9', w: '#ffffff' },
      },
      item_revive_totem: {
        rows: [
          '....oooooo......',
          '...oGGGGGGoo....',
          '..oGGoYYoGGGo...',
          '..oGGGGGGGGGo...',
          '...oGGooGGGo....',
          '...oGGGGGGGo....',
          '....ooooooo.....',
        ],
        pal: { o: '#100d24', G: '#ffd275', Y: '#ff75c3' },
      },
      item_pocket_fireworks: {
        rows: [
          '.....oo.........',
          '....oYYo........',
          '...oRRRRo.......',
          '...oWWWWo.......',
          '...oRRRRo.......',
          '...oWWWWo.......',
          '....oooo........',
          '.....oo.........',
        ],
        pal: { o: '#100d24', Y: '#ffe066', R: '#ff5d8f', W: '#ffffff' },
      },
      item_moonmilk: {
        rows: [
          '....oooo........',
          '...oBBBBoo......',
          '...oWWWWWWo.....',
          '..oWWwWWWWWo....',
          '..oWWWWWWWWo....',
          '..oWWWWWWWWo....',
          '...oWWWWWWo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', B: '#a0c4ff', W: '#f1f5f9', w: '#ffffff' },
      },
      item_starlight_brew: {
        rows: [
          '.....oooo.......',
          '.....oGGo.......',
          '....oooooo......',
          '...oCCCCCCo.....',
          '..oCCwCCCCCo....',
          '..oCCYYYYCCo....',
          '..oCCCCCCCCo....',
          '...oCCCCCCo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', G: '#ffd275', C: '#6ef3ff', w: '#ffffff', Y: '#ffe066' },
      },
      item_everheart_elixir: {
        rows: [
          '.....oooo.......',
          '.....oGGo.......',
          '...oooooooo.....',
          '..oPPwPPwPPo....',
          '..oPPPPPPPPo....',
          '...oPPPPPPo.....',
          '....oPPPPo......',
          '.....oPPo.......',
          '......oo........',
        ],
        pal: { o: '#100d24', G: '#ffd275', P: '#ff75c3', w: '#ffffff' },
      },
      item_blink_scroll: {
        rows: [
          '...oooooo.......',
          '..oYYYYYYo......',
          '..oPPPPPPo......',
          '..oPPwPPPo......',
          '..oPPPPPPo......',
          '..oPPPPPPo......',
          '..oYYYYYYo......',
          '...oooooo.......',
        ],
        pal: { o: '#100d24', Y: '#ffd275', P: '#c084fc', w: '#ffffff' },
      },
      item_grappling_hook: {
        rows: [
          '.....oo..oo.....',
          '....oSSooSSo....',
          '...oSSoSSoSSo...',
          '......oSSo......',
          '.....oSSo.......',
          '....oBBo........',
          '...oBBo.........',
          '..oooo..........',
        ],
        pal: { o: '#100d24', S: '#cbd5e1', B: '#b45309' },
      },
      item_gravity_jar: {
        rows: [
          '.....oooo.......',
          '....oGGGGoo.....',
          '...oPPPPPPo.....',
          '..oPPWWWWPPo....',
          '..oPPWbbWPPo....',
          '..oPPWWWWPPo....',
          '...oPPPPPPo.....',
          '....oooooo......',
        ],
        pal: { o: '#100d24', G: '#94a3b8', P: '#7c3aed', W: '#c084fc', b: '#100d24' },
      },
      item_chaos_dice: {
        rows: [
          '..oooooooo......',
          '.oWWWWWWWWo.....',
          '.oWRWWWWWRo.....',
          '.oWWWWBWWWo.....',
          '.oWRWWWWWRo.....',
          '.oWWWWWWWWo.....',
          '..oooooooo......',
        ],
        pal: { o: '#100d24', W: '#f8fafc', R: '#ff5d8f', B: '#6ef3ff' },
      },
      item_decoy_plush: {
        rows: [
          '..oo....oo......',
          '.oPPo..oPPo.....',
          '.oPPPPPPPPo.....',
          '.oPoPPPPoPo.....',
          '..oPPPPPPo......',
          '..oPPYYPPo......',
          '...oooooo.......',
        ],
        pal: { o: '#100d24', P: '#f49ac1', Y: '#ffe066' },
      },
      item_titan_shroom: {
        rows: [
          '...oooooo.......',
          '.ooRRRRRRoo.....',
          'oRRwRRRRwRRo....',
          'oRRRRwRRRRRo....',
          '.oooooooooo.....',
          '...oWWWWo.......',
          '...oWWWWo.......',
          '...oooooo.......',
        ],
        pal: { o: '#100d24', R: '#ff6b35', w: '#ffe066', W: '#fde68a' },
      },
      item_chrono_hourglass: {
        rows: [
          '..oooooooo......',
          '..oGGGGGGGo.....',
          '...oCCCCo.......',
          '....oCCo........',
          '....oYYo........',
          '...oYYYYo.......',
          '..oGGGGGGGo.....',
          '..oooooooo......',
        ],
        pal: { o: '#100d24', G: '#ffd275', C: '#6ef3ff', Y: '#ffe066' },
      },
      item_swap_orb: {
        rows: [
          '...oooooo.......',
          '..oCCCCCCo......',
          '.oCCwCCPPPo.....',
          '.oCCPPPPPPo.....',
          '.oCCPPwPPPo.....',
          '..oPPPPPPo......',
          '...oooooo.......',
        ],
        pal: { o: '#100d24', C: '#6ef3ff', P: '#f49ac1', w: '#ffffff' },
      },
      item_disco_prism: {
        rows: [
          '.....oo.........',
          '....oWCo........',
          '...oRRYYo.......',
          '..oGGCCPPo......',
          '.oRRYYGGCCo.....',
          '..oooooooo......',
        ],
        pal: { o: '#100d24', W: '#ffffff', C: '#6ef3ff', R: '#ff5d8f', Y: '#ffe066', G: '#66ffd9', P: '#c084fc' },
      },
      item_meteor_whistle: {
        rows: [
          '.....oooo.......',
          '....oRRRRoo.....',
          '...oRRYYRRRo....',
          '..oGGGRRRRRo....',
          '..oGGo..ooo.....',
          '...oo...........',
        ],
        pal: { o: '#100d24', R: '#ff6b35', Y: '#ffe066', G: '#94a3b8' },
      },
      item_lucky_backpack: {
        rows: [
          '.....oooooo.....',
          '....oBBBBBBoo...',
          '...oBBYYYYBBBo..',
          '..oBBBBBBBBBBBo.',
          '..oBBGYYYYGBBBo.',
          '..oBBGYYYYGBBBo.',
          '..oBBBBBBBBBBBo.',
          '...oBBBBBBBBBo..',
          '....ooooooooo...',
        ],
        pal: { o: '#100d24', B: '#b45309', G: '#ffd275', Y: '#ffe066' },
      },
      item_tiny_comet: {
        rows: [
          '......oooo......',
          '....ooYYYYo.....',
          '..ooYYwYYYo.....',
          '.oYYYYYYYYo.....',
          '..oooooooo......',
        ],
        pal: { o: '#100d24', Y: '#ffe066', w: '#ffffff' },
      },
      item_glass_heart: {
        rows: [
          '.oo...oo.',
          'oCCo.oCCo',
          'oCChOCCCo',
          'oCCCCCCCo',
          '.oCCCCCo.',
          '..oCCCo..',
          '...oCo...',
          '....o....',
        ],
        pal: { o: '#100d24', C: '#a5f3fc', h: '#ffffff' },
      },
      item_wandering_eye: {
        rows: [
          '..oooooo........',
          '.oWWWWWWo.......',
          'oWWPPPPWWo......',
          'oWWPwwPWWo......',
          '.oWWWWWWo.......',
          '..oooooo........',
        ],
        pal: { o: '#100d24', W: '#f8fafc', P: '#c084fc', w: '#100d24' },
      },
      item_lucky_acorn: {
        rows: [
          '....oooo........',
          '..ooBBBBoo......',
          '.oBBBBBBBBo.....',
          '..oAAAAAAo......',
          '..oAAwAAAo......',
          '...oAAAAo.......',
          '....oooo........',
        ],
        pal: { o: '#100d24', B: '#6b4230', A: '#ffd275', w: '#ffffff' },
      },
      item_moth_crown: {
        rows: [
          '.oo....oo.......',
          'oYYo..oYYo......',
          'oYYYYYYYYo......',
          'oYYPYYPYYo......',
          '.oooooooo.......',
        ],
        pal: { o: '#100d24', Y: '#ffd275', P: '#f49ac1' },
      },
      item_starseed: {
        rows: [
          '....oo..........',
          '...oGGo.........',
          '..oYYYYo........',
          '.oYYwYYYo.......',
          '..oYYYYo........',
          '...oooo.........',
        ],
        pal: { o: '#100d24', G: '#66ffd9', Y: '#ffe066', w: '#ffffff' },
      },
    };

    for (const [key, def] of Object.entries(icons)) {
      const { ctx, tex } = this.createCanvas(key, 16, 16);
      this.drawGrid(ctx, 1, 3, def.rows, def.pal);
      tex.refresh();
    }
  }

  private generatePlayerSprites(): void {
    // 16x24 per frame, 6 frames horizontally:
    // 0: idle0, 1: idle1, 2: walk0, 3: walk1, 4: dodge, 5: downed
    for (const pal of PLAYER_PALETTES) {
      this.buildPlayerSheet(pal);
    }
    for (const dlc of DLC_CHARACTERS) {
      this.buildDlcCharacterSheet(dlc.id);
    }
  }

  private buildPlayerSheet(pal: PlayerPalette): void {
    const key = `player_${pal.id}`;
    const fw = 16;
    const fh = 24;
    const { ctx, tex } = this.createCanvas(key, fw * 6, fh);
    const cCloak = this.shade(pal.cloak, 1);
    const cCloakDk = this.shade(pal.cloak, 0.72);
    const cTrim = this.shade(pal.trim, 1);
    const cSkin = this.shade(pal.skin, 1);
    const cHat = this.shade(pal.hat, 1);
    const cHatHi = this.shade(pal.hat, 1.25);

    const drawCharFrame = (frameIdx: number, bobY: number, legOffset: number, squash: boolean, downed: boolean) => {
      const ox = frameIdx * fw;
      if (downed) {
        // Cute fallen character with little starry dizzy look
        this.px(ctx, ox + 2, 16, '#100d24', 12, 6);
        this.px(ctx, ox + 3, 17, cCloak, 6, 4);
        this.px(ctx, ox + 9, 17, cSkin, 4, 4);
        this.px(ctx, ox + 10, 18, '#100d24', 1, 1);
        this.px(ctx, ox + 12, 18, '#100d24', 1, 1);
        this.px(ctx, ox + 5, 13, '#ffe066', 2, 1);
        this.px(ctx, ox + 10, 12, '#ffe066', 2, 1);
        return;
      }

      const y = 3 + bobY + (squash ? 2 : 0);
      // Pointy cute hat / hood
      this.px(ctx, ox + 6, y, '#100d24', 4, 2);
      this.px(ctx, ox + 7, y + 1, cHatHi, 2, 1);
      this.px(ctx, ox + 4, y + 2, '#100d24', 8, 3);
      this.px(ctx, ox + 5, y + 2, cHat, 6, 3);
      this.px(ctx, ox + 3, y + 5, '#100d24', 10, 2);
      this.px(ctx, ox + 4, y + 5, cTrim, 8, 1);

      // Oversized cute head
      this.px(ctx, ox + 4, y + 6, '#100d24', 8, 6);
      this.px(ctx, ox + 5, y + 7, cSkin, 6, 4);
      // Expressive eyes
      this.px(ctx, ox + 6, y + 8, '#100d24', 1, 2);
      this.px(ctx, ox + 9, y + 8, '#100d24', 1, 2);
      // Rosy cheeks
      this.px(ctx, ox + 5, y + 10, '#f49ac1', 1, 1);
      this.px(ctx, ox + 10, y + 10, '#f49ac1', 1, 1);

      // Cloak body
      const bodyH = squash ? 5 : 6;
      this.px(ctx, ox + 3, y + 12, '#100d24', 10, bodyH);
      this.px(ctx, ox + 4, y + 12, cCloak, 8, bodyH - 1);
      this.px(ctx, ox + 4, y + 12 + bodyH - 2, cCloakDk, 8, 1);
      // Trim
      this.px(ctx, ox + 5, y + 12, cTrim, 6, 1);

      // Feet
      this.px(ctx, ox + 4 + legOffset, y + 12 + bodyH, '#100d24', 3, 2);
      this.px(ctx, ox + 9 - legOffset, y + 12 + bodyH, '#100d24', 3, 2);
    };

    drawCharFrame(0, 0, 0, false, false);
    drawCharFrame(1, 1, 0, false, false);
    drawCharFrame(2, 0, -1, false, false);
    drawCharFrame(3, 1, 1, false, false);
    drawCharFrame(4, 0, 0, true, false);
    drawCharFrame(5, 0, 0, false, true);

    tex.refresh();
    // Register frames manually on CanvasTexture
    for (let i = 0; i < 6; i++) {
      tex.add(i, 0, i * fw, 0, fw, fh);
    }
  }

  private buildDlcCharacterSheet(charId: DlcCharacterId): void {
    const key = `player_${charId}`;
    const fw = 16;
    const fh = 24;
    const { ctx, tex } = this.createCanvas(key, fw * 6, fh);

    const themes: Record<
      DlcCharacterId,
      { body: string; bodyDk: string; trim: string; skin: string; hat: string; hatHi: string }
    > = {
      wizard: { body: '#2c2366', bodyDk: '#1a1440', trim: '#ffe066', skin: '#ffdec7', hat: '#3b2b8a', hatHi: '#6c5bb3' },
      hitman: { body: '#1e1e26', bodyDk: '#111117', trim: '#ef4444', skin: '#f7d9c4', hat: '#18181f', hatHi: '#3f3f4e' },
      skeleton: { body: '#1f1c2e', bodyDk: '#12101c', trim: '#e2e8f0', skin: '#f1f5f9', hat: '#e2e8f0', hatHi: '#ffffff' },
      robot: { body: '#64748b', bodyDk: '#475569', trim: '#38bdf8', skin: '#94a3b8', hat: '#475569', hatHi: '#cbd5e1' },
      astronaut: { body: '#e2e8f0', bodyDk: '#94a3b8', trim: '#f59e0b', skin: '#f59e0b', hat: '#f8fafc', hatHi: '#ffffff' },
      demon: { body: '#7f1d1d', bodyDk: '#450a0a', trim: '#fbbf24', skin: '#ef4444', hat: '#991b1b', hatHi: '#f87171' },
      zombie: { body: '#3f6212', bodyDk: '#1a2e05', trim: '#78350f', skin: '#84cc16', hat: '#4d7c0f', hatHi: '#a3e635' },
      plague_doctor: { body: '#1f1b24', bodyDk: '#120f17', trim: '#d97706', skin: '#f8fafc', hat: '#27222e', hatHi: '#474054' },
      toga: { body: '#f8fafc', bodyDk: '#cbd5e1', trim: '#fbbf24', skin: '#f1c29b', hat: '#16a34a', hatHi: '#4ade80' },
      aviator: { body: '#78350f', bodyDk: '#451a03', trim: '#fef3c7', skin: '#fcd5b5', hat: '#92400e', hatHi: '#b45309' },
      pirate: { body: '#991b1b', bodyDk: '#450a0a', trim: '#fbbf24', skin: '#fcd5b5', hat: '#1f1b24', hatHi: '#474054' },
      ninja: { body: '#18181f', bodyDk: '#09090d', trim: '#ef4444', skin: '#fcd5b5', hat: '#1e1e26', hatHi: '#3f3f4e' },
      knight: { body: '#94a3b8', bodyDk: '#475569', trim: '#ef4444', skin: '#cbd5e1', hat: '#cbd5e1', hatHi: '#f8fafc' },
      cyberpunk: { body: '#1e1b4b', bodyDk: '#0f172a', trim: '#f472b6', skin: '#fcd5b5', hat: '#ec4899', hatHi: '#f9a8d4' },
      alien: { body: '#6d28d9', bodyDk: '#4c1d95', trim: '#38bdf8', skin: '#a3e635', hat: '#a3e635', hatHi: '#d9f99d' },
      vampire: { body: '#18181f', bodyDk: '#09090d', trim: '#dc2626', skin: '#f1f5f9', hat: '#18181f', hatHi: '#475569' },
      chef: { body: '#f8fafc', bodyDk: '#cbd5e1', trim: '#ef4444', skin: '#fcd5b5', hat: '#ffffff', hatHi: '#e2e8f0' },
      clown: { body: '#f59e0b', bodyDk: '#b45309', trim: '#38bdf8', skin: '#f8fafc', hat: '#ef4444', hatHi: '#60a5fa' },
      cowboy: { body: '#78350f', bodyDk: '#451a03', trim: '#dc2626', skin: '#f1c29b', hat: '#d97706', hatHi: '#fbbf24' },
      samurai: { body: '#991b1b', bodyDk: '#450a0a', trim: '#fbbf24', skin: '#fcd5b5', hat: '#1f1b24', hatHi: '#fbbf24' },
      mummy: { body: '#e7e5e4', bodyDk: '#a8a29e', trim: '#d6d3d1', skin: '#e7e5e4', hat: '#f5f5f4', hatHi: '#d6d3d1' },
      mushroom: { body: '#78350f', bodyDk: '#451a03', trim: '#fef3c7', skin: '#fef3c7', hat: '#ef4444', hatHi: '#ffffff' },
      scarecrow: { body: '#92400e', bodyDk: '#451a03', trim: '#fbbf24', skin: '#d97706', hat: '#78350f', hatHi: '#b45309' },
      royal: { body: '#6b21a8', bodyDk: '#3b0764', trim: '#f8fafc', skin: '#fcd5b5', hat: '#fbbf24', hatHi: '#fef08a' },
      diver: { body: '#b45309', bodyDk: '#78350f', trim: '#fbbf24', skin: '#d97706', hat: '#d97706', hatHi: '#fde68a' },
      frog: { body: '#15803d', bodyDk: '#14532d', trim: '#bef264', skin: '#4ade80', hat: '#4ade80', hatHi: '#86efac' },
    };
    const th = themes[charId];

    const drawFrame = (frameIdx: number, bobY: number, legOffset: number, squash: boolean, downed: boolean) => {
      const ox = frameIdx * fw;
      if (downed) {
        this.px(ctx, ox + 2, 16, '#100d24', 12, 6);
        this.px(ctx, ox + 3, 17, th.body, 6, 4);
        this.px(ctx, ox + 9, 17, th.skin, 4, 4);
        this.px(ctx, ox + 10, 18, '#100d24', 1, 1);
        this.px(ctx, ox + 12, 18, '#100d24', 1, 1);
        this.px(ctx, ox + 5, 13, '#ffe066', 2, 1);
        this.px(ctx, ox + 10, 12, '#ffe066', 2, 1);
        return;
      }

      const y = 3 + bobY + (squash ? 2 : 0);
      const bodyH = squash ? 5 : 6;

      // Headgear / top silhouette per character
      if (charId === 'wizard') {
        this.px(ctx, ox + 6, y - 2, '#100d24', 4, 3);
        this.px(ctx, ox + 7, y - 1, th.hatHi, 2, 2);
        this.px(ctx, ox + 4, y + 1, '#100d24', 8, 4);
        this.px(ctx, ox + 5, y + 1, th.hat, 6, 4);
        this.px(ctx, ox + 7, y + 2, '#ffe066', 1, 1);
        this.px(ctx, ox + 2, y + 5, '#100d24', 12, 2);
        this.px(ctx, ox + 3, y + 5, th.trim, 10, 1);
      } else if (charId === 'hitman') {
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
      } else if (charId === 'skeleton') {
        this.px(ctx, ox + 5, y + 4, '#100d24', 6, 2);
        this.px(ctx, ox + 6, y + 5, th.skin, 4, 1);
      } else if (charId === 'robot') {
        this.px(ctx, ox + 7, y + 1, '#38bdf8', 2, 2);
        this.px(ctx, ox + 7, y + 3, '#100d24', 2, 2);
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 5, th.hatHi, 6, 1);
      } else if (charId === 'astronaut') {
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
      } else if (charId === 'demon') {
        // Horns
        this.px(ctx, ox + 3, y + 2, '#100d24', 2, 3);
        this.px(ctx, ox + 4, y + 2, '#fbbf24', 1, 3);
        this.px(ctx, ox + 11, y + 2, '#100d24', 2, 3);
        this.px(ctx, ox + 11, y + 2, '#fbbf24', 1, 3);
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 5, th.skin, 6, 1);
      } else if (charId === 'zombie') {
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 5, th.hat, 5, 1);
      } else if (charId === 'plague_doctor') {
        this.px(ctx, ox + 4, y + 1, '#100d24', 8, 4);
        this.px(ctx, ox + 5, y + 2, th.hat, 6, 3);
        this.px(ctx, ox + 2, y + 5, '#100d24', 12, 2);
        this.px(ctx, ox + 3, y + 5, th.hatHi, 10, 1);
      } else if (charId === 'toga') {
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 4, '#65a30d', 6, 2);
        this.px(ctx, ox + 5, y + 4, '#fbbf24', 2, 1);
        this.px(ctx, ox + 9, y + 4, '#fbbf24', 2, 1);
      } else if (charId === 'aviator') {
        this.px(ctx, ox + 4, y + 2, '#100d24', 8, 4);
        this.px(ctx, ox + 5, y + 3, th.hat, 6, 3);
        // Brass flight goggles
        this.px(ctx, ox + 4, y + 4, '#fbbf24', 3, 2);
        this.px(ctx, ox + 9, y + 4, '#fbbf24', 3, 2);
        this.px(ctx, ox + 5, y + 4, '#67e8f9', 1, 1);
        this.px(ctx, ox + 10, y + 4, '#67e8f9', 1, 1);
      } else if (charId === 'pirate') {
        this.px(ctx, ox + 3, y + 2, '#100d24', 10, 4);
        this.px(ctx, ox + 4, y + 3, th.hat, 8, 3);
        this.px(ctx, ox + 7, y + 3, '#f8fafc', 2, 2);
      } else if (charId === 'ninja') {
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
        this.px(ctx, ox + 4, y + 5, '#ef4444', 8, 1);
      } else if (charId === 'knight') {
        this.px(ctx, ox + 6, y, '#ef4444', 4, 3);
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hatHi, 6, 2);
      } else if (charId === 'cyberpunk') {
        this.px(ctx, ox + 6, y + 1, th.hat, 4, 4);
        this.px(ctx, ox + 7, y + 1, th.hatHi, 2, 3);
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
      } else if (charId === 'alien') {
        this.px(ctx, ox + 4, y + 2, '#100d24', 8, 4);
        this.px(ctx, ox + 5, y + 3, th.skin, 6, 3);
      } else if (charId === 'vampire') {
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
        this.px(ctx, ox + 7, y + 5, th.hat, 2, 2);
      } else if (charId === 'chef') {
        this.px(ctx, ox + 4, y, '#100d24', 8, 5);
        this.px(ctx, ox + 5, y + 1, th.hat, 6, 4);
      } else if (charId === 'clown') {
        this.px(ctx, ox + 3, y + 3, '#ef4444', 3, 4);
        this.px(ctx, ox + 10, y + 3, '#60a5fa', 3, 4);
        this.px(ctx, ox + 6, y + 3, '#fbbf24', 4, 2);
      } else if (charId === 'cowboy') {
        this.px(ctx, ox + 4, y + 2, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 2, th.hat, 6, 3);
        this.px(ctx, ox + 2, y + 5, '#100d24', 12, 2);
        this.px(ctx, ox + 3, y + 5, th.hatHi, 10, 1);
      } else if (charId === 'samurai') {
        this.px(ctx, ox + 3, y + 1, '#fbbf24', 2, 3);
        this.px(ctx, ox + 11, y + 1, '#fbbf24', 2, 3);
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
      } else if (charId === 'mummy') {
        this.px(ctx, ox + 4, y + 4, '#100d24', 8, 2);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
      } else if (charId === 'mushroom') {
        this.px(ctx, ox + 3, y + 1, '#100d24', 10, 5);
        this.px(ctx, ox + 4, y + 2, th.hat, 8, 4);
        this.px(ctx, ox + 5, y + 3, '#ffffff', 2, 2);
        this.px(ctx, ox + 9, y + 2, '#ffffff', 2, 2);
      } else if (charId === 'scarecrow') {
        this.px(ctx, ox + 5, y, '#100d24', 6, 4);
        this.px(ctx, ox + 6, y + 1, th.hat, 4, 3);
        this.px(ctx, ox + 2, y + 4, '#100d24', 12, 2);
        this.px(ctx, ox + 3, y + 4, th.hatHi, 10, 1);
      } else if (charId === 'royal') {
        this.px(ctx, ox + 4, y + 2, '#100d24', 8, 4);
        this.px(ctx, ox + 5, y + 3, th.hat, 6, 2);
        this.px(ctx, ox + 5, y + 2, '#fbbf24', 1, 1);
        this.px(ctx, ox + 7, y + 2, '#ef4444', 2, 1);
        this.px(ctx, ox + 10, y + 2, '#fbbf24', 1, 1);
      } else if (charId === 'diver') {
        this.px(ctx, ox + 4, y + 3, '#100d24', 8, 3);
        this.px(ctx, ox + 5, y + 4, th.hat, 6, 2);
      } else if (charId === 'frog') {
        // Bulging frog eyes on top of head
        this.px(ctx, ox + 4, y + 3, '#100d24', 3, 3);
        this.px(ctx, ox + 5, y + 4, '#ffffff', 1, 1);
        this.px(ctx, ox + 9, y + 3, '#100d24', 3, 3);
        this.px(ctx, ox + 10, y + 4, '#ffffff', 1, 1);
      }

      // Head
      this.px(ctx, ox + 4, y + 6, '#100d24', 8, 6);
      this.px(ctx, ox + 5, y + 7, th.skin, 6, 4);

      // Face details
      if (charId === 'hitman') {
        // Sunglasses
        this.px(ctx, ox + 5, y + 8, '#0b0917', 6, 2);
        this.px(ctx, ox + 6, y + 8, '#94a3b8', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#94a3b8', 1, 1);
      } else if (charId === 'robot') {
        this.px(ctx, ox + 5, y + 7, '#0f172a', 6, 4);
        this.px(ctx, ox + 6, y + 8, '#38bdf8', 1, 2);
        this.px(ctx, ox + 9, y + 8, '#38bdf8', 1, 2);
      } else if (charId === 'astronaut') {
        this.px(ctx, ox + 5, y + 7, '#f59e0b', 6, 4);
        this.px(ctx, ox + 6, y + 8, '#fef3c7', 2, 1);
      } else if (charId === 'plague_doctor') {
        // Dark hood + white beak
        this.px(ctx, ox + 5, y + 7, '#18141f', 6, 4);
        this.px(ctx, ox + 6, y + 8, '#fde68a', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#fde68a', 1, 1);
        this.px(ctx, ox + 7, y + 9, '#f8fafc', 4, 2);
        this.px(ctx, ox + 10, y + 10, '#e2e8f0', 2, 1);
      } else if (charId === 'demon') {
        this.px(ctx, ox + 6, y + 8, '#ffe066', 1, 2);
        this.px(ctx, ox + 9, y + 8, '#ffe066', 1, 2);
      } else if (charId === 'zombie') {
        this.px(ctx, ox + 6, y + 8, '#ffffff', 1, 2);
        this.px(ctx, ox + 9, y + 8, '#ef4444', 1, 1);
        this.px(ctx, ox + 8, y + 7, '#1a2e05', 2, 1);
      } else if (charId === 'pirate') {
        this.px(ctx, ox + 6, y + 8, '#100d24', 2, 2);
        this.px(ctx, ox + 9, y + 8, '#100d24', 1, 2);
      } else if (charId === 'ninja') {
        this.px(ctx, ox + 5, y + 7, '#18181f', 6, 4);
        this.px(ctx, ox + 5, y + 8, th.skin, 6, 1);
        this.px(ctx, ox + 6, y + 8, '#100d24', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#100d24', 1, 1);
      } else if (charId === 'knight') {
        this.px(ctx, ox + 5, y + 7, '#94a3b8', 6, 4);
        this.px(ctx, ox + 5, y + 8, '#0b0917', 6, 1);
        this.px(ctx, ox + 6, y + 8, '#38bdf8', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#38bdf8', 1, 1);
      } else if (charId === 'cyberpunk') {
        this.px(ctx, ox + 5, y + 8, '#0b0917', 6, 2);
        this.px(ctx, ox + 5, y + 8, '#22d3ee', 6, 1);
      } else if (charId === 'alien') {
        this.px(ctx, ox + 5, y + 8, '#0b0917', 2, 3);
        this.px(ctx, ox + 9, y + 8, '#0b0917', 2, 3);
      } else if (charId === 'vampire') {
        this.px(ctx, ox + 6, y + 8, '#ef4444', 1, 2);
        this.px(ctx, ox + 9, y + 8, '#ef4444', 1, 2);
      } else if (charId === 'clown') {
        this.px(ctx, ox + 6, y + 8, '#100d24', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#100d24', 1, 1);
        this.px(ctx, ox + 7, y + 9, '#ef4444', 2, 2);
      } else if (charId === 'mummy') {
        this.px(ctx, ox + 5, y + 8, '#100d24', 6, 1);
        this.px(ctx, ox + 6, y + 8, '#fbbf24', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#fbbf24', 1, 1);
        this.px(ctx, ox + 5, y + 10, '#a8a29e', 6, 1);
      } else if (charId === 'diver') {
        this.px(ctx, ox + 5, y + 7, '#b45309', 6, 4);
        this.px(ctx, ox + 6, y + 8, '#67e8f9', 4, 2);
      } else if (charId === 'scarecrow') {
        this.px(ctx, ox + 6, y + 8, '#100d24', 1, 1);
        this.px(ctx, ox + 9, y + 8, '#100d24', 1, 1);
        this.px(ctx, ox + 6, y + 10, '#100d24', 4, 1);
      } else if (charId === 'frog') {
        this.px(ctx, ox + 6, y + 9, '#14532d', 4, 1);
      } else {
        this.px(ctx, ox + 6, y + 8, '#100d24', 1, 2);
        this.px(ctx, ox + 9, y + 8, '#100d24', 1, 2);
      }

      // Wizard long white beard
      if (charId === 'wizard') {
        this.px(ctx, ox + 5, y + 10, '#f8fafc', 6, 4);
        this.px(ctx, ox + 6, y + 14, '#e2e8f0', 4, 2);
      }

      // Body
      this.px(ctx, ox + 3, y + 12, '#100d24', 10, bodyH);
      this.px(ctx, ox + 4, y + 12, th.body, 8, bodyH - 1);
      this.px(ctx, ox + 4, y + 12 + bodyH - 2, th.bodyDk, 8, 1);

      if (charId === 'hitman') {
        // White shirt V & red tie
        this.px(ctx, ox + 7, y + 12, '#f8fafc', 2, 3);
        this.px(ctx, ox + 7, y + 13, '#ef4444', 2, 3);
      } else if (charId === 'skeleton') {
        // Ribcage
        this.px(ctx, ox + 7, y + 12, '#f1f5f9', 2, 4);
        this.px(ctx, ox + 5, y + 13, '#e2e8f0', 6, 1);
        this.px(ctx, ox + 5, y + 15, '#e2e8f0', 6, 1);
      } else if (charId === 'robot') {
        this.px(ctx, ox + 6, y + 13, '#38bdf8', 4, 2);
      } else if (charId === 'toga') {
        // Diagonal gold sash
        this.px(ctx, ox + 5, y + 12, th.trim, 2, 2);
        this.px(ctx, ox + 7, y + 13, th.trim, 2, 2);
        this.px(ctx, ox + 9, y + 14, th.trim, 2, 2);
      } else if (charId === 'aviator') {
        // Fluffy shearling collar
        this.px(ctx, ox + 4, y + 12, th.trim, 8, 2);
      } else if (charId !== 'wizard') {
        this.px(ctx, ox + 5, y + 12, th.trim, 6, 1);
      }

      // Feet
      const footCol = charId === 'skeleton' ? '#e2e8f0' : '#100d24';
      this.px(ctx, ox + 4 + legOffset, y + 12 + bodyH, footCol, 3, 2);
      this.px(ctx, ox + 9 - legOffset, y + 12 + bodyH, footCol, 3, 2);
    };

    drawFrame(0, 0, 0, false, false);
    drawFrame(1, 1, 0, false, false);
    drawFrame(2, 0, -1, false, false);
    drawFrame(3, 1, 1, false, false);
    drawFrame(4, 0, 0, true, false);
    drawFrame(5, 0, 0, false, true);

    tex.refresh();
    for (let i = 0; i < 6; i++) {
      tex.add(i, 0, i * fw, 0, fw, fh);
    }
  }

  private generateEnemySprites(): void {
    const enemies: Array<{
      key: string;
      body: number;
      hi: number;
      eye: string;
      shape: 'slime' | 'moth' | 'mushroom' | 'eye' | 'beetle' | 'armour' | 'doll' | 'void' | 'spider' | 'ghost' | 'construct';
    }> = [
      { key: 'enemy_slimelet', body: 0x7b6cf6, hi: 0xc4b5fd, eye: '#ffffff', shape: 'slime' },
      { key: 'enemy_tiny_moth', body: 0xf49ac1, hi: 0xfde2e4, eye: '#100d24', shape: 'moth' },
      { key: 'enemy_sleepy_mushroom', body: 0xe879f9, hi: 0xf5d0fe, eye: '#100d24', shape: 'mushroom' },
      { key: 'enemy_glimmer_eye', body: 0x8b5cf6, hi: 0xddd6fe, eye: '#6ef3ff', shape: 'eye' },
      { key: 'enemy_crystal_beetle', body: 0x38bdf8, hi: 0xa5f3fc, eye: '#ffe066', shape: 'beetle' },
      { key: 'enemy_wisp_bat', body: 0x6366f1, hi: 0x67e8f9, eye: '#ffe066', shape: 'moth' },
      { key: 'enemy_puffcap', body: 0xd946ef, hi: 0x9ef01a, eye: '#100d24', shape: 'mushroom' },
      { key: 'enemy_spore_spirit', body: 0x34d399, hi: 0xa7f3d0, eye: '#100d24', shape: 'slime' },
      { key: 'enemy_acid_blob', body: 0x84cc16, hi: 0xd9f99d, eye: '#100d24', shape: 'slime' },
      { key: 'enemy_corrupted_flower', body: 0xf43f5e, hi: 0xfda4af, eye: '#ffe066', shape: 'mushroom' },
      { key: 'enemy_haunted_armour', body: 0x94a3b8, hi: 0xe2e8f0, eye: '#ff75c3', shape: 'armour' },
      { key: 'enemy_button_doll', body: 0xfb7185, hi: 0xffd275, eye: '#100d24', shape: 'doll' },
      { key: 'enemy_voidling', body: 0x3b0764, hi: 0xff47b6, eye: '#ffffff', shape: 'void' },
      // Floor 2
      { key: 'enemy_prism_mite', body: 0x22d3ee, hi: 0xe0f2fe, eye: '#100d24', shape: 'beetle' },
      { key: 'enemy_echo_wisp', body: 0x4f46e5, hi: 0x6ef3ff, eye: '#ffffff', shape: 'eye' },
      { key: 'enemy_shard_golem', body: 0x0ea5e9, hi: 0xbae6fd, eye: '#ffe066', shape: 'construct' },
      { key: 'enemy_cave_crawler', body: 0x475569, hi: 0x6ef3ff, eye: '#ffe066', shape: 'spider' },
      // Floor 3
      { key: 'enemy_mycelium_mite', body: 0x10b981, hi: 0xa7f3d0, eye: '#100d24', shape: 'spider' },
      { key: 'enemy_glow_toadstool', body: 0xc026d3, hi: 0x66ffd9, eye: '#100d24', shape: 'mushroom' },
      { key: 'enemy_rot_moth', body: 0x7e22ce, hi: 0x9ef01a, eye: '#ffffff', shape: 'moth' },
      { key: 'enemy_moss_hulk', body: 0x059669, hi: 0x6ee7b7, eye: '#ffe066', shape: 'construct' },
      { key: 'enemy_spore_eye', body: 0x14b8a6, hi: 0x99f6e4, eye: '#9ef01a', shape: 'eye' },
      // Floor 4
      { key: 'enemy_copper_scarab', body: 0xd97706, hi: 0x66ffd9, eye: '#100d24', shape: 'beetle' },
      { key: 'enemy_ooze_ling', body: 0x65a30d, hi: 0xbef264, eye: '#100d24', shape: 'slime' },
      { key: 'enemy_brine_wraith', body: 0x2dd4bf, hi: 0xa6ff4d, eye: '#100d24', shape: 'ghost' },
      { key: 'enemy_brass_sentinel', body: 0xb45309, hi: 0x5eead4, eye: '#a6ff4d', shape: 'construct' },
      // Floor 5
      { key: 'enemy_clockwork_tick', body: 0xf59e0b, hi: 0xfef08a, eye: '#100d24', shape: 'spider' },
      { key: 'enemy_porcelain_mask', body: 0xfda4af, hi: 0xfff1f2, eye: '#100d24', shape: 'ghost' },
      { key: 'enemy_pendulum_knight', body: 0x7c3aed, hi: 0xffd275, eye: '#ffd275', shape: 'armour' },
      { key: 'enemy_velvet_moth', body: 0xe11d48, hi: 0xffd275, eye: '#ffffff', shape: 'moth' },
      { key: 'enemy_gear_golem', body: 0x64748b, hi: 0xfbbf24, eye: '#ffd275', shape: 'construct' },
      // Floor 6
      { key: 'enemy_shadow_mote', body: 0x581c87, hi: 0xff47b6, eye: '#ffffff', shape: 'ghost' },
      { key: 'enemy_night_weaver', body: 0x1e1b4b, hi: 0xf472b6, eye: '#ff47b6', shape: 'spider' },
      { key: 'enemy_abyss_watcher', body: 0x4c1d95, hi: 0xe879f9, eye: '#ff47b6', shape: 'eye' },
      { key: 'enemy_dread_knight', body: 0x312e81, hi: 0xff47b6, eye: '#ff47b6', shape: 'armour' },
      { key: 'enemy_eldritch_spawn', body: 0x090712, hi: 0x7e22ce, eye: '#ff8c1a', shape: 'void' },
    ];

    for (const e of enemies) {
      const { ctx, tex } = this.createCanvas(e.key, 32, 16);
      const b = this.shade(e.body, 1);
      const hi = this.shade(e.hi, 1);

      for (let f = 0; f < 2; f++) {
        const ox = f * 16;
        const dy = f === 1 ? 1 : 0;
        if (e.shape === 'slime') {
          this.px(ctx, ox + 3, 5 + dy, '#100d24', 10, 9 - dy);
          this.px(ctx, ox + 4, 6 + dy, b, 8, 7 - dy);
          this.px(ctx, ox + 5, 6 + dy, hi, 3, 2);
          this.px(ctx, ox + 5, 9 + dy, e.eye, 2, 2);
          this.px(ctx, ox + 9, 9 + dy, e.eye, 2, 2);
        } else if (e.shape === 'moth') {
          const wingY = f === 0 ? 4 : 6;
          this.px(ctx, ox + 1, wingY, '#100d24', 5, 6);
          this.px(ctx, ox + 2, wingY + 1, hi, 3, 4);
          this.px(ctx, ox + 10, wingY, '#100d24', 5, 6);
          this.px(ctx, ox + 11, wingY + 1, hi, 3, 4);
          this.px(ctx, ox + 6, 4 + dy, '#100d24', 4, 8);
          this.px(ctx, ox + 7, 5 + dy, b, 2, 6);
          this.px(ctx, ox + 7, 6 + dy, e.eye, 2, 1);
        } else if (e.shape === 'mushroom') {
          this.px(ctx, ox + 2, 2 + dy, '#100d24', 12, 7);
          this.px(ctx, ox + 3, 3 + dy, b, 10, 5);
          this.px(ctx, ox + 5, 4 + dy, hi, 2, 2);
          this.px(ctx, ox + 10, 4 + dy, hi, 2, 2);
          this.px(ctx, ox + 5, 9 + dy, '#100d24', 6, 5);
          this.px(ctx, ox + 6, 9 + dy, '#f8fafc', 4, 4);
          this.px(ctx, ox + 6, 10 + dy, e.eye, 1, 1);
          this.px(ctx, ox + 9, 10 + dy, e.eye, 1, 1);
        } else if (e.shape === 'eye') {
          this.px(ctx, ox + 3, 3 + dy, '#100d24', 10, 10);
          this.px(ctx, ox + 4, 4 + dy, b, 8, 8);
          this.px(ctx, ox + 5, 5 + dy, '#ffffff', 6, 6);
          this.px(ctx, ox + 7, 7 + dy, e.eye, 2, 2);
        } else if (e.shape === 'beetle') {
          this.px(ctx, ox + 2, 3 + dy, '#100d24', 12, 10);
          this.px(ctx, ox + 3, 4 + dy, b, 10, 8);
          this.px(ctx, ox + 4, 4 + dy, hi, 8, 2);
          this.px(ctx, ox + 5, 9 + dy, e.eye, 2, 2);
          this.px(ctx, ox + 9, 9 + dy, e.eye, 2, 2);
        } else if (e.shape === 'armour') {
          this.px(ctx, ox + 4, 2 + dy, '#100d24', 8, 12);
          this.px(ctx, ox + 5, 3 + dy, b, 6, 10);
          this.px(ctx, ox + 6, 4 + dy, hi, 4, 2);
          this.px(ctx, ox + 6, 6 + dy, e.eye, 1, 1);
          this.px(ctx, ox + 9, 6 + dy, e.eye, 1, 1);
        } else if (e.shape === 'spider') {
          const legY = f === 0 ? 9 : 8;
          this.px(ctx, ox + 1, legY, '#100d24', 3, 2);
          this.px(ctx, ox + 12, legY, '#100d24', 3, 2);
          this.px(ctx, ox + 2, legY + 2, '#100d24', 2, 2);
          this.px(ctx, ox + 12, legY + 2, '#100d24', 2, 2);
          this.px(ctx, ox + 4, 5 + dy, '#100d24', 8, 7);
          this.px(ctx, ox + 5, 6 + dy, b, 6, 5);
          this.px(ctx, ox + 6, 6 + dy, hi, 4, 2);
          this.px(ctx, ox + 6, 9 + dy, e.eye, 1, 1);
          this.px(ctx, ox + 9, 9 + dy, e.eye, 1, 1);
        } else if (e.shape === 'ghost') {
          this.px(ctx, ox + 3, 2 + dy, '#100d24', 10, 11);
          this.px(ctx, ox + 4, 3 + dy, b, 8, 9);
          this.px(ctx, ox + 5, 4 + dy, hi, 6, 3);
          this.px(ctx, ox + 4 + (f === 1 ? 1 : 0), 12 + dy, '#100d24', 2, 2);
          this.px(ctx, ox + 9 - (f === 1 ? 1 : 0), 12 + dy, '#100d24', 2, 2);
          this.px(ctx, ox + 6, 6 + dy, e.eye, 1, 2);
          this.px(ctx, ox + 9, 6 + dy, e.eye, 1, 2);
        } else if (e.shape === 'construct') {
          this.px(ctx, ox + 2, 2 + dy, '#100d24', 12, 12);
          this.px(ctx, ox + 3, 3 + dy, b, 10, 10);
          this.px(ctx, ox + 4, 3 + dy, hi, 8, 2);
          this.px(ctx, ox + 5, 6 + dy, '#100d24', 6, 2);
          this.px(ctx, ox + 6, 6 + dy, e.eye, 1, 1);
          this.px(ctx, ox + 9, 6 + dy, e.eye, 1, 1);
        } else {
          // doll / void
          this.px(ctx, ox + 4, 3 + dy, '#100d24', 8, 11);
          this.px(ctx, ox + 5, 4 + dy, b, 6, 9);
          this.px(ctx, ox + 6, 5 + dy, hi, 4, 2);
          this.px(ctx, ox + 6, 7 + dy, e.eye, 1, 1);
          this.px(ctx, ox + 9, 7 + dy, e.eye, 1, 1);
        }
      }

      tex.refresh();
      tex.add(0, 0, 0, 0, 16, 16);
      tex.add(1, 0, 16, 0, 16, 16);
    }

    // Summoned ally skeleton (2-frame 16x16 spritesheet)
    const { ctx: skCtx, tex: skTex } = this.createCanvas('ally_skeleton', 32, 16);
    for (let f = 0; f < 2; f++) {
      const ox = f * 16;
      const dy = f === 1 ? 1 : 0;
      // Skull
      this.px(skCtx, ox + 5, 2 + dy, '#100d24', 6, 6);
      this.px(skCtx, ox + 6, 3 + dy, '#e2e8f0', 4, 4);
      this.px(skCtx, ox + 6, 4 + dy, '#c084fc', 1, 1);
      this.px(skCtx, ox + 9, 4 + dy, '#c084fc', 1, 1);
      // Ribcage
      this.px(skCtx, ox + 5, 8 + dy, '#100d24', 6, 4);
      this.px(skCtx, ox + 6, 8 + dy, '#cbd5e1', 4, 1);
      this.px(skCtx, ox + 6, 10 + dy, '#cbd5e1', 4, 1);
      // Legs
      this.px(skCtx, ox + 5, 12 + (f === 0 ? 0 : 1), '#e2e8f0', 2, 2);
      this.px(skCtx, ox + 9, 12 + (f === 1 ? 0 : 1), '#e2e8f0', 2, 2);
    }
    skTex.refresh();
    skTex.add(0, 0, 0, 0, 16, 16);
    skTex.add(1, 0, 16, 0, 16, 16);
  }

  private generateBossSprites(): void {
    const bosses: Array<{ key: string; body: number; accent: number; eye: string }> = [
      { key: 'boss_hollow_stag', body: 0x4c1d95, accent: 0xf49ac1, eye: '#ffe066' },
      { key: 'boss_crystal_guardian', body: 0x1e3a8a, accent: 0x6ef3ff, eye: '#ffffff' },
      { key: 'boss_mothercap', body: 0x701a75, accent: 0x66ffd9, eye: '#ffe066' },
      { key: 'boss_sludge_empress', body: 0x365314, accent: 0xa6ff4d, eye: '#ff75c3' },
      { key: 'boss_clockwork_witch', body: 0x4a1d4a, accent: 0xffd275, eye: '#6ef3ff' },
      { key: 'boss_withered_everheart', body: 0x1e0933, accent: 0xff47b6, eye: '#ffffff' },
      { key: 'boss_nyarlathotep', body: 0x07050d, accent: 0xff8c1a, eye: '#ffffff' },
    ];

    for (const boss of bosses) {
      const { ctx, tex } = this.createCanvas(boss.key, 64, 32);
      const b = this.shade(boss.body, 1);
      const a = this.shade(boss.accent, 1);

      for (let f = 0; f < 2; f++) {
        const ox = f * 32;
        const dy = f === 1 ? 1 : 0;

        if (boss.key === 'boss_hollow_stag') {
          // Crown / horns (kept exact for Floor 1 boss)
          this.px(ctx, ox + 6, 2 + dy, '#100d24', 5, 6);
          this.px(ctx, ox + 7, 3 + dy, a, 3, 4);
          this.px(ctx, ox + 21, 2 + dy, '#100d24', 5, 6);
          this.px(ctx, ox + 22, 3 + dy, a, 3, 4);
          // Main silhouette
          this.px(ctx, ox + 6, 6 + dy, '#100d24', 20, 22);
          this.px(ctx, ox + 7, 7 + dy, b, 18, 20);
          this.px(ctx, ox + 10, 9 + dy, a, 12, 4);
          // Glowing eyes
          this.px(ctx, ox + 10, 14 + dy, boss.eye, 3, 3);
          this.px(ctx, ox + 19, 14 + dy, boss.eye, 3, 3);
          // Core rune
          this.px(ctx, ox + 14, 20 + dy, a, 4, 4);
          this.px(ctx, ox + 15, 21 + dy, '#ffffff', 2, 2);
        } else if (boss.key === 'boss_crystal_guardian') {
          // Floating diamond crystal monolith + orbiting shards
          const shardY = f === 0 ? 11 : 15;
          this.px(ctx, ox + 1, shardY, '#100d24', 5, 7);
          this.px(ctx, ox + 2, shardY + 1, a, 3, 5);
          this.px(ctx, ox + 26, 26 - shardY, '#100d24', 5, 7);
          this.px(ctx, ox + 27, 27 - shardY, a, 3, 5);
          // Diamond body
          this.px(ctx, ox + 13, 2 + dy, '#100d24', 6, 4);
          this.px(ctx, ox + 10, 5 + dy, '#100d24', 12, 5);
          this.px(ctx, ox + 7, 9 + dy, '#100d24', 18, 12);
          this.px(ctx, ox + 10, 21 + dy, '#100d24', 12, 5);
          this.px(ctx, ox + 13, 26 + dy, '#100d24', 6, 4);
          this.px(ctx, ox + 14, 3 + dy, a, 4, 3);
          this.px(ctx, ox + 11, 6 + dy, b, 10, 4);
          this.px(ctx, ox + 8, 10 + dy, b, 16, 10);
          this.px(ctx, ox + 11, 20 + dy, b, 10, 5);
          this.px(ctx, ox + 14, 25 + dy, a, 4, 3);
          // Visor & prism core
          this.px(ctx, ox + 10, 12 + dy, '#100d24', 12, 3);
          this.px(ctx, ox + 11, 13 + dy, boss.eye, 10, 1);
          this.px(ctx, ox + 13, 17 + dy, a, 6, 4);
          this.px(ctx, ox + 15, 18 + dy, '#ffffff', 2, 2);
        } else if (boss.key === 'boss_mothercap') {
          // Wide spotted fungal cap + thick stalk
          this.px(ctx, ox + 4, 3 + dy, '#100d24', 24, 5);
          this.px(ctx, ox + 2, 7 + dy, '#100d24', 28, 10);
          this.px(ctx, ox + 5, 4 + dy, b, 22, 4);
          this.px(ctx, ox + 3, 8 + dy, b, 26, 8);
          // Glowing spots on cap
          this.px(ctx, ox + 6, 6 + dy, a, 4, 3);
          this.px(ctx, ox + 14, 5 + dy, a, 5, 3);
          this.px(ctx, ox + 22, 7 + dy, a, 4, 3);
          this.px(ctx, ox + 9, 12 + dy, a, 3, 3);
          this.px(ctx, ox + 19, 12 + dy, a, 3, 3);
          // Stalk & eyes
          this.px(ctx, ox + 9, 17 + dy, '#100d24', 14, 12);
          this.px(ctx, ox + 10, 17 + dy, '#e2e8f0', 12, 11);
          this.px(ctx, ox + 11, 17 + dy, a, 10, 2);
          this.px(ctx, ox + 11, 21 + dy, '#100d24', 3, 3);
          this.px(ctx, ox + 18, 21 + dy, '#100d24', 3, 3);
          this.px(ctx, ox + 12, 22 + dy, boss.eye, 2, 2);
          this.px(ctx, ox + 19, 22 + dy, boss.eye, 2, 2);
        } else if (boss.key === 'boss_sludge_empress') {
          // Crowned bubbling slime empress
          this.px(ctx, ox + 10, 2 + dy, '#100d24', 12, 6);
          this.px(ctx, ox + 11, 3 + dy, '#ffd275', 2, 4);
          this.px(ctx, ox + 15, 2 + dy, '#ffd275', 2, 5);
          this.px(ctx, ox + 19, 3 + dy, '#ffd275', 2, 4);
          // Wide gelatinous body
          this.px(ctx, ox + 4, 8 + dy, '#100d24', 24, 20);
          this.px(ctx, ox + 2, 14 + dy, '#100d24', 28, 14);
          this.px(ctx, ox + 5, 9 + dy, b, 22, 18);
          this.px(ctx, ox + 3, 15 + dy, b, 26, 12);
          // Acid highlights & bubbles
          this.px(ctx, ox + 7, 11 + dy, a, 6, 3);
          this.px(ctx, ox + 20, 20 + dy, a, 4, 4);
          this.px(ctx, ox + 6, 22 + dy, a, 3, 3);
          // Fierce eyes
          this.px(ctx, ox + 10, 15 + dy, boss.eye, 3, 3);
          this.px(ctx, ox + 19, 15 + dy, boss.eye, 3, 3);
        } else if (boss.key === 'boss_clockwork_witch') {
          // Floating gears on left & right
          const gOff = f === 0 ? 0 : 2;
          this.px(ctx, ox + 1, 13 + gOff, '#100d24', 6, 6);
          this.px(ctx, ox + 2, 14 + gOff, a, 4, 4);
          this.px(ctx, ox + 25, 15 - gOff, '#100d24', 6, 6);
          this.px(ctx, ox + 26, 16 - gOff, a, 4, 4);
          // Pointed witch hat
          this.px(ctx, ox + 14, 1 + dy, '#100d24', 4, 4);
          this.px(ctx, ox + 11, 5 + dy, '#100d24', 10, 5);
          this.px(ctx, ox + 6, 10 + dy, '#100d24', 20, 4);
          this.px(ctx, ox + 14, 2 + dy, b, 3, 3);
          this.px(ctx, ox + 12, 6 + dy, b, 8, 4);
          this.px(ctx, ox + 7, 11 + dy, a, 18, 2);
          // Cloak & face
          this.px(ctx, ox + 8, 14 + dy, '#100d24', 16, 15);
          this.px(ctx, ox + 9, 14 + dy, b, 14, 14);
          this.px(ctx, ox + 11, 15 + dy, '#100d24', 10, 5);
          this.px(ctx, ox + 12, 17 + dy, boss.eye, 2, 2);
          this.px(ctx, ox + 18, 17 + dy, boss.eye, 2, 2);
          // Timepiece core
          this.px(ctx, ox + 14, 22 + dy, a, 4, 4);
          this.px(ctx, ox + 15, 23 + dy, '#100d24', 2, 2);
        } else if (boss.key === 'boss_nyarlathotep') {
          // Towering, broad-shouldered shadowy primordial horror with horned cowl & slit eyes
          const tOff = f === 0 ? 0 : 1;
          // Jagged sweeping horns & gaunt head
          this.px(ctx, ox + 10, 1 + dy, '#4c1d95', 2, 5);
          this.px(ctx, ox + 20, 1 + dy, '#4c1d95', 2, 5);
          this.px(ctx, ox + 12, 3 + dy, '#3b0764', 8, 8);
          this.px(ctx, ox + 13, 4 + dy, '#05030a', 6, 7);
          // Piercing slit eyes on head
          this.px(ctx, ox + 14, 6 + dy, '#ffe066', 1, 2);
          this.px(ctx, ox + 17, 6 + dy, '#ffe066', 1, 2);
          this.px(ctx, ox + 15, 8 + dy, '#ff6b1a', 2, 1);
          // Broad hunched shoulders & gaunt torso tapering into shadow shroud
          this.px(ctx, ox + 5, 10 + dy, '#3b0764', 22, 6);
          this.px(ctx, ox + 6, 11 + dy, '#05030a', 20, 5);
          this.px(ctx, ox + 9, 16 + dy, '#05030a', 14, 8);
          this.px(ctx, ox + 11, 24 + dy, '#05030a', 10, 6);
          // Long gaunt shadowy arms + tentacles
          this.px(ctx, ox + 2, 11 + tOff, '#05030a', 4, 12);
          this.px(ctx, ox + 1, 21 + tOff, '#4c1d95', 3, 4);
          this.px(ctx, ox + 26, 11 - tOff, '#05030a', 4, 12);
          this.px(ctx, ox + 28, 21 - tOff, '#4c1d95', 3, 4);
          this.px(ctx, ox + 6, 23 - tOff, '#3b0764', 3, 7);
          this.px(ctx, ox + 23, 23 + tOff, '#3b0764', 3, 7);
          // Glowing orange heart in gaunt chest
          this.px(ctx, ox + 14, 14 + dy, '#ff6b1a', 4, 5);
          this.px(ctx, ox + 15, 15 + dy, '#ffe066', 2, 3);
        } else {
          // boss_withered_everheart: thorny fractured heart with 3 void eyes
          this.px(ctx, ox + 3, 4 + dy, '#100d24', 11, 10);
          this.px(ctx, ox + 18, 4 + dy, '#100d24', 11, 10);
          this.px(ctx, ox + 5, 12 + dy, '#100d24', 22, 9);
          this.px(ctx, ox + 9, 20 + dy, '#100d24', 14, 6);
          this.px(ctx, ox + 13, 25 + dy, '#100d24', 6, 5);
          // Heart lobes & body
          this.px(ctx, ox + 4, 5 + dy, b, 9, 8);
          this.px(ctx, ox + 19, 5 + dy, b, 9, 8);
          this.px(ctx, ox + 6, 12 + dy, b, 20, 8);
          this.px(ctx, ox + 10, 20 + dy, b, 12, 5);
          this.px(ctx, ox + 14, 25 + dy, b, 4, 3);
          // Thorns
          this.px(ctx, ox + 1, 9 + dy, a, 3, 2);
          this.px(ctx, ox + 28, 9 + dy, a, 3, 2);
          // Three glowing void eyes + pulsing core
          this.px(ctx, ox + 9, 10 + dy, boss.eye, 2, 3);
          this.px(ctx, ox + 21, 10 + dy, boss.eye, 2, 3);
          this.px(ctx, ox + 15, 7 + dy, a, 2, 3);
          this.px(ctx, ox + 13, 16 + dy, a, 6, 5);
          this.px(ctx, ox + 15, 17 + dy, '#ffffff', 2, 3);
        }
      }

      tex.refresh();
      tex.add(0, 0, 0, 0, 32, 32);
      tex.add(1, 0, 32, 0, 32, 32);
    }
  }
}
