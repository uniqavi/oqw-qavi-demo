import Phaser from 'phaser';
import { initAudio, beep } from '../game/audio.js';

// Phone-call cutscene script. Edit freely — the writers will polish.
const CUTSCENE = [
  { speaker: 'PHONE', text: '*BRRRT.*  *BRRRT.*' },
  { speaker: 'BOSS-1', text: 'I need you on something. Tonight. Only you can do this.' },
  { speaker: 'YOU', text: "I'm done. I told you last time was the last time." },
  { speaker: 'BOSS-1', text: "We both know that's not true. They have files. Files that change the war." },
  { speaker: 'BOSS-1', text: "You go in through their video site. Don't talk to anyone. You come out with what we need." },
  { speaker: 'YOU', text: '...Fine. One last job.' },
  { speaker: 'BOSS-1', text: "You're not just a soldier. You're the only one this works for. Open your browser." },
  { speaker: 'SYSTEM', text: '> initializing connection...' },
];

const SPEAKER_COLORS = {
  PHONE: '#9a9aa0',
  'BOSS-1': '#E63946',
  YOU: '#4A7BC8',
  SYSTEM: '#2D8659',
};

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    this.dom = {
      mainMenu:        document.getElementById('main-menu'),
      diffMenu:        document.getElementById('diff-menu'),
      intro:           document.getElementById('intro'),
      settings:        document.getElementById('settings-modal'),
      help:            document.getElementById('help-modal'),
      diffConfirm:     document.getElementById('diff-confirm'),
      dialogueSpeaker: document.getElementById('dialogue-speaker'),
      dialogueLine:    document.getElementById('dialogue-line'),
      dialogueHint:    document.getElementById('dialogue-hint'),
    };

    document.body.classList.add('menu-mode');
    this.show(this.dom.mainMenu);
    this.hide(this.dom.diffMenu);
    this.hide(this.dom.intro);
    this.hide(this.dom.settings);
    this.hide(this.dom.help);

    // Restore saved settings
    this.selectedDiff = localStorage.getItem('oqw-difficulty') || 'normal';
    this.markDiffCard(this.selectedDiff);
    this.dom.diffConfirm.disabled = false;
    const savedAudio = localStorage.getItem('oqw-audio') || 'on';
    this.markAudioBtn(savedAudio);

    // Single AbortController removes all DOM listeners on shutdown — safe to
    // re-create MenuScene multiple times (e.g. via "MAIN MENU" from results).
    this.abort = new AbortController();
    const signal = this.abort.signal;

    // Main menu buttons
    this.bindClick('btn-start',      () => this.openDiffMenu(), signal);
    this.bindClick('btn-settings',   () => this.show(this.dom.settings), signal);
    this.bindClick('btn-help',       () => this.show(this.dom.help), signal);
    this.bindClick('settings-close', () => this.hide(this.dom.settings), signal);
    this.bindClick('help-close',     () => this.hide(this.dom.help), signal);

    // Difficulty select
    document.querySelectorAll('.diff-card').forEach((card) => {
      card.addEventListener('click', () => this.selectDiff(card.dataset.diff), { signal });
    });
    this.bindClick('diff-back',    () => this.closeDiffMenu(), signal);
    this.bindClick('diff-confirm', () => this.beginCutscene(), signal);

    // Audio toggle in settings
    document.querySelectorAll('.diff-btn[data-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.audio;
        localStorage.setItem('oqw-audio', v);
        this.markAudioBtn(v);
      }, { signal });
    });

    // Cutscene advance — click anywhere on .intro OR Space/Enter
    this.advanceFn = (e) => {
      if (this.dom.intro.classList.contains('hidden')) return;
      if (e.type === 'keydown' && e.key !== ' ' && e.key !== 'Enter') return;
      if (e.type === 'keydown') e.preventDefault();
      this.advanceCutscene();
    };
    document.addEventListener('keydown', this.advanceFn, { signal });
    this.dom.intro.addEventListener('click', this.advanceFn, { signal });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.abort.abort();
      if (this.typewriterTimer) clearTimeout(this.typewriterTimer);
    });
  }

  // ===== DOM helpers =====
  bindClick(id, fn, signal) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn, signal ? { signal } : undefined);
  }
  show(el) { el?.classList.remove('hidden'); }
  hide(el) { el?.classList.add('hidden'); }

  markDiffCard(value) {
    document.querySelectorAll('.diff-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.diff === value);
    });
  }
  markAudioBtn(value) {
    document.querySelectorAll('.diff-btn[data-audio]').forEach((b) => {
      b.classList.toggle('active', b.dataset.audio === value);
    });
  }

  // ===== Difficulty menu flow =====
  openDiffMenu() {
    initAudio();
    this.hide(this.dom.mainMenu);
    this.show(this.dom.diffMenu);
  }
  closeDiffMenu() {
    this.hide(this.dom.diffMenu);
    this.show(this.dom.mainMenu);
  }
  selectDiff(value) {
    this.selectedDiff = value;
    localStorage.setItem('oqw-difficulty', value);
    this.markDiffCard(value);
    this.dom.diffConfirm.disabled = false;
    beep(900, 0.04, 'square', 0.04);
  }

  // ===== Cutscene =====
  beginCutscene() {
    initAudio();
    this.hide(this.dom.diffMenu);
    this.show(this.dom.intro);
    this.cutsceneIdx = 0;
    this.typingActive = false;

    [0, 250, 600, 850].forEach((delay) => {
      setTimeout(() => beep(880, 0.14, 'sine', 0.06), delay);
    });

    setTimeout(() => this.showLine(0), 1200);
  }

  showLine(idx) {
    const line = CUTSCENE[idx];
    if (!line) return;
    this.dom.dialogueSpeaker.textContent = line.speaker;
    this.dom.dialogueSpeaker.style.color = SPEAKER_COLORS[line.speaker] || '#fff';
    this.dom.dialogueLine.textContent = '';
    this.dom.dialogueHint.style.opacity = '0';

    this.typingActive = true;
    let i = 0;
    const text = line.text;
    const tick = () => {
      if (!this.typingActive) {
        this.dom.dialogueLine.textContent = text;
        this.dom.dialogueHint.style.opacity = '0.7';
        return;
      }
      if (i < text.length) {
        i++;
        this.dom.dialogueLine.textContent = text.slice(0, i);
        if (text[i - 1] !== ' ' && Math.random() < 0.25) {
          beep(1700 + Math.random() * 500, 0.005, 'square', 0.012);
        }
        this.typewriterTimer = setTimeout(tick, 26);
      } else {
        this.typingActive = false;
        this.dom.dialogueHint.style.opacity = '0.7';
      }
    };
    tick();
  }

  advanceCutscene() {
    if (this.typingActive) {
      clearTimeout(this.typewriterTimer);
      this.typingActive = false;
      const line = CUTSCENE[this.cutsceneIdx];
      this.dom.dialogueLine.textContent = line.text;
      this.dom.dialogueHint.style.opacity = '0.7';
      return;
    }
    this.cutsceneIdx++;
    if (this.cutsceneIdx >= CUTSCENE.length) {
      this.endCutscene();
    } else {
      this.showLine(this.cutsceneIdx);
    }
  }

  endCutscene() {
    const flash = document.createElement('div');
    flash.className = 'cutscene-flash';
    document.body.appendChild(flash);
    requestAnimationFrame(() => flash.classList.add('active'));

    setTimeout(() => beep(440, 0.06, 'square', 0.06), 200);
    setTimeout(() => beep(660, 0.06, 'square', 0.06), 320);
    setTimeout(() => beep(880, 0.1, 'square', 0.07), 460);

    setTimeout(() => {
      this.hide(this.dom.intro);
      document.body.classList.remove('menu-mode');
      this.scene.start('GameScene', { difficulty: this.selectedDiff });
      this.scene.launch('HUDScene');
      setTimeout(() => {
        flash.classList.remove('active');
        setTimeout(() => flash.remove(), 700);
      }, 100);
    }, 700);
  }
}
