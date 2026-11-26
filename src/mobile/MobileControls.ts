import { mobileInput, NavDir, VirtualButton } from './MobileInput';

const DIRS_8: Array<{ dx: number; dy: number; nav: NavDir; label: string }> = [
  { dx: 1, dy: 0, nav: 'right', label: 'E' },
  { dx: 1, dy: 1, nav: 'down', label: 'SE' },
  { dx: 0, dy: 1, nav: 'down', label: 'S' },
  { dx: -1, dy: 1, nav: 'down', label: 'SW' },
  { dx: -1, dy: 0, nav: 'left', label: 'W' },
  { dx: -1, dy: -1, nav: 'up', label: 'NW' },
  { dx: 0, dy: -1, nav: 'up', label: 'N' },
  { dx: 1, dy: -1, nav: 'up', label: 'NE' },
];

export function initMobileControls(root: HTMLElement): void {
  root.innerHTML = `
    <div class="mc-columns" id="mc-columns">
      <div class="mc-col mc-col-left">
        <div class="mc-stick-wrap">
          <div class="mc-stick-base" id="mc-stick-base">
            <div class="mc-stick-cross"></div>
            <div class="mc-stick-knob" id="mc-stick-knob"></div>
          </div>
          <div class="mc-pad-label">MOVE / NAV</div>
        </div>

        <div class="mc-btn-row mc-left-util">
          <button class="mc-btn mc-btn-circle mc-btn-act mc-hidden" data-btn="tab" aria-label="Toggle Map" title="Map">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <polygon points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <line x1="9" y1="4" x2="9" y2="18" stroke="currentColor" stroke-width="1.8"/>
              <line x1="15" y1="6" x2="15" y2="20" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-util" data-btn="esc" aria-label="Pause or Back" title="Pause / Back">
            <svg viewBox="0 0 24 24" class="mc-icon mc-hidden" id="mc-icon-pause" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/>
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>
            </svg>
            <svg viewBox="0 0 24 24" class="mc-icon" id="mc-icon-back" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="9" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="mc-col mc-col-right">
        <div class="mc-dpad-wrap">
          <div class="mc-dpad" id="mc-dpad">
            <svg viewBox="0 0 160 160" class="mc-dpad-svg" aria-label="8-way attack D-pad">
              <polygon points="48,4 112,4 156,48 156,112 112,156 48,156 4,112 4,48" fill="#171230" stroke="#6c5bb3" stroke-width="3"/>
              <g id="mc-dpad-wedges">
                ${buildOctagonWedgesSvg()}
              </g>
              <polygon points="66,54 94,54 106,66 106,94 94,106 66,106 54,94 54,66" fill="#100d24" stroke="#4a3b7d" stroke-width="2"/>
              <circle cx="80" cy="80" r="6" fill="#f49ac1" opacity="0.65"/>
            </svg>
          </div>
          <div class="mc-pad-label">8-WAY AIM / ATK</div>
        </div>

        <div class="mc-btn-row mc-right-actions">
          <button class="mc-btn mc-btn-circle mc-btn-act mc-hidden" data-btn="space" aria-label="Dodge Dash" title="Dodge">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M4 8h8M3 12h11M5 16h7" stroke="#66ffd9" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M14 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-act" data-btn="e" aria-label="Interact or Select" title="Interact / Select">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M12 3l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7z" fill="currentColor"/>
              <circle cx="18" cy="18" r="2" fill="#66ffd9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="mc-bottom-hud">
      <div class="mc-stats-bar mc-hidden" id="mc-stats-bar">
        <div class="mc-stats-group">
          <div class="mc-hearts" id="mc-hearts"></div>
          <div class="mc-hearts" id="mc-shields"></div>
        </div>
        <div class="mc-stats-group">
          <div class="mc-hearts" id="mc-stamina"></div>
          <div class="mc-stats-group">
            <svg viewBox="0 0 12 12" width="16" height="16" class="mc-shard-svg" aria-hidden="true">
              <polygon points="6,1 10,5 8,11 4,11 2,5" fill="#6ef3ff" stroke="#100d24" stroke-width="1"/>
            </svg>
            <span class="mc-shard-count" id="mc-shard-count">0</span>
          </div>
          <div class="mc-statuses" id="mc-statuses"></div>
        </div>
      </div>

      <div class="mc-inv-bar mc-hidden" id="mc-inv-bar">
        <div class="mc-inv-info">
          <div class="mc-inv-name" id="mc-inv-name">Empty Hand</div>
          <div class="mc-inv-desc" id="mc-inv-desc"></div>
        </div>
        <div class="mc-inv-row">
          <div></div>
          <div class="mc-inv-slots">
            ${[0, 1, 2]
              .map(
                (i) => `
              <button class="mc-inv-slot" data-slot="${i}" aria-label="Inventory Slot ${i + 1}">
                <img class="mc-inv-icon mc-hidden" alt="" />
                <div class="mc-inv-use-bg mc-hidden"><div class="mc-inv-use-fill"></div></div>
              </button>
            `
              )
              .join('')}
          </div>
          <button class="mc-btn mc-btn-circle mc-btn-act mc-inv-drop mc-hidden" data-btn="q" aria-label="Drop Item" title="Drop Item">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M12 4c1.2-1.2 2.8-1.4 3.5-1-.2 1.2-1.2 2.1-2.5 2.2" fill="none" stroke="#66ffd9" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M12 6.5c-2.8 0-4.8 1.9-4.8 4.6 0 2.7 1.9 5.2 4.8 5.2s4.8-2.5 4.8-5.2c0-2.7-2-4.6-4.8-4.6z" fill="#f49ac1" stroke="currentColor" stroke-width="1.4"/>
              <path d="M12 17v4m0 0l-2.5-2.2M12 21l2.5-2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="mc-keyboard mc-hidden" id="mc-keyboard"></div>
  `;

  // Wire action buttons
  root.querySelectorAll<HTMLButtonElement>('[data-btn]').forEach((btnEl) => {
    const btnName = btnEl.dataset.btn as VirtualButton;
    const press = (ev: PointerEvent) => {
      ev.preventDefault();
      btnEl.classList.add('active');
      mobileInput.emitButton(btnName);
    };
    const release = (ev: PointerEvent) => {
      ev.preventDefault();
      btnEl.classList.remove('active');
    };
    btnEl.addEventListener('pointerdown', press);
    btnEl.addEventListener('pointerup', release);
    btnEl.addEventListener('pointercancel', release);
    btnEl.addEventListener('pointerleave', release);
  });

  // Wire inventory slot taps
  const slotEls = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-slot]'));
  slotEls.forEach((slotEl) => {
    const idx = Number(slotEl.dataset.slot);
    slotEl.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      mobileInput.selectSlot(idx);
    });
  });

  const mapBtn = root.querySelector<HTMLButtonElement>('[data-btn="tab"]');
  const dropBtn = root.querySelector<HTMLButtonElement>('[data-btn="q"]');
  const dodgeBtn = root.querySelector<HTMLButtonElement>('[data-btn="space"]');
  const pauseIcon = root.querySelector<SVGElement>('#mc-icon-pause');
  const backIcon = root.querySelector<SVGElement>('#mc-icon-back');
  const statsBar = root.querySelector<HTMLElement>('#mc-stats-bar');
  const heartsEl = root.querySelector<HTMLElement>('#mc-hearts');
  const shieldsEl = root.querySelector<HTMLElement>('#mc-shields');
  const staminaEl = root.querySelector<HTMLElement>('#mc-stamina');
  const shardCountEl = root.querySelector<HTMLElement>('#mc-shard-count');
  const statusesEl = root.querySelector<HTMLElement>('#mc-statuses');
  const invBar = root.querySelector<HTMLElement>('#mc-inv-bar');
  const invNameEl = root.querySelector<HTMLElement>('#mc-inv-name');
  const invDescEl = root.querySelector<HTMLElement>('#mc-inv-desc');

  const rarityColorMap: Record<string, string> = {
    common: '#ffffff',
    uncommon: '#66ffd9',
    rare: '#6ef3ff',
    super_rare: '#f49ac1',
    secret: '#ff47b6',
  };

  mobileInput.onHudChange((state) => {
    const inGame = state.inGame;
    const activeItem = state.inventory[state.activeSlot] ?? null;

    mapBtn?.classList.toggle('mc-hidden', !inGame);
    dodgeBtn?.classList.toggle('mc-hidden', !inGame);
    dropBtn?.classList.toggle('mc-hidden', !inGame || !activeItem);
    pauseIcon?.classList.toggle('mc-hidden', !inGame);
    backIcon?.classList.toggle('mc-hidden', inGame);
    statsBar?.classList.toggle('mc-hidden', !inGame);
    invBar?.classList.toggle('mc-hidden', !inGame);

    if (!inGame) return;

    if (heartsEl) {
      const numHearts = Math.min(10, Math.ceil(state.maxHp / 2));
      let html = '';
      for (let i = 0; i < numHearts; i++) {
        const rem = state.hp - i * 2;
        if (rem >= 2) {
          html += '<svg viewBox="0 0 12 12" width="13" height="13" class="mc-heart-svg"><path d="M6 10.5L1.5 6.2C0.5 5.2 0.5 3.3 1.7 2.3 2.8 1.4 4.5 1.7 6 3.2 7.5 1.7 9.2 1.4 10.3 2.3 11.5 3.3 11.5 5.2 10.5 6.2Z" fill="#ff5d8f" stroke="#100d24" stroke-width="1"/></svg>';
        } else if (rem === 1) {
          html += '<svg viewBox="0 0 12 12" width="13" height="13" class="mc-heart-svg"><path d="M6 10.5L1.5 6.2C0.5 5.2 0.5 3.3 1.7 2.3 2.8 1.4 4.5 1.7 6 3.2 7.5 1.7 9.2 1.4 10.3 2.3 11.5 3.3 11.5 5.2 10.5 6.2Z" fill="#2b2447" stroke="#100d24" stroke-width="1"/><path d="M6 10.5L1.5 6.2C0.5 5.2 0.5 3.3 1.7 2.3 2.8 1.4 4.5 1.7 6 3.2Z" fill="#ff5d8f"/></svg>';
        } else {
          html += '<svg viewBox="0 0 12 12" width="13" height="13" class="mc-heart-svg"><path d="M6 10.5L1.5 6.2C0.5 5.2 0.5 3.3 1.7 2.3 2.8 1.4 4.5 1.7 6 3.2 7.5 1.7 9.2 1.4 10.3 2.3 11.5 3.3 11.5 5.2 10.5 6.2Z" fill="#2b2447" stroke="#100d24" stroke-width="1"/></svg>';
        }
      }
      heartsEl.innerHTML = html;
    }

    if (shieldsEl) {
      const shieldCount = Math.min(6, Math.max(0, state.shield));
      let html = '';
      for (let i = 0; i < shieldCount; i++) {
        html += '<svg viewBox="0 0 12 12" width="13" height="13" class="mc-heart-svg"><path d="M2 2h8v4c0 2.8-4 5-4 5S2 8.8 2 6V2z" fill="#6ef3ff" stroke="#100d24" stroke-width="1"/></svg>';
      }
      shieldsEl.innerHTML = html;
    }

    if (staminaEl) {
      const fullStam = Math.floor(state.stamina);
      const maxStam = Math.max(1, Math.min(6, Math.round(state.maxStamina)));
      let html = '';
      for (let i = 0; i < maxStam; i++) {
        const fill = i < fullStam ? '#ffe066' : '#2b2447';
        html += `<svg viewBox="0 0 12 12" width="13" height="13" class="mc-stam-svg"><polygon points="7,1 3,7 6,7 5,11 9,5 6,5" fill="${fill}" stroke="#100d24" stroke-width="0.9"/></svg>`;
      }
      staminaEl.innerHTML = html;
    }

    if (shardCountEl) {
      shardCountEl.textContent = String(state.shards);
    }

    if (statusesEl) {
      statusesEl.innerHTML = state.statusEffects
        .slice(0, 4)
        .map((eff) => {
          const hex = `#${eff.color.toString(16).padStart(6, '0')}`;
          return `<span class="mc-status-pip" style="background:${hex}" title="${eff.id}"></span>`;
        })
        .join('');
    }

    slotEls.forEach((slotEl, i) => {
      slotEl.classList.toggle('active', state.activeSlot === i);
      const item = state.inventory[i];
      const img = slotEl.querySelector<HTMLImageElement>('.mc-inv-icon');
      const barBg = slotEl.querySelector<HTMLElement>('.mc-inv-use-bg');
      const barFill = slotEl.querySelector<HTMLElement>('.mc-inv-use-fill');
      if (item && item.iconDataUrl) {
        if (img) {
          if (img.src !== item.iconDataUrl) img.src = item.iconDataUrl;
          img.classList.remove('mc-hidden');
        }
        if (barBg && barFill) {
          const pct = Math.max(0, Math.min(1, item.uses / Math.max(1, item.maxUses)));
          barBg.classList.remove('mc-hidden');
          barFill.style.width = `${Math.round(pct * 100)}%`;
          barFill.style.background = pct > 0.35 ? '#66ffd9' : '#ff5d8f';
        }
      } else {
        img?.classList.add('mc-hidden');
        barBg?.classList.add('mc-hidden');
      }
    });

    if (invNameEl && invDescEl) {
      if (activeItem) {
        invNameEl.textContent = `${activeItem.name} (${activeItem.uses}/${activeItem.maxUses})`;
        invNameEl.style.color = rarityColorMap[activeItem.rarity] ?? '#ffffff';
        invDescEl.textContent = activeItem.description;
      } else {
        invNameEl.textContent = 'Empty Hand';
        invNameEl.style.color = '#ffffff';
        invDescEl.textContent = '';
      }
    }
  });

  setupJoystick(
    root.querySelector<HTMLElement>('#mc-stick-base')!,
    root.querySelector<HTMLElement>('#mc-stick-knob')!
  );
  setupOctagonDpad(root.querySelector<HTMLElement>('#mc-dpad')!);
}

