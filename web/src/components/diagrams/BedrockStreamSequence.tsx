'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

export default function BedrockStreamSequence(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // 3 Participants
    const participants = [
      { name: 'Client', color: THEME.muted },
      { name: 'API (route.ts)', color: THEME.cyan },
      { name: 'Bedrock', color: THEME.purple },
    ];

    const topY = 20 * s;
    const boxH = 34 * s;
    const boxW = 120 * s;
    const colSpacing = width / (participants.length + 1);

    // Animation
    const totalFrames = 300;
    const progress = (frame % totalFrames) / totalFrames;

    // Helpers
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawMsgArrow(fromCol: number, toCol: number, y: number, label: string, color: string, dashed = false) {
      const x1 = colSpacing * (fromCol + 1);
      const x2 = colSpacing * (toCol + 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      if (dashed) ctx.setLineDash([4 * s, 3 * s]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arrowhead
      const dir = x2 > x1 ? 1 : -1;
      const hl = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - dir * hl, y - hl * 0.5);
      ctx.lineTo(x2 - dir * hl, y + hl * 0.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // Label
      const lx = (x1 + x2) / 2;
      drawText(label, lx, y - 10 * s, color, 8);
    }

    function drawParticle(x: number, y: number, color: string) {
      ctx.beginPath();
      ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw participant boxes and lifelines
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const cx = colSpacing * (i + 1);
      const bx = cx - boxW / 2;
      const hovered = isHover(mouse.x, mouse.y, bx, topY, boxW, boxH);
      drawBox(bx, topY, boxW, boxH, p.color, hovered);
      drawText(p.name, cx, topY + boxH / 2, THEME.text, 11);

      // Lifeline
      ctx.strokeStyle = p.color + '33';
      ctx.lineWidth = 1 * s;
      ctx.setLineDash([4 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(cx, topY + boxH);
      ctx.lineTo(cx, height - 20 * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Messages
    const msgStartY = topY + boxH + 30 * s;
    const msgGap = 36 * s;

    // 1. POST /api/ai
    drawMsgArrow(0, 1, msgStartY, 'POST /api/ai', THEME.cyan);

    // 2. InvokeModelWithResponseStreamCommand
    drawMsgArrow(1, 2, msgStartY + msgGap, 'InvokeModelWithResponseStream', THEME.purple);

    // Loop block
    const loopY = msgStartY + msgGap * 1.6;
    const loopH = msgGap * 3.8;
    const loopX = colSpacing * 0.4;
    const loopW = colSpacing * 3.2;
    ctx.fillStyle = THEME.cyan + '08';
    roundRect(ctx, loopX, loopY, loopW, loopH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '44';
    ctx.lineWidth = 1.5 * s;
    roundRect(ctx, loopX, loopY, loopW, loopH, 6 * s);
    ctx.stroke();

    // Loop label
    const labelW = 80 * s;
    const labelH = 18 * s;
    ctx.fillStyle = THEME.cyan + '33';
    roundRect(ctx, loopX, loopY, labelW, labelH, 4 * s);
    ctx.fill();
    drawText('LOOP', loopX + labelW / 2, loopY + labelH / 2, THEME.cyan, 9);

    // Loop messages
    const lmY = loopY + 34 * s;
    drawMsgArrow(2, 1, lmY, 'Text Chunk', THEME.purple, true);
    drawMsgArrow(1, 0, lmY + msgGap, 'SSE chunk {delta}', THEME.cyan, true);

    // Self-arrow for client render
    const selfY = lmY + msgGap * 2;
    const clientX = colSpacing;
    ctx.strokeStyle = THEME.muted;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(clientX, selfY - 8 * s);
    ctx.lineTo(clientX + 30 * s, selfY - 8 * s);
    ctx.lineTo(clientX + 30 * s, selfY + 8 * s);
    ctx.lineTo(clientX, selfY + 8 * s);
    ctx.stroke();
    const hl2 = 6 * s;
    ctx.beginPath();
    ctx.moveTo(clientX, selfY + 8 * s);
    ctx.lineTo(clientX + hl2, selfY + 8 * s - hl2 * 0.5);
    ctx.lineTo(clientX + hl2, selfY + 8 * s + hl2 * 0.5);
    ctx.closePath();
    ctx.fillStyle = THEME.muted;
    ctx.fill();
    drawText('ReactMarkdown render', clientX + 34 * s, selfY, THEME.muted, 8, 'left');

    // Done message (after loop)
    const doneY = loopY + loopH + 24 * s;
    drawMsgArrow(1, 0, doneY, 'SSE done {content, tools, time}', THEME.green);

    // Animated particles
    if (progress < 0.15) {
      // Client → API
      const t = progress / 0.15;
      const x1 = colSpacing;
      const x2 = colSpacing * 2;
      drawParticle(x1 + t * (x2 - x1), msgStartY, THEME.cyan);
    } else if (progress < 0.3) {
      // API → Bedrock
      const t = (progress - 0.15) / 0.15;
      const x1 = colSpacing * 2;
      const x2 = colSpacing * 3;
      drawParticle(x1 + t * (x2 - x1), msgStartY + msgGap, THEME.purple);
    } else if (progress < 0.8) {
      // Loop: fast cycling chunks
      const loopProgress = (progress - 0.3) / 0.5;
      const chunkCycle = (loopProgress * 4) % 1; // 4 complete cycles
      if (chunkCycle < 0.5) {
        // Bedrock → API
        const t = chunkCycle / 0.5;
        const x1 = colSpacing * 3;
        const x2 = colSpacing * 2;
        drawParticle(x1 + t * (x2 - x1), lmY, THEME.purple);
      } else {
        // API → Client
        const t = (chunkCycle - 0.5) / 0.5;
        const x1 = colSpacing * 2;
        const x2 = colSpacing;
        drawParticle(x1 + t * (x2 - x1), lmY + msgGap, THEME.cyan);
      }
    } else {
      // Done: API → Client
      const t = (progress - 0.8) / 0.2;
      const x1 = colSpacing * 2;
      const x2 = colSpacing;
      drawParticle(x1 + t * (x2 - x1), doneY, THEME.green);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
