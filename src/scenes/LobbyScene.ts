import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { isMobileMode, NavDir, VirtualButton } from '../mobile/MobileInput';
import { inputSystem } from '../systems/InputSystem';
import { net } from '../systems/MultiplayerSystem';
import { isSteamworksBuild, steamSystem } from '../systems/SteamSystem';
import { getDailySeed } from '../utils/SeededGenerator';

export class LobbyScene extends Phaser.Scene {
  private playerRows: Phaser.GameObjects.Container[] = [];
  private actionBtnGroup: Phaser.GameObjects.GameObject[] = [];
  private isReady = false;
  private statusText!: Phaser.GameObjects.BitmapText;
  private startBtn?: Phaser.GameObjects.Image;

  private copyBtn!: Phaser.GameObjects.BitmapText;
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;
  private actionBtn?: Phaser.GameObjects.Image;
  private actionTxt?: Phaser.GameObjects.BitmapText;
  private onCopyAction!: () => void;
  private onBackAction!: () => void;
  private onMainAction?: () => void;
  private mobileFocusIndex = 2; // 0: COPY, 1: BACK, 2: START/READY
  private connectTimedOut = false;
  private triedAlternateBackend = false;
  private switchNetBtn?: Phaser.GameObjects.BitmapText;
  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    this.isReady = net.mode === 'host';
    this.mobileFocusIndex = 2;
    this.connectTimedOut = false;
    this.triedAlternateBackend = false;
    this.switchNetBtn = undefined;
    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 180, 24, 'CO-OP LOBBY', 16, 0xf49ac1, 0.5, 0.5);

    this.add.image(180, 52, 'ui_panel').setDisplaySize(220, 28);
    addPixelText(this, 130, 52, `CODE: ${net.inviteCode}`, 8, 0xffe066, 0.5, 0.5);

    this.copyBtn = addPixelText(this, 235, 52, '[COPY]', 8, 0x66ffd9, 0.5, 0.5);
    this.onCopyAction = () => {
      navigator.clipboard?.writeText(net.inviteCode).catch(() => {});
      this.copyBtn.setText('[COPIED]');
      SoundSystem.playPickup();
      this.time.delayedCall(1200, () => {
        if (this.copyBtn.active) this.copyBtn.setText('[COPY]');
      });
    };
    if (!isMobileMode()) {
      this.copyBtn.setInteractive({ useHandCursor: true }).on('pointerdown', this.onCopyAction);
    }

    this.add.image(180, 142, 'ui_panel').setDisplaySize(308, 130);

    if (isSteamworksBuild()) {
      const inviteBg = this.add.image(180, 195, 'ui_btn').setDisplaySize(112, 16).setDepth(5);
      const inviteTxt = addPixelText(this, 180, 195, 'INVITE FRIENDS', 8, 0x66ffd9, 0.5, 0.5).setDepth(5);
      inviteBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        SoundSystem.playPickup();
        void steamSystem.openInviteDialog();
      });
      inviteBg.on('pointerover', () => {
        inviteBg.setTexture('ui_btn_hover');
        inviteTxt.setTint(0xffe066);
      });
      inviteBg.on('pointerout', () => {
        inviteBg.setTexture('ui_btn');
        inviteTxt.setTint(0x66ffd9);
      });
    }

    this.statusText = addPixelText(this, 180, 214, '', 8, 0xb8a1ff, 0.5, 0.5, 320);

    this.rebuildActionButton();

    this.backBtn = this.add.image(115, 244, 'ui_btn').setDisplaySize(100, 22);
    this.backTxt = addPixelText(this, 115, 244, 'BACK', 8, 0xffffff, 0.5, 0.5);
    this.onBackAction = () => {
      net.disconnect();
      this.scene.start('MenuScene');
    };
    if (!isMobileMode()) {
      this.backBtn.setInteractive({ useHandCursor: true }).on('pointerdown', this.onBackAction);
    }

    net.onLobbyUpdate = () => this.refreshPlayers();
    net.onPeerLeft = undefined;
    net.onHostMigrated = (newHostPeerId, isLocalNewHost) => {
      if (isLocalNewHost) {
        this.isReady = true;
      }
      this.rebuildActionButton();
      this.refreshPlayers();
      const hostName = net.players.get(newHostPeerId)?.name ?? 'Player';
      const notice = addPixelText(
        this,
        180,
        74,
        isLocalNewHost ? 'HOST LEFT - YOU ARE NOW HOST!' : `HOST MIGRATED TO ${hostName}`,
        8,
        0xffe066,
        0.5,
        0.5
      );
      this.time.delayedCall(2500, () => {
        if (notice.active) notice.destroy();
      });
    };
    net.onGameStart = (seed, levelIndex, restorePlayer) => {
      this.scene.start('GameScene', {
        levelIndex,
        floorSeed: seed,
        resetRun: !restorePlayer,
        carryPlayer: restorePlayer,
        restoreReconnect: !!restorePlayer,
      });
    };

    net.broadcastLobbySelf(this.isReady);
    this.refreshPlayers();

    if (net.mode === 'client') {
      this.switchNetBtn = addPixelText(this, 180, 226, '', 8, 0x66ffd9, 0.5, 0.5);
      if (!isMobileMode()) {
        this.switchNetBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const next = net.signalingBackend === 'nostr' ? 'mqtt' : 'nostr';
          this.connectTimedOut = false;
          net.reconnectClientWithBackend(next);
          net.broadcastLobbySelf(this.isReady);
          SoundSystem.playPickup();
          this.refreshPlayers();
        });
      }

      const initialBackend = net.signalingBackend;
      this.time.delayedCall(8000, () => {
        if (!this.scene.isActive('LobbyScene')) return;
        if (net.mode === 'client' && net.players.size <= 1 && !net.hasDirectPeers() && !this.triedAlternateBackend) {
          this.triedAlternateBackend = true;
          const alt = initialBackend === 'nostr' ? 'mqtt' : 'nostr';
          net.reconnectClientWithBackend(alt);
          net.broadcastLobbySelf(this.isReady);
          this.refreshPlayers();
        }
      });

      this.time.delayedCall(16000, () => {
        if (!this.scene.isActive('LobbyScene')) return;
        if (net.mode === 'client' && net.players.size <= 1) {
          if (!net.hasDirectPeers() && net.signalingBackend !== initialBackend) {
            net.reconnectClientWithBackend(initialBackend);
            net.broadcastLobbySelf(this.isReady);
          }
          this.connectTimedOut = true;
          this.refreshPlayers();
        }
      });
    }

    this.refreshMobileFocus();
    this.unsubNav = inputSystem.onNav((dir) => this.handleMobileNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => this.handleMobileButton(btn));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
    });
  }

  private rebuildActionButton(): void {
    for (const obj of this.actionBtnGroup) obj.destroy();
    this.actionBtnGroup = [];
    this.startBtn = undefined;
    this.actionBtn = undefined;
    this.actionTxt = undefined;

    if (net.mode === 'host') {
      const btn = this.add.image(245, 244, 'ui_btn').setDisplaySize(116, 22);
      const txt = addPixelText(this, 245, 244, 'START RUN', 8, 0xffffff, 0.5, 0.5);
      this.onMainAction = () => {
        const allReady = Array.from(net.players.values()).every((p) => p.ready);
        if (!allReady) return;
        SoundSystem.playUnlock();
        const seed = getDailySeed(0);
        net.broadcastStart(seed, 0);
        this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
      };
      if (!isMobileMode()) {
        btn.setInteractive({ useHandCursor: true }).on('pointerdown', this.onMainAction);
      }
      this.startBtn = btn;
      this.actionBtn = btn;
      this.actionTxt = txt;
      this.actionBtnGroup.push(btn, txt);
    } else {
      const readyBtn = this.add.image(245, 244, 'ui_btn').setDisplaySize(116, 22);
      const readyTxt = addPixelText(this, 245, 244, this.isReady ? 'UNREADY' : 'READY', 8, 0xffffff, 0.5, 0.5);
      this.onMainAction = () => {
        this.isReady = !this.isReady;
        readyTxt.setText(this.isReady ? 'UNREADY' : 'READY');
        net.broadcastLobbySelf(this.isReady);
        SoundSystem.playPickup();
      };
      if (!isMobileMode()) {
        readyBtn.setInteractive({ useHandCursor: true }).on('pointerdown', this.onMainAction);
      }
      this.actionBtn = readyBtn;
      this.actionTxt = readyTxt;
      this.actionBtnGroup.push(readyBtn, readyTxt);
    }
    if (isMobileMode()) {
      this.refreshMobileFocus();
    }
  }

  private handleMobileNav(dir: NavDir): void {
    SoundSystem.playSwing();
    if (dir === 'up' || dir === 'down') {
      this.mobileFocusIndex = this.mobileFocusIndex === 0 ? 2 : 0;
    } else if (dir === 'left' || dir === 'right') {
      if (this.mobileFocusIndex === 0) this.mobileFocusIndex = 2;
      else this.mobileFocusIndex = this.mobileFocusIndex === 1 ? 2 : 1;
    }
    this.refreshMobileFocus();
  }

  private handleMobileButton(btn: VirtualButton): void {
    if (btn === 'esc') {
      this.onBackAction();
      return;
    }
    if (btn !== 'e' && btn !== 'space') return;
    if (this.mobileFocusIndex === 0) this.onCopyAction();
    else if (this.mobileFocusIndex === 1) this.onBackAction();
    else this.onMainAction?.();
  }

  private refreshMobileFocus(): void {
    if (!isMobileMode() && inputSystem.controlType !== 'gamepad') return;
    this.copyBtn.setTint(this.mobileFocusIndex === 0 ? 0xffe066 : 0x66ffd9);
    if (this.backBtn && this.backTxt) {
      this.backBtn.setTexture(this.mobileFocusIndex === 1 ? 'ui_btn_hover' : 'ui_btn');
      this.backTxt.setTint(this.mobileFocusIndex === 1 ? 0xffe066 : 0xffffff);
    }
    if (this.actionBtn && this.actionTxt) {
      this.actionBtn.setTexture(this.mobileFocusIndex === 2 ? 'ui_btn_hover' : 'ui_btn');
      this.actionTxt.setTint(this.mobileFocusIndex === 2 ? 0xffe066 : 0xffffff);
    }
  }

  private refreshPlayers(): void {
    for (const r of this.playerRows) r.destroy();
    this.playerRows = [];

    const list = Array.from(net.players.values());
    const rowStep = isSteamworksBuild() ? 23 : 28;
    const rowStartY = isSteamworksBuild() ? 94 : 98;
    list.forEach((p, idx) => {
      const y = rowStartY + idx * rowStep;
      const row = this.add.container(0, 0);
      const sp = this.add.sprite(48, y, `player_${p.paletteId}`, 0);
      row.add(sp);
      let nameX = 68;
      if (p.steamId) {
        const stIc = this.add.image(68, y, 'ui_steam_icon').setOrigin(0, 0.5);
        row.add(stIc);
        nameX = 80;
      }
      const tag = p.isHost ? ' [HOST]' : '';
      const nm = addPixelText(this, nameX, y - 4, `${p.name}${tag}`, 8, 0xffffff, 0, 0);
      const rdy = addPixelText(this, 318, y - 4, p.ready ? 'READY' : 'WAIT...', 8, p.ready ? 0x66ffd9 : 0xf49ac1, 1, 0);
      row.add([nm, rdy]);
      this.playerRows.push(row);
    });

    const allReady = list.length > 0 && list.every((p) => p.ready);
    const altBackend = net.signalingBackend === 'nostr' ? 'MQTT' : 'NOSTR';
    if (this.switchNetBtn) {
      const showSwitch = net.mode === 'client' && list.length <= 1;
      this.switchNetBtn.setVisible(showSwitch);
      if (showSwitch) {
        this.switchNetBtn.setText(`[TRY ${altBackend}]`);
      }
    }

    if (net.mode === 'host') {
      this.statusText
        .setText(allReady ? `${list.length}/4 Adventurers Ready` : 'Waiting for all players to ready up...')
        .setTint(0xb8a1ff);
      if (this.startBtn) {
        this.startBtn.setAlpha(allReady ? 1 : 0.45);
      }
    } else if (net.connectionError && list.length <= 1) {
      this.statusText.setText(net.connectionError).setTint(0xff5d8f);
    } else if (list.length <= 1) {
      this.statusText
        .setText(
          this.connectTimedOut
            ? 'No host found - check code/NET'
            : `Connecting to party (${net.signalingBackend.toUpperCase()})...`
        )
        .setTint(this.connectTimedOut ? 0xffe066 : 0xb8a1ff);
    } else {
      this.statusText.setText(`Connected (${list.length}/4) - Waiting for host...`).setTint(0xb8a1ff);
    }
  }
}
