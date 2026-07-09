// Shared "LEVEL COMPLETE" overlay — shown after finishing each level.
//
// One XP-styled dialog with a single primary action: GO BACK TO DESKTOP.
// The progression loop runs through the desktop (Toto's chat unlocks the
// next stage there), so levels never jump directly into one another.
//
//   showLevelComplete({ title, sub, extraHtml, onDesktop, primaryLabel })
//     - extraHtml: optional block injected above the button (e.g. the final
//       level's score entry). Wire its events via the returned element.
//   Returns the overlay root element (already appended to <body>).
//
// The overlay removes itself when the button is clicked, then calls
// onDesktop(). Scenes should also remove #level-complete on SHUTDOWN as a
// safety net.

import { playSfx } from './sfx.js';
import { beep } from './audio.js';

export function showLevelComplete({ title, sub = '', extraHtml = '', onDesktop, primaryLabel = 'GO BACK TO DESKTOP' }) {
  // Never stack two of these
  document.getElementById('level-complete')?.remove();

  const el = document.createElement('div');
  el.id = 'level-complete';
  el.style.cssText =
    'position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(8,10,14,0.62);font-family:Tahoma,Arial,sans-serif;opacity:0;transition:opacity .35s ease;';
  el.innerHTML =
    '<div style="width:440px;background:#ece9d8;border:2px solid #0a246a;box-shadow:6px 6px 0 rgba(0,0,0,0.35);transform:translateY(10px);transition:transform .35s ease;" id="lc-panel">' +
      '<div style="background:#0a246a;color:#fff;font-weight:bold;font-size:13px;padding:6px 10px;display:flex;justify-content:space-between;">' +
        '<span>MISSION UPDATE</span><span style="opacity:.7">SCAN.exe</span>' +
      '</div>' +
      '<div style="padding:18px 20px;text-align:center;">' +
        '<div style="font:bold 15px Consolas,monospace;color:#2D8659;letter-spacing:2px;margin-bottom:6px;">[ LEVEL COMPLETE ]</div>' +
        '<div style="font:bold 26px \'Saira Condensed\',sans-serif;color:#1a1a1f;">' + title + '</div>' +
        (sub ? '<div style="font:13px Tahoma,Arial;color:#555;margin-top:8px;line-height:1.5;">' + sub + '</div>' : '') +
        extraHtml +
        '<div style="margin-top:16px;">' +
          '<button id="lc-desktop" style="padding:9px 22px;font:bold 13px Tahoma;background:#2D8659;color:#fff;border:2px outset #6dc89e;cursor:pointer;">' +
            primaryLabel +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);

  // slide/fade in
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    const panel = el.querySelector('#lc-panel');
    if (panel) panel.style.transform = 'translateY(0)';
  });

  playSfx('exportReady');
  beep(659, 0.12, 'sine', 0.1);
  setTimeout(() => beep(988, 0.2, 'sine', 0.1), 140);

  el.querySelector('#lc-desktop')?.addEventListener('click', () => {
    el.remove();
    onDesktop?.();
  }, { once: true });

  return el;
}

export function removeLevelComplete() {
  document.getElementById('level-complete')?.remove();
}
