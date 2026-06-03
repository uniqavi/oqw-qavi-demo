import Phaser from 'phaser';
import { initAudio, beep } from '../game/audio.js';
import { loadMusic, playMusic, setMusicMuted } from '../game/music.js';
import { playVoice, stopVoice, setVoiceMuted } from '../game/voice.js';
import { MenuEffects } from '../game/menuEffects.js';

// Intro phone call between Toto and the player — old friends reconnecting.
// `{name}` is replaced with the codename the player typed in the name-prompt
// modal (collected after BEGIN INFILTRATION, before this cutscene plays).
// Each line has a `voiceId` mapping to /public/voice/<id>.mp3 for drop-in TTS.
const CUTSCENE = [
  { speaker: 'PHONE',  text: '*BRRRT.*  *BRRRT.*' /* SFX, not voiced */ },
  { speaker: 'TOTO',   text: "Hey... pick up. It's me.",
    voiceId: 'intro-toto-01' },
  { speaker: 'YOU',    text: "Toto? Long time no call. Everything alright?",
    voiceId: 'intro-you-01' },
  { speaker: 'TOTO',   text: "...No. Things have gotten bad, {name}. Like — real bad.",
    voiceId: 'intro-toto-02' },
  { speaker: 'TOTO',   text: "HUSH Corp is getting out of hand. We have to do something. Now.",
    voiceId: 'intro-toto-03' },
  { speaker: 'YOU',    text: "Yeah... I've been watching it too. The headlines, the cover-ups. I bet what they're hiding is way worse than what's leaked.",
    voiceId: 'intro-you-02' },
  { speaker: 'YOU',    text: "I'm not feeling good about this, Toto.",
    voiceId: 'intro-you-03' },
  { speaker: 'TOTO',   text: "Exactly. That's why I called. You're our only shot right now — and I've got a plan.",
    voiceId: 'intro-toto-04' },
  { speaker: 'TOTO',   text: "I wrote a stealth agent. It disguises itself as a normal browser window. Just another tab nobody pays attention to.",
    voiceId: 'intro-toto-05' },
  { speaker: 'TOTO',   text: "You ride that window into HUSH's pages. Scan what they've buried under the fake comments and bot views. Pull the receipts.",
    voiceId: 'intro-toto-06' },
  { speaker: 'YOU',    text: "A 75-pixel rectangle. Subtle.",
    voiceId: 'intro-you-04' },
  { speaker: 'TOTO',   text: "That IS the subtle. Nobody looks twice at a window.",
    voiceId: 'intro-toto-07' },
  { speaker: 'TOTO',   text: "But before we go live — I'll walk you through a drill, {name}. You should see the system once before it's real.",
    voiceId: 'intro-toto-08' },
  { speaker: 'SYSTEM', text: "> spoofing user agent — you are 'NormalBrowser/1.0'" },
  { speaker: 'SYSTEM', text: '> deploying to a sandbox for calibration...' },
];

