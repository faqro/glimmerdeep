import { GameAction, GamepadBrand, GamepadButtonId, inputSystem } from './InputSystem';

export function getGamepadButtonTexture(
  btn: GamepadButtonId,
  brand: GamepadBrand = inputSystem.gamepadBrand
): string {
  if (brand === 'playstation') {
    switch (btn) {
      case 'A':
        return 'ps_cross';
      case 'B':
        return 'ps_circle';
      case 'X':
        return 'ps_square';
      case 'Y':
        return 'ps_triangle';
      case 'LB':
        return 'ps_l1';
      case 'RB':
        return 'ps_r1';
      case 'LT':
        return 'ps_l2';
      case 'RT':
        return 'ps_r2';
      case 'BACK':
        return 'ps_back';
      case 'START':
        return 'ps_start';
    }
  }
  switch (btn) {
    case 'A':
      return 'pad_a';
    case 'B':
      return 'pad_b';
    case 'X':
      return 'pad_x';
    case 'Y':
      return 'pad_y';
    case 'LB':
      return 'pad_lb';
    case 'RB':
      return 'pad_rb';
    case 'LT':
      return 'pad_lt';
    case 'RT':
      return 'pad_rt';
    case 'BACK':
      return 'pad_back';
    case 'START':
      return 'pad_start';
  }
}

export function getGamepadButtonLabel(
  btn: GamepadButtonId,
  brand: GamepadBrand = inputSystem.gamepadBrand
): string {
  if (brand === 'playstation') {
    switch (btn) {
      case 'A':
        return 'Cross';
      case 'B':
        return 'Circle';
      case 'X':
        return 'Square';
      case 'Y':
        return 'Triangle';
      case 'LB':
        return 'L1';
      case 'RB':
        return 'R1';
      case 'LT':
        return 'L2';
      case 'RT':
        return 'R2';
      case 'BACK':
        return 'Share';
      case 'START':
        return 'Options';
    }
  }
  return btn;
}

export function getControlIconTexture(action: GameAction): string {
  const type = inputSystem.controlType;
  if (type === 'gamepad') {
    return getGamepadButtonTexture(inputSystem.getButtonForAction(action));
  }
  if (type === 'touch') {
    switch (action) {
      case 'interact':
        return 'touch_interact';
      case 'dodge':
        return 'touch_dodge';
      case 'map':
        return 'touch_map';
      case 'drop':
        return 'touch_drop';
      case 'attack':
        return 'pad_dpad';
      default:
        return 'touch_interact';
    }
  }
  // Keyboard / Mouse
  switch (action) {
    case 'interact':
      return 'key_e';
    case 'drop':
      return 'key_q';
    case 'dodge':
      return 'key_space';
    case 'map':
      return 'key_tab';
    case 'pause':
      return 'key_esc';
    case 'attack':
      return 'mouse_lmb';
    case 'secondary':
      return 'mouse_rmb';
    case 'prevSlot':
    case 'nextSlot':
      return 'mouse_scroll';
  }
}

export function getControlActionText(action: GameAction): string {
  const type = inputSystem.controlType;
  if (type === 'gamepad') {
    return getGamepadButtonLabel(inputSystem.getButtonForAction(action));
  }
  if (type === 'touch') {
    switch (action) {
      case 'interact':
        return 'BTN';
      case 'dodge':
        return 'DASH';
      case 'map':
        return 'MAP';
      case 'drop':
        return 'DROP';
      default:
        return 'TAP';
    }
  }
  switch (action) {
    case 'interact':
      return 'E';
    case 'drop':
      return 'Q';
    case 'dodge':
      return 'SPACE';
    case 'map':
      return 'TAB';
    case 'pause':
      return 'ESC';
    case 'attack':
      return 'LMB';
    case 'secondary':
      return 'RMB';
    default:
      return '';
  }
}
