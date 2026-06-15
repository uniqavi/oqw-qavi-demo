import Phaser from 'phaser';
import { initAudio, beep, noise } from '../game/audio.js';
import { loadMusic, playMusic, setMusicMuted } from '../game/music.js';
import { loadSfx, setSfxMuted } from '../game/sfx.js';
import { playVoice, stopVoice, setVoiceMuted } from '../game/voice.js';
import { wireVolumeControl } from '../game/pauseMenu.js';

// ============================================================================
// OPENING — Windows XP welcome → desktop → Toto incoming call → browser → tutorial
//
//   1. XP welcome screen (the main menu). Click "Administrator", then type your
//      name as the "password" (the hint says so). It's stored as the codename
//      Toto uses for the rest of the game.
//   2. XP desktop (Bliss wallpaper, icons, taskbar, Start menu, clock).
//   3. A VoIP "incoming call" window pops up — Toto, with an anonymous avatar
//      (a little browser window). Accept it; the old-friends dialogue plays.
//   4. After the call, open the Internet (IE) app → it "loads" → TutorialScene.
//
// Only the browser advances the game; other icons/Start items give a polite
// XP error ding. Difficulty defaults to Easy (the old picker is retired).
// ============================================================================

// Old-friends call. `{name}` resolves to the typed codename. voiceIds map to
// /public/voice/<id>.mp3 (drop-in TTS; missing files silently no-op).
const CALL_LINES = [
  { speaker: 'TOTO',   text: "Hey... pick up. It's me.", voiceId: 'intro-toto-01' },
  { speaker: 'YOU',    text: "Toto? Long time no call. Everything alright?", voiceId: 'intro-you-01' },
  { speaker: 'TOTO',   text: "...No. Things have gotten bad, {name}. Like — real bad.", voiceId: 'intro-toto-02' },
  { speaker: 'TOTO',   text: "HUSH Corp is getting out of hand. We have to do something. Now.", voiceId: 'intro-toto-03' },
  { speaker: 'YOU',    text: "Yeah... I've been watching it too. The headlines, the cover-ups. I bet what they're hiding is way worse than what's leaked.", voiceId: 'intro-you-02' },
  { speaker: 'YOU',    text: "I'm not feeling good about this, Toto.", voiceId: 'intro-you-03' },
  { speaker: 'TOTO',   text: "Exactly. That's why I called. You're our only shot right now — and I've got a plan.", voiceId: 'intro-toto-04' },
  { speaker: 'TOTO',   text: "I wrote a stealth agent. It disguises itself as a normal browser window. Just another tab nobody pays attention to.", voiceId: 'intro-toto-05' },
  { speaker: 'TOTO',   text: "You ride that window into HUSH's pages. Pull the receipts they've buried under fake comments and bot views.", voiceId: 'intro-toto-06' },
  { speaker: 'YOU',    text: "A little rectangle. Subtle.", voiceId: 'intro-you-04' },
  { speaker: 'TOTO',   text: "That IS the subtle. Nobody looks twice at a window.", voiceId: 'intro-toto-07' },
  { speaker: 'TOTO',   text: "Before we go live I'll walk you through a drill, {name}. Open your browser — I'll meet you in there.", voiceId: 'intro-toto-08' },
  { speaker: 'SYSTEM', text: "> spoofing user agent — you are 'NormalBrowser/1.0'" },
  { speaker: 'SYSTEM', text: '> open Internet Explorer to begin calibration…' },
];

const SPEAKER_COLORS = { PHONE: '#9a9aa0', TOTO: '#E63946', YOU: '#4A7BC8', SYSTEM: '#2D8659' };

function resolveName(text) {
  const name = (localStorage.getItem('oqw-name') || '').trim() || 'operative';
  return text.replace(/\{name\}/g, name);
}

