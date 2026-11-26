import { initMobileControls } from './MobileControls';

const MOBILE_STYLE_ID = 'glimmerdeep-mobile-style';

const MOBILE_CSS = `
  * {
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }

  html,
  body {
    width: 100%;
    height: 100%;
    background-color: #0b0917;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
  }

  #mobile-shell {
    width: 100vw;
    height: 100dvh;
    max-width: calc(100dvh * 2 / 3);
    display: flex;
    flex-direction: column;
    background: #0e0c21;
    border-left: 2px solid #2b2447;
    border-right: 2px solid #2b2447;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  #game-container {
    width: 100% !important;
    height: 50% !important;
    flex: 1 1 50%;
    background: #000000;
    border-bottom: 2px solid #4a3b7d;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
  }

  #game-container canvas {
    image-rendering: pixelated !important;
    image-rendering: crisp-edges !important;
  }

  #mobile-controls {
    flex: 1 1 50%;
    height: 50%;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 8px 6px;
    background: linear-gradient(180deg, #120f29 0%, #0b0917 100%);
    min-height: 0;
    gap: 4px;
    overflow: hidden;
  }

  .mc-columns {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .mc-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .mc-col-left {
    align-items: center;
  }

  .mc-col-right {
    align-items: center;
  }

  .mc-btn-row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    min-height: clamp(34px, 9.5vw, 44px);
  }

  .mc-btn.mc-hidden {
    display: none;
  }

  .mc-btn {
    background: #241c47;
    color: #ffffff;
    border: 2px solid #6c5bb3;
    box-shadow: inset 0 -2px 0 #100d24, 0 2px 6px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .mc-btn-circle {
    border-radius: 50%;
    width: clamp(34px, 9.5vw, 44px);
    height: clamp(34px, 9.5vw, 44px);
  }

  .mc-btn-util {
    color: #b8a1ff;
  }

  .mc-btn-act {
    color: #ffe066;
    border-color: #8a75d6;
  }

  .mc-icon {
    width: 56%;
    height: 56%;
    display: block;
    pointer-events: none;
  }

  .mc-icon.mc-hidden {
    display: none;
  }

  .mc-btn.active {
    background: #6c5bb3;
    border-color: #ffe066;
    color: #ffffff;
    transform: translateY(1px) scale(0.96);
  }

  .mc-stick-wrap,
  .mc-dpad-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .mc-pad-label {
    font-size: 10px;
    color: #7e71b8;
    letter-spacing: 0.8px;
  }

  .mc-stick-base {
    position: relative;
    width: min(33vw, 130px);
    height: min(33vw, 130px);
    border-radius: 50%;
    background: radial-gradient(circle at center, #1b1538 0%, #100d24 85%);
    border: 3px solid #6c5bb3;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mc-stick-cross {
    position: absolute;
    width: 70%;
    height: 70%;
    border: 1px dashed #392e68;
    border-radius: 50%;
    pointer-events: none;
  }

  .mc-stick-knob {
    width: 42%;
    height: 42%;
    border-radius: 50%;
    background: #3d3170;
    border: 2px solid #f49ac1;
    box-shadow: 0 0 8px rgba(244, 154, 193, 0.35);
    pointer-events: none;
    transition: background-color 0.08s ease;
  }

  .mc-stick-knob.active {
    background: #6c5bb3;
    border-color: #ffe066;
  }

  .mc-dpad {
    width: min(33vw, 130px);
    height: min(33vw, 130px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mc-dpad-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .mc-bottom-hud {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .mc-stats-bar {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    background: #141029;
    border: 2px solid #4a3b7d;
    padding: 3px 6px;
  }

  .mc-stats-bar.mc-hidden {
    display: none;
  }

  .mc-stats-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mc-hearts {
    display: flex;
    flex-wrap: nowrap;
    gap: 1.5px;
    align-items: center;
  }

  .mc-heart-svg,
  .mc-stam-svg,
  .mc-shard-svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    display: block;
  }

  .mc-shard-count {
    font-size: 11px;
    font-weight: bold;
    color: #6ef3ff;
  }

  .mc-statuses {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mc-status-pip {
    width: 9px;
    height: 9px;
    border: 1px solid #100d24;
  }

  .mc-inv-bar {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    background: #181430;
    border: 2px solid #5d4e9e;
    padding: 3px 6px;
    box-shadow: inset 0 -2px 0 #100d24;
  }

  .mc-inv-bar.mc-hidden {
    display: none;
  }

  .mc-inv-row {
    width: 100%;
    min-height: 38px;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }

  .mc-inv-slots {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 7px;
  }

  .mc-inv-drop {
    justify-self: start;
    margin-left: 8px;
    width: 34px;
    height: 34px;
  }

  .mc-inv-slot {
    position: relative;
    width: 38px;
    height: 38px;
    background: #100d24;
    border: 2px solid #4a3b7d;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2px;
    cursor: pointer;
  }

  .mc-inv-slot.active {
    background: #241c47;
    border-color: #ffe066;
    box-shadow: 0 0 6px rgba(255, 224, 102, 0.35);
  }

  .mc-inv-icon {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    object-fit: contain;
    pointer-events: none;
  }

  .mc-inv-icon.mc-hidden {
    display: none;
  }

  .mc-inv-use-bg {
    position: absolute;
    left: 3px;
    right: 3px;
    bottom: 2px;
    height: 3px;
    background: #0b0917;
    pointer-events: none;
  }

  .mc-inv-use-bg.mc-hidden {
    display: none;
  }

  .mc-inv-use-fill {
    height: 100%;
    background: #66ffd9;
    width: 100%;
  }

  .mc-inv-info {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    justify-content: center;
    gap: 1px;
  }

  .mc-inv-name {
    font-size: 10px;
    font-weight: bold;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mc-inv-desc {
    font-size: 8px;
    color: #b8a1ff;
    line-height: 10px;
    height: 20px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .mc-keyboard {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  .mc-keyboard.mc-hidden,
  .mc-columns.mc-hidden {
    display: none;
  }

  .mc-kb-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .mc-kb-title {
    font-size: 10px;
    color: #f49ac1;
    letter-spacing: 0.8px;
  }

  .mc-kb-input {
    width: 100%;
    max-width: 300px;
    background: #100d24;
    border: 2px solid #ffe066;
    color: #ffffff;
    font-family: monospace;
    font-size: 12px;
    text-align: center;
    padding: 4px 8px;
    min-height: 24px;
  }

  .mc-kb-rows {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }

  .mc-kb-row {
    display: flex;
    justify-content: center;
    gap: 3px;
  }

  .mc-kb-key {
    flex: 1;
    max-width: 34px;
    height: 30px;
    background: #241c47;
    color: #ffffff;
    border: 2px solid #6c5bb3;
    box-shadow: inset 0 -2px 0 #100d24;
    font-family: monospace;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
  }

  .mc-kb-key.wide {
    flex: 1.8;
    max-width: 78px;
  }

  .mc-kb-key.enter {
    color: #66ffd9;
    border-color: #66ffd9;
  }

  .mc-kb-key.danger {
    color: #f49ac1;
  }

  .mc-kb-key.focused,
  .mc-kb-key:active {
    background: #6c5bb3;
    border-color: #ffe066;
    color: #ffe066;
  }
`;

export function mountMobileShell(): void {
  if (!document.getElementById(MOBILE_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = MOBILE_STYLE_ID;
    style.textContent = MOBILE_CSS;
    document.head.appendChild(style);
  }

  let shell = document.getElementById('mobile-shell');
  let gameContainer = document.getElementById('game-container');
  let controlsRoot = document.getElementById('mobile-controls');

  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'mobile-shell';
    if (gameContainer && gameContainer.parentElement) {
      gameContainer.parentElement.insertBefore(shell, gameContainer);
      shell.appendChild(gameContainer);
    } else {
      gameContainer = document.createElement('div');
      gameContainer.id = 'game-container';
      shell.appendChild(gameContainer);
      document.body.appendChild(shell);
    }
  }

  if (!controlsRoot) {
    controlsRoot = document.createElement('div');
    controlsRoot.id = 'mobile-controls';
    shell.appendChild(controlsRoot);
  }

  if (!controlsRoot.hasChildNodes()) {
    initMobileControls(controlsRoot);
  }
}
