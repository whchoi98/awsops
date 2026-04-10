'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 250;

interface EventBox {
  type: string;
  content: string;
  color: string;
}

const EVENTS: EventBox[] = [
  { type: 'status', content: '\uBD84\uC11D \uC911', color: THEME.orange },
  { type: 'status', content: 'Gateway \uC5F0\uACB0', color: THEME.orange },
  { type: 'chunk', content: '\uC751\uB2F5 \uD14D\uC2A4\uD2B8...', color: THEME.green },
  { type: 'chunk', content: '\uCD94\uAC00 \uD14D\uC2A4\uD2B8...', color: THEME.green },
  { type: 'done', content: '\uC644\uB8CC + \uBA54\uD0C0', color: THEME.purple },
];

export default function SSEEventsFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const count = EVENTS.length;
    const marginX = 20 * s;
    const marginY = 30 * s;
    const arrowW = 24 * s;
    const totalArrowW = (count - 1) * arrowW;
    const availW = width - marginX * 2 - totalArrowW;
    const boxW = availW / count;
    const boxH = height - marginY * 2 - 30 * s;
    const baseY = marginY + 20 * s;
    const badgeH = 20 * s;

    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    // Title
    drawText('Server-Sent Events Flow', width / 2, marginY - 5 * s, THEME.muted, 10);

    const positions: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let i = 0; i < count; i++) {
      const ev = EVENTS[i];
      const bx = marginX + i * (boxW + arrowW);
      const by = baseY;
      positions.push({ x: bx, y: by, w: boxW, h: boxH });

      const hovered = isHover(mouse.x, mouse.y, bx, by, boxW, boxH);

      if (hovered) {
        ctx.shadowColor = ev.color;
        ctx.shadowBlur = 15 * s;
      }

      // Box
      ctx.fillStyle = THEME.card;
      roundRect(ctx, bx, by, boxW, boxH, 8 * s);
      ctx.fill();
      ctx.strokeStyle = hovered ? ev.color : THEME.border;
      ctx.lineWidth = (hovered ? 2 : 1.5) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Type badge
      const badgeW = (ev.type.length * 7 + 16) * s;
      const badgeX = bx + boxW / 2 - badgeW / 2;
      const badgeY = by + 10 * s;
      ctx.fillStyle = ev.color + '33';
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4 * s);
      ctx.fill();
      drawText(ev.type, bx + boxW / 2, badgeY + badgeH / 2, ev.color, 9);

      // Content
      drawText(ev.content, bx + boxW / 2, by + boxH / 2 + 10 * s, THEME.text, 10);

      // Arrow to next
      if (i < count - 1) {
        const ax1 = bx + boxW + 3 * s;
        const ax2 = bx + boxW + arrowW - 3 * s;
        const ay = by + boxH / 2;
        ctx.strokeStyle = THEME.dim;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax2, ay);
        ctx.stroke();

        // Arrowhead
        const headLen = 6 * s;
        ctx.beginPath();
        ctx.moveTo(ax2, ay);
        ctx.lineTo(ax2 - headLen, ay - headLen * 0.6);
        ctx.lineTo(ax2 - headLen, ay + headLen * 0.6);
        ctx.closePath();
        ctx.fillStyle = THEME.dim;
        ctx.fill();
      }
    }

    // Animated particle
    const cycleDuration = 240;
    const progress = (frame % cycleDuration) / cycleDuration;
    const totalLen = count - 1;
    const segF = progress * totalLen;
    const seg = Math.min(Math.floor(segF), totalLen - 1);
    const segT = segF - seg;

    if (positions.length >= 2) {
      const p1 = positions[seg];
      const p2 = positions[seg + 1];
      const px = (p1.x + p1.w) + segT * (p2.x - p1.x - p1.w);
      const py = p1.y + p1.h / 2;

      const pColor = EVENTS[seg].color;
      ctx.beginPath();
      ctx.arc(px, py, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = pColor;
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
