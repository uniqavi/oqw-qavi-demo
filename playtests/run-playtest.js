import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';

const SCREENSHOT_DIR = 'C:/Users/qavi9/.gemini/antigravity-ide/brain/be6ff2b8-129a-4cad-94d0-adc4a2eb7934/screenshots';

function waitServer(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Server did not start in time'));
        return;
      }
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve();
        }
      }).on('error', () => {
        // Server not ready yet, keep trying
      });
    }, 500);
  });
}

async function run() {
  console.log('Ensuring screenshot directory exists...');
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('Starting Vite development server...');
  const server = spawn('npx', ['vite', '--port', '5173'], {
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  server.stdout.on('data', (data) => {
    console.log(`[Vite stdout] ${data.toString().trim()}`);
  });

  server.stderr.on('data', (data) => {
    console.error(`[Vite stderr] ${data.toString().trim()}`);
  });

  let browser;
  try {
    console.log('Waiting for Vite server to become responsive...');
    await waitServer('http://localhost:5173');
    console.log('Vite server is ready! Launching browser...');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Listen to console messages inside the page for debugging
    page.on('console', (msg) => {
      console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
      console.error(`[Browser PageError] ${err.toString()}`);
    });

    console.log('Navigating to the game login page...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_screen.png') });

    console.log('Clicking the login button...');
    await page.click('#login-btn');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_main_menu.png') });

    // Level 1.1: DashboardScene (spreadsheet grid)
    console.log('Jumping straight to Level 1.1 (DashboardScene)...');
    await page.evaluate(() => {
      window.__game.scene.scenes.forEach(s => {
        if (s.scene.isActive() && s.scene.key !== 'BootScene') {
          window.__game.scene.stop(s.scene.key);
        }
      });
      document.body.classList.remove('menu-mode');
      ['xp-welcome', 'xp-desktop', 'xp-call', 'xp-browser'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
      const difficulty = localStorage.getItem('oqw-difficulty') || 'easy';
      window.__game.scene.start('DashboardScene', { difficulty });
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_dashboard_start.png') });

    console.log('Advancing initial narration dialogues...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_dashboard_active.png') });

    console.log('Simulating player movement keys in Level 1.1...');
    // Press D (move right) for 600ms, then release
    await page.keyboard.down('d');
    await page.waitForTimeout(600);
    await page.keyboard.up('d');
    await page.waitForTimeout(200);

    // Press S (move down) for 600ms, then release
    await page.keyboard.down('s');
    await page.waitForTimeout(600);
    await page.keyboard.up('s');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_dashboard_moved.png') });

    // Level 1.2: GameScene (Endless Runner)
    console.log('Jumping straight to Level 1.2 (GameScene runner)...');
    await page.evaluate(() => {
      window.__game.scene.scenes.forEach(s => {
        if (s.scene.isActive() && s.scene.key !== 'BootScene') {
          window.__game.scene.stop(s.scene.key);
        }
      });
      document.body.classList.remove('menu-mode');
      ['xp-welcome', 'xp-desktop', 'xp-call', 'xp-browser'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
      const difficulty = localStorage.getItem('oqw-difficulty') || 'easy';
      window.__game.scene.start('GameScene', { difficulty });
      window.__game.scene.run('HUDScene');
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_gamescene_start.png') });

    console.log('Waiting for runner scrolling...');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_gamescene_scrolling.png') });

    console.log('Simulating movement and dash in Level 1.2...');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_gamescene_moved.png') });

    console.log('Playtest completed successfully!');
  } catch (error) {
    console.error('Playtest run encountered an error:', error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
    console.log('Stopping Vite server...');
    server.kill();
  }
}

run();