export default class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    this.d = {
      welcome:   document.getElementById('xp-welcome'),
      desktop:   document.getElementById('xp-desktop'),
      admin:     document.getElementById('xpw-admin'),
      pwwrap:    document.getElementById('xpw-pwwrap'),
      pw:        document.getElementById('xpw-pw'),
      go:        document.getElementById('xpw-go'),
      hint:      document.getElementById('xpw-hint'),
      prompt:    document.getElementById('xpw-prompt'),
      turnoff:   document.getElementById('xpw-turnoff'),
      icons:     document.getElementById('xp-icons'),
      start:     document.getElementById('xp-start'),
      startmenu: document.getElementById('xp-startmenu'),
      smUser:    document.getElementById('xpsm-user'),
      tasks:     document.getElementById('xp-tasks'),
      clock:     document.getElementById('xp-clock'),
      vol:       document.getElementById('xp-vol'),
      volpop:    document.getElementById('xp-volpop'),
      call:      document.getElementById('xp-call'),
      callSub:   document.getElementById('call-sub'),
      callActions: document.getElementById('call-actions'),
      callDialogue: document.getElementById('call-dialogue'),
      callSpeaker:  document.getElementById('call-speaker'),
      callLine:     document.getElementById('call-line'),
      callAdvance:  document.getElementById('call-advance'),
      callAccept:   document.getElementById('call-accept'),
      callDecline:  document.getElementById('call-decline'),
      callX:        document.getElementById('xp-call-x'),
      browser:   document.getElementById('xp-browser'),
      browserX:  document.getElementById('xp-browser-x'),
      ieAddr:    document.getElementById('ie-addr'),
      ieFill:    document.getElementById('ie-progress-fill'),
      ieText:    document.getElementById('ie-loading-text'),
    };

    document.body.classList.add('menu-mode');
    this.show(this.d.welcome);
    this.hide(this.d.desktop);
    this.hide(this.d.pwwrap);
    localStorage.setItem('oqw-difficulty', 'easy');   // picker retired → default Easy

    // Audio — single master-volume control (see audio.js). Unmute legacy flags.
    loadMusic(); loadSfx();
    setMusicMuted(false); setSfxMuted(false); setVoiceMuted(false);
    playMusic('menu', { fadeMs: 1200 });

    this.callIdx = 0;
    this.callTyping = false;
    this.callRunning = false;     // dialogue in progress
    this.callDone = false;        // cutscene finished → browser armed
    this.launching = false;
    this.timers = [];

    this.abort = new AbortController();
    const sig = this.abort.signal;
    this.sig = sig;

    // ---- Welcome screen ----
    this.on(this.d.admin, 'click', () => this.selectAdmin(), sig);
    this.on(this.d.admin, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.selectAdmin(); } }, sig);
    this.on(this.d.go, 'click', (e) => { e.stopPropagation(); this.tryLogin(); }, sig);
    if (this.d.pw) {
      this.on(this.d.pw, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.tryLogin(); } }, sig);
      this.on(this.d.pw, 'click', (e) => e.stopPropagation(), sig);
    }
    document.querySelectorAll('.xpw-user.disabled').forEach((el) =>
      el.addEventListener('click', () => this.denyUser(el), { signal: sig }));
    this.on(this.d.turnoff, 'click', () => { beep(140, 0.18, 'sawtooth', 0.08); }, sig);

    // ---- Desktop: icons (delegated), Start, taskbar, tray, Start-menu items ----
    this.on(this.d.icons, 'click', (e) => {
      const icon = e.target.closest('.xp-icon'); if (!icon) return;
      this.selectIcon(icon);
    }, sig);
    this.on(this.d.icons, 'dblclick', (e) => {
      const icon = e.target.closest('.xp-icon'); if (!icon) return;
      this.openApp(icon.dataset.app, icon);
    }, sig);
    this.on(this.d.start, 'click', (e) => { e.stopPropagation(); this.toggleStart(); }, sig);
    this.on(this.d.startmenu, 'click', (e) => {
      const item = e.target.closest('[data-app]'); if (!item) return;
      this.toggleStart(false);
      this.openApp(item.dataset.app, null);
    }, sig);
    this.on(document.getElementById('xpsm-shutdown'), 'click', () => beep(140, 0.18, 'sawtooth', 0.08), sig);
    this.on(document.getElementById('xpsm-logoff'), 'click', () => this.logOff(), sig);
    this.on(this.d.tasks, 'click', (e) => {
      const t = e.target.closest('.xp-task'); if (!t) return;
      this.openApp(t.dataset.app, null);
    }, sig);
    document.querySelectorAll('.xpql').forEach((el) => {
      if (el.dataset.app) el.addEventListener('click', () => this.openApp(el.dataset.app, null), { signal: sig });
    });

    // ---- Tray volume popup (shares the global master-volume control) ----
    this.on(this.d.vol, 'click', (e) => { e.stopPropagation(); this.toggleVol(); }, sig);
    this.on(this.d.volpop, 'click', (e) => e.stopPropagation(), sig);
    wireVolumeControl({
      slider: document.getElementById('xp-vol-slider'),
      val:    document.getElementById('xp-vol-val'),
      mute:   document.getElementById('xp-vol-mute'),
    }, { signal: sig });

    // ---- Toto call ----
    this.on(this.d.callAccept, 'click', (e) => { e.stopPropagation(); this.acceptCall(); }, sig);
    this.on(this.d.callDecline, 'click', (e) => { e.stopPropagation(); this.declineCall(); }, sig);
    this.on(this.d.callX, 'click', (e) => { e.stopPropagation(); this.declineCall(); }, sig);
    this.on(this.d.call, 'click', () => { if (this.callRunning) this.advanceCall(); }, sig);
    this.on(this.d.browserX, 'click', (e) => { e.stopPropagation(); this.cancelBrowser(); }, sig);

    // Global: SPACE/Enter advance the call; click anywhere closes Start/vol popups.
    this.onKey = (e) => {
      if (this.callRunning && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.advanceCall(); }
    };
    document.addEventListener('keydown', this.onKey, { signal: sig });
    this.onDocClick = () => { this.toggleStart(false); this.toggleVol(false); };
    document.addEventListener('click', this.onDocClick, { signal: sig });

    // Clock
    this.tickClock();
    this.clockInt = setInterval(() => this.tickClock(), 15000);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.abort.abort();
      clearInterval(this.clockInt);
      this.timers.forEach(clearTimeout);
      stopVoice();
      // Make sure no XP layer is left covering whatever scene comes next.
      ['welcome', 'desktop', 'call', 'browser', 'startmenu', 'volpop'].forEach((k) => this.hide(this.d[k]));
    });
  }

  // ===== helpers =====
  on(el, ev, fn, sig) { if (el) el.addEventListener(ev, fn, sig ? { signal: sig } : undefined); }
  show(el) { el?.classList.remove('hidden'); }
  hide(el) { el?.classList.add('hidden'); }
  later(fn, ms) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }

  tickClock() {
    if (!this.d.clock) return;
    const d = new Date();
    let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
    this.d.clock.textContent = `${h}:${m} ${ap}`;
  }

  // ===== Welcome / login =====
  selectAdmin() {
    initAudio();
    this.d.admin?.classList.add('selected');
    this.show(this.d.pwwrap);
    if (this.d.prompt) this.d.prompt.textContent = 'Type your name as the password, then press the green arrow.';
    if (this.d.hint) { this.d.hint.classList.remove('error'); this.d.hint.textContent = 'Hint: type your name'; }
    beep(900, 0.04, 'square', 0.04);
    this.later(() => this.d.pw?.focus(), 60);
  }
  denyUser(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
    beep(160, 0.16, 'square', 0.05); noise(0.06, 0.05);
  }
  tryLogin() {
    const v = (this.d.pw?.value || '').trim();
    if (!v) {
      if (this.d.hint) { this.d.hint.classList.add('error'); this.d.hint.textContent = 'Type your name to log on.'; }
      this.d.admin?.classList.add('shake');
      setTimeout(() => this.d.admin?.classList.remove('shake'), 400);
      beep(160, 0.16, 'square', 0.05);
      return;
    }
    localStorage.setItem('oqw-name', v);
    beep(880, 0.05, 'sine', 0.06);
    this.later(() => beep(1320, 0.12, 'sine', 0.06), 90);
    // brief "logging on" then desktop
    if (this.d.prompt) this.d.prompt.textContent = 'Loading your personal settings…';
    this.later(() => this.showDesktop(v), 700);
  }

  showDesktop(name) {
    this.hide(this.d.welcome);
    this.show(this.d.desktop);
    if (this.d.smUser) this.d.smUser.textContent = name;
    // XP "ta-da" chord
    [523, 659, 784, 1047].forEach((f, i) => this.later(() => beep(f, 0.16, 'sine', 0.06), i * 110));
    // Toto rings shortly after the desktop settles.
    this.later(() => this.popCall(), 1500);
  }

  // ===== Toto call =====
  popCall() {
    if (this.callDone) return;
    this.show(this.d.call);
    this.callRing(0);
  }
  callRing(n) {
    if (this.callRunning || this.callDone) return;
    if (n > 8) return;
    beep(680, 0.12, 'square', 0.05);
    this.later(() => beep(620, 0.12, 'square', 0.05), 140);
    if (this.d.callSub && n === 0) this.d.callSub.textContent = 'unknown number · ringing…';
    this.later(() => this.callRing(n + 1), 1600);
  }
  acceptCall() {
    initAudio();
    this.callRunning = true;
    this.hide(this.d.callActions);
    this.show(this.d.callDialogue);
    if (this.d.callSub) this.d.callSub.textContent = 'unknown number · connected';
    beep(440, 0.05, 'sine', 0.06);
    this.callIdx = 0;
    this.showCallLine(0);
  }
  declineCall() {
    this.d.call?.classList.add('shake');
    setTimeout(() => this.d.call?.classList.remove('shake'), 400);
    if (this.d.callSub) this.d.callSub.textContent = "you can't really ignore Toto · still ringing…";
    beep(200, 0.16, 'square', 0.05);
  }
  showCallLine(idx) {
    const line = CALL_LINES[idx];
    if (!line) return this.endCall();
    if (this.d.callSpeaker) {
      this.d.callSpeaker.textContent = line.speaker;
      this.d.callSpeaker.style.background = SPEAKER_COLORS[line.speaker] || '#1a1a1f';
    }
    if (this.d.callLine) this.d.callLine.textContent = '';
    this.d.callAdvance?.classList.add('hidden');
    if (line.voiceId) playVoice(line.voiceId); else stopVoice();
    this.callTyping = true;
    let i = 0;
    const text = resolveName(line.text);
    const tick = () => {
      if (!this.callTyping) { if (this.d.callLine) this.d.callLine.textContent = text; this.d.callAdvance?.classList.remove('hidden'); return; }
      if (i < text.length) {
        i++;
        if (this.d.callLine) this.d.callLine.textContent = text.slice(0, i);
        if (text[i - 1] !== ' ' && Math.random() < 0.25) beep(1700 + Math.random() * 500, 0.005, 'square', 0.012);
        this.callTimer = this.later(tick, 18);
      } else {
        this.callTyping = false;
        this.d.callAdvance?.classList.remove('hidden');
      }
    };
    tick();
  }
  advanceCall() {
    if (!this.callRunning) return;
    if (this.callTyping) {
      this.callTyping = false;
      if (this.d.callLine) this.d.callLine.textContent = resolveName(CALL_LINES[this.callIdx].text);
      this.d.callAdvance?.classList.remove('hidden');
      return;
    }
    this.callIdx++;
    if (this.callIdx >= CALL_LINES.length) return this.endCall();
    this.showCallLine(this.callIdx);
  }
  endCall() {
    this.callRunning = false;
    this.callDone = true;
    stopVoice();
    // Close the call, arm + highlight the browser path.
    this.later(() => this.hide(this.d.call), 400);
    document.querySelectorAll('[data-app="browser"]').forEach((el) => el.classList.add('xp-pulse'));
    beep(660, 0.08, 'sine', 0.06);
  }

  // ===== Apps =====
  openApp(app, iconEl) {
    if (app === 'browser') return this.launchBrowser();
    // Before the call is answered, nudge the player to pick up.
    if (!this.callDone && this.d.call && !this.d.call.classList.contains('hidden')) {
      this.declineCall();
      return;
    }
    // Everything else: polite XP error ding + shake.
    if (iconEl) { iconEl.classList.add('shake'); setTimeout(() => iconEl.classList.remove('shake'), 400); }
    beep(180, 0.14, 'square', 0.05); noise(0.05, 0.05);
  }
  selectIcon(icon) {
    document.querySelectorAll('.xp-icon.selected').forEach((i) => i.classList.remove('selected'));
    icon.classList.add('selected');
  }

  launchBrowser() {
    if (this.launching) return;
    // If Toto is still calling and hasn't been answered, answer first.
    if (!this.callDone && this.d.call && !this.d.call.classList.contains('hidden')) {
      this.declineCall();
      return;
    }
    this.launching = true;
    this.toggleStart(false);
    this.show(this.d.browser);
    // ensure a taskbar entry feel — bring IE forward (already top z via class)
    if (this.d.ieFill) this.d.ieFill.style.width = '0%';
    if (this.d.ieText) this.d.ieText.textContent = 'Connecting…';
    if (this.d.ieAddr) this.d.ieAddr.textContent = 'http://totallynormaltube.gov.??/';
    beep(900, 0.04, 'square', 0.04);

    // Fake load, then enter the tutorial.
    const steps = [
      { p: 18, t: 'Connecting…' },
      { p: 44, t: 'Spoofing user agent — NormalBrowser/1.0' },
      { p: 72, t: 'Opening sandbox page…' },
      { p: 100, t: 'Done' },
    ];
    steps.forEach((s, i) => this.later(() => {
      if (this.d.ieFill) this.d.ieFill.style.width = s.p + '%';
      if (this.d.ieText) this.d.ieText.textContent = s.t;
      beep(1200 + i * 150, 0.03, 'square', 0.03);
    }, 350 + i * 480));

    this.later(() => this.enterTutorial(), 350 + steps.length * 480 + 350);
  }
  cancelBrowser() {
    this.hide(this.d.browser);
    this.launching = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
  enterTutorial() {
    // The XP layers are DOM overlays (not tied to menu-mode), so hide them
    // explicitly or they linger on top of the game canvas.
    this.hide(this.d.browser);
    this.hide(this.d.call);
    this.hide(this.d.startmenu);
    this.hide(this.d.volpop);
    this.hide(this.d.desktop);
    this.hide(this.d.welcome);
    document.body.classList.remove('menu-mode');
    this.scene.start('TutorialScene', { difficulty: 'easy' });
  }

  // ===== Start menu / tray =====
  toggleStart(force) {
    const open = force === undefined ? this.d.startmenu?.classList.contains('hidden') : force;
    if (open) { this.show(this.d.startmenu); this.d.start?.classList.add('open'); }
    else { this.hide(this.d.startmenu); this.d.start?.classList.remove('open'); }
  }
  toggleVol(force) {
    const open = force === undefined ? this.d.volpop?.classList.contains('hidden') : force;
    if (open) this.show(this.d.volpop); else this.hide(this.d.volpop);
  }
  logOff() {
    // Back to the welcome screen.
    this.toggleStart(false);
    this.hide(this.d.desktop);
    this.show(this.d.welcome);
    this.callDone = false; this.callRunning = false; this.launching = false;
    this.hide(this.d.call); this.hide(this.d.browser);
    document.querySelectorAll('.xp-pulse').forEach((el) => el.classList.remove('xp-pulse'));
    beep(440, 0.1, 'sine', 0.05);
  }
}