// Resolve {name} placeholders against the saved codename.
function formatLine(text) {
  const name = (localStorage.getItem('oqw-name') || '').trim() || 'operative';
  return text.replace(/\{name\}/g, name);
}

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
      namePrompt:       document.getElementById('name-prompt'),
      nameInput:        document.getElementById('name-input'),
      nameNote:         document.getElementById('name-note'),
      nameConfirm:      document.getElementById('name-confirm'),
      nameBack:         document.getElementById('name-back'),
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
    this.hide(this.dom.namePrompt);
    this.hide(this.dom.intro);
    this.hide(this.dom.settings);
    this.hide(this.dom.help);

    // Restore saved settings
    this.selectedDiff = localStorage.getItem('oqw-difficulty') || 'easy';
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

    // Menu background effects — dust in projector beam, rain, steam,
    // city twinkles. One MenuEffects per dark-room canvas (main / diff /
    // intro all share the same image so all three get the same ambience).
    this.fx = [];
    const fxCanvasIds = ['menu-fx-canvas-main', 'menu-fx-canvas-diff', 'menu-fx-canvas-intro'];
    for (const id of fxCanvasIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const fx = new MenuEffects(el);
      fx.start();
      this.fx.push(fx);
    }

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
    // BEGIN INFILTRATION now opens the name-prompt modal; the cutscene only
    // starts after the player commits a codename (required, not skippable).
    this.bindClick('diff-confirm', () => this.openNamePrompt(), signal);
    this.bindClick('name-back',    () => this.closeNamePrompt(), signal);
    this.bindClick('name-confirm', () => this.commitNameAndBegin(), signal);
    // Live-validate the input: enable CONFIRM only when a non-empty codename
    // is present. Enter submits.
    if (this.dom.nameInput) {
      this.dom.nameInput.addEventListener('input', () => this.refreshNameValidity(), { signal });
      this.dom.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !this.dom.nameConfirm.disabled) {
          e.preventDefault();
          this.commitNameAndBegin();
        }
      }, { signal });
    }

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

    // Intro skip button
    this.bindClick('intro-skip', (e) => {
      e.stopPropagation();
      this.endCutscene();
    }, signal);

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
      // Stop all running effect canvases to release rAF + listeners
      if (this.fx) this.fx.forEach((fx) => fx.stop());
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

  // ===== Name prompt (between difficulty and cutscene) =====
  // The name-prompt is a .modal (layered above) — it intentionally leaves
  // .diff-menu mounted so its .dark-room background stays visible. A CSS
  // :has() rule hides the diff overlay automatically while a modal is open.
  openNamePrompt() {
    initAudio();
    this.show(this.dom.namePrompt);
    const saved = (localStorage.getItem('oqw-name') || '').trim();
    if (this.dom.nameInput) {
      this.dom.nameInput.value = saved;
      setTimeout(() => this.dom.nameInput.focus(), 60);
    }
    this.refreshNameValidity();
  }
  closeNamePrompt() {
    this.hide(this.dom.namePrompt);
  }
  refreshNameValidity() {
    const v = (this.dom.nameInput?.value || '').trim();
    const ok = v.length > 0;
    if (this.dom.nameConfirm) this.dom.nameConfirm.disabled = !ok;
    if (this.dom.nameNote) {
      this.dom.nameNote.classList.toggle('ready', ok);
      this.dom.nameNote.textContent = ok
        ? '▸ codename locked. press CONFIRM or hit Enter.'
        : '▸ type a codename to continue';
    }
  }
  commitNameAndBegin() {
    const v = (this.dom.nameInput?.value || '').trim();
    if (!v) return;                               // safety: button should be disabled
    localStorage.setItem('oqw-name', v);
    beep(900, 0.05, 'square', 0.04);
    this.hide(this.dom.namePrompt);
    this.beginCutscene();
  }

  // ===== Cutscene =====
  beginCutscene() {
    initAudio();
    this.hide(this.dom.diffMenu);
    this.hide(this.dom.namePrompt);
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
    // Speaker chip — background tinted by speaker, text stays white.
    this.dom.dialogueSpeaker.textContent = line.speaker;
    this.dom.dialogueSpeaker.style.background = SPEAKER_COLORS[line.speaker] || '#1a1a1f';
    this.dom.dialogueSpeaker.style.color = '#fff';
    this.dom.dialogueLine.textContent = '';
    // (.dialogue-hint is display:none — kept for backwards-compat, no opacity needed)

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
    const text = formatLine(line.text);   // resolve {name} → codename
    const tick = () => {
      if (!this.typingActive) {
        this.dom.dialogueLine.textContent = text;
        return;
      }
      if (i < text.length) {
        i++;
        this.dom.dialogueLine.textContent = text.slice(0, i);
        if (text[i - 1] !== ' ' && Math.random() < 0.25) {
          beep(1700 + Math.random() * 500, 0.005, 'square', 0.012);
        }
        this.typewriterTimer = setTimeout(tick, 18);
      } else {
        this.typingActive = false;
      }
    };
    tick();
  }

  advanceCutscene() {
    if (this.typingActive) {
      clearTimeout(this.typewriterTimer);
      this.typingActive = false;
      const line = CUTSCENE[this.cutsceneIdx];
      this.dom.dialogueLine.textContent = formatLine(line.text);
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
      // Route through the tutorial first. (During the build phase we always
      // show it; later we can gate on localStorage 'oqw-tutorial-done' so
      // repeat players skip straight to GameScene.)
      this.scene.start('TutorialScene', { difficulty: this.selectedDiff });
      setTimeout(() => {
        flash.classList.remove('active');
        setTimeout(() => flash.remove(), 700);
      }, 100);
    }, 700);
  }
}
