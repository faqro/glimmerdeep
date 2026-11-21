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
    height: auto !important;
    aspect-ratio: 4 / 3;
    flex-shrink: 0;
    background: #0b0917;
    border-bottom: 2px solid #4a3b7d;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  #game-container canvas {
    image-rendering: pixelated !important;
    image-rendering: crisp-edges !important;
  }

  #mobile-controls {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10px 12px 14px;
    background: linear-gradient(180deg, #120f29 0%, #0b0917 100%);
    min-height: 0;
  }

  .mc-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .mc-left-util,
  .mc-right-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .mc-btn {
    background: #241c47;
    color: #ffffff;
    border: 2px solid #6c5bb3;
    box-shadow: inset 0 -2px 0 #100d24;
    font-family: monospace;
    font-weight: bold;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mc-btn-sm {
    min-width: 34px;
    height: 28px;
    font-size: 11px;
    color: #b8a1ff;
  }

  .mc-btn-act {
    min-width: 40px;
    height: 32px;
    font-size: 12px;
    color: #ffe066;
    border-color: #8a75d6;
  }

  .mc-btn.active {
    background: #6c5bb3;
    border-color: #ffe066;
    color: #ffffff;
    transform: translateY(1px);
  }

  .mc-main-row {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 0;
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
    width: min(38vw, 152px);
    height: min(38vw, 152px);
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
    width: min(40vw, 160px);
    height: min(40vw, 160px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mc-dpad-svg {
    width: 100%;
    height: 100%;
    display: block;
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