function buildOctagonWedgesSvg(): string {
  // 8 wedges centered at (80, 80), outer radius ~74, inner radius ~28
  // Angles for the 8 directions: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
  const cx = 80;
  const cy = 80;
  const rOut = 73;
  const rIn = 27;
  const labels = ['▶', '◢', '▼', '◣', '◀', '◤', '▲', '◥'];

  return DIRS_8.map((_, idx) => {
    const a1 = ((idx * 45 - 22.5) * Math.PI) / 180;
    const a2 = ((idx * 45 + 22.5) * Math.PI) / 180;
    const x1 = (cx + Math.cos(a1) * rIn).toFixed(1);
    const y1 = (cy + Math.sin(a1) * rIn).toFixed(1);
    const x2 = (cx + Math.cos(a1) * rOut).toFixed(1);
    const y2 = (cy + Math.sin(a1) * rOut).toFixed(1);
    const x3 = (cx + Math.cos(a2) * rOut).toFixed(1);
    const y3 = (cy + Math.sin(a2) * rOut).toFixed(1);
    const x4 = (cx + Math.cos(a2) * rIn).toFixed(1);
    const y4 = (cy + Math.sin(a2) * rIn).toFixed(1);

    const aMid = (idx * 45 * Math.PI) / 180;
    const lx = (cx + Math.cos(aMid) * 53).toFixed(1);
    const ly = (cy + Math.sin(aMid) * 53 + 4).toFixed(1);

    return `
      <g class="mc-wedge" data-wedge="${idx}">
        <polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}" fill="#241c47" stroke="#4a3b7d" stroke-width="1.5"/>
        <text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" fill="#b8a1ff" font-family="monospace" pointer-events="none">${labels[idx]}</text>
      </g>
    `;
  }).join('');
}

