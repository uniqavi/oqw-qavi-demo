import Phaser from 'phaser';
import { initAudio, beep } from '../game/audio.js';
import { loadMusic, playMusic, setMusicMuted } from '../game/music.js';
import { playVoice, stopVoice, setVoiceMuted } from '../game/voice.js';

// Intro phone call. Direction A — absurdist, self-aware. Toto is tired and
// dry; YOU is deadpan. Each line has a `voiceId` that maps to a drop-in
// audio file at /public/voice/<voiceId>.mp3 — see public/voice/README.md
// for the AI voice generation guide.
//
// Lines are written for clean TTS delivery (full sentences, natural
// punctuation, no inline SFX markers).
const CUTSCENE = [
  { speaker: 'PHONE',  text: '*BRRRT.*  *BRRRT.*  *BRRRT.*' /* SFX, not voiced */ },
  { speaker: 'TOTO',   text: "Hey. Don't hang up.",
    voiceId: 'intro-toto-01' },
  { speaker: 'YOU',    text: "I literally just opened my browser.",
    voiceId: 'intro-you-01' },
  { speaker: 'TOTO',   text: "Yeah. That's why I'm calling. Heard of HUSH?",
    voiceId: 'intro-toto-02' },
  { speaker: 'YOU',    text: 'The company whose slogan is just "shh"?',
    voiceId: 'intro-you-02' },
  { speaker: 'TOTO',   text: "That's the one. Search, social, every video site you've ever visited. All theirs.",
    voiceId: 'intro-toto-03' },
  { speaker: 'TOTO',   text: "They're hiding something. We want it.",
    voiceId: 'intro-toto-04' },
  { speaker: 'YOU',    text: 'Define "we."',
    voiceId: 'intro-you-03' },
  { speaker: 'TOTO',   text: "People who'd rather not have one company telling the entire internet to shut up. Name's Toto, by the way.",
    voiceId: 'intro-toto-05' },
  { speaker: 'YOU',    text: '...like the dog?',
    voiceId: 'intro-you-04' },
  { speaker: 'TOTO',   text: 'Like the band. But yes, also the dog.',
    voiceId: 'intro-toto-06' },
  { speaker: 'TOTO',   text: "There's a file. They buried it on their own video site. A whole document, hidden in a youtube page. They thought that was clever.",
    voiceId: 'intro-toto-07' },
  { speaker: 'YOU',    text: 'It is a little clever.',
    voiceId: 'intro-you-05' },
  { speaker: 'TOTO',   text: "Get in, find the file, plant something so we can get back in later, get out. Don't get noticed. The page will fight you.",
    voiceId: 'intro-toto-08' },
  { speaker: 'YOU',    text: 'The page will fight me.',
    voiceId: 'intro-you-06' },
  { speaker: 'TOTO',   text: "Ads, comments, the recommendation algorithm. They're all HUSH.",
    voiceId: 'intro-toto-09' },
  { speaker: 'YOU',    text: "I'm a 75-pixel rectangle. Watching me back is the only thing I do.",
    voiceId: 'intro-you-07' },
  { speaker: 'TOTO',   text: "That's the spirit.",
    voiceId: 'intro-toto-10' },
  { speaker: 'YOU',    text: 'Pay?',
    voiceId: 'intro-you-08' },
  { speaker: 'TOTO',   text: 'Enough to upgrade you to 200 pixels.',
    voiceId: 'intro-toto-11' },
  { speaker: 'YOU',    text: 'Send the address.',
    voiceId: 'intro-you-09' },
  { speaker: 'SYSTEM', text: '> spoofing user agent...' },
  { speaker: 'SYSTEM', text: "> you are now: 'NormalBrowser/1.0'" },
  { speaker: 'SYSTEM', text: '> connecting to totallynormaltube.gov.??' },
];

const SPEAKER_COLORS = {
  PHONE:  '#9a9aa0',
  TOTO:   '#E63946',
  YOU:    '#4A7BC8',
  SYSTEM: '#2D8659',
};

// Portrait file paths per speaker. Missing files just leave portrait blank.
const SPEAKER_PORTRAITS = {
  PHONE:  '/portraits/phone.png',
  TOTO:   '/portraits/toto.png',
  YOU:    '/portraits/you.png',
  SYSTEM: '',  // no portrait for system messages
};

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    this.dom = {
      mainMenu:         document.getElementById('main-menu'),
      diffMenu:         document.getElementById('diff-menu'),
      intro:            document.getElementById('intro'),
      settings:         document.getElementById('settings-modal'),
      help:             document.getElementById('help-modal'),
      diffConfirm:      document.getElementById('diff-confirm'),
      dialogueSpeaker:  document.getElementById('dialogue-speaker'),
      dialogueLine:     document.getElementById('dialogue-line'),
      dialogueHint:     document.getElementById('dialogue-hint'),
      dialoguePortrait: document.getElementById('dialogue-portrait'),
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

    // Music — preload tracks + start menu theme (will only play after first
    // user interaction due to browser autoplay policy, that's fine)
    loadMusic();
    setMusicMuted(savedAudio === 'off');
    setVoiceMuted(savedAudio === 'off');
    playMusic('menu', { fadeMs: 1200 });

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

    // Audio toggle in settings — mutes music + voice live
    document.querySelectorAll('.diff-btn[data-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.audio;
        localStorage.setItem('oqw-audio', v);
        this.markAudioBtn(v);
        setMusicMuted(v === 'off');
        setVoiceMuted(v === 'off');
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

    // Swap portrait. If file is missing (404), onerror hides the element so
    // dialogue still reads cleanly without a broken-image icon.
    const portraitEl = this.dom.dialoguePortrait;
    if (portraitEl) {
      const path = SPEAKER_PORTRAITS[line.speaker];
      if (path) {
        portraitEl.onerror = () => portraitEl.classList.add('missing');
        portraitEl.onload  = () => portraitEl.classList.remove('missing');
        portraitEl.src = path;
      } else {
        portraitEl.removeAttribute('src');
        portraitEl.classList.add('missing');
      }
    }

    // Play matching voice clip if one exists (drop-in MP3s — missing files
    // silently no-op so the cutscene still works pre-asset).
    if (line.voiceId) playVoice(line.voiceId);
    else stopVoice();

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
    stopVoice();
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
