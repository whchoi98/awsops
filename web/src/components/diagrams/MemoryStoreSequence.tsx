'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

interface Participant {
  label: string;
  color: string;
}

const PARTICIPANTS: Participant[] = [
  { label: 'User', color: THEME.muted },
  { label: 'AI Page', color: THEME.cyan },
  { label: '/api/ai', color: THEME.green },
  { label: 'agentcore-memory.ts', color: THEME.purple },
  { label: 'data/memory/', color: THEME.orange },
];

const CANVAS_HEIGHT = 400;

export default function MemoryStoreSequence(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const colCount = PARTICIPANTS.length;
    const margin = 30 * s;
    const colW = (width - margin * 2) / colCount;
    const headerY = 20 * s;
    const headerH = 36 * s;
    const lifelineTop = headerY + headerH;
    const lifelineBot = height - 20 * s;

    // Animation cycle: 420 frames total (7s at 60fps)
    const totalFrames = 420;
    const t = (frame % totalFrames) / totalFrames;

    function colX(i: number): number {
      return margin + colW * i + colW / 2;
    }

    // Helper: draw box with optional glow
    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 15 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    // Draw participant headers
    for (let i = 0; i < colCount; i++) {
      const p = PARTICIPANTS[i];
      const cx = colX(i);
      const boxW = Math.min(colW - 10 * s, 120 * s);
      const hovered = isHover(mouse.x, mouse.y, cx - boxW / 2, headerY, boxW, headerH);
      drawBox(cx - boxW / 2, headerY, boxW, headerH, p.color, hovered);
      drawText(p.label, cx, headerY + headerH / 2, THEME.text, 10);
    }

    // Draw dashed lifelines
    ctx.setLineDash([4 * s, 4 * s]);
    for (let i = 0; i < colCount; i++) {
      const cx = colX(i);
      ctx.strokeStyle = PARTICIPANTS[i].color + '44';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(cx, lifelineTop);
      ctx.lineTo(cx, lifelineBot);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Message definitions: [fromCol, toCol, label, yFraction, color]
    type Msg = [number, number, string, number, string];
    const saveMessages: Msg[] = [
      [0, 1, 'Enter question', 0.08, THEME.muted],
      [1, 2, 'POST /api/ai', 0.16, THEME.cyan],
      [2, 2, 'Generate response', 0.24, THEME.green],
      [2, 3, 'Save conversation', 0.32, THEME.green],
      [3, 3, 'JWT \u2192 email', 0.40, THEME.purple],
      [3, 4, '{email}/{ts}.json', 0.48, THEME.purple],
    ];
    const searchMessages: Msg[] = [
      [0, 1, 'Search history', 0.60, THEME.muted],
      [1, 3, 'Per-user search', 0.68, THEME.cyan],
      [3, 4, 'File scan', 0.76, THEME.purple],
      [4, 1, 'Return results', 0.84, THEME.orange],
    ];

    // Section labels
    const saveY = lifelineTop + (lifelineBot - lifelineTop) * 0.02;
    const searchY = lifelineTop + (lifelineBot - lifelineTop) * 0.54;
    const labelX = 8 * s;

    drawText('Save', labelX, saveY, THEME.green, 9, 'left');
    drawText('Search', labelX, searchY, THEME.cyan, 9, 'left');

    // Divider line between save and search
    const divY = lifelineTop + (lifelineBot - lifelineTop) * 0.54 - 10 * s;
    ctx.setLineDash([2 * s, 3 * s]);
    ctx.strokeStyle = THEME.dim;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(margin, divY);
    ctx.lineTo(width - margin, divY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw messages
    function drawMessage(msgs: Msg[], animStart: number, animEnd: number) {
      for (let i = 0; i < msgs.length; i++) {
        const [from, to, label, yFrac, color] = msgs[i];
        const y = lifelineTop + (lifelineBot - lifelineTop) * yFrac;
        const x1 = colX(from);
        const x2 = colX(to);

        if (from === to) {
          // Self-message (loop arrow)
          const loopW = 30 * s;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 * s;
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x1 + loopW, y);
          ctx.lineTo(x1 + loopW, y + 12 * s);
          ctx.lineTo(x1, y + 12 * s);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(x1, y + 12 * s);
          ctx.lineTo(x1 + 6 * s, y + 8 * s);
          ctx.lineTo(x1 + 6 * s, y + 16 * s);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          drawText(label, x1 + loopW / 2, y - 8 * s, color, 8);
        } else {
          // Arrow between participants
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 * s;
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          // Arrowhead
          const dir = x2 > x1 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x2, y);
          ctx.lineTo(x2 - dir * 8 * s, y - 4 * s);
          ctx.lineTo(x2 - dir * 8 * s, y + 4 * s);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          // Label
          const midX = (x1 + x2) / 2;
          drawText(label, midX, y - 8 * s, color, 8);
        }

        // Animated particle on the active message
        const msgAnimStart = animStart + (animEnd - animStart) * (i / msgs.length);
        const msgAnimEnd = animStart + (animEnd - animStart) * ((i + 1) / msgs.length);
        if (t >= msgAnimStart && t < msgAnimEnd) {
          const p = (t - msgAnimStart) / (msgAnimEnd - msgAnimStart);
          let px: number, py: number;
          if (from === to) {
            px = x1 + 30 * s * (p < 0.5 ? p * 2 : 1 - (p - 0.5) * 2);
            py = y + (p < 0.5 ? 0 : 12 * s * (p - 0.5) * 2);
          } else {
            px = x1 + (x2 - x1) * p;
            py = y;
          }
          ctx.beginPath();
          ctx.arc(px, py, 4 * s, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12 * s;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    drawMessage(saveMessages, 0, 0.5);
    drawMessage(searchMessages, 0.5, 1.0);
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