function setupJoystick(base: HTMLElement, knob: HTMLElement): void {
  let activePointerId: number | null = null;
  let lastNavDir: NavDir | null = null;
  let repeatTimeout: number | undefined;
  let repeatInterval: number | undefined;

  const clearNavRepeat = () => {
    if (repeatTimeout !== undefined) window.clearTimeout(repeatTimeout);
    if (repeatInterval !== undefined) window.clearInterval(repeatInterval);
    repeatTimeout = undefined;
    repeatInterval = undefined;
    lastNavDir = null;
  };

  const triggerNavRepeat = (dir: NavDir | null) => {
    if (dir === lastNavDir) return;
    clearNavRepeat();
    if (!dir) return;
    lastNavDir = dir;
    mobileInput.emitNav(dir);
    repeatTimeout = window.setTimeout(() => {
      repeatInterval = window.setInterval(() => {
        if (lastNavDir) mobileInput.emitNav(lastNavDir);
      }, 170);
    }, 320);
  };

  const updateFromPointer = (ev: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxDist = rect.width * 0.36;

    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxDist && dist > 0) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const normDist = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;
    if (normDist < 0.2) {
      mobileInput.setMove(0, 0);
      triggerNavRepeat(null);
      return;
    }

    const nx = dx / maxDist;
    const ny = dy / maxDist;
    mobileInput.setMove(nx, ny);

    const navDir: NavDir =
      Math.abs(nx) >= Math.abs(ny) ? (nx < 0 ? 'left' : 'right') : ny < 0 ? 'up' : 'down';
    triggerNavRepeat(navDir);
  };

  base.addEventListener('pointerdown', (ev: PointerEvent) => {
    ev.preventDefault();
    if (activePointerId !== null) return;
    activePointerId = ev.pointerId;
    base.setPointerCapture(ev.pointerId);
    knob.classList.add('active');
    updateFromPointer(ev);
  });

  base.addEventListener('pointermove', (ev: PointerEvent) => {
    if (ev.pointerId !== activePointerId) return;
    ev.preventDefault();
    updateFromPointer(ev);
  });

  const endStick = (ev: PointerEvent) => {
    if (ev.pointerId !== activePointerId) return;
    ev.preventDefault();
    activePointerId = null;
    knob.classList.remove('active');
    knob.style.transform = 'translate(0px, 0px)';
    mobileInput.setMove(0, 0);
    triggerNavRepeat(null);
  };

  base.addEventListener('pointerup', endStick);
  base.addEventListener('pointercancel', endStick);
}

