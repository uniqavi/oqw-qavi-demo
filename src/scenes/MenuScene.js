import Phaser from 'phaser';
import { loadSfx, playSfx } from '../game/sfx.js';
import { loadMusic, stopMusic, playMusic } from '../game/music.js';
import { initAudio, beep } from '../game/audio.js';
import { getLeaderboard, fmtTime } from '../game/leaderboard.js';
import { showLandingPage } from '../game/landingPage.js';

/**
 * MeTube Desktop Parody - Phaser 3 Implementation
 * This script creates a self-contained desktop UI simulation.
 * All graphics are generated programmatically using Phaser's Graphics object.
 */

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    preload() {
        // Briefing dossier is down to two pages (1.jpg + 3.jpg) — the rest
        // were removed from the design.
        this.load.image('briefing_img_1', 'src/Briefing Images/1.jpg');
        this.load.image('briefing_img_2', 'src/Briefing Images/3.jpg');

        // Load Bonus Content images
        for (let i = 1; i <= 4; i++) {
            this.load.image(`bonus_img_${i}`, `src/Bonus Content/${i}.jpeg`);
        }
        this.load.image('bonus_img_5', 'src/Bonus Content/5.jpg');
    }



    create() {
        // Clean up XP overlays if they are present
        const XP_OVERLAYS = ['xp-welcome', 'xp-desktop', 'xp-call', 'xp-browser'];
        XP_OVERLAYS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        // Keep menu-mode on body so browser tabs/urlbar stay hidden
        document.body.classList.add('menu-mode');
        // Wipe the gameplay overlay canvas — levels draw to #oqw and their
        // last frame would otherwise linger over the desktop.
        const oqw = document.getElementById('oqw');
        if (oqw) oqw.getContext('2d')?.clearRect(0, 0, oqw.width, oqw.height);
        loadSfx();
        loadMusic();

        this.generateTextures();
        this.createBackground();
        
        // Track active windows
        this.notepadTextarea = null;
        this.notepadWindow = null;
        this.chatWindowOpen = false;

        // ── Window manager ────────────────────────────────────────────────
        // Every open window registers here. Depths come from a monotonic
        // counter inside a reserved band (100..4999) so windows can never
        // cover the taskbar (5000+) or notification toasts (9999+), and a
        // single scene-level wheel listener routes scroll to the top-most
        // window under the pointer instead of each window guessing bounds.
        this._windows = [];
        this._windowDepthCounter = 100;
        this.input.on('wheel', this._dispatchWheel, this);

        // DOM overlays (chat pane, notepad textarea) outlive Phaser objects —
        // remove them on any scene exit (level launch, logout, restart).
        this.events.once('shutdown', () => {
            if (this.chatPane) { this.chatPane.remove(); this.chatPane = null; }
            if (this.notepadTextarea) { this.notepadTextarea.remove(); this.notepadTextarea = null; }
        });

        // Determine progression. Story stages, in order:
        //   briefing-read   → Quiet Window (Level 1) icon unlocked
        //   level2-cleared  → the 1.2 runner is beaten; encrypted intel lands
        //                     in the Briefing folder ("new doc available")
        //   decrypted       → the intel_02 decryption minigame was solved
        //   level2-ready    → Toto's post-decrypt chat finished; The Quiet:
        //                     Hush (Level 2 dashboard) icon unlocked
        const lvl1Cleared = localStorage.getItem('oqw-level1-cleared') === 'true';
        const level12Ready = localStorage.getItem('oqw-level12-ready') === 'true';
        const runnerCleared = localStorage.getItem('oqw-level2-cleared') === 'true';
        const briefingRead = localStorage.getItem('oqw-briefing-read') === 'true';
        const decrypted = localStorage.getItem('oqw-decrypted') === 'true';
        const level2Ready = localStorage.getItem('oqw-level2-ready') === 'true';
        const level3Cleared = localStorage.getItem('oqw-level3-cleared') === 'true';
        const epilogueDone = localStorage.getItem('oqw-epilogue-done') === 'true';
        this.briefingRead = briefingRead;
        this.lvl1Cleared = lvl1Cleared;
        this.level12Ready = level12Ready;
        this.runnerCleared = runnerCleared;
        this.decrypted = decrypted;
        this.level2Ready = level2Ready;
        this.level3Cleared = level3Cleared;
        this.epilogueDone = epilogueDone;

        if (this.briefingRead) {
            // Completed chat state
            this.chatHistory = [
                { sender: 'Toto', text: 'X? You online?' },
                { sender: 'You', text: 'Yeah. What\'s the status?' },
                { sender: 'Toto', text: 'HUSH is planning an infrastructure attack. It\'s bad.' },
                { sender: 'You', text: 'Where do we start?' },
                { sender: 'Toto', text: 'I dropped a Briefing folder on your desktop. Open it, read the files first. I\'m preparing the web bypass.' },
                { sender: 'You', text: 'Copy that. Opening the files.' },
                { sender: 'Toto', text: 'I hope you have a clear idea about the mission now.' },
                { sender: 'You', text: 'Yes. How do I get in?' },
                { sender: 'Toto', text: 'I have temporarily enabled the bypass to their web page. Quiet Window is now unlocked on your desktop.' },
                { sender: 'You', text: 'Understood. I\'m entering the page.' },
                { sender: 'Toto', text: 'Be careful. They might have something up their sleeves. Good luck, agent.' }
            ];
            this.chatSteps = [];
            this.currentChatStep = 0;

            // ── Post-1.1 exchange — Toto unlocks Level 1.2 (the video page).
            // Every level transition has its own conversation; this one plays
            // when the player returns to the desktop after clearing 1.1.
            if (lvl1Cleared) {
                this.chatHistory.push({ sender: 'Toto', text: 'Feed\'s clean — you scanned everything and their grid never pinned you. Nice work, agent.' });
                if (level12Ready) {
                    this.chatHistory.push(
                        { sender: 'You', text: 'That boosted video… it\'s a door, isn\'t it?' },
                        { sender: 'Toto', text: 'Exactly. "What They Don\'t Want You To See" is HUSH\'s distribution pipe. I\'ve wedged the bypass into the video page itself — Quiet Window 1.2 is on your desktop.' },
                        { sender: 'You', text: 'Heading in.' },
                        { sender: 'Toto', text: 'Careful — that page auto-scrolls and it fights back harder. Scan the evidence, then get out through the crack in the wall.' }
                    );
                } else {
                    this.chatSteps = [
                        { reply: 'That boosted video… it\'s a door, isn\'t it?', response: 'Exactly. "What They Don\'t Want You To See" is HUSH\'s distribution pipe. I\'ve wedged the bypass into the video page itself — Quiet Window 1.2 is on your desktop.' },
                        { reply: 'Heading in.', response: 'Careful — that page auto-scrolls and it fights back harder. Scan the evidence, then get out through the crack in the wall.' }
                    ];
                }
            }

            if (decrypted) {
                // The post-decrypt exchange (pending or completed)
                this.chatHistory.push({ sender: 'Toto', text: 'Whoa — you cracked their encryption. That file maps HUSH\'s whole operation to one place: their analytics dashboard.' });
                if (level2Ready) {
                    this.chatHistory.push(
                        { sender: 'You', text: 'Can you get me in?' },
                        { sender: 'Toto', text: 'Bypass is up. "The Quiet: Hush" just appeared on your desktop. It\'s their dashboard — expect it to fight back.' },
                        { sender: 'You', text: 'On it. Going dark.' },
                        { sender: 'Toto', text: 'Good hunting, agent.' }
                    );
                } else {
                    this.chatSteps = [
                        { reply: 'Can you get me in?', response: 'Bypass is up. "The Quiet: Hush" just appeared on your desktop. It\'s their dashboard — expect it to fight back.' },
                        { reply: 'On it. Going dark.', response: 'Good hunting, agent.' }
                    ];
                }
            } else if (runnerCleared) {
                // Back from the runner — point the player at the new file
                this.chatHistory.push({ sender: 'Toto', text: 'That run stirred them up. An encrypted file just landed in your Briefing folder — see if you can crack it.' });
            }

            // ── Campaign epilogue — plays after the dashboard falls. ──
            if (level3Cleared) {
                this.chatHistory.push({ sender: 'Toto', text: 'It\'s done. The dashboard is dark and the real numbers are out. HUSH can\'t massage this away.' });
                if (epilogueDone) {
                    this.chatHistory.push(
                        { sender: 'You', text: 'So that\'s it? We won?' },
                        { sender: 'Toto', text: 'For tonight. Their whole operation ran through that dashboard — you pulled the plug on the machine that decides what a billion people get bored by.' },
                        { sender: 'You', text: 'Signing off, Toto.' },
                        { sender: 'Toto', text: 'Get some rest, agent. The quiet window is yours now. — T.' }
                    );
                } else {
                    this.chatSteps = [
                        { reply: 'So that\'s it? We won?', response: 'For tonight. Their whole operation ran through that dashboard — you pulled the plug on the machine that decides what a billion people get bored by.' },
                        { reply: 'Signing off, Toto.', response: 'Get some rest, agent. The quiet window is yours now. — T.' }
                    ];
                }
            }
        } else {
            // Start of game flow
            this.chatHistory = [
                { sender: 'Toto', text: 'X? You online?' }
            ];
            this.chatSteps = [
                { reply: 'Yeah. What\'s the status?', response: 'HUSH is planning an infrastructure attack. It\'s bad.' },
                { reply: 'Where do we start?', response: 'I dropped a Briefing folder on your desktop. Open it, read the files first. I\'m preparing the web bypass.' },
                { reply: 'Copy that. Opening the files.', response: null }
            ];
            this.currentChatStep = 0;
        }

        let currentY = 60;

        // 1. Briefing Folder (Gates story mode)
        this.briefFolderGroup = this.createDesktopIcon(60, currentY, 'folder_icon', 'Briefing', () => this.openBriefingFolderWindow());
        // "New doc available" badge once the runner is beaten but the intel
        // hasn't been decrypted yet (Phase 3 lore notification badge).
        if (runnerCleared && !decrypted) this._addFolderBadge();
        currentY += 100;

        // 2. SecureChat App
        this.secureChatGroup = this.createDesktopIcon(60, currentY, 'icon_securechat', 'SecureChat', () => this.openChatWindow());
        currentY += 100;

        // 3. Internet Browser (Quiet Window level 1.1)
        this.metubeGroup = this.createDesktopIcon(60, currentY, 'icon_metube', 'Quiet Window', () => this.launchLevel('HomeScene'));
        // Hide if the briefing has not been read yet
        if (!briefingRead) {
            this.metubeGroup.setVisible(false);
            this.metubeGroup.setAlpha(0);
        }
        currentY += 100;

        // 3b. Level 1.2 (the boosted-video page) — created once 1.1 is
        // cleared, but stays invisible until Toto's post-1.1 chat unlocks it
        // (mirrors the hush3Group pattern below).
        if (lvl1Cleared || level12Ready) {
            this.metube12Group = this.createDesktopIcon(60, currentY, 'icon_metube', 'Quiet Window 1.2', () => this.launchLevel('GameScene', true));
            if (!level12Ready) {
                this.metube12Group.setVisible(false);
                this.metube12Group.setAlpha(0);
            }
            currentY += 100;
        }

        // 4. Level 2.0 Browser (The Quiet: Hush) — created once the intel is
        // decrypted, but stays invisible until Toto's chat unlocks it.
        // Lives in its OWN second column (x=170) so it never lands on top of
        // the Quiet Window 1.2 icon in the first column.
        if (decrypted || level2Ready) {
            this.hush3Group = this.createDesktopIcon(170, 60, 'icon_hush_3', 'The Quiet: Hush', () => this.launchLevel('DashboardScene'));
            if (!level2Ready) {
                this.hush3Group.setVisible(false);
                this.hush3Group.setAlpha(0);
            }
        }

        // 4b. Bonus folder - created permanently, but only visible if epilogue is done
        this.bonusFolderGroup = this.createDesktopIcon(170, 160, 'folder_icon', 'Bonus', () => this.openBriefingFolderWindow(true));
        if (!this.epilogueDone) {
            this.bonusFolderGroup.setVisible(false);
            this.bonusFolderGroup.setAlpha(0);
        }

        // 5. Recycle Bin Icon
        this.recycleBinGroup = this.createDesktopIcon(60, currentY, 'recycle_icon', 'Recycle Bin', () => console.log('Recycle Bin clicked'));
        currentY += 100;

        // 6. Manual (Notepad)
        this.manualGroup = this.createDesktopIcon(60, currentY, 'manual_icon', 'Manual', (x, y) => this.openNotepadWindow(x, y));
        currentY += 100;

        // 7. Log Out Icon
        this.logoutGroup = this.createDesktopIcon(60, currentY, 'logout_icon', 'Log Out', () => this.triggerShutdown());

        // Create Taskbar and start message flow
        this.createTaskbar();
        this.createNotification();
        this.createLeaderboardWidget();

        // Returning from a cleared runner with intel still encrypted → nudge
        // the player toward the Briefing folder.
        if (runnerCleared && !decrypted) {
            this.time.delayedCall(1200, () => this._showIntelNotification());
        } else if (lvl1Cleared && !level12Ready) {
            // Back from 1.1 — Toto's unlock chat for 1.2 is waiting
            this.time.delayedCall(1200, () => this.showNewMessageNotification(
                'NEW MESSAGE FROM TOTO', 'TOTO: Feed\'s clean. Ready for\nthe next door?'));
        } else if (level3Cleared && !epilogueDone) {
            // Back from the dashboard — campaign epilogue
            this.time.delayedCall(1200, () => this.showNewMessageNotification(
                'NEW MESSAGE FROM TOTO', 'TOTO: It\'s done. The dashboard\nis dark.'));
        }
    }

    // Desktop widget: TOP AGENTS — the 3 fastest full runs (name + total time).
    createLeaderboardWidget() {
        const board = getLeaderboard();
        const w = 280, rowH = 32, headerRowH = 24;
        const h = 60 + headerRowH + Math.max(1, board.length) * rowH + 10;
        const wx = 1920 - w - 34, wy = 84;
        const widget = this.add.container(wx, wy);

        // All text at resolution 2 — the desktop canvas gets CSS-downscaled,
        // which left 1× text looking blurry.
        const TXT = (x, y, str, style) => this.add.text(x, y, str, { resolution: 2, ...style });

        const bg = this.add.graphics();
        bg.fillStyle(0x0c0c0e, 0.9);
        bg.fillRoundedRect(0, 0, w, h, 6);
        bg.lineStyle(2, 0xf4d35e, 0.9);
        bg.strokeRoundedRect(0, 0, w, h, 6);
        // header band
        bg.fillStyle(0xf4d35e, 1);
        bg.fillRoundedRect(0, 0, w, 34, { tl: 6, tr: 6, bl: 0, br: 0 });

        const title = TXT(w / 2, 17, '🏆 TOP AGENTS', {
            fontFamily: 'Tahoma, Arial', fontSize: '15px', color: '#1a1a1f', fontWeight: 'bold'
        }).setOrigin(0.5);
        const sub = TXT(w / 2, 44, 'fastest full runs — all levels', {
            fontFamily: 'Consolas, monospace', fontSize: '10px', color: '#9a9a9a'
        }).setOrigin(0.5);

        // Column headers: AGENT | TIME
        const headY = 58;
        const headAgent = TXT(46, headY, 'AGENT', {
            fontFamily: 'Consolas, monospace', fontSize: '11px', color: '#f4d35e', fontWeight: 'bold'
        });
        const headTime = TXT(w - 16, headY, 'TIME', {
            fontFamily: 'Consolas, monospace', fontSize: '11px', color: '#f4d35e', fontWeight: 'bold'
        }).setOrigin(1, 0);
        const headRule = this.add.graphics();
        headRule.lineStyle(1, 0xf4d35e, 0.35);
        headRule.lineBetween(12, headY + 16, w - 12, headY + 16);

        widget.add([bg, title, sub, headAgent, headTime, headRule]);

        const rowsY = headY + headerRowH;
        if (board.length === 0) {
            widget.add(TXT(w / 2, rowsY + rowH / 2, 'no completed runs yet', {
                fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#6b6b73', fontStyle: 'italic'
            }).setOrigin(0.5));
        } else {
            const medals = ['#f4d35e', '#c0c0c5', '#cd7f32'];
            board.forEach((run, i) => {
                const y = rowsY + i * rowH;
                const medal = this.add.graphics();
                medal.fillStyle(Phaser.Display.Color.HexStringToColor(medals[i]).color, 1);
                medal.fillCircle(24, y + rowH / 2, 10);
                const rank = TXT(24, y + rowH / 2, String(i + 1), {
                    fontFamily: 'Tahoma, Arial', fontSize: '12px', color: '#1a1a1f', fontWeight: 'bold'
                }).setOrigin(0.5);
                const name = TXT(46, y + rowH / 2, run.name, {
                    fontFamily: 'Consolas, monospace', fontSize: '14px', color: '#f5f5f5', fontWeight: 'bold'
                }).setOrigin(0, 0.5);
                const time = TXT(w - 16, y + rowH / 2, fmtTime(run.time), {
                    fontFamily: 'Consolas, monospace', fontSize: '14px', color: '#6dc89e'
                }).setOrigin(1, 0.5);
                widget.add([medal, rank, name, time]);
            });
        }
        this.leaderboardWidget = widget;
    }

    // Small red pulsing "!" badge on the Briefing folder icon.
    _addFolderBadge() {
        const badge = this.add.container(24, -26);
        const dot = this.add.graphics();
        dot.fillStyle(0xe63946, 1);
        dot.fillCircle(0, 0, 11);
        dot.lineStyle(2, 0xffffff, 1);
        dot.strokeCircle(0, 0, 11);
        const mark = this.add.text(0, 0, '!', {
            fontFamily: 'Arial', fontSize: '14px', color: '#ffffff', fontWeight: 'bold'
        }).setOrigin(0.5);
        badge.add([dot, mark]);
        this.briefFolderGroup.add(badge);
        this.folderBadge = badge;
        this.tweens.add({
            targets: badge, scaleX: 1.25, scaleY: 1.25,
            duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    _showIntelNotification() {
        if (this.notificationContainer) this.notificationContainer.destroy();
        this.notificationContainer = this.add.container(1600, 1040);
        this.notificationContainer.setDepth(9999);

        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 0.95);
        bg.fillRoundedRect(0, 0, 300, 75, 6);
        bg.lineStyle(2, 0xe63946, 1);
        bg.strokeRoundedRect(0, 0, 300, 75, 6);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 300, 75), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
            this.openBriefingFolderWindow();
            this.tweens.add({
                targets: this.notificationContainer, y: 1040, duration: 300,
                ease: 'Power2.easeIn', onComplete: () => this.notificationContainer.destroy()
            });
        });

        const iconBg = this.add.graphics();
        iconBg.fillStyle(0xd9a756, 1);
        iconBg.fillRect(20, 24, 12, 6);
        iconBg.fillRect(16, 29, 28, 20);
        iconBg.fillStyle(0xe63946, 1);
        iconBg.fillCircle(44, 28, 8);

        const title = this.add.text(60, 12, 'NEW DOC AVAILABLE', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#e63946', fontWeight: 'bold'
        });
        const msg = this.add.text(60, 28, 'An encrypted file appeared in your\nBriefing folder. Click to open.', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#333333'
        });

        this.notificationContainer.add([bg, iconBg, title, msg]);
        beep(740, 0.12, 'sine', 0.05);
        this.time.delayedCall(140, () => beep(988, 0.18, 'sine', 0.05));
        this.tweens.add({
            targets: this.notificationContainer, y: 955, duration: 500, ease: 'Cubic.easeOut'
        });
    }

    _showBonusFolderNotification() {
        if (this.notificationContainer) this.notificationContainer.destroy();
        this.notificationContainer = this.add.container(1600, 1040);
        this.notificationContainer.setDepth(9999);

        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 0.95);
        bg.fillRoundedRect(0, 0, 300, 75, 6);
        bg.lineStyle(2, 0xe63946, 1);
        bg.strokeRoundedRect(0, 0, 300, 75, 6);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 300, 75), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
            this.openBriefingFolderWindow(true);
            this.tweens.add({
                targets: this.notificationContainer, y: 1040, duration: 300,
                ease: 'Power2.easeIn', onComplete: () => this.notificationContainer.destroy()
            });
        });

        const iconBg = this.add.graphics();
        iconBg.fillStyle(0xd9a756, 1);
        iconBg.fillRect(20, 24, 12, 6);
        iconBg.fillRect(16, 29, 28, 20);
        iconBg.fillStyle(0xe63946, 1);
        iconBg.fillCircle(44, 28, 8);

        const title = this.add.text(60, 12, 'NEW FOLDER FOUND', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#e63946', fontWeight: 'bold'
        });
        const msg = this.add.text(60, 28, 'A bonus folder appeared on your\ndesktop. Click to open.', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#333333'
        });

        this.notificationContainer.add([bg, iconBg, title, msg]);
        beep(740, 0.12, 'sine', 0.05);
        this.time.delayedCall(140, () => beep(988, 0.18, 'sine', 0.05));
        this.tweens.add({
            targets: this.notificationContainer, y: 955, duration: 500, ease: 'Cubic.easeOut'
        });
    }

    /**
     * Generates all UI textures programmatically.
     */
    generateTextures() {
        if (this.textures.exists('icon_metube')) return;
        
        // 1. Black Play Button Icon (Infiltrating Logo)
        const logoGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        logoGraphics.fillStyle(0x000000, 1);
        logoGraphics.fillRoundedRect(0, 0, 64, 64, 12);
        logoGraphics.fillStyle(0xffffff, 1);
        logoGraphics.fillTriangle(24, 20, 24, 44, 46, 32);
        logoGraphics.generateTexture('icon_metube', 64, 64);

        // 1b. Hush 3 Icon
        const hush3Graphics = this.make.graphics({ x: 0, y: 0, add: false });
        hush3Graphics.fillStyle(0x0284c7, 1);
        hush3Graphics.fillCircle(32, 32, 24);
        hush3Graphics.lineStyle(2, 0xffffff, 1);
        hush3Graphics.strokeCircle(32, 32, 24);
        
        hush3Graphics.beginPath();
        hush3Graphics.moveTo(8, 32);
        hush3Graphics.lineTo(56, 32);
        hush3Graphics.strokePath();

        hush3Graphics.beginPath();
        hush3Graphics.moveTo(32, 8);
        hush3Graphics.lineTo(32, 56);
        hush3Graphics.strokePath();

        hush3Graphics.lineStyle(1.5, 0xe0f2fe, 1);
        hush3Graphics.strokeEllipse(32, 32, 16, 48);

        hush3Graphics.generateTexture('icon_hush_3', 64, 64);

        // 2. Window Background
        const winBg = this.make.graphics({ x: 0, y: 0, add: false });
        winBg.fillStyle(0xf0f0f0, 1);
        winBg.fillRect(0, 0, 600, 400);
        winBg.lineStyle(2, 0x888888, 1);
        winBg.strokeRect(0, 0, 600, 400);
        winBg.generateTexture('window_bg', 600, 400);

        // 3. Title Bar
        const titleBar = this.make.graphics({ x: 0, y: 0, add: false });
        titleBar.fillStyle(0x333333, 1);
        titleBar.fillRect(0, 0, 600, 30);
        titleBar.generateTexture('title_bar', 600, 30);

        // 4. Close Button (X)
        const closeBtn = this.make.graphics({ x: 0, y: 0, add: false });
        closeBtn.fillStyle(0xcc0000, 1);
        closeBtn.fillRect(0, 0, 30, 30);
        closeBtn.lineStyle(2, 0xffffff, 1);
        closeBtn.lineBetween(8, 8, 22, 22);
        closeBtn.lineBetween(22, 8, 8, 22);
        closeBtn.generateTexture('close_btn', 30, 30);
        
        // 5. Start Button
        const startBtn = this.make.graphics({ x: 0, y: 0, add: false });
        startBtn.fillStyle(0x4a4a4a, 1);
        startBtn.fillRoundedRect(0, 0, 80, 30, 4);
        startBtn.lineStyle(1, 0xffffff, 0.5);
        startBtn.strokeRoundedRect(0, 0, 80, 30, 4);
        startBtn.generateTexture('start_btn', 80, 30);

        // 6. Log Out Icon (Open Door)
        const logoutGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        logoutGraphics.lineStyle(4, 0xdddddd, 1);
        logoutGraphics.strokeRect(16, 12, 32, 44);
        logoutGraphics.fillStyle(0x333333, 1);
        logoutGraphics.fillRect(18, 14, 28, 40);
        logoutGraphics.fillStyle(0xcc3333, 1);
        logoutGraphics.beginPath();
        logoutGraphics.moveTo(18, 14);
        logoutGraphics.lineTo(40, 8);
        logoutGraphics.lineTo(40, 52);
        logoutGraphics.lineTo(18, 54);
        logoutGraphics.closePath();
        logoutGraphics.fillPath();
        logoutGraphics.generateTexture('logout_icon', 64, 64);

        // 7. Recycle Bin Icon
        const binGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        binGraphics.fillStyle(0xc0c0c0, 1);
        binGraphics.beginPath();
        binGraphics.moveTo(14, 20);
        binGraphics.lineTo(50, 20);
        binGraphics.lineTo(44, 56);
        binGraphics.lineTo(20, 56);
        binGraphics.closePath();
        binGraphics.fillPath();
        binGraphics.lineStyle(2, 0x999999, 1);
        binGraphics.strokePath();
        
        // Lid
        binGraphics.fillStyle(0xaaaaaa, 1);
        binGraphics.fillRect(10, 14, 44, 6);
        binGraphics.fillRect(26, 8, 12, 6);

        // Ribs
        binGraphics.lineBetween(24, 25, 26, 50);
        binGraphics.lineBetween(32, 25, 32, 50);
        binGraphics.lineBetween(40, 25, 38, 50);
        binGraphics.generateTexture('recycle_icon', 64, 64);

        // 8. Manual (Book) Icon
        const bookGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        bookGraphics.fillStyle(0x004488, 1);
        bookGraphics.beginPath();
        bookGraphics.moveTo(32, 16);
        bookGraphics.lineTo(8, 12);
        bookGraphics.lineTo(8, 52);
        bookGraphics.lineTo(32, 56);
        bookGraphics.lineTo(56, 52);
        bookGraphics.lineTo(56, 12);
        bookGraphics.closePath();
        bookGraphics.fillPath();

        bookGraphics.fillStyle(0xffffff, 1);
        bookGraphics.beginPath();
        bookGraphics.moveTo(32, 18);
        bookGraphics.lineTo(12, 15);
        bookGraphics.lineTo(12, 48);
        bookGraphics.lineTo(32, 52);
        bookGraphics.closePath();
        bookGraphics.fillPath();

        bookGraphics.fillStyle(0xeeeeee, 1);
        bookGraphics.beginPath();
        bookGraphics.moveTo(32, 18);
        bookGraphics.lineTo(52, 15);
        bookGraphics.lineTo(52, 48);
        bookGraphics.lineTo(32, 52);
        bookGraphics.closePath();
        bookGraphics.fillPath();
        
        bookGraphics.fillStyle(0xcc0000, 1);
        bookGraphics.fillRect(30, 14, 4, 42);
        bookGraphics.generateTexture('manual_icon', 64, 64);

        // 9. Manila Folder Icon
        const folderGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        folderGraphics.fillStyle(0xd9a756, 1);
        folderGraphics.fillRoundedRect(8, 12, 24, 12, 3);
        folderGraphics.fillRoundedRect(4, 20, 56, 36, 4);
        folderGraphics.lineStyle(2, 0xb08035, 1);
        folderGraphics.strokeRoundedRect(4, 20, 56, 36, 4);
        folderGraphics.lineBetween(8, 26, 56, 26);
        folderGraphics.generateTexture('folder_icon', 64, 64);

        // 10. Vector Madam Z Face drawing for puzzle
        const madamZ = this.make.graphics({ x: 0, y: 0, add: false });
        madamZ.fillStyle(0x0a1020, 1);
        madamZ.fillRect(0, 0, 300, 300);
        madamZ.fillStyle(0x2d4373, 1);
        madamZ.fillTriangle(150, 220, 60, 300, 240, 300); // Suit
        madamZ.fillStyle(0xffffff, 1);
        madamZ.fillTriangle(150, 220, 120, 270, 180, 270); // Shirt
        madamZ.fillStyle(0xffd1a4, 1);
        madamZ.fillCircle(150, 160, 45); // Head
        madamZ.fillStyle(0xc0c0c0, 1);
        madamZ.fillCircle(115, 140, 25); // Left Hair
        madamZ.fillCircle(185, 140, 25); // Right Hair
        madamZ.fillCircle(150, 120, 35); // Top Hair
        madamZ.fillStyle(0x000000, 1);
        madamZ.fillCircle(135, 160, 4); // Left Eye
        madamZ.fillCircle(165, 160, 4); // Right Eye
        madamZ.lineStyle(2, 0x000000, 1);
        madamZ.lineBetween(135, 182, 165, 182); // Mouth
        madamZ.generateTexture('enemy_image', 300, 300);

        // 11. Text Document Icon (brief.doc)
        const docGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        docGraphics.fillStyle(0xffffff, 1);
        docGraphics.fillRect(16, 8, 32, 48);
        docGraphics.lineStyle(2, 0x888888, 1);
        docGraphics.strokeRect(16, 8, 32, 48);
        // Dog-ear
        docGraphics.fillStyle(0xdddddd, 1);
        docGraphics.fillTriangle(38, 8, 48, 8, 48, 18);
        // Lines
        docGraphics.lineStyle(1.5, 0x888888, 1);
        docGraphics.lineBetween(22, 24, 42, 24);
        docGraphics.lineBetween(22, 32, 42, 32);
        docGraphics.lineBetween(22, 40, 34, 40);
        docGraphics.generateTexture('doc_icon', 64, 64);

        // 12. Classic-style window control buttons — 30x30 flush design
        // --- Minimize (classic grey, 3D bevel, black underscore) ---
        const minBtn = this.make.graphics({ x: 0, y: 0, add: false });
        minBtn.fillStyle(0xc0c0c0, 1);
        minBtn.fillRect(0, 0, 30, 30);
        // Bevel
        minBtn.lineStyle(1.5, 0xffffff, 1);
        minBtn.lineBetween(0, 0, 30, 0);
        minBtn.lineBetween(0, 0, 0, 30);
        minBtn.lineStyle(1.5, 0x808080, 1);
        minBtn.lineBetween(0, 29, 30, 29);
        minBtn.lineBetween(29, 0, 29, 30);
        // Icon
        minBtn.lineStyle(2, 0x000000, 1);
        minBtn.lineBetween(9, 20, 21, 20);
        minBtn.generateTexture('xp_min_btn', 30, 30);

        // --- Maximize (classic grey, 3D bevel, black window) ---
        const maxBtn = this.make.graphics({ x: 0, y: 0, add: false });
        maxBtn.fillStyle(0xc0c0c0, 1);
        maxBtn.fillRect(0, 0, 30, 30);
        // Bevel
        maxBtn.lineStyle(1.5, 0xffffff, 1);
        maxBtn.lineBetween(0, 0, 30, 0);
        maxBtn.lineBetween(0, 0, 0, 30);
        maxBtn.lineStyle(1.5, 0x808080, 1);
        maxBtn.lineBetween(0, 29, 30, 29);
        maxBtn.lineBetween(29, 0, 29, 30);
        // Icon
        maxBtn.lineStyle(1.5, 0x000000, 1);
        maxBtn.strokeRect(9, 9, 12, 12);
        maxBtn.lineStyle(2.5, 0x000000, 1);
        maxBtn.lineBetween(9, 10, 21, 10);
        maxBtn.generateTexture('xp_max_btn', 30, 30);

        // --- Close (solid red, white X, flush 30x30 style) ---
        const xpCloseBtn = this.make.graphics({ x: 0, y: 0, add: false });
        xpCloseBtn.fillStyle(0xcc0000, 1);
        xpCloseBtn.fillRect(0, 0, 30, 30);
        // Icon
        xpCloseBtn.lineStyle(2.5, 0xffffff, 1);
        xpCloseBtn.lineBetween(8, 8, 22, 22);
        xpCloseBtn.lineBetween(22, 8, 8, 22);
        xpCloseBtn.generateTexture('xp_close_btn', 30, 30);

        // --- SecureChat App Icon (phone + lock) ---
        const chatIconG = this.make.graphics({ x: 0, y: 0, add: false });
        // Green background bubble
        chatIconG.fillStyle(0x25d366, 1);
        chatIconG.fillRoundedRect(0, 0, 64, 64, 14);
        // Phone outline (white)
        chatIconG.fillStyle(0xffffff, 1);
        chatIconG.fillRoundedRect(18, 12, 28, 40, 5);
        // Screen area
        chatIconG.fillStyle(0x25d366, 1);
        chatIconG.fillRect(22, 18, 20, 26);
        // Home button dot
        chatIconG.fillStyle(0xffffff, 1);
        chatIconG.fillCircle(32, 48, 3);
        // Chat bubble overlay
        chatIconG.fillStyle(0xffffff, 1);
        chatIconG.fillRoundedRect(20, 20, 24, 16, 4);
        // Bubble tail
        chatIconG.fillTriangle(22, 36, 28, 36, 22, 42);
        // Dots inside bubble
        chatIconG.fillStyle(0x25d366, 1);
        chatIconG.fillCircle(27, 28, 2);
        chatIconG.fillCircle(32, 28, 2);
        chatIconG.fillCircle(37, 28, 2);
        chatIconG.generateTexture('icon_securechat', 64, 64);
    }

    createBackground() {
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x3a6ea5, 0x3a6ea5, 0x123456, 0x123456, 1);
        bg.fillRect(0, 0, this.scale.width, this.scale.height);
        
        this.scale.on('resize', (gameSize) => {
            bg.clear();
            bg.fillGradientStyle(0x3a6ea5, 0x3a6ea5, 0x123456, 0x123456, 1);
            bg.fillRect(0, 0, gameSize.width, gameSize.height);
            
            if (this.notepadTextarea && this.notepadWindow) {
                this.updateTextareaPosition();
            }
        });
    }

    createDesktopIcon(x, y, textureKey, labelText, onClickCallback, targetSize = 64) {
        const iconGroup = this.add.container(x, y);
        
        let baseScale = 1;
        const frame = this.textures.getFrame(textureKey);
        if (frame && frame.width > 0) {
            baseScale = targetSize / frame.width;
        }
        
        const shadows = [];
        for (let i = 1; i <= 6; i++) {
            const offset = i * 1.5; 
            const alpha = 0.25 / (i * 1.2);
            const scale = (1 + (i * 0.02)) * baseScale;
            shadows.push(this.add.image(-offset, offset, textureKey).setTint(0x000000).setAlpha(alpha).setScale(scale));
        }

        const icon = this.add.image(0, 0, textureKey).setInteractive({ useHandCursor: true, draggable: true }).setScale(baseScale);
        const label = this.add.text(0, 45, labelText, {
            fontFamily: 'Arial', fontSize: '14px', color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 }
        }).setOrigin(0.5);

        iconGroup.add([...shadows, icon, label]);

        // Dragging
        let startDragX = 0;
        let startDragY = 0;
        icon.on('dragstart', (pointer) => {
            startDragX = iconGroup.x - pointer.x;
            startDragY = iconGroup.y - pointer.y;
        });
        icon.on('drag', (pointer) => {
            iconGroup.x = pointer.x + startDragX;
            iconGroup.y = pointer.y + startDragY;
        });

        icon.on('dragend', () => {
            if (textureKey !== 'recycle_icon' && this.recycleBinGroup) {
                const dist = Phaser.Math.Distance.Between(iconGroup.x, iconGroup.y, this.recycleBinGroup.x, this.recycleBinGroup.y);
                if (dist < 60) {
                    iconGroup.destroy();
                }
            }
        });

        // Double click
        let lastTime = 0;
        icon.on('pointerdown', () => {
            playSfx('desktopClick');
            let clickDelay = this.time.now - lastTime;
            lastTime = this.time.now;
            if (clickDelay < 350) {
                onClickCallback(iconGroup.x, iconGroup.y);
            }
        });

        icon.on('pointerover', () => icon.setTint(0xdddddd));
        icon.on('pointerout', () => icon.clearTint());

        return iconGroup;
    }

    // ─── Window manager ────────────────────────────────────────────────────
    _registerWindow(entry) {
        // entry: { name, title, container, w, h, onWheel?, onMinimize?, onRestore? }
        entry.minimized = false;
        this._windows.push(entry);
        this._focusWindow(entry.container);
        this._addTaskbarButton(entry);
        return entry;
    }

    _unregisterWindow(container) {
        const entry = this._windows.find(w => w.container === container);
        if (entry && entry.taskBtn) entry.taskBtn.destroy();
        this._windows = this._windows.filter(w => w.container !== container);
        this._layoutTaskbarButtons();
        // Focus falls to the next-highest open window, like real Windows
        const next = this._windows
            .filter(w => !w.minimized && w.container.visible)
            .sort((a, b) => b.container.depth - a.container.depth)[0];
        if (next) this._focusWindow(next.container);
        else this._updateDomOcclusion();
    }

    _getWindow(name) {
        return this._windows.find(w => w.name === name) || null;
    }

    _focusWindow(container) {
        container.setDepth(++this._windowDepthCounter);
        this._updateDomOcclusion();
    }

    // DOM overlays (chat pane, notepad textarea) always paint above the
    // canvas, so a higher-depth Phaser window dragged over them would be
    // painted UNDER their content. Hide an overlay whenever another visible
    // window overlaps its rect from above. Entries opt in via `domEl` +
    // `domRect` (overlay rect in window-local coords).
    _updateDomOcclusion() {
        for (const w of this._windows) {
            if (!w.domEl) continue;
            let occluded = false;
            if (!w.minimized && w.container.visible) {
                const ax = w.container.x + w.domRect.x;
                const ay = w.container.y + w.domRect.y;
                for (const o of this._windows) {
                    if (o === w || o.minimized || !o.container.visible) continue;
                    if (o.container.depth <= w.container.depth) continue;
                    const overlapX = o.container.x < ax + w.domRect.w && o.container.x + o.w > ax;
                    const overlapY = o.container.y < ay + w.domRect.h && o.container.y + o.h > ay;
                    if (overlapX && overlapY) { occluded = true; break; }
                }
            }
            w.domEl.style.visibility = occluded ? 'hidden' : 'visible';
        }
    }

    // Top-most visible window whose bounds contain the point (window-local test).
    _topWindowAt(x, y) {
        let top = null;
        for (const w of this._windows) {
            const c = w.container;
            if (!c.visible || w.minimized || c.scaleX < 0.99) continue;
            const lx = x - c.x;
            const ly = y - c.y;
            if (lx >= 0 && lx <= w.w && ly >= 0 && ly <= w.h) {
                if (!top || c.depth > top.container.depth) top = w;
            }
        }
        return top;
    }

    _dispatchWheel(pointer, gameObjects, deltaX, deltaY) {
        const top = this._topWindowAt(pointer.x, pointer.y);
        if (top && top.onWheel) top.onWheel(pointer, deltaX, deltaY);
    }

    _minimizeWindow(entry) {
        if (entry.minimized) return;
        entry.minimized = true;
        playSfx('desktopClick');
        if (entry.onMinimize) entry.onMinimize();
        entry.restoreX = entry.container.x;
        entry.restoreY = entry.container.y;
        const btnX = entry.taskBtn ? entry.taskBtn.x + 70 : 200;
        this.tweens.add({
            targets: entry.container,
            x: btnX, y: 1060,
            scaleX: 0, scaleY: 0,
            duration: 250,
            ease: 'Power2.easeIn',
            onComplete: () => entry.container.setVisible(false)
        });
        this._updateDomOcclusion();
    }

    _restoreWindow(entry) {
        if (!entry.minimized) {
            this._focusWindow(entry.container);
            return;
        }
        entry.minimized = false;
        playSfx('desktopClick');
        entry.container.setVisible(true);
        this._focusWindow(entry.container);
        this.tweens.add({
            targets: entry.container,
            x: entry.restoreX, y: entry.restoreY,
            scaleX: 1, scaleY: 1,
            duration: 250,
            ease: 'Power2.easeOut',
            onComplete: () => {
                if (entry.onRestore) entry.onRestore();
                this._updateDomOcclusion();
            }
        });
    }

    // Classic grey taskbar button for an open window; click = restore/focus.
    _addTaskbarButton(entry) {
        const btnW = 150, btnH = 28;
        const btn = this.add.container(0, 1046);
        btn.setDepth(5001);

        const bg = this.add.graphics();
        bg.fillStyle(0xc0c0c0, 1);
        bg.fillRect(0, 0, btnW, btnH);
        bg.lineStyle(1.5, 0xffffff, 1);
        bg.lineBetween(0, 0, btnW, 0);
        bg.lineBetween(0, 0, 0, btnH);
        bg.lineStyle(1.5, 0x808080, 1);
        bg.lineBetween(0, btnH, btnW, btnH);
        bg.lineBetween(btnW, 0, btnW, btnH);

        const label = this.add.text(8, 7, entry.title, {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
        });

        btn.add([bg, label]);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, btnW, btnH), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this._restoreWindow(entry));

        entry.taskBtn = btn;
        this._layoutTaskbarButtons();
    }

    _layoutTaskbarButtons() {
        let x = 92; // right of the Start button
        for (const w of this._windows) {
            if (!w.taskBtn) continue;
            w.taskBtn.x = x;
            x += 158;
        }
    }

    // ─── Helper: Clip a text object to a max width with an ellipsis ────────
    _truncateToWidth(textObj, maxWidth) {
        if (textObj.width <= maxWidth) return textObj;
        let s = textObj.text;
        while (s.length > 1 && textObj.width > maxWidth) {
            s = s.slice(0, -1);
            textObj.setText(s + '…');
        }
        return textObj;
    }

    // ─── Helper: Make a window draggable ──────────────────────────────────
    _makeWindowDraggable(windowContainer, dragZone, onDragCallback) {
        this.input.setDraggable(dragZone);
        let sx = 0, sy = 0;
        dragZone.on('dragstart', (pointer) => {
            sx = windowContainer.x - pointer.x;
            sy = windowContainer.y - pointer.y;
            this._focusWindow(windowContainer);
        });
        dragZone.on('drag', (pointer) => {
            windowContainer.x = pointer.x + sx;
            windowContainer.y = pointer.y + sy;
            if (onDragCallback) onDragCallback();
            this._updateDomOcclusion();
        });
    }

    // ─── Helper: Animate window open ──────────────────────────────────────
    _animateWindowOpen(windowContainer, targetX, targetY, onComplete, onUpdateCallback) {
        this.tweens.add({
            targets: windowContainer,
            x: targetX, y: targetY,
            scaleX: 1, scaleY: 1,
            duration: 350,
            ease: 'Power2.easeOut',
            onUpdate: onUpdateCallback,
            onComplete: () => {
                // Windows tween in from a corner — occlusion of DOM overlays
                // must be recomputed at the FINAL position, not registration.
                this._updateDomOcclusion();
                if (onComplete) onComplete();
            }
        });
    }

    // ─── Helper: Animate window close ─────────────────────────────────────
    _animateWindowClose(windowContainer, onComplete, onUpdateCallback) {
        playSfx('desktopClick');
        this.tweens.add({
            targets: windowContainer,
            scaleX: 0, scaleY: 0,
            duration: 250,
            ease: 'Power2.easeIn',
            onUpdate: onUpdateCallback,
            onComplete: () => {
                windowContainer.destroy();
                if (onComplete) onComplete();
            }
        });
    }

    // ─── Helper: XP-style title bar with gradient ─────────────────────────
    _drawXPTitleBar(g, w, h, color1 = 0x0a246a, color2 = 0x3a6ea5) {
        g.fillGradientStyle(color1, color2, color1, color2, 1);
        g.fillRect(0, 0, w, h);
        // Subtle highlight line
        g.lineStyle(1, 0xffffff, 0.15);
        g.lineBetween(0, 1, w, 1);
    }

    // ─── Helper: Classic-style window control buttons (min/max/close) ──────────
    _addXPWindowControls(windowContainer, winWidth, closeCallback) {
        const btnY = 0;
        const btnSize = 30;
        const closeX = winWidth - btnSize;
        const maxX = closeX - btnSize;
        const minX = maxX - btnSize;

        const minBtn = this.add.image(minX, btnY, 'xp_min_btn').setOrigin(0).setInteractive({ useHandCursor: true });
        const maxBtn = this.add.image(maxX, btnY, 'xp_max_btn').setOrigin(0).setInteractive({ useHandCursor: true });
        const closeBtn = this.add.image(closeX, btnY, 'xp_close_btn').setOrigin(0).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', closeCallback);
        closeBtn.on('pointerover', () => closeBtn.setTint(0xff8888));
        closeBtn.on('pointerout', () => closeBtn.clearTint());

        minBtn.on('pointerdown', () => {
            const entry = this._windows.find(w => w.container === windowContainer);
            if (entry) this._minimizeWindow(entry);
            else playSfx('desktopClick');
        });
        minBtn.on('pointerover', () => minBtn.setTint(0xdddddd));
        minBtn.on('pointerout', () => minBtn.clearTint());

        maxBtn.on('pointerdown', () => playSfx('desktopClick'));
        maxBtn.on('pointerover', () => maxBtn.setTint(0xdddddd));
        maxBtn.on('pointerout', () => maxBtn.clearTint());

        windowContainer.add([minBtn, maxBtn, closeBtn]);
        return { minBtn, maxBtn, closeBtn };
    }


    createTaskbar() {
        const taskbar = this.add.graphics();
        // Taskbar background (classic grey)
        taskbar.fillStyle(0xc0c0c0, 1);
        taskbar.fillRect(0, 1040, 1920, 40);
        // 3D top edge: white highlight, then grey shadow
        taskbar.lineStyle(1.5, 0xffffff, 1);
        taskbar.lineBetween(0, 1040, 1920, 1040);
        taskbar.lineStyle(1.5, 0x808080, 1);
        taskbar.lineBetween(0, 1041, 1920, 1041);

        // Start button graphics
        const startBtn = this.add.graphics();
        startBtn.fillStyle(0xc0c0c0, 1);
        startBtn.fillRect(4, 1044, 80, 32);
        // Bevel for Start button: white top/left, dark grey bottom/right
        startBtn.lineStyle(1.5, 0xffffff, 1);
        startBtn.lineBetween(4, 1044, 84, 1044);
        startBtn.lineBetween(4, 1044, 4, 1076);
        startBtn.lineStyle(1.5, 0x808080, 1);
        startBtn.lineBetween(4, 1076, 84, 1076);
        startBtn.lineBetween(84, 1044, 84, 1076);
        
        // Start text
        const startText = this.add.text(32, 1052, 'Start', {
            fontFamily: 'Tahoma, Arial', fontSize: '14px', color: '#000000', fontWeight: 'bold'
        });
        
        // Simple start icon (logo context, or just a small flag)
        const flag = this.add.graphics();
        flag.fillStyle(0xef4444, 1); flag.fillRect(14, 1053, 6, 5);
        flag.fillStyle(0x3b82f6, 1); flag.fillRect(22, 1053, 6, 5);
        flag.fillStyle(0x22c55e, 1); flag.fillRect(14, 1060, 6, 5);
        flag.fillStyle(0xeab308, 1); flag.fillRect(22, 1060, 6, 5);
        
        // Clock tray (inset panel)
        const clockTray = this.add.graphics();
        clockTray.fillStyle(0xc0c0c0, 1);
        clockTray.fillRect(1800, 1044, 116, 32);
        // Inset border: dark grey top/left, white bottom/right
        clockTray.lineStyle(1.5, 0x808080, 1);
        clockTray.lineBetween(1800, 1044, 1916, 1044);
        clockTray.lineBetween(1800, 1044, 1800, 1076);
        clockTray.lineStyle(1.5, 0xffffff, 1);
        clockTray.lineBetween(1800, 1076, 1916, 1076);
        clockTray.lineBetween(1916, 1044, 1916, 1076);
        
        this.clockText = this.add.text(1820, 1053, '', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#000000', fontWeight: 'bold'
        });

        // Taskbar band sits above all draggable windows (which cap at 4999)
        [taskbar, startBtn, startText, flag, clockTray, this.clockText].forEach(el => el.setDepth(5000));

        this.updateClock();
        this.time.addEvent({
            delay: 1000,
            callback: this.updateClock,
            callbackScope: this,
            loop: true
        });
    }

    updateClock() {
        if (!this.clockText) return;
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        this.clockText.setText(`${hours}:${minutes} ${ampm}`);
    }

    createNotification() {
        const briefingRead = localStorage.getItem('oqw-briefing-read') === 'true';
        if (briefingRead) return;

        this.notificationContainer = this.add.container(1600, 1040);
        this.notificationContainer.setDepth(9999);

        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 0.95);
        bg.fillRoundedRect(0, 0, 300, 75, 6);
        bg.lineStyle(2, 0x25d366, 1);
        bg.strokeRoundedRect(0, 0, 300, 75, 6);

        // Make the background click open the chat window directly
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 300, 75), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
            this.openChatWindow();
            this.tweens.add({
                targets: this.notificationContainer,
                y: 1040,
                duration: 300,
                ease: 'Power2.easeIn',
                onComplete: () => this.notificationContainer.destroy()
            });
        });

        const closeX = this.add.text(280, 5, '×', {
            fontFamily: 'Arial', fontSize: '16px', color: '#888888', fontWeight: 'bold'
        }).setInteractive({ useHandCursor: true });
        
        closeX.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            this.tweens.add({
                targets: this.notificationContainer,
                y: 1040,
                duration: 300,
                ease: 'Power2.easeIn',
                onComplete: () => this.notificationContainer.destroy()
            });
        });

        // Green WhatsApp-style circle icon
        const iconBg = this.add.graphics();
        iconBg.fillStyle(0x25d366, 1);
        iconBg.fillCircle(30, 37, 18);
        
        // Phone icon inside circle
        const phoneIcon = this.add.graphics();
        phoneIcon.fillStyle(0xffffff, 1);
        phoneIcon.fillRoundedRect(23, 29, 14, 18, 3);
        phoneIcon.fillStyle(0x25d366, 1);
        phoneIcon.fillRect(26, 32, 8, 10);

        const titleText = this.add.text(60, 12, 'SecureChat', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#25d366', fontWeight: 'bold'
        });

        const msgText = this.add.text(60, 28, 'TOTO: X? You online?\nTap to open chat.', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#333333'
        });

        this.notificationContainer.add([bg, closeX, iconBg, phoneIcon, titleText, msgText]);

        this.time.delayedCall(1500, () => {
            initAudio();
            beep(587.33, 0.15, 'triangle', 0.05);
            this.time.delayedCall(160, () => beep(880, 0.25, 'triangle', 0.05));
            
            this.tweens.add({
                targets: this.notificationContainer,
                y: 955,
                duration: 500,
                ease: 'Cubic.easeOut'
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHAT WINDOW — WhatsApp-style with contacts sidebar
    // ═══════════════════════════════════════════════════════════════════════
    openChatWindow() {
        const existing = this._getWindow('chat');
        if (existing) {
            this._restoreWindow(existing);
            return;
        }
        this.chatWindowOpen = true;

        const totalW = 720;
        const totalH = 540;
        const sidebarW = 240;
        const targetX = (this.scale.width - totalW) / 2;
        const targetY = (this.scale.height - totalH) / 2;

        const windowContainer = this.add.container(this.scale.width / 2, this.scale.height / 2);
        windowContainer.name = 'chat';
        windowContainer.setScale(0);

        // ── Window outer shell ────────────────────────────────────────────
        const outerFrame = this.add.graphics();
        outerFrame.fillStyle(0xf0f0f0, 1);
        outerFrame.fillRect(0, 0, totalW, totalH);
        outerFrame.lineStyle(2, 0x888888, 1);
        outerFrame.strokeRect(0, 0, totalW, totalH);

        // ── Title bar (classic solid navy blue) ───────────────────────────
        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, totalW, titleBarH);
        titleBar.lineStyle(1, 0xffffff, 0.15);
        titleBar.lineBetween(0, 1, totalW, 1);

        // Chat icon in title bar
        const titleIcon = this.add.graphics();
        titleIcon.fillStyle(0x25d366, 1);
        titleIcon.fillRect(7, 7, 18, 18);
        titleIcon.fillStyle(0xffffff, 1);
        titleIcon.fillRect(10, 11, 12, 8);
        titleIcon.fillTriangle(10, 19, 14, 19, 10, 21);

        const titleText = this.add.text(30, 8, 'SecureChat', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });


        // ────────────────────────────────────────────────────────────────
        // LEFT SIDEBAR
        // ────────────────────────────────────────────────────────────────
        const sidebarBg = this.add.graphics();
        sidebarBg.fillStyle(0xfafafa, 1);
        sidebarBg.fillRect(0, titleBarH, sidebarW, totalH - titleBarH);
        sidebarBg.lineStyle(1, 0xe0e0e0, 1);
        sidebarBg.lineBetween(sidebarW, titleBarH, sidebarW, totalH);

        // Sidebar top header (dark green)
        const sidebarHeader = this.add.graphics();
        sidebarHeader.fillStyle(0x075e54, 1);
        sidebarHeader.fillRect(0, titleBarH, sidebarW, 50);

        const chatsLabel = this.add.text(14, titleBarH + 16, 'Chats', {
            fontFamily: 'Segoe UI, Arial', fontSize: '18px', color: '#ffffff', fontWeight: 'bold'
        });

        // Sidebar icons (pencil + 3 dots)
        const sidebarIcons = this.add.graphics();
        sidebarIcons.lineStyle(1.5, 0xb0d8d0, 1);
        sidebarIcons.lineBetween(sidebarW - 52, titleBarH + 18, sidebarW - 44, titleBarH + 24);
        sidebarIcons.lineBetween(sidebarW - 44, titleBarH + 24, sidebarW - 40, titleBarH + 20);
        sidebarIcons.lineBetween(sidebarW - 40, titleBarH + 20, sidebarW - 52, titleBarH + 18);
        sidebarIcons.fillStyle(0xb0d8d0, 1);
        sidebarIcons.fillCircle(sidebarW - 18, titleBarH + 18, 2);
        sidebarIcons.fillCircle(sidebarW - 18, titleBarH + 25, 2);
        sidebarIcons.fillCircle(sidebarW - 18, titleBarH + 32, 2);

        // Search bar
        const searchBg = this.add.graphics();
        searchBg.fillStyle(0xf0f0f0, 1);
        searchBg.fillRoundedRect(8, titleBarH + 56, sidebarW - 16, 28, 6);
        searchBg.lineStyle(1, 0xdddddd, 1);
        searchBg.strokeRoundedRect(8, titleBarH + 56, sidebarW - 16, 28, 6);

        const searchIcon = this.add.graphics();
        searchIcon.lineStyle(1.5, 0x888888, 1);
        searchIcon.strokeCircle(22, titleBarH + 70, 6);
        searchIcon.lineBetween(26, titleBarH + 74, 30, titleBarH + 78);

        const searchHint = this.add.text(36, titleBarH + 62, 'Search or start new chat', {
            fontFamily: 'Segoe UI, Arial', fontSize: '11px', color: '#aaaaaa'
        });

        // Contact rows
        const contacts = [
            { name: 'Archived', preview: '', time: '', badge: 2, isArchived: true, color: 0xcccccc },
            { name: 'Maya Kasuma',    preview: 'Yes! OK',               time: '14:54', badge: 0, color: 0x9b59b6 },
            { name: 'Jason Ballmer',  preview: 'Video',                 time: '15:26', badge: 3, color: 0xe74c3c },
            { name: 'Alice Whitman',  preview: 'Wow! Have great time.', time: '15:12', badge: 0, color: 0x3498db, isActive: true },
            { name: 'Baking Club',    preview: 'Rebecca: @Chris R?',    time: '14:43', badge: 1, color: 0xe67e22 },
            { name: 'Stasa Benko',    preview: 'Aww no problem.',       time: '13:56', badge: 2, color: 0x1abc9c },
            { name: 'Family Foodies', preview: 'Dinner last night!',    time: '11:21', badge: 0, color: 0x2ecc71 },
            // (list is capped at 7 rows — an 8th row used to spill past the
            // 540px window frame: 30 + 92 + 8×54 = 554 > 540.)
        ];

        const contactsContainer = this.add.container(0, 0);
        let contactY = titleBarH + 92;
        const rowH = 54;

        contacts.forEach((c) => {
            const rowBg = this.add.graphics();
            rowBg.fillStyle(c.isActive ? 0xf0f8f0 : 0xfafafa, 1);
            rowBg.fillRect(0, contactY, sidebarW, rowH);
            const divider = this.add.graphics();
            divider.lineStyle(1, 0xeeeeee, 1);
            divider.lineBetween(52, contactY + rowH - 1, sidebarW, contactY + rowH - 1);

            if (c.isArchived) {
                const archIcon = this.add.graphics();
                archIcon.lineStyle(1.5, 0x888888, 1);
                archIcon.strokeRect(14, contactY + 18, 20, 16);
                archIcon.lineBetween(14, contactY + 24, 34, contactY + 24);
                archIcon.lineBetween(21, contactY + 18, 21, contactY + 14);
                archIcon.lineBetween(27, contactY + 18, 27, contactY + 14);
                const archLabel = this.add.text(42, contactY + 18, 'Archived', {
                    fontFamily: 'Segoe UI, Arial', fontSize: '13px', color: '#128c7e', fontWeight: 'bold'
                });
                const archBadge = this.add.graphics();
                archBadge.fillStyle(0x25d366, 1);
                archBadge.fillCircle(sidebarW - 16, contactY + 27, 9);
                const archBadgeText = this.add.text(sidebarW - 16, contactY + 27, `${c.badge}`, {
                    fontFamily: 'Segoe UI, Arial', fontSize: '10px', color: '#ffffff', fontWeight: 'bold'
                }).setOrigin(0.5);
                contactsContainer.add([rowBg, divider, archIcon, archLabel, archBadge, archBadgeText]);
            } else {
                const av = this.add.graphics();
                av.fillStyle(c.color, 1);
                av.fillCircle(22, contactY + rowH / 2, 17);
                av.fillStyle(0xffffff, 1);
                av.fillCircle(22, contactY + rowH / 2 - 5, 6);
                av.beginPath();
                av.arc(22, contactY + rowH / 2 + 12, 10, Math.PI, 0, false);
                av.fillPath();

                // Single-line, ellipsis-clipped so long strings can't wrap out
                // of the fixed 54px row or run under the time/badge column.
                const nameText = this._truncateToWidth(this.add.text(48, contactY + 8, c.name, {
                    fontFamily: 'Segoe UI, Arial', fontSize: '12px', color: '#111111', fontWeight: 'bold'
                }), sidebarW - 48 - 44);
                const previewText = this._truncateToWidth(this.add.text(48, contactY + 28, c.preview, {
                    fontFamily: 'Segoe UI, Arial', fontSize: '10px', color: '#888888'
                }), sidebarW - 48 - 28);
                const timeText = this.add.text(sidebarW - 6, contactY + 10, c.time, {
                    fontFamily: 'Segoe UI, Arial', fontSize: '10px', color: '#888888'
                }).setOrigin(1, 0);

                contactsContainer.add([rowBg, divider, av, nameText, previewText, timeText]);

                if (c.badge > 0) {
                    const badge = this.add.graphics();
                    badge.fillStyle(0x25d366, 1);
                    badge.fillCircle(sidebarW - 14, contactY + 37, 9);
                    const badgeT = this.add.text(sidebarW - 14, contactY + 37, `${c.badge}`, {
                        fontFamily: 'Segoe UI, Arial', fontSize: '10px', color: '#ffffff', fontWeight: 'bold'
                    }).setOrigin(0.5);
                    contactsContainer.add([badge, badgeT]);
                }
            }
            contactY += rowH;
        });

        // ────────────────────────────────────────────────────────────────
        // RIGHT CHAT PANEL
        // ────────────────────────────────────────────────────────────────
        const chatPanelX = sidebarW;
        const chatPanelW = totalW - sidebarW;
        const chatHeaderH = 56;

        const chatHeader = this.add.graphics();
        chatHeader.fillStyle(0x075e54, 1);
        chatHeader.fillRect(chatPanelX, titleBarH, chatPanelW, chatHeaderH);

        const chatAvatar = this.add.graphics();
        chatAvatar.fillStyle(0x3498db, 1);
        chatAvatar.fillCircle(chatPanelX + 30, titleBarH + chatHeaderH / 2, 19);
        chatAvatar.fillStyle(0xffffff, 1);
        chatAvatar.fillCircle(chatPanelX + 30, titleBarH + chatHeaderH / 2 - 5, 7);
        chatAvatar.beginPath();
        chatAvatar.arc(chatPanelX + 30, titleBarH + chatHeaderH / 2 + 13, 11, Math.PI, 0, false);
        chatAvatar.fillPath();

        const chatName = this.add.text(chatPanelX + 58, titleBarH + 12, 'TOTO', {
            fontFamily: 'Segoe UI, Arial', fontSize: '15px', color: '#ffffff', fontWeight: 'bold'
        });
        const chatStatus = this.add.text(chatPanelX + 58, titleBarH + 32, 'online', {
            fontFamily: 'Segoe UI, Arial', fontSize: '11px', color: '#a8d8d0'
        });

        const chatHeaderIcons = this.add.graphics();
        chatHeaderIcons.lineStyle(2, 0xb0d8d0, 1);
        chatHeaderIcons.strokeRect(chatPanelX + chatPanelW - 95, titleBarH + 17, 16, 12);
        chatHeaderIcons.fillStyle(0xb0d8d0, 1);
        chatHeaderIcons.fillTriangle(
            chatPanelX + chatPanelW - 77, titleBarH + 19,
            chatPanelX + chatPanelW - 77, titleBarH + 27,
            chatPanelX + chatPanelW - 71, titleBarH + 23
        );
        chatHeaderIcons.lineStyle(2, 0xb0d8d0, 1);
        chatHeaderIcons.strokeCircle(chatPanelX + chatPanelW - 50, titleBarH + 23, 9);
        chatHeaderIcons.fillStyle(0xb0d8d0, 1);
        chatHeaderIcons.fillCircle(chatPanelX + chatPanelW - 20, titleBarH + 17, 2);
        chatHeaderIcons.fillCircle(chatPanelX + chatPanelW - 20, titleBarH + 24, 2);
        chatHeaderIcons.fillCircle(chatPanelX + chatPanelW - 20, titleBarH + 31, 2);

        // Chat wallpaper
        const chatAreaTop = titleBarH + chatHeaderH;
        const inputBarH = 55;
        const chatAreaH = totalH - chatAreaTop - inputBarH;

        const chatBg = this.add.graphics();
        chatBg.fillStyle(0xe5ddd5, 1);
        chatBg.fillRect(chatPanelX, chatAreaTop, chatPanelW, chatAreaH);
        chatBg.fillStyle(0xd0c9c0, 0.2);
        for (let px = chatPanelX + 15; px < chatPanelX + chatPanelW; px += 36) {
            for (let py = chatAreaTop + 15; py < chatAreaTop + chatAreaH; py += 36) {
                if (((px * 11 + py * 7) % 3) === 0) chatBg.fillCircle(px, py, 2);
            }
        }

        // Input bar
        const inputBarY = totalH - inputBarH;
        const inputBarBg = this.add.graphics();
        inputBarBg.fillStyle(0xf0f0f0, 1);
        inputBarBg.fillRect(chatPanelX, inputBarY, chatPanelW, inputBarH);
        inputBarBg.lineStyle(1, 0xdddddd, 1);
        inputBarBg.lineBetween(chatPanelX, inputBarY, chatPanelX + chatPanelW, inputBarY);

        const emojiIcon = this.add.graphics();
        emojiIcon.lineStyle(1.5, 0x888888, 1);
        emojiIcon.strokeCircle(chatPanelX + 22, inputBarY + 27, 12);
        emojiIcon.fillStyle(0x888888, 1);
        emojiIcon.fillCircle(chatPanelX + 17, inputBarY + 24, 2);
        emojiIcon.fillCircle(chatPanelX + 27, inputBarY + 24, 2);
        emojiIcon.beginPath();
        emojiIcon.arc(chatPanelX + 22, inputBarY + 28, 7, 0.3, Math.PI - 0.3);
        emojiIcon.strokePath();

        const clipIcon = this.add.graphics();
        clipIcon.lineStyle(2, 0x888888, 1);
        clipIcon.beginPath();
        clipIcon.arc(chatPanelX + 52, inputBarY + 22, 6, -Math.PI * 0.5, Math.PI * 0.5);
        clipIcon.lineTo(chatPanelX + 49, inputBarY + 28);
        clipIcon.arc(chatPanelX + 49, inputBarY + 22, 6, Math.PI * 0.5, -Math.PI * 0.5);
        clipIcon.strokePath();

        const inputFieldBg = this.add.graphics();
        inputFieldBg.fillStyle(0xffffff, 1);
        inputFieldBg.fillRoundedRect(chatPanelX + 68, inputBarY + 8, chatPanelW - 118, 38, 20);
        inputFieldBg.lineStyle(1, 0xcccccc, 0.5);
        inputFieldBg.strokeRoundedRect(chatPanelX + 68, inputBarY + 8, chatPanelW - 118, 38, 20);

        const inputText = this.add.text(chatPanelX + 88, inputBarY + 18, '', {
            fontFamily: 'Segoe UI, Arial', fontSize: '13px', color: '#333333',
            wordWrap: { width: chatPanelW - 150 }
        });

        const sendBtnCx = chatPanelX + chatPanelW - 26;
        const sendBtnCy = inputBarY + 27;
        const sendBtnBg = this.add.graphics();
        sendBtnBg.fillStyle(0x00a884, 1);
        sendBtnBg.fillCircle(sendBtnCx, sendBtnCy, 20);
        sendBtnBg.fillStyle(0xffffff, 1);
        sendBtnBg.beginPath();
        sendBtnBg.moveTo(sendBtnCx - 9, sendBtnCy - 7);
        sendBtnBg.lineTo(sendBtnCx + 9, sendBtnCy);
        sendBtnBg.lineTo(sendBtnCx - 9, sendBtnCy + 7);
        sendBtnBg.lineTo(sendBtnCx - 5, sendBtnCy);
        sendBtnBg.closePath();
        sendBtnBg.fillPath();

        const sendBtnZone = this.add.zone(sendBtnCx - 20, sendBtnCy - 20, 40, 40).setOrigin(0).setInteractive({ useHandCursor: true });

        this.chatInputText = inputText;
        this.chatSendBtnBg = sendBtnBg;
        this.chatSendBtnZone = sendBtnZone;

        // ── Message pane (DOM overlay) ────────────────────────────────────
        // This Phaser 4 build has no working masks (setMask is a silent
        // no-op, verified in-browser), so the scrolling bubble list is a DOM
        // element clipped and scrolled natively by CSS — same pattern as the
        // notepad textarea. Native wheel handling also means scroll can never
        // bleed into other windows.
        const pane = document.createElement('div');
        pane.className = 'chat-bubble-pane';
        pane.style.display = 'none';
        (document.getElementById('game') || document.body).appendChild(pane);
        this.chatPane = pane;
        // Clicking the message list should focus the window like any other part of it
        pane.addEventListener('pointerdown', () => this._focusWindow(windowContainer));

        const escapeHtml = (s) => s.replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));

        // Keep the pane glued to the chat area of the (draggable) window,
        // converting canvas coordinates to page pixels.
        const positionPane = () => {
            const canvas = this.sys.game.canvas;
            const sx = (canvas.clientWidth || this.scale.width) / this.scale.width;
            const sy = (canvas.clientHeight || this.scale.height) / this.scale.height;
            const left = (canvas.offsetLeft || 0) + (windowContainer.x + chatPanelX) * sx;
            const top = (canvas.offsetTop || 0) + (windowContainer.y + chatAreaTop) * sy;
            pane.style.left = `${left}px`;
            pane.style.top = `${top}px`;
            pane.style.width = `${chatPanelW * sx}px`;
            pane.style.height = `${chatAreaH * sy}px`;
            pane.style.fontSize = `${Math.max(9, Math.round(13 * sy))}px`;
        };
        this.chatPositionPane = positionPane;

        this.chatTyping = false;

        const renderBubbles = () => {
            const now = new Date();
            const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
            let html = '';
            this.chatHistory.forEach(msg => {
                const isToto = msg.sender === 'Toto';
                const ticks = isToto ? '' : ' <span class="ticks">✓✓</span>';
                html += `<div class="chat-bubble-row ${isToto ? 'from-toto' : 'from-you'}">` +
                    `<div class="chat-bubble">${escapeHtml(msg.text)}` +
                    `<span class="meta">${timeStr}${ticks}</span></div></div>`;
            });
            if (this.chatTyping) {
                html += '<div class="chat-typing">Toto is typing...</div>';
            }
            pane.innerHTML = html;
            pane.scrollTop = pane.scrollHeight; // keep latest message in view
        };

        this.chatRenderBubbles = renderBubbles;

        renderBubbles();
        if (this.currentChatStep < this.chatSteps.length) {
            inputText.setText(this.chatSteps[this.currentChatStep].reply);
            inputText.setColor('#333333');
            sendBtnZone.setInteractive();
            sendBtnBg.setAlpha(1);
        } else {
            inputText.setColor('#aaaaaa');
            inputText.setText(this._chatIdleHint());
            sendBtnZone.disableInteractive();
            sendBtnBg.setAlpha(0.5);
        }

        sendBtnZone.on('pointerdown', () => {
            if (this.currentChatStep >= this.chatSteps.length) return;
            const stepData = this.chatSteps[this.currentChatStep];
            playSfx('desktopClick');
            beep(800, 0.08, 'sine', 0.05);
            this.chatHistory.push({ sender: 'You', text: stepData.reply });
            renderBubbles();
            sendBtnZone.disableInteractive();
            sendBtnBg.setAlpha(0.5);
            inputText.setText('');
            this.currentChatStep++;
            if (stepData.response) {
                this.time.delayedCall(500, () => { this.chatTyping = true; renderBubbles(); });
                this.time.delayedCall(1400, () => {
                    this.chatTyping = false;
                    this.chatHistory.push({ sender: 'Toto', text: stepData.response });
                    renderBubbles();
                    beep(500, 0.12, 'triangle', 0.04);
                    if (this.currentChatStep < this.chatSteps.length) {
                        inputText.setText(this.chatSteps[this.currentChatStep].reply);
                        sendBtnZone.setInteractive();
                        sendBtnBg.setAlpha(1);
                    } else {
                        this._onChatStepsComplete(inputText);
                    }
                });
            } else {
                this._onChatStepsComplete(inputText);
            }
        });

        windowContainer.add([
            outerFrame, titleBar, titleIcon, titleText,
            sidebarBg, sidebarHeader, chatsLabel, sidebarIcons,
            searchBg, searchIcon, searchHint, contactsContainer,
            chatHeader, chatAvatar, chatName, chatStatus, chatHeaderIcons,
            chatBg,
            inputBarBg, emojiIcon, clipIcon, inputFieldBg, inputText, sendBtnBg, sendBtnZone
        ]);

        const removePane = () => {
            pane.remove();
            this.chatPane = null;
            this.chatPositionPane = null;
        };

        this._addXPWindowControls(windowContainer, totalW, () => {
            this._unregisterWindow(windowContainer);
            removePane();
            this._animateWindowClose(windowContainer, () => {
                this.chatWindowOpen = false;
                this.chatRenderBubbles = null;
                this.chatInputText = null;
                this.chatSendBtnBg = null;
                this.chatSendBtnZone = null;
            });
        });

        this._registerWindow({
            name: 'chat', title: 'SecureChat',
            container: windowContainer, w: totalW, h: totalH,
            domEl: pane,
            domRect: { x: chatPanelX, y: chatAreaTop, w: chatPanelW, h: chatAreaH },
            // The DOM pane can't scale with the Phaser minimize tween — hide
            // it during the animation and re-sync when restored.
            onMinimize: () => { pane.style.display = 'none'; },
            onRestore: () => { positionPane(); pane.style.display = 'block'; }
        });

        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, totalW - 90, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar, positionPane);

        outerFrame.setInteractive(new Phaser.Geom.Rectangle(0, 0, totalW, totalH), Phaser.Geom.Rectangle.Contains);
        outerFrame.on('pointerdown', () => this._focusWindow(windowContainer));

        this._animateWindowOpen(windowContainer, targetX, targetY, () => {
            positionPane();
            pane.style.display = 'block';
            renderBubbles();
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILE EXPLORER WINDOW — Windows XP style
    // ═══════════════════════════════════════════════════════════════════════
    openBriefingFolderWindow(isBonus = false) {
        const winName = isBonus ? 'bonus_folder_explorer' : 'folder_explorer';
        const existing = this._getWindow(winName);
        if (existing) {
            this._restoreWindow(existing);
            return;
        }

        const winWidth = 560;
        const winHeight = 380;
        const targetX = (this.scale.width - winWidth) / 2;
        const targetY = (this.scale.height - winHeight) / 2;

        const windowContainer = this.add.container(60, 60);
        windowContainer.name = winName;
        windowContainer.setScale(0);

        // ── Window outer border ───────────────────────────────────────────
        const outerBorder = this.add.graphics();
        outerBorder.lineStyle(2, 0x888888, 1);
        outerBorder.strokeRect(0, 0, winWidth, winHeight);

        // ── Title bar (classic solid navy blue) ───────────────────────────
        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, winWidth, titleBarH);
        titleBar.lineStyle(1, 0xffffff, 0.15);
        titleBar.lineBetween(0, 1, winWidth, 1);

        // Folder icon in title bar
        const titleFolderIcon = this.add.graphics();
        titleFolderIcon.fillStyle(0xd9a756, 1);
        titleFolderIcon.fillRect(6, 6, 10, 5);
        titleFolderIcon.fillRect(4, 10, 16, 12);

        const titleText = this.add.text(26, 7, isBonus ? 'Bonus Content' : 'Briefing', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });


        // ── Menu bar ──────────────────────────────────────────────────────
        const menuBarY = titleBarH;
        const menuBar = this.add.graphics();
        menuBar.fillStyle(0xf0f0f0, 1);
        menuBar.fillRect(0, menuBarY, winWidth, 22);

        const menuItems = ['File', 'Edit', 'View', 'Favorites', 'Tools', 'Help'];
        let menuX = 8;
        menuItems.forEach(item => {
            const mt = this.add.text(menuX, menuBarY + 3, item, {
                fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
            });
            windowContainer.add(mt);
            menuX += mt.width + 14;
        });

        // ── Toolbar ───────────────────────────────────────────────────────
        const toolbarY = menuBarY + 22;
        const toolbar = this.add.graphics();
        toolbar.fillStyle(0xf5f5f5, 1);
        toolbar.fillRect(0, toolbarY, winWidth, 30);
        toolbar.lineStyle(1, 0xd4d4d4, 1);
        toolbar.lineBetween(0, toolbarY + 30, winWidth, toolbarY + 30);

        // Back button
        const backArrow = this.add.graphics();
        backArrow.fillStyle(0x3b8e3b, 1);
        backArrow.fillCircle(20, toolbarY + 15, 10);
        backArrow.fillStyle(0xffffff, 1);
        backArrow.fillTriangle(16, toolbarY + 15, 24, toolbarY + 10, 24, toolbarY + 20);

        const backLabel = this.add.text(35, toolbarY + 8, 'Back', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
        });

        // Forward (greyed out)
        const fwdArrow = this.add.graphics();
        fwdArrow.fillStyle(0xaaaaaa, 0.5);
        fwdArrow.fillCircle(85, toolbarY + 15, 10);
        fwdArrow.fillStyle(0xffffff, 0.5);
        fwdArrow.fillTriangle(89, toolbarY + 15, 81, toolbarY + 10, 81, toolbarY + 20);

        // Search icon
        const searchIcon = this.add.graphics();
        searchIcon.lineStyle(2, 0x888888, 1);
        searchIcon.strokeCircle(160, toolbarY + 13, 6);
        searchIcon.lineBetween(164, toolbarY + 17, 170, toolbarY + 23);
        const searchLabel = this.add.text(175, toolbarY + 8, 'Search', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#555555'
        });

        // Folders icon
        const foldersIcon = this.add.graphics();
        foldersIcon.fillStyle(0xd9a756, 1);
        foldersIcon.fillRoundedRect(225, toolbarY + 6, 14, 8, 1);
        foldersIcon.fillRoundedRect(223, toolbarY + 12, 18, 12, 2);
        const foldersLabel = this.add.text(245, toolbarY + 8, 'Folders', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#555555'
        });

        // ── Address bar ───────────────────────────────────────────────────
        const addressBarY = toolbarY + 30;
        const addressBar = this.add.graphics();
        addressBar.fillStyle(0xf5f5f5, 1);
        addressBar.fillRect(0, addressBarY, winWidth, 24);
        addressBar.lineStyle(1, 0xd4d4d4, 1);
        addressBar.lineBetween(0, addressBarY + 24, winWidth, addressBarY + 24);

        const addressLabel = this.add.text(8, addressBarY + 4, 'Address', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000', fontWeight: 'bold'
        });

        const addressFieldBg = this.add.graphics();
        addressFieldBg.fillStyle(0xffffff, 1);
        addressFieldBg.fillRect(60, addressBarY + 2, winWidth - 120, 20);
        addressFieldBg.lineStyle(1, 0x7f9db9, 1);
        addressFieldBg.strokeRect(60, addressBarY + 2, winWidth - 120, 20);

        // Folder icon in address bar
        const addrFolderIcon = this.add.graphics();
        addrFolderIcon.fillStyle(0xd9a756, 1);
        addrFolderIcon.fillRoundedRect(65, addressBarY + 5, 8, 4, 1);
        addrFolderIcon.fillRoundedRect(64, addressBarY + 8, 12, 9, 1);

        const addressPath = this.add.text(82, addressBarY + 4, isBonus ? 'C:\\Documents\\Bonus Content' : 'C:\\Documents\\Briefing', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
        });

        const goBtn = this.add.text(winWidth - 50, addressBarY + 4, 'Go', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8', fontWeight: 'bold'
        });

        // ── Content area ──────────────────────────────────────────────────
        const contentY = addressBarY + 24;
        const contentH = winHeight - contentY;
        const sidebarW = 150;

        // Left sidebar
        const sidebar = this.add.graphics();
        sidebar.fillGradientStyle(0xdde8f6, 0xdde8f6, 0xbdd2ea, 0xbdd2ea, 1);
        sidebar.fillRect(0, contentY, sidebarW, contentH);
        sidebar.lineStyle(1, 0xb0c4de, 1);
        sidebar.lineBetween(sidebarW, contentY, sidebarW, winHeight);

        // Sidebar headers & items
        const sidebarTitle1 = this.add.text(12, contentY + 10, 'File Tasks', {
            fontFamily: 'Tahoma, Arial', fontSize: '12px', color: '#215dc6', fontWeight: 'bold'
        });
        const sidebarItem1 = this.add.text(18, contentY + 32, 'Open file', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });
        const sidebarItem2 = this.add.text(18, contentY + 50, 'Move file', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });
        const sidebarItem3 = this.add.text(18, contentY + 68, 'Copy file', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });

        // Separator
        const sep = this.add.graphics();
        sep.lineStyle(1, 0xb0c4de, 1);
        sep.lineBetween(10, contentY + 90, sidebarW - 10, contentY + 90);

        const sidebarTitle2 = this.add.text(12, contentY + 100, 'Other Places', {
            fontFamily: 'Tahoma, Arial', fontSize: '12px', color: '#215dc6', fontWeight: 'bold'
        });
        const sidebarItem4 = this.add.text(18, contentY + 122, 'My Documents', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });
        const sidebarItem5 = this.add.text(18, contentY + 140, 'My Computer', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });
        const sidebarItem6 = this.add.text(18, contentY + 158, 'Desktop', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#1c5fa8'
        });

        // Right content panel (white)
        const mainContent = this.add.graphics();
        mainContent.fillStyle(0xffffff, 1);
        mainContent.fillRect(sidebarW, contentY, winWidth - sidebarW, contentH);

        // Status bar at bottom
        const statusBar = this.add.graphics();
        statusBar.fillStyle(0xf0f0f0, 1);
        statusBar.fillRect(0, winHeight - 22, winWidth, 22);
        statusBar.lineStyle(1, 0xd4d4d4, 1);
        statusBar.lineBetween(0, winHeight - 22, winWidth, winHeight - 22);

        const statusText = this.add.text(8, winHeight - 18, isBonus ? '1 object' : (this.runnerCleared ? '2 objects' : '1 object'), {
            fontFamily: 'Tahoma, Arial', fontSize: '10px', color: '#000000'
        });

        // ── File icon: brief.doc / Do not Open.doc ────────────────────────
        const fileX = sidebarW + 60;
        const fileY = contentY + 50;
        const fileIcon = this.add.image(fileX, fileY, 'doc_icon').setInteractive({ useHandCursor: true });
        const fileLabel = this.add.text(fileX, fileY + 45, isBonus ? 'Do not Open.doc' : 'brief.doc', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
        }).setOrigin(0.5);

        // Double-click to open
        let lastTime = 0;
        fileIcon.on('pointerdown', () => {
            playSfx('desktopClick');
            let clickDelay = this.time.now - lastTime;
            lastTime = this.time.now;
            if (clickDelay < 350) {
                this.openBriefingWindow(windowContainer.x + 50, windowContainer.y + 50, isBonus);
            }
        });

        // Selection highlight on hover
        fileIcon.on('pointerover', () => {
            fileIcon.setTint(0xaaccee);
            fileLabel.setBackgroundColor('#316ac5');
            fileLabel.setColor('#ffffff');
        });
        fileIcon.on('pointerout', () => {
            fileIcon.clearTint();
            fileLabel.setBackgroundColor(null);
            fileLabel.setColor('#000000');
        });

        // ── Second file: intel_02 (appears after the runner is beaten) ────
        // Encrypted until the decryption minigame is solved; decrypted opens
        // the intel viewer directly.
        const intelParts = [];
        if (this.runnerCleared && !isBonus) {
            const fX = fileX + 110;
            const intelIcon = this.add.image(fX, fileY, 'doc_icon').setInteractive({ useHandCursor: true });
            const intelLabel = this.add.text(fX, fileY + 45, this.decrypted ? 'intel_02.txt' : 'intel_02.enc', {
                fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
            }).setOrigin(0.5);
            intelParts.push(intelIcon, intelLabel);

            if (!this.decrypted) {
                intelIcon.setTint(0x99bb99);
                // Padlock overlay for the encrypted state
                const lock = this.add.graphics();
                lock.fillStyle(0xf4d35e, 1);
                lock.fillRoundedRect(fX + 4, fileY + 8, 16, 12, 2);
                lock.lineStyle(2.5, 0x8a6d1a, 1);
                lock.strokeRoundedRect(fX + 4, fileY + 8, 16, 12, 2);
                lock.beginPath();
                lock.arc(fX + 12, fileY + 8, 5, Math.PI, 0, false);
                lock.strokePath();
                intelParts.push(lock);
            }

            let intelLast = 0;
            intelIcon.on('pointerdown', () => {
                playSfx('desktopClick');
                const delay = this.time.now - intelLast;
                intelLast = this.time.now;
                if (delay < 350) {
                    if (this.decrypted) this.openIntelViewer(windowContainer.x + 70, windowContainer.y + 70);
                    else this.openDecryptMinigame(windowContainer.x + 70, windowContainer.y + 70);
                }
            });
            intelIcon.on('pointerover', () => {
                intelIcon.setTint(0xaaccee);
                intelLabel.setBackgroundColor('#316ac5');
                intelLabel.setColor('#ffffff');
            });
            intelIcon.on('pointerout', () => {
                if (this.decrypted) intelIcon.clearTint(); else intelIcon.setTint(0x99bb99);
                intelLabel.setBackgroundColor(null);
                intelLabel.setColor('#000000');
            });
        }

        // ── Assemble window ───────────────────────────────────────────────
        windowContainer.add([
            outerBorder, titleBar, titleFolderIcon, titleText,
            menuBar, toolbar, backArrow, backLabel, fwdArrow,
            searchIcon, searchLabel, foldersIcon, foldersLabel,
            addressBar, addressLabel, addressFieldBg, addrFolderIcon, addressPath, goBtn,
            sidebar, sidebarTitle1, sidebarItem1, sidebarItem2, sidebarItem3,
            sep, sidebarTitle2, sidebarItem4, sidebarItem5, sidebarItem6,
            mainContent, statusBar, statusText, fileIcon, fileLabel,
            ...intelParts
        ]);

        this._addXPWindowControls(windowContainer, winWidth, () => {
            this._unregisterWindow(windowContainer);
            this._animateWindowClose(windowContainer);
        });

        this._registerWindow({
            name: winName, title: isBonus ? 'Bonus Content' : 'Briefing',
            container: windowContainer, w: winWidth, h: winHeight
        });

        // Dragging
        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 90, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar);

        // Bring to front
        outerBorder.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        outerBorder.on('pointerdown', () => this._focusWindow(windowContainer));

        this._animateWindowOpen(windowContainer, targetX, targetY);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BRIEFING DOCUMENT VIEWER (Dossier slides + puzzle)
    // ═══════════════════════════════════════════════════════════════════════
    openBriefingWindow(startX = 60, startY = 60, isBonus = false) {
        const winName = isBonus ? 'bonus_doc' : 'brief';
        const existing = this._getWindow(winName);
        if (existing) {
            this._restoreWindow(existing);
            return;
        }

        // Sized up from 540×500 — the dossier pages were rendering small and
        // blurry. The bigger fit box keeps far more of the source resolution.
        const winWidth = 860;
        const winHeight = 820;
        const targetX = (this.scale.width - winWidth) / 2;
        const targetY = (this.scale.height - winHeight) / 2;

        const windowContainer = this.add.container(startX, startY);
        windowContainer.name = winName;
        windowContainer.setScale(0);

        const bg = this.add.graphics();
        bg.fillStyle(0xdfd3c3, 1); // Manila dossier background
        bg.fillRect(0, 0, winWidth, winHeight);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRect(0, 0, winWidth, winHeight);

        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, winWidth, titleBarH);
        titleBar.lineStyle(1, 0xffffff, 0.15);
        titleBar.lineBetween(0, 1, winWidth, 1);

        const titleText = this.add.text(10, 7, isBonus ? 'Do not Open.doc - File Viewer' : 'Briefing.doc - File Viewer', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });

        const closeBtn = this.add.image(winWidth - 30, 0, 'xp_close_btn').setOrigin(0).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setTint(0xff8888));
        closeBtn.on('pointerout', () => closeBtn.clearTint());

        const slideContainer = this.add.container(0, 30);
        let currentSlide = 0;
        const totalSlides = isBonus ? 5 : 2;   // the briefing dossier is two pages, bonus is five
        const slides = [];

        // Create a slide container for each briefing/bonus image
        for (let i = 1; i <= totalSlides; i++) {
            const slide = this.add.container(0, 0);
            const imgKey = isBonus ? `bonus_img_${i}` : `briefing_img_${i}`;
            const img = this.add.image(winWidth / 2, 360, imgKey);
            // Fit image in a much larger box so the page text stays readable
            const scale = Math.min((winWidth - 50) / img.width, 680 / img.height, 1);
            img.setScale(scale);

            slide.add(img);
            slide.setVisible(i === 1);
            slideContainer.add(slide);
            slides.push(slide);
        }

        // Next Button
        const nextBtnBg = this.add.graphics();
        nextBtnBg.fillStyle(0xc0c0c0, 1);
        nextBtnBg.fillRect(winWidth - 110, winHeight - 45, 90, 30);
        nextBtnBg.lineStyle(1.5, 0xffffff, 1);
        nextBtnBg.lineBetween(winWidth - 110, winHeight - 45, winWidth - 20, winHeight - 45);
        nextBtnBg.lineBetween(winWidth - 110, winHeight - 45, winWidth - 110, winHeight - 15);
        nextBtnBg.lineStyle(1.5, 0x808080, 1);
        nextBtnBg.lineBetween(winWidth - 110, winHeight - 15, winWidth - 20, winHeight - 15);
        nextBtnBg.lineBetween(winWidth - 20, winHeight - 45, winWidth - 20, winHeight - 15);

        const nextBtnText = this.add.text(winWidth - 65, winHeight - 38, 'NEXT >', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000', fontWeight: 'bold'
        }).setOrigin(0.5);

        const nextBtnZone = this.add.zone(winWidth - 110, winHeight - 45, 90, 30).setOrigin(0).setInteractive({ useHandCursor: true });

        // Prev Button
        const prevBtnBg = this.add.graphics();
        prevBtnBg.fillStyle(0xc0c0c0, 1);
        prevBtnBg.fillRect(20, winHeight - 45, 80, 30);
        prevBtnBg.lineStyle(1.5, 0xffffff, 1);
        prevBtnBg.lineBetween(20, winHeight - 45, 100, winHeight - 45);
        prevBtnBg.lineBetween(20, winHeight - 45, 20, winHeight - 15);
        prevBtnBg.lineStyle(1.5, 0x808080, 1);
        prevBtnBg.lineBetween(20, winHeight - 15, 100, winHeight - 15);
        prevBtnBg.lineBetween(100, winHeight - 45, 100, winHeight - 15);

        const prevBtnText = this.add.text(60, winHeight - 38, '< PREV', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000', fontWeight: 'bold'
        }).setOrigin(0.5);

        const prevBtnZone = this.add.zone(20, winHeight - 45, 80, 30).setOrigin(0).setInteractive({ useHandCursor: true });

        prevBtnBg.setVisible(false);
        prevBtnText.setVisible(false);
        prevBtnZone.disableInteractive();

        const updateNavigation = () => {
            for (let i = 0; i < totalSlides; i++) {
                slides[i].setVisible(currentSlide === i);
            }

            prevBtnBg.setVisible(currentSlide > 0);
            prevBtnText.setVisible(currentSlide > 0);
            if (currentSlide > 0) prevBtnZone.setInteractive(); else prevBtnZone.disableInteractive();

            if (currentSlide === totalSlides - 1) {
                nextBtnText.setText('FINISH');
            } else {
                nextBtnText.setText('NEXT >');
            }
        };

        updateNavigation();

        nextBtnZone.on('pointerdown', () => {
            if (currentSlide < totalSlides - 1) {
                playSfx('desktopClick');
                currentSlide++;
                updateNavigation();
            } else {
                playSfx('desktopClick');
                this._unregisterWindow(windowContainer);
                this._animateWindowClose(windowContainer);
                if (!isBonus) {
                    this.triggerPostBriefingChatSequence();
                }
            }
        });

        prevBtnZone.on('pointerdown', () => {
            if (currentSlide > 0) {
                playSfx('desktopClick');
                currentSlide--;
                updateNavigation();
            }
        });

        windowContainer.add([bg, titleBar, titleText, closeBtn, slideContainer, nextBtnBg, nextBtnText, nextBtnZone, prevBtnBg, prevBtnText, prevBtnZone]);

        this._registerWindow({
            name: winName, title: isBonus ? 'Do not Open.doc' : 'Briefing.doc',
            container: windowContainer, w: winWidth, h: winHeight
        });

        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 40, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar);

        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this._focusWindow(windowContainer));

        closeBtn.on('pointerdown', () => {
            this._unregisterWindow(windowContainer);
            this._animateWindowClose(windowContainer);
        });

        this._animateWindowOpen(windowContainer, targetX, targetY);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DECRYPTION MINIGAME — GTA-style vertical column decryptor.
    // 8 columns of scrolling letters on a green CRT terminal. Time SPACE /
    // ENTER so each column's RED letter sits in the target zone; lock all 8
    // to spell DATABASE. A miss buzzes and resets the run. Solving it
    // decrypts intel_02 and advances the story (Phase 3).
    // ═══════════════════════════════════════════════════════════════════════
    openDecryptMinigame(startX = 80, startY = 80) {
        const existing = this._getWindow('decrypt');
        if (existing) {
            this._restoreWindow(existing);
            return;
        }

        const WORD = 'DATABASE';
        const COLS = WORD.length;
        const ROWS = 8;                       // letters per column strip
        const ROW_H = 40;
        const COL_W = 56;
        const termX = 26, termY = 78;
        const termW = COLS * COL_W + 28;      // CRT screen area
        const termH = 330;
        const centerY = termY + termH / 2;    // the horizontal target zone
        const winWidth = termW + termX * 2;
        const winHeight = termY + termH + 70;
        const targetX = (this.scale.width - winWidth) / 2;
        const targetY = (this.scale.height - winHeight) / 2;

        const windowContainer = this.add.container(startX, startY);
        windowContainer.name = 'decrypt';
        windowContainer.setScale(0);

        const bg = this.add.graphics();
        bg.fillStyle(0x0c0c0e, 1);
        bg.fillRect(0, 0, winWidth, winHeight);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRect(0, 0, winWidth, winHeight);

        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, winWidth, titleBarH);
        const titleText = this.add.text(10, 7, 'DECRYPT.EXE — intel_02.enc', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });

        const hintText = this.add.text(winWidth / 2, titleBarH + 24,
            'SPACE / ENTER when the RED letter crosses the target zone', {
            fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#7ad0eb', resolution: 2
        }).setOrigin(0.5);

        // ── CRT screen: dark green glass + scanlines + target zone band ──
        const crt = this.add.graphics();
        crt.fillStyle(0x041207, 1);
        crt.fillRect(termX, termY, termW, termH);
        crt.lineStyle(2, 0x1d5c31, 1);
        crt.strokeRect(termX, termY, termW, termH);
        for (let sy = termY + 4; sy < termY + termH; sy += 6) {
            crt.lineStyle(1, 0x000000, 0.28);
            crt.lineBetween(termX + 1, sy, termX + termW - 1, sy);
        }
        // target zone bar across the middle
        const zone = this.add.graphics();
        zone.fillStyle(0x2ca55c, 0.16);
        zone.fillRect(termX + 2, centerY - ROW_H / 2, termW - 4, ROW_H);
        zone.lineStyle(1.5, 0x39d97a, 0.85);
        zone.lineBetween(termX + 2, centerY - ROW_H / 2, termX + termW - 2, centerY - ROW_H / 2);
        zone.lineBetween(termX + 2, centerY + ROW_H / 2, termX + termW - 2, centerY + ROW_H / 2);

        const statusLine = this.add.text(winWidth / 2, termY + termH + 22,
            'SEQUENCE KEY: 8 CHARACTERS  ·  COLUMN 1 OF 8', {
            fontFamily: 'Consolas, monospace', fontSize: '11px', color: '#9a9a9a', resolution: 2
        }).setOrigin(0.5);

        // ── Columns ──────────────────────────────────────────────────────
        const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const colXOf = (c) => termX + 14 + c * COL_W + COL_W / 2;
        const stripH = ROWS * ROW_H;
        const cols = [];
        for (let c = 0; c < COLS; c++) {
            const letters = [];
            const targetRow = Math.floor(Math.random() * ROWS);
            for (let r = 0; r < ROWS; r++) {
                const isTarget = r === targetRow;
                let ch = WORD[c];
                if (!isTarget) {
                    do { ch = ALPHA[Math.floor(Math.random() * 26)]; } while (ch === WORD[c]);
                }
                const t = this.add.text(colXOf(c), 0, ch, {
                    fontFamily: 'Consolas, monospace', fontSize: '24px', resolution: 2,
                    color: isTarget ? '#ff5555' : '#39d97a', fontWeight: 'bold',
                }).setOrigin(0.5);
                t.isTarget = isTarget;
                t.rowOffset = r * ROW_H + Math.random() * 2;
                letters.push(t);
            }
            cols.push({
                letters,
                scroll: Math.random() * stripH,
                speed: 95 + c * 7 + Math.random() * 25,   // each column drifts differently
                locked: false,
            });
        }

        // active-column bracket
        const bracket = this.add.graphics();

        let active = 0;
        let solved = false;
        let closed = false;

        const drawBracket = () => {
            bracket.clear();
            if (solved || active >= COLS) return;
            const x = colXOf(active);
            bracket.lineStyle(2.5, 0xf4d35e, 1);
            const hw = COL_W / 2 - 6, hh = ROW_H / 2 + 4;
            bracket.beginPath();
            bracket.moveTo(x - hw + 8, centerY - hh); bracket.lineTo(x - hw, centerY - hh); bracket.lineTo(x - hw, centerY + hh); bracket.lineTo(x - hw + 8, centerY + hh);
            bracket.moveTo(x + hw - 8, centerY - hh); bracket.lineTo(x + hw, centerY - hh); bracket.lineTo(x + hw, centerY + hh); bracket.lineTo(x + hw - 8, centerY + hh);
            bracket.strokePath();
        };
        drawBracket();

        // per-frame: scroll the strips; letters fade toward the screen edges
        const tick = (_t, dms) => {
            if (closed) return;
            const dt = Math.min(0.05, dms / 1000);
            for (const col of cols) {
                if (!col.locked) col.scroll = (col.scroll + col.speed * dt) % stripH;
                for (const l of col.letters) {
                    let y = ((l.rowOffset + col.scroll) % stripH) - ROW_H;
                    l.y = termY + y;
                    const edge = Math.min(l.y - termY, termY + termH - l.y);
                    const inZone = Math.abs(l.y - centerY) < ROW_H / 2;
                    l.setAlpha(edge < 0 ? 0 : Math.min(1, edge / 70) * (col.locked && !l.isTarget ? 0.12 : 1));
                    if (!col.locked && l.isTarget) l.setScale(inZone ? 1.15 : 1);
                }
            }
        };
        this.events.on(Phaser.Scenes.Events.UPDATE, tick);

        // full reset after a miss — all locked columns unlock and re-scroll
        const resetRun = () => {
            beep(85, 0.32, 'sawtooth', 0.13);
            this.cameras.main.shake(120, 0.002);
            for (const col of cols) {
                col.locked = false;
                col.speed = 95 + Math.random() * 45;
                for (const l of col.letters) l.setColor(l.isTarget ? '#ff5555' : '#39d97a');
            }
            active = 0;
            statusLine.setText('SIGNAL LOST — SEQUENCE RESET  ·  COLUMN 1 OF 8');
            statusLine.setColor('#ff5555');
            this.time.delayedCall(700, () => { if (!closed && !solved) { statusLine.setColor('#9a9a9a'); statusLine.setText('SEQUENCE KEY: 8 CHARACTERS  ·  COLUMN 1 OF 8'); } });
            drawBracket();
        };

        const tryLock = () => {
            if (solved || closed) return;
            const col = cols[active];
            const target = col.letters.find(l => l.isTarget);
            if (Math.abs(target.y - centerY) < ROW_H * 0.5) {
                // MATCH — snap, lock, advance
                col.locked = true;
                col.scroll = (stripH + centerY - termY - target.rowOffset + ROW_H) % stripH;
                target.setColor('#39ff7c');
                beep(1180 + active * 60, 0.09, 'sine', 0.11);
                active++;
                if (active >= COLS) {
                    solved = true;
                    bracket.clear();
                    statusLine.setText('KEY ACCEPTED: DATABASE');
                    statusLine.setColor('#39ff7c');
                    // flashing DECRYPTION COMPLETE for 1.5s, then the payoff
                    const doneText = this.add.text(winWidth / 2, centerY, 'DECRYPTION COMPLETE', {
                        fontFamily: 'Consolas, monospace', fontSize: '26px', color: '#39ff7c',
                        fontWeight: 'bold', backgroundColor: '#041207', padding: { x: 14, y: 8 }, resolution: 2,
                    }).setOrigin(0.5);
                    windowContainer.add(doneText);
                    this.tweens.add({ targets: doneText, alpha: 0.15, duration: 190, yoyo: true, repeat: 6 });
                    beep(880, 0.1, 'sine', 0.1);
                    this.time.delayedCall(160, () => beep(1174, 0.12, 'sine', 0.1));
                    this.time.delayedCall(340, () => beep(1568, 0.2, 'sine', 0.12));
                    this.time.delayedCall(1500, () => { if (!closed) this._onIntelDecrypted(windowContainer, statusLine); });
                } else {
                    statusLine.setText('LOCKED ' + WORD.slice(0, active) + '  ·  COLUMN ' + (active + 1) + ' OF 8');
                    statusLine.setColor('#9a9a9a');
                    drawBracket();
                }
            } else {
                resetRun();
            }
        };
        const onSpace = () => tryLock();
        this.input.keyboard.on('keydown-SPACE', onSpace);
        this.input.keyboard.on('keydown-ENTER', onSpace);

        const cleanup = () => {
            closed = true;
            this.events.off(Phaser.Scenes.Events.UPDATE, tick);
            this.input.keyboard.off('keydown-SPACE', onSpace);
            this.input.keyboard.off('keydown-ENTER', onSpace);
        };
        this._decryptCleanup = cleanup;
        this.events.once('shutdown', cleanup);

        const allLetters = cols.flatMap(c => c.letters);
        windowContainer.add([bg, titleBar, titleText, hintText, crt, zone, ...allLetters, bracket, statusLine]);

        this._addXPWindowControls(windowContainer, winWidth, () => {
            cleanup();
            this._unregisterWindow(windowContainer);
            this._animateWindowClose(windowContainer);
        });

        this._registerWindow({
            name: 'decrypt', title: 'DECRYPT.EXE',
            container: windowContainer, w: winWidth, h: winHeight
        });

        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 90, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this._focusWindow(windowContainer));

        this._animateWindowOpen(windowContainer, targetX, targetY);
    }

    _onIntelDecrypted(minigameWindow, statusLine) {
        statusLine.setText('DECRYPTED — OPENING FILE...');
        statusLine.setColor('#2D8659');

        this.decrypted = true;
        localStorage.setItem('oqw-decrypted', 'true');
        if (this.folderBadge) { this.folderBadge.destroy(); this.folderBadge = null; }

        this._decryptCleanup?.();
        this._unregisterWindow(minigameWindow);
        this._animateWindowClose(minigameWindow);
        this.openIntelViewer();
        this.triggerPostDecryptChatSequence();
    }

    // Decrypted intel viewer — the recovered image + the lore takeaway.
    openIntelViewer(startX = 100, startY = 80) {
        const existing = this._getWindow('intel_viewer');
        if (existing) {
            this._restoreWindow(existing);
            return;
        }

        const winWidth = 560;
        const winHeight = 520;
        const targetX = (this.scale.width - winWidth) / 2;
        const targetY = (this.scale.height - winHeight) / 2;

        const windowContainer = this.add.container(startX, startY);
        windowContainer.name = 'intel_viewer';
        windowContainer.setScale(0);

        // Recovered file is a captured internal memo (plain text) — the old
        // image asset was cut from the build.
        const bg = this.add.graphics();
        bg.fillStyle(0xfdfdf6, 1);
        bg.fillRect(0, 0, winWidth, winHeight);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRect(0, 0, winWidth, winHeight);

        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, winWidth, titleBarH);
        const titleText = this.add.text(10, 7, 'intel_02.txt - Notepad', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });

        const header = this.add.text(28, titleBarH + 18,
            'RECOVERED FILE  ·  intel_02\nsource: internal mail relay, partial capture', {
            fontFamily: 'Consolas, monospace', fontSize: '12px', color: '#8a6d1a', resolution: 2, lineSpacing: 4
        });

        const body = this.add.text(28, titleBarH + 70,
            'They keep the real numbers in one room.\n' +
            'Not the feeds. Not the video farm. A dashboard.\n' +
            '\n' +
            'Every lie they run gets measured there. Reach,\n' +
            'drift, suppression rate. The words they pay for\n' +
            'and the words they bury. All of it, plotted like\n' +
            'weather.\n' +
            '\n' +
            'The address only resolves from inside their own\n' +
            'network: internal.hush/analytics. Session keys\n' +
            'rotate at dawn. Tonight the door is loose.\n' +
            '\n' +
            'If a window can get in there and walk out with\n' +
            'the exports, HUSH stops being a rumor and starts\n' +
            'being evidence.\n' +
            '\n' +
            'One more thing. I watched the traffic for an hour\n' +
            'before it kicked me. The charts watch back.\n' +
            '\n' +
            'Burn this after reading. I mean it.', {
            fontFamily: 'Consolas, monospace', fontSize: '13.5px', color: '#1f2c44', resolution: 2, lineSpacing: 5
        });

        const stamp = this.add.text(winWidth - 26, winHeight - 26, ': T', {
            fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#8a6d1a', fontStyle: 'italic', resolution: 2
        }).setOrigin(1, 0.5);

        windowContainer.add([bg, titleBar, titleText, header, body, stamp]);

        this._addXPWindowControls(windowContainer, winWidth, () => {
            this._unregisterWindow(windowContainer);
            this._animateWindowClose(windowContainer);
        });

        this._registerWindow({
            name: 'intel_viewer', title: 'intel_02.txt',
            container: windowContainer, w: winWidth, h: winHeight
        });

        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 90, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this._focusWindow(windowContainer));

        this._animateWindowOpen(windowContainer, targetX, targetY);
    }

    triggerPostDecryptChatSequence() {
        this.chatHistory.push({ sender: 'Toto', text: 'Whoa — you cracked their encryption. That file maps HUSH\'s whole operation to one place: their analytics dashboard.' });
        this.chatSteps = [
            { reply: 'Can you get me in?', response: 'Bypass is up. "The Quiet: Hush" just appeared on your desktop. It\'s their dashboard — expect it to fight back.' },
            { reply: 'On it. Going dark.', response: 'Good hunting, agent.' }
        ];
        this.currentChatStep = 0;

        // Pre-create the (hidden) Level 2 icon so the chat unlock can reveal
        // it — same second-column slot as create() so it never overlaps the
        // Quiet Window 1.2 icon.
        if (!this.hush3Group) {
            this.hush3Group = this.createDesktopIcon(170, 60, 'icon_hush_3', 'The Quiet: Hush', () => this.launchLevel('DashboardScene'));
            this.hush3Group.setVisible(false);
            this.hush3Group.setAlpha(0);
        }

        if (this.chatWindowOpen && this.chatRenderBubbles) {
            this.chatRenderBubbles();
            if (this.chatInputText) {
                this.chatInputText.setText(this.chatSteps[0].reply);
                this.chatInputText.setColor('#333333');
            }
            if (this.chatSendBtnZone) this.chatSendBtnZone.setInteractive();
            if (this.chatSendBtnBg) this.chatSendBtnBg.setAlpha(1);
            beep(600, 0.15, 'sine', 0.05);
        } else {
            this.showNewMessageNotification('NEW MESSAGE FROM TOTO', 'TOTO: Whoa — you cracked their\nencryption...');
        }
    }

    // Placeholder text for the (auto-typed) input field when no reply is queued.
    _chatIdleHint() {
        if (this.level3Cleared) return 'Mission complete. HUSH is exposed.';
        if (this.level2Ready) return 'Go dark. Launch The Quiet: Hush.';
        if (this.runnerCleared) return 'Crack the encrypted file in the Briefing folder.';
        if (this.level12Ready) return 'Dive into Quiet Window 1.2.';
        if (this.briefingRead) return 'Bypass secured. Launch Quiet Window.';
        return 'Open the Briefing folder on the desktop.';
    }

    // Runs when the player sends the last queued reply of the current chat
    // stage — advances progression and unlocks the matching desktop icon.
    _onChatStepsComplete(inputText) {
        inputText.setColor('#aaaaaa');
        if (this.decrypted && !this.level2Ready) {
            // Post-decrypt chat done → the dashboard unlocks (Phase 3 gate)
            this.level2Ready = true;
            localStorage.setItem('oqw-level2-ready', 'true');
            if (this.hush3Group) {
                this.hush3Group.setVisible(true);
                this.tweens.add({ targets: this.hush3Group, alpha: 1, duration: 800 });
            }
        } else if (this.lvl1Cleared && !this.level12Ready) {
            // Post-1.1 chat done → Level 1.2 (video page) unlocks
            this.level12Ready = true;
            localStorage.setItem('oqw-level12-ready', 'true');
            if (this.metube12Group) {
                this.metube12Group.setVisible(true);
                this.tweens.add({ targets: this.metube12Group, alpha: 1, duration: 800 });
            }
        } else if (this.level3Cleared && !this.epilogueDone) {
            // Campaign epilogue read — nothing left to unlock
            this.epilogueDone = true;
            localStorage.setItem('oqw-epilogue-done', 'true');
            if (this.bonusFolderGroup) {
                this.bonusFolderGroup.setVisible(true);
                this.tweens.add({ targets: this.bonusFolderGroup, alpha: 1, duration: 800 });
            }
            this.time.delayedCall(1200, () => {
                this._showBonusFolderNotification();
            });
        } else if (this.briefingRead) {
            localStorage.setItem('oqw-briefing-read', 'true');
            if (this.metubeGroup) {
                this.metubeGroup.setVisible(true);
                this.tweens.add({ targets: this.metubeGroup, alpha: 1, duration: 800 });
            }
        }
        inputText.setText(this._chatIdleHint());
    }

    triggerPostBriefingChatSequence() {
        this.briefingRead = true;
        
        // Push Toto's post-briefing message to chat history
        this.chatHistory.push({ sender: 'Toto', text: 'I hope you have a clear idea about the mission now.' });
        
        // Set the new post-briefing chat steps
        this.chatSteps = [
            { reply: 'Yes. How do I get in?', response: 'I have temporarily enabled the bypass to their web page. Quiet Window is now unlocked on your desktop.' },
            { reply: 'Understood. I\'m entering the page.', response: 'Be careful. They might have something up their sleeves. Good luck, agent.' }
        ];
        this.currentChatStep = 0;

        // If the chat app is currently open, dynamically update it in place!
        if (this.chatWindowOpen && this.chatRenderBubbles) {
            this.chatRenderBubbles();
            if (this.chatInputText) {
                this.chatInputText.setText(this.chatSteps[0].reply);
                this.chatInputText.setColor('#333333');
            }
            if (this.chatSendBtnZone) this.chatSendBtnZone.setInteractive();
            if (this.chatSendBtnBg) this.chatSendBtnBg.setAlpha(1);
            
            // Play notification beep sound
            beep(600, 0.15, 'sine', 0.05);
        } else {
            // Trigger a message notification to grab player's attention
            this.showNewMessageNotification();
        }
    }

    showNewMessageNotification(titleStr = 'NEW MESSAGE FROM TOTO', msgStr = 'TOTO: I hope you have a clear\nidea about the mission...') {
        if (this.notificationContainer) {
            this.notificationContainer.destroy();
        }

        this.notificationContainer = this.add.container(1600, 1040);
        this.notificationContainer.setDepth(9999);

        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 0.95);
        bg.fillRoundedRect(0, 0, 300, 75, 6);
        bg.lineStyle(2, 0x25d366, 1);
        bg.strokeRoundedRect(0, 0, 300, 75, 6);

        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 300, 75), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
            this.openChatWindow();
            this.tweens.add({
                targets: this.notificationContainer,
                y: 1040,
                duration: 300,
                ease: 'Power2.easeIn',
                onComplete: () => this.notificationContainer.destroy()
            });
        });

        const closeX = this.add.text(280, 5, '×', {
            fontFamily: 'Arial', fontSize: '16px', color: '#888888', fontWeight: 'bold'
        }).setInteractive({ useHandCursor: true });
        
        closeX.on('pointerdown', (pointer, localX, localY, event) => {
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            this.tweens.add({
                targets: this.notificationContainer,
                y: 1040,
                duration: 300,
                ease: 'Power2.easeIn',
                onComplete: () => this.notificationContainer.destroy()
            });
        });

        // WhatsApp-style icon
        const iconBg = this.add.graphics();
        iconBg.fillStyle(0x25d366, 1);
        iconBg.fillCircle(30, 37, 20);
        
        // Chat bubble path in circle
        iconBg.fillStyle(0xffffff, 1);
        iconBg.fillRect(18, 28, 24, 16);
        iconBg.fillTriangle(20, 44, 26, 44, 20, 49);

        const title = this.add.text(60, 12, titleStr, {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#075e54', fontWeight: 'bold'
        });

        const msg = this.add.text(60, 28, msgStr, {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#333333'
        });

        this.notificationContainer.add([bg, iconBg, title, msg, closeX]);

        playSfx('desktopClick');
        beep(600, 0.15, 'sine', 0.05);

        this.tweens.add({
            targets: this.notificationContainer,
            y: 950,
            duration: 400,
            ease: 'Cubic.easeOut'
        });
    }

    _showBypassNotification() {
        this.notificationContainer = this.add.container(1600, 1040);
        this.notificationContainer.setDepth(9999);

        const alertBg = this.add.graphics();
        alertBg.fillStyle(0xffffff, 0.95);
        alertBg.fillRoundedRect(0, 0, 300, 75, 6);
        alertBg.lineStyle(2, 0x16a34a, 1);
        alertBg.strokeRoundedRect(0, 0, 300, 75, 6);

        alertBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, 300, 75), Phaser.Geom.Rectangle.Contains);
        alertBg.on('pointerdown', () => {
            this.launchLevel('HomeScene');
        });

        const alertTitle = this.add.text(60, 12, 'BYPASS SECURED', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#16a34a', fontWeight: 'bold'
        });

        const alertMsg = this.add.text(60, 28, 'TOTO: The web bypass is ready.\nLaunch the browser to begin.', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#333333'
        });
        
        const alertIconBg = this.add.graphics();
        alertIconBg.fillStyle(0x16a34a, 1);
        alertIconBg.fillCircle(30, 37, 18);

        const ieShape = this.add.graphics();
        ieShape.fillStyle(0xffffff, 1);
        ieShape.fillRoundedRect(22, 28, 16, 18, 3);
        ieShape.lineStyle(2, 0x16a34a, 1);
        ieShape.strokeRoundedRect(22, 28, 16, 18, 3);

        this.notificationContainer.add([alertBg, alertTitle, alertMsg, alertIconBg, ieShape]);
        
        beep(880, 0.15, 'sine', 0.05);
        this.time.delayedCall(160, () => beep(1318.51, 0.25, 'sine', 0.05));

        this.tweens.add({
            targets: this.notificationContainer,
            y: 955,
            duration: 500,
            ease: 'Cubic.easeOut'
        });
    }

    triggerShutdown() {
        playSfx('desktopClick');
        stopMusic({ fadeMs: 800 });
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 1);
        overlay.fillRect(0, 0, this.scale.width, this.scale.height);
        overlay.setDepth(9999);

        const shutdownText = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Logging out...', {
            fontFamily: 'Courier New', fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5).setDepth(10000);

        this.time.delayedCall(1500, () => {
            shutdownText.destroy();
            overlay.destroy();
            // Logging out returns to the LANDING PAGE (the old MeTube OS
            // lock screen was retired) — Start Game resumes the desktop.
            showLandingPage({
                onStart: () => playMusic('level1', { fadeMs: 1200 }),
            });
        });
    }

    launchLevel(sceneKey, launchHud) {
        if (this.notepadTextarea) {
            this.notepadTextarea.remove();
            this.notepadTextarea = null;
        }
        document.body.classList.remove('menu-mode');
        this.scene.start(sceneKey, { difficulty: 'easy' });
        if (launchHud) this.scene.launch('HUDScene');
    }

    openNotepadWindow(startX = 55, startY = 560) {
        if (this.notepadWindow) {
            const existing = this._getWindow('notepad');
            if (existing) this._restoreWindow(existing);
            return;
        }

        const winWidth = 450;
        const winHeight = 350;
        const targetX = (this.scale.width - winWidth) / 2;
        const targetY = (this.scale.height - winHeight) / 2;

        const windowContainer = this.add.container(startX, startY);
        windowContainer.name = 'notepad';
        windowContainer.setScale(0);
        this.notepadWindow = windowContainer;

        const bg = this.add.graphics();
        bg.fillStyle(0xf0f0f0, 1);
        bg.fillRect(0, 0, winWidth, winHeight);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRect(0, 0, winWidth, winHeight);

        const titleBarH = 30;
        const titleBar = this.add.graphics();
        titleBar.fillStyle(0x000080, 1);
        titleBar.fillRect(0, 0, winWidth, titleBarH);
        titleBar.lineStyle(1, 0xffffff, 0.15);
        titleBar.lineBetween(0, 1, winWidth, 1);

        // Notepad icon in title
        const noteIcon = this.add.graphics();
        noteIcon.fillStyle(0xffffff, 1);
        noteIcon.fillRect(6, 8, 12, 15);
        noteIcon.lineStyle(1, 0x888888, 1);
        noteIcon.strokeRect(6, 8, 12, 15);
        noteIcon.lineStyle(0.5, 0x888888, 1);
        noteIcon.lineBetween(8, 13, 16, 13);
        noteIcon.lineBetween(8, 16, 16, 16);
        noteIcon.lineBetween(8, 19, 14, 19);

        const titleText = this.add.text(24, 7, 'Manual - Notepad', {
            fontFamily: 'Tahoma, Arial', fontSize: '13px', color: '#ffffff', fontWeight: 'bold'
        });

        const menuBar = this.add.graphics();
        menuBar.fillStyle(0xf0f0f0, 1);
        menuBar.fillRect(0, titleBarH, winWidth, 20);
        menuBar.lineStyle(1, 0xd4d4d4, 1);
        menuBar.lineBetween(0, titleBarH + 20, winWidth, titleBarH + 20);

        const menuText = this.add.text(5, titleBarH + 3, 'File  Edit  Format  View  Help', {
            fontFamily: 'Tahoma, Arial', fontSize: '11px', color: '#000000'
        });

        windowContainer.add([bg, titleBar, noteIcon, titleText, menuBar, menuText]);

        this._addXPWindowControls(windowContainer, winWidth, () => {
            if (this.notepadTextarea) {
                this.notepadTextarea.remove();
                this.notepadTextarea = null;
            }
            this._unregisterWindow(windowContainer);
            this._animateWindowClose(windowContainer, () => {
                this.notepadWindow = null;
            });
        });

        this._registerWindow({
            name: 'notepad', title: 'Manual - Notepad',
            container: windowContainer, w: winWidth, h: winHeight,
            get domEl() { return windowContainer.scene.notepadTextarea; },
            domRect: { x: 2, y: 52, w: winWidth - 4, h: winHeight - 54 },
            // The text body is a DOM textarea floating over the canvas — it
            // must hide while the window is minimized.
            onMinimize: () => { if (this.notepadTextarea) this.notepadTextarea.style.display = 'none'; },
            onRestore: () => this.updateTextareaPosition()
        });

        titleBar.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 80, titleBarH), Phaser.Geom.Rectangle.Contains);
        this._makeWindowDraggable(windowContainer, titleBar);

        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this._focusWindow(windowContainer));

        // Re-add drag update for textarea position
        titleBar.on('drag', () => {
            this.updateTextareaPosition();
        });

        this.notepadTextarea = document.createElement('textarea');
        this.notepadTextarea.className = 'notepad-textarea';
        this.notepadTextarea.value = "=== OPERATIONS BRIEFING ===\n" +
            "\nCODENAME: QUIET WINDOW\n" +
            "STATUS: ACTIVE\n" +
            "\nYou are a stealth agent disguised as a normal browser window." +
            " Your mission: infiltrate HUSH Corp's pages and extract" +
            " classified documents buried under clickbait and bot views.\n" +
            "\n=== HOW TO STAY ALIVE ===\n" +
            "\nMOVEMENT:\n  WASD / Arrow Keys — move the window\n  SHIFT — dash (essential for dodging)\n" +
            "\nOBJECTIVE:\n  Collect yellow EVIDENCE DOCS scattered across each page.\n  Once you have them all, find the exit and dive in.\n" +
            "\nTHREATS — the page bites back:\n" +
            "  • Chasing Recommendations — video cards tear off and chase you\n" +
            "  • Search Shrapnel — the search bar fires if you linger near the top\n" +
            "  • Falling Comments — dodge the rain of user comments\n" +
            "  • Exploding Likes — watch for detonating like buttons\n" +
            "  • Cookie Banner — the crushing consent popup\n" +
            "  • Account Avatar — pulls a GUN. One shot = lethal.\n" +
            "    Rush it to break the aim before it fires.\n" +
            "\n=== MISSION SELECT ===\n" +
            "\n  Quiet Window    — Level 1: The Home Feed\n" +
            "  2 Hush 2 Quiet  — Level 2: The Dashboard\n" +
            "  The Quiet: Hush — Level 3: SPYGRAM\n" +
            "\n=== DESKTOP TIPS ===\n" +
            "\n  - Drag icons to move them around.\n" +
            "  - Drag icons onto Recycle Bin to delete them.\n" +
            "  - Double click a game icon to launch that mission.\n" +
            "  - ESC pauses during gameplay.\n" +
            "\nGood luck, operative. Don't get caught.";
        
        const gameEl = document.getElementById('game') || document.body;
        gameEl.appendChild(this.notepadTextarea);
        
        this.notepadTextarea.style.display = 'none';

        this.tweens.add({
            targets: windowContainer,
            x: targetX,
            y: targetY,
            scaleX: 1,
            scaleY: 1,
            duration: 350,
            ease: 'Power2.easeOut',
            onComplete: () => {
                this.notepadTextarea.style.display = 'block';
                this.updateTextareaPosition();
            }
        });
    }

    updateTextareaPosition() {
        if (!this.notepadWindow || !this.notepadTextarea) return;

        const padding = 2;
        const headerHeight = 50;
        const winWidth = 450;
        const winHeight = 350;

        const phaserCanvas = this.sys.game.canvas;
        const canvasW = phaserCanvas.clientWidth || phaserCanvas.offsetWidth || this.scale.width;
        const canvasH = phaserCanvas.clientHeight || phaserCanvas.offsetHeight || this.scale.height;
        const sx = canvasW / this.scale.width;
        const sy = canvasH / this.scale.height;

        const canvasLeft = phaserCanvas.offsetLeft || 0;
        const canvasTop = phaserCanvas.offsetTop || 0;

        const x = this.notepadWindow.x + padding;
        const y = this.notepadWindow.y + headerHeight + padding;
        const w = winWidth - padding * 2;
        const h = winHeight - headerHeight - padding * 2;

        this.notepadTextarea.style.left = `${canvasLeft + x * sx}px`;
        this.notepadTextarea.style.top = `${canvasTop + y * sy}px`;
        this.notepadTextarea.style.width = `${w * sx}px`;
        this.notepadTextarea.style.height = `${h * sy}px`;
        this.notepadTextarea.style.fontSize = `${Math.max(10, Math.round(14 * sy))}px`;
        
        const scale = this.notepadWindow.scaleX;
        if (scale < 1) {
            this.notepadTextarea.style.display = 'none';
        } else {
            this.notepadTextarea.style.display = 'block';
        }
    }
}
