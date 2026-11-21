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
    <div class="mc-columns">
      <div class="mc-col mc-col-left">
        <div class="mc-btn-row mc-left-util">
          <button class="mc-btn mc-btn-circle mc-btn-util" data-btn="esc" aria-label="Pause or Back" title="Pause / Back">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/>
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-util" data-btn="prevSlot" aria-label="Previous Item" title="Previous Item">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <polygon points="15,5 7,12 15,19" fill="currentColor"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-util" data-btn="nextSlot" aria-label="Next Item" title="Next Item">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <polygon points="9,5 17,12 9,19" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <div class="mc-stick-wrap">
          <div class="mc-stick-base" id="mc-stick-base">
            <div class="mc-stick-cross"></div>
            <div class="mc-stick-knob" id="mc-stick-knob"></div>
          </div>
          <div class="mc-pad-label">MOVE / NAV</div>
        </div>
      </div>

      <div class="mc-col mc-col-right">
        <div class="mc-btn-row mc-right-actions">
          <button class="mc-btn mc-btn-circle mc-btn-act" data-btn="e" aria-label="Interact or Select" title="Interact / Select">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M12 3l2.2 5.3L19.5 10l-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-1.7z" fill="currentColor"/>
              <circle cx="18" cy="18" r="2" fill="#66ffd9"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-act" data-btn="space" aria-label="Dodge Dash" title="Dodge">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M4 8h8M3 12h11M5 16h7" stroke="#66ffd9" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M14 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-act" data-btn="tab" aria-label="Toggle Map" title="Map">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <polygon points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <line x1="9" y1="4" x2="9" y2="18" stroke="currentColor" stroke-width="1.8"/>
              <line x1="15" y1="6" x2="15" y2="20" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
          <button class="mc-btn mc-btn-circle mc-btn-act" data-btn="q" aria-label="Drop Item" title="Drop Item">
            <svg viewBox="0 0 24 24" class="mc-icon" aria-hidden="true">
              <path d="M12 4c1.2-1.2 2.8-1.4 3.5-1-.2 1.2-1.2 2.1-2.5 2.2" fill="none" stroke="#66ffd9" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M12 6.5c-2.8 0-4.8 1.9-4.8 4.6 0 2.7 1.9 5.2 4.8 5.2s4.8-2.5 4.8-5.2c0-2.7-2-4.6-4.8-4.6z" fill="#f49ac1" stroke="currentColor" stroke-width="1.4"/>
              <path d="M12 17v4m0 0l-2.5-2.2M12 21l2.5-2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

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
      </div>
    </div>
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