function setupOctagonDpad(dpad: HTMLElement): void {
  let activePointerId: number | null = null;
  let lastWedgeIdx = -1;
  let lastNavDir: NavDir | null = null;
  let repeatTimeout: number | undefined;
  let repeatInterval: number | undefined;

  const wedges = Array.from(dpad.querySelectorAll<SVGGElement>('.mc-wedge'));

  const highlightWedge = (idx: number) => {
    wedges.forEach((w, i) => {
      const poly = w.querySelector('polygon');
      if (!poly) return;
      if (i === idx) {
        poly.setAttribute('fill', '#6c5bb3');
        poly.setAttribute('stroke', '#ffe066');
      } else {
        poly.setAttribute('fill', '#241c47');
        poly.setAttribute('stroke', '#4a3b7d');
      }
    });
  };

  const clearNavRepeat = () => {
    if (repeatTimeout !== undefined) window.clearTimeout(repeatTimeout);
    if (repeatInterval !== undefined) window.clearInterval(repeatInterval);
    repeatTimeout = undefined;
    repeatInterval = undefined;
    lastNavDir = null;
  };

  const triggerNavRepeat = (dir: NavDir | null) => {
    if (dir === lastNavDir) return;
    clearNavRepeat();
    if (!dir) return;
    lastNavDir = dir;
    mobileInput.emitNav(dir);
    repeatTimeout = window.setTimeout(() => {
      repeatInterval = window.setInterval(() => {
        if (lastNavDir) mobileInput.emitNav(lastNavDir);
      }, 170);
    }, 320);
  };

  const updateFromPointer = (ev: PointerEvent) => {
    const rect = dpad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = ev.clientX - cx;
    const dy = ev.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < rect.width * 0.1) {
      lastWedgeIdx = -1;
      highlightWedge(-1);
      mobileInput.setDpad(false, 0, 0);
      triggerNavRepeat(null);
      return;
    }

    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const idx = Math.floor(((deg + 22.5) % 360) / 45);
    const dir = DIRS_8[idx];

    if (idx !== lastWedgeIdx) {
      lastWedgeIdx = idx;
      highlightWedge(idx);
    }

    mobileInput.setDpad(true, dir.dx, dir.dy);
    triggerNavRepeat(dir.nav);
  };

  dpad.addEventListener('pointerdown', (ev: PointerEvent) => {
    ev.preventDefault();
    if (activePointerId !== null) return;
    activePointerId = ev.pointerId;
    dpad.setPointerCapture(ev.pointerId);
    updateFromPointer(ev);
  });

  dpad.addEventListener('pointermove', (ev: PointerEvent) => {
    if (ev.pointerId !== activePointerId) return;
    ev.preventDefault();
    updateFromPointer(ev);
  });

  const endDpad = (ev: PointerEvent) => {
    if (ev.pointerId !== activePointerId) return;
    ev.preventDefault();
    activePointerId = null;
    lastWedgeIdx = -1;
    highlightWedge(-1);
    mobileInput.setDpad(false, 0, 0);
    triggerNavRepeat(null);
  };

  dpad.addEventListener('pointerup', endDpad);
  dpad.addEventListener('pointercancel', endDpad);
}
