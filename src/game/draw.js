// Vanilla 2D canvas draw helpers shared across scenes and agents.
// All take a CanvasRenderingContext2D and draw directly to it.

import { wob } from './physics.js';

// Hand-jittered quadrilateral (the "wobbly rectangle" look).
export function drawHandRect(ctx, x, y, w, h, fill, stroke, seed, lineW = 1.2) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.moveTo(x + wob(seed, 1), y + wob(seed + 1, 1));
  ctx.lineTo(x + w + wob(seed + 2, 1), y + wob(seed + 3, 1));
  ctx.lineTo(x + w + wob(seed + 4, 1), y + h + wob(seed + 5, 1));
  ctx.lineTo(x + wob(seed + 6, 1), y + h + wob(seed + 7, 1));
  ctx.closePath();
  ctx.fill();
  if (stroke) ctx.stroke();
}

// Sidebar recommendation card (idle or agent-controlled).
export function drawRecCard(ctx, x, y, w, h, idx, isAgent, agentState, time, spikeState) {
  const colors = ['#4A7BC8', '#9b59b6', '#2D8659', '#F4D35E', '#E63946', '#0fa3b1', '#888', '#444'];
  const c = colors[idx % colors.length];
  
  const isSpikeTelegraph = spikeState && spikeState.state === 'telegraph';
  if (isSpikeTelegraph) {
    ctx.fillStyle = Math.floor(time * 18) % 2 === 0 ? '#ffe5e5' : '#fff';
    ctx.strokeStyle = '#E63946';
    ctx.lineWidth = 2.5;
  } else if (isAgent && (agentState === 'awakening' || agentState === 'chasing')) {
    ctx.fillStyle = '#E63946';
    ctx.strokeStyle = '#E63946';
    ctx.lineWidth = 2;
  } else {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = isAgent ? '#E63946' : '#ddd';
    ctx.lineWidth = isAgent ? 2 : 1;
  }
  
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  
  ctx.fillStyle = c;
  ctx.fillRect(x + 6, y + 6, 100, h - 12);
  
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x + 6 + 75, y + 6 + h - 28, 26, 14);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('12:34', x + 6 + 78, y + 6 + h - 21);
  
  const titles = [
    'How to do the thing', "You won't BELIEVE this", 'why is this happening',
    'top 10 forbidden tabs', "they don't want you watching", 'asmr keyboard typing',
    'a video about something', 'this changes everything',
  ];
  
  const isHighAlert = isAgent || isSpikeTelegraph;
  ctx.fillStyle = isHighAlert ? '#E63946' : '#1a1a1f';
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(titles[idx % titles.length], x + 114, y + 8);
  ctx.fillStyle = isHighAlert ? '#E63946' : '#888';
  ctx.font = '10px sans-serif';
  ctx.fillText('UnknownChannel', x + 114, y + 28);
  ctx.fillText((100 + idx * 73) + 'K views', x + 114, y + 44);
  ctx.fillText('█ days ago', x + 114, y + 60);
  
  if (isAgent && agentState === 'chasing') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('◣ ◢', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
  }
}

// Comment row (idle, charging, or falling).
export function drawComment(ctx, x, y, w, h, idx, isAgent, agentState, mortarState, time) {
  const charging = isAgent && agentState === 'rumbling';
  const falling = isAgent && agentState === 'falling';
  ctx.fillStyle = charging ? '#ffe5e5' : (falling ? '#1a1a1f' : '#fff');
  ctx.strokeStyle = isAgent ? '#E63946' : '#ddd';
  ctx.lineWidth = isAgent ? 2 : 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  
  const cx = x + 22;
  const cy = y + 22;
  const r = 14;
  const avatarC = ['#4A7BC8', '#2D8659', '#9b59b6', '#F4D35E'];
  let baseColor = avatarC[idx % avatarC.length];

  if (mortarState) {
    if (mortarState.state !== 'idle') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mortarState.angle);
      ctx.fillStyle = '#333333';
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(8, -3, mortarState.barrelLength, 6);
      ctx.fill();
      ctx.stroke();
      
      if (mortarState.state === 'transforming') {
        const pulse = 0.5 + Math.sin(time * 30) * 0.5;
        ctx.strokeStyle = 'rgba(230, 57, 70, ' + pulse + ')';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(8, -3, mortarState.barrelLength, 6);
      }
      ctx.restore();
    }

    if (mortarState.state === 'transforming') {
      baseColor = Math.sin(time * 20) > 0 ? '#E63946' : baseColor;
    } else if (mortarState.state === 'cooldown') {
      baseColor = '#606060';
    }
  }

  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = isAgent ? '#E63946' : (mortarState ? '#1a1a1f' : '#ddd');
  ctx.lineWidth = isAgent ? 2 : (mortarState ? 1.5 : 1);
  ctx.stroke();
  
  if (!mortarState || mortarState.state === 'idle') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('U' + (idx + 1), cx, cy + 1);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = falling ? '#fff' : '#1a1a1f';
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('@user_' + (idx + 1) + '  •  2 hours ago', x + 44, y + 8);
  const normal = [
    'first lol',
    "this is so true. anyway, here's a longer comment about something",
    'who else is watching in 19██?',
    "don't scroll past, important info: ████████████",
  ];
  const menace = 'I SEE YOU LITTLE WINDOW.';
  ctx.fillStyle = falling ? '#E63946' : (charging ? '#E63946' : '#444');
  ctx.font = isAgent && (charging || falling) ? 'bold 13px ui-monospace, monospace' : '11px sans-serif';
  ctx.fillText(charging || falling ? menace : normal[idx % normal.length], x + 44, y + 28);
  ctx.fillStyle = '#888';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('👍 ' + (idx * 47) + '   👎   reply', x + 44, y + 56);
}
