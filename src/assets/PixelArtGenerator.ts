import Phaser from 'phaser';
import { PLAYER_PALETTES } from '../data/palettes';
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
  }

  private generateBossSprites(): void {
    const bosses: Array<{ key: string; body: number; accent: number; eye: string }> = [
      { key: 'boss_hollow_stag', body: 0x4c1d95, accent: 0xf49ac1, eye: '#ffe066' },
      { key: 'boss_crystal_guardian', body: 0x1e3a8a, accent: 0x6ef3ff, eye: '#ffffff' },
      { key: 'boss_mothercap', body: 0x701a75, accent: 0x66ffd9, eye: '#ffe066' },
      { key: 'boss_sludge_empress', body: 0x365314, accent: 0xa6ff4d, eye: '#ff75c3' },
      { key: 'boss_clockwork_witch', body: 0x4a1d4a, accent: 0xffd275, eye: '#6ef3ff' },
      { key: 'boss_withered_everheart', body: 0x1e0933, accent: 0xff47b6, eye: '#ffffff' },
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
