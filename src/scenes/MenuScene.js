import Phaser from 'phaser';
import { loadSfx, playSfx } from '../game/sfx.js';

/**
 * MeTube Desktop Parody - Phaser 3 Implementation
 * This script creates a self-contained desktop UI simulation.
 * All graphics are generated programmatically using Phaser's Graphics object.
 */

// Fixed design dimensions — must match the viewport (index.html: 1920×1080).
// Using constants instead of this.scale.width/height ensures the desktop scene
// renders at exactly the same resolution as the game levels on every device.
const DW = 1920;
const DH = 1080;

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    preload() {
        // No external assets to load - we generate textures programmatically in create()
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
        loadSfx();

        this.generateTextures();
        this.createBackground();
        
        // Track active window to prevent duplicates
        this.activeWindow = null;
        this.notepadTextarea = null;

        // Create Desktop Icons — each game icon launches its level directly
        this.metubeGroup = this.createDesktopIcon(55, 60, 'icon_metube', 'Quiet Window', () => this.launchLevel('HomeScene'));
        this.hush2Group = this.createDesktopIcon(55, 160, 'icon_hush_2', '2 Hush 2 Quiet', () => this.launchLevel('GameScene', true));
        this.hush3Group = this.createDesktopIcon(55, 260, 'icon_hush_3', 'The Quiet: Hush', () => this.launchLevel('DashboardScene'));
        this.logoutGroup = this.createDesktopIcon(55, 360, 'logout_icon', 'Log Out', () => this.triggerShutdown());
        this.recycleBinGroup = this.createDesktopIcon(55, 460, 'recycle_icon', 'Recycle Bin', () => console.log('Recycle Bin clicked'));
        this.manualGroup = this.createDesktopIcon(55, 560, 'manual_icon', 'Manual', (x, y) => this.openNotepadWindow(x, y));
    }

    /**
     * Generates all UI textures programmatically.
     */
    generateTextures() {
        // 1. Black Play Button Icon (Infiltrating Logo)
        const logoGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        logoGraphics.fillStyle(0x000000, 1);
        logoGraphics.fillRoundedRect(0, 0, 64, 64, 12);
        logoGraphics.fillStyle(0xffffff, 1);
        // Draw a white triangle for the 'play' symbol
        logoGraphics.fillTriangle(24, 20, 24, 44, 46, 32);
        logoGraphics.generateTexture('icon_metube', 64, 64);

        // 1a. Hush 2 Icon
        const hush2Graphics = this.make.graphics({ x: 0, y: 0, add: false });
        hush2Graphics.fillStyle(0x000000, 1);
        hush2Graphics.fillRoundedRect(0, 0, 64, 64, 12);
        hush2Graphics.fillStyle(0xffffff, 1);
        hush2Graphics.fillTriangle(24, 20, 24, 44, 46, 32);
        hush2Graphics.generateTexture('icon_hush_2_base', 64, 64);
        hush2Graphics.fillStyle(0xffffff, 1);
        // Draw a simple '2'
        hush2Graphics.fillRect(48, 48, 8, 2);
        hush2Graphics.fillRect(54, 50, 2, 4);
        hush2Graphics.fillRect(48, 54, 8, 2);
        hush2Graphics.fillRect(48, 56, 2, 4);
        hush2Graphics.fillRect(48, 60, 8, 2);
        hush2Graphics.generateTexture('icon_hush_2', 64, 64);

        // 1b. Hush 3 Icon
        const hush3Graphics = this.make.graphics({ x: 0, y: 0, add: false });
        hush3Graphics.fillStyle(0x000000, 1);
        hush3Graphics.fillRoundedRect(0, 0, 64, 64, 12);
        hush3Graphics.fillStyle(0xffffff, 1);
        hush3Graphics.fillTriangle(24, 20, 24, 44, 46, 32);
        hush3Graphics.fillStyle(0xffffff, 1);
        // Draw a simple '3'
        hush3Graphics.fillRect(48, 48, 8, 2);
        hush3Graphics.fillRect(54, 50, 2, 4);
        hush3Graphics.fillRect(50, 54, 6, 2);
        hush3Graphics.fillRect(54, 56, 2, 4);
        hush3Graphics.fillRect(48, 60, 8, 2);
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
        
        // 5. Start Button (Texture kept but not used)
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
        
        // Book Cover
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

        // Left Pages
        bookGraphics.fillStyle(0xffffff, 1);
        bookGraphics.beginPath();
        bookGraphics.moveTo(32, 18);
        bookGraphics.lineTo(12, 15);
        bookGraphics.lineTo(12, 48);
        bookGraphics.lineTo(32, 52);
        bookGraphics.closePath();
        bookGraphics.fillPath();

        // Right Pages (slightly darker for shading)
        bookGraphics.fillStyle(0xeeeeee, 1);
        bookGraphics.beginPath();
        bookGraphics.moveTo(32, 18);
        bookGraphics.lineTo(52, 15);
        bookGraphics.lineTo(52, 48);
        bookGraphics.lineTo(32, 52);
        bookGraphics.closePath();
        bookGraphics.fillPath();
        
        // Red bookmark ribbon
        bookGraphics.fillStyle(0xcc0000, 1);
        bookGraphics.fillRect(30, 14, 4, 42);

        bookGraphics.generateTexture('manual_icon', 64, 64);
    }

    createBackground() {
        // Classic blue desktop wallpaper — use fixed design dims
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x3a6ea5, 0x3a6ea5, 0x123456, 0x123456, 1);
        bg.fillRect(0, 0, DW, DH);
    }

    createDesktopIcon(x, y, textureKey, labelText, onClickCallback) {
        const iconGroup = this.add.container(x, y);
        
        // Add a stacked fake blur shadow with gradient-like falloff and increased blur radius
        const shadows = [];
        for (let i = 1; i <= 6; i++) {
            const offset = i * 1.5; 
            const alpha = 0.25 / (i * 1.2); // Soft gradient-like falloff
            const scale = 1 + (i * 0.02); // Simulate diffuse spread
            shadows.push(this.add.image(-offset, offset, textureKey).setTint(0x000000).setAlpha(alpha).setScale(scale));
        }

        const icon = this.add.image(0, 0, textureKey).setInteractive({ useHandCursor: true, draggable: true });
        const label = this.add.text(0, 45, labelText, {
            fontFamily: 'Arial', fontSize: '14px', color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 4, y: 2 }
        }).setOrigin(0.5);

        iconGroup.add([...shadows, icon, label]);

        // Dragging logic
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

        // Drop to delete logic
        icon.on('dragend', () => {
            if (textureKey !== 'recycle_icon' && this.recycleBinGroup) {
                const dist = Phaser.Math.Distance.Between(iconGroup.x, iconGroup.y, this.recycleBinGroup.x, this.recycleBinGroup.y);
                // If within 60 pixels of the recycle bin center, delete the icon
                if (dist < 60) {
                    iconGroup.destroy();
                }
            }
        });

        // Double click simulation
        let lastTime = 0;
        icon.on('pointerdown', () => {
            playSfx('desktopClick');
            let clickDelay = this.time.now - lastTime;
            lastTime = this.time.now;
            if (clickDelay < 350) {
                onClickCallback(iconGroup.x, iconGroup.y);
            }
        });

        // Hover effects
        icon.on('pointerover', () => icon.setTint(0xdddddd));
        icon.on('pointerout', () => icon.clearTint());

        return iconGroup;
    }

    triggerShutdown() {
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 1);
        overlay.fillRect(0, 0, DW, DH);
        overlay.setDepth(9999);

        const shutdownText = this.add.text(DW / 2, DH / 2, 'System Shutting Down...', {
            fontFamily: 'Courier New', fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5).setDepth(10000);

        this.time.delayedCall(2000, () => {
            shutdownText.setText('It is now safe to turn off your computer.');
        });
    }

    launchLevel(sceneKey, launchHud) {
        // Clean up any open notepad textarea
        if (this.notepadTextarea) {
            this.notepadTextarea.remove();
            this.notepadTextarea = null;
        }
        document.body.classList.remove('menu-mode');
        this.scene.start(sceneKey, { difficulty: 'easy' });
        if (launchHud) this.scene.launch('HUDScene');
    }

    openNotepadWindow(startX = 55, startY = 560) {
        if (this.activeWindow) {
            this.activeWindow.setDepth(this.children.length);
            return;
        }

        const winWidth = 450;
        const winHeight = 350;
        const targetX = (DW - winWidth) / 2;
        const targetY = (DH - winHeight) / 2;

        const windowContainer = this.add.container(startX, startY);
        windowContainer.name = 'notepad';
        windowContainer.setScale(0);
        this.activeWindow = windowContainer;

        const bg = this.add.graphics();
        bg.fillStyle(0xf0f0f0, 1);
        bg.fillRect(0, 0, winWidth, winHeight);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRect(0, 0, winWidth, winHeight);

        const titleBarBg = this.add.graphics();
        titleBarBg.fillStyle(0x000080, 1); // Classic Windows blue
        titleBarBg.fillRect(0, 0, winWidth, 30);

        const titleText = this.add.text(10, 7, 'Manual - Notepad', {
            fontFamily: 'Arial', fontSize: '14px', color: '#ffffff'
        });

        const closeBtn = this.add.image(winWidth - 30, 0, 'close_btn').setOrigin(0).setInteractive({ useHandCursor: true });

        const menuBar = this.add.graphics();
        menuBar.fillStyle(0xe0e0e0, 1);
        menuBar.fillRect(0, 30, winWidth, 20);
        menuBar.lineStyle(1, 0xcccccc, 1);
        menuBar.lineBetween(0, 50, winWidth, 50);

        const menuText = this.add.text(5, 33, 'File  Edit  Format  View  Help', {
            fontFamily: 'Arial', fontSize: '12px', color: '#000000'
        });

        windowContainer.add([bg, titleBarBg, titleText, closeBtn, menuBar, menuText]);
        windowContainer.setDepth(this.children.length);

        // Draggable window logic
        titleBarBg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth - 30, 30), Phaser.Geom.Rectangle.Contains);
        this.input.setDraggable(titleBarBg);
        
        let startDragX = 0;
        let startDragY = 0;

        titleBarBg.on('dragstart', (pointer) => {
            startDragX = windowContainer.x - pointer.x;
            startDragY = windowContainer.y - pointer.y;
            windowContainer.setDepth(this.children.length);
        });

        titleBarBg.on('drag', (pointer) => {
            windowContainer.x = pointer.x + startDragX;
            windowContainer.y = pointer.y + startDragY;
            this.updateTextareaPosition();
        });

        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, winWidth, winHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
            windowContainer.setDepth(this.children.length);
        });

        // HTML Textarea — must live inside the viewport so it inherits the CSS transform
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
        // Append inside the canvas-wrap so it inherits the viewport CSS transform
        const canvasWrap = document.querySelector('.canvas-wrap') || document.body;
        canvasWrap.appendChild(this.notepadTextarea);
        
        // Hide initially for animation
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

        closeBtn.on('pointerdown', () => {
            playSfx('desktopClick');
            if (this.notepadTextarea) {
                this.notepadTextarea.remove();
                this.notepadTextarea = null;
            }

            this.tweens.add({
                targets: windowContainer,
                x: startX,
                y: startY,
                scaleX: 0,
                scaleY: 0,
                duration: 250,
                ease: 'Power2.easeIn',
                onComplete: () => {
                    windowContainer.destroy();
                    this.activeWindow = null;
                }
            });
        });
    }

    updateTextareaPosition() {
        if (!this.activeWindow || !this.notepadTextarea) return;

        const padding = 2;
        const headerHeight = 50; // title bar + menu bar
        const winWidth = 450;
        const winHeight = 350;

        // The Phaser canvas is inside the #game div inside .canvas-wrap.
        // We need the position relative to the canvas-wrap, which is the
        // textarea's offsetParent thanks to its position:relative.
        const gameEl = document.getElementById('game');
        const gameRect = gameEl ? gameEl.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };

        // Phaser scene coords → pixel coords inside the game div.
        // The Phaser canvas fills the #game div, so the scale factor is
        // gameDiv-pixel-width / phaser-scene-width.
        const scaleX = gameRect.width / DW;
        const scaleY = gameRect.height / DH;

        const x = this.activeWindow.x + padding;
        const y = this.activeWindow.y + headerHeight + padding;
        const w = winWidth - padding * 2;
        const h = winHeight - headerHeight - padding * 2;

        this.notepadTextarea.style.left = `${x}px`;
        this.notepadTextarea.style.top = `${y}px`;
        this.notepadTextarea.style.width = `${w}px`;
        this.notepadTextarea.style.height = `${h}px`;
        
        // Handle scaling during animation
        const scale = this.activeWindow.scaleX;
        if (scale < 1) {
            this.notepadTextarea.style.display = 'none';
        } else {
            this.notepadTextarea.style.display = 'block';
        }
    }
}
