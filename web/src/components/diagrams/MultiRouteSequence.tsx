'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 450;

interface Participant {
  label: string;
  color: string;
}

const PARTICIPANTS: Participant[] = [
  { label: 'User', color: THEME.muted },
  { label: 'route.ts', color: THEME.cyan },
  { label: 'Intent\nClassifier', color: THEME.purple },
  { label: 'Network\nGW', color: THEME.green },
  { label: 'Cost\nGW', color: THEME.orange },
  { label: 'Bedrock', color: THEME.purple },
];

export default function MultiRouteSequence(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const headerH = 50 * s;
    const headerY = 15 * s;
    const lifelineTop = headerY + headerH + 5 * s;
    const lifelineBottom = height - 20 * s;
    const colCount = PARTICIPANTS.length;
    const margin = 30 * s;
    const colW = (width - margin * 2) / colCount;

    function colX(i: number) {
      return margin + colW * i + colW / 2;
    }

    // --- helpers ---
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawMultiText(text: string, x: number, y: number, color: string, size: number) {
      const lines = text.split('\n');
      const lineH = (size + 3) * s;
      const startY = y - ((lines.length - 1) * lineH) / 2;
      for (let i = 0; i < lines.length; i++) {
        drawText(lines[i], x, startY + i * lineH, color, size);
      }
    }

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string, label?: string, dashed = false) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      if (dashed) ctx.setLineDash([6 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 8 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      if (label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 10 * s;
        drawText(label, midX, midY, THEME.text, 8);
      }
    }

    // --- Header boxes ---
    const boxW = Math.min(90 * s, colW - 10 * s);
    const boxH = headerH;

    for (let i = 0; i < colCount; i++) {
      const cx = colX(i);
      const bx = cx - boxW / 2;
      const by = headerY;
      const p = PARTICIPANTS[i];
      const hovered = isHover(mouse.x, mouse.y, bx, by, boxW, boxH);

      if (hovered) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, bx, by, boxW, boxH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      drawMultiText(p.label, cx, by + boxH / 2, THEME.text, 10);
    }

    // --- Lifelines (dashed) ---
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.lineWidth = 1 * s;
    for (let i = 0; i < colCount; i++) {
      const cx = colX(i);
      ctx.strokeStyle = PARTICIPANTS[i].color + '44';
      ctx.beginPath();
      ctx.moveTo(cx, lifelineTop);
      ctx.lineTo(cx, lifelineBottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // --- Message arrows ---
    const msgStartY = lifelineTop + 20 * s;
    const msgGap = 38 * s;
    let y = msgStartY;

    // 1: User -> route.ts "Query"
    drawArrow(colX(0), y, colX(1), y, THEME.cyan, 'User Query');
    y += msgGap;

    // 2: route.ts -> Classifier "Intent classify"
    drawArrow(colX(1), y, colX(2), y, THEME.purple, 'Intent Classify');
    y += msgGap;

    // 3: Classifier -> route.ts "[network, cost]"
    drawArrow(colX(2), y, colX(1), y, THEME.purple, '[network, cost]', true);
    y += msgGap;

    // PARALLEL block
    const parallelStartY = y - 12 * s;
    const parallelH = msgGap * 2 + 24 * s;

    // parallel bg
    ctx.fillStyle = THEME.green + '0d';
    roundRect(ctx, colX(1) - 30 * s, parallelStartY, colX(4) - colX(1) + 60 * s, parallelH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.green + '44';
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([4 * s, 3 * s]);
    ctx.stroke();
    ctx.setLineDash([]);

    // PARALLEL label
    ctx.fillStyle = THEME.green + '99';
    roundRect(ctx, colX(1) - 28 * s, parallelStartY - 1 * s, 70 * s, 16 * s, 4 * s);
    ctx.fill();
    drawText('PARALLEL', colX(1) + 7 * s, parallelStartY + 7 * s, THEME.green, 7);

    // 4: route.ts -> Network GW
    drawArrow(colX(1), y, colX(3), y, THEME.green, 'Network Analysis');
    y += msgGap;

    // 5: route.ts -> Cost GW
    drawArrow(colX(1), y, colX(4), y, THEME.orange, 'Cost Analysis');
    y += msgGap;

    // 6: Network GW -> route.ts (result)
    drawArrow(colX(3), y, colX(1), y, THEME.green, 'Network Result', true);
    y += msgGap;

    // 7: Cost GW -> route.ts (result)
    drawArrow(colX(4), y, colX(1), y, THEME.orange, 'Cost Result', true);
    y += msgGap;

    // 8: route.ts -> Bedrock "Synthesize"
    drawArrow(colX(1), y, colX(5), y, THEME.purple, 'Synthesize');
    y += msgGap;

    // 9: Bedrock -> route.ts -> User (SSE)
    drawArrow(colX(5), y, colX(0), y, THEME.cyan, 'SSE Streaming');

    // --- Animated particle ---
    const totalSteps = 9;
    const cycleDuration = 360;
    const progress = (frame % cycleDuration) / cycleDuration;
    const stepF = progress * totalSteps;
    const currentStep = Math.floor(stepF);
    const stepT = stepF - currentStep;

    const arrowDefs: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [
      { x1: colX(0), y1: msgStartY, x2: colX(1), y2: msgStartY, color: THEME.cyan },
      { x1: colX(1), y1: msgStartY + msgGap, x2: colX(2), y2: msgStartY + msgGap, color: THEME.purple },
      { x1: colX(2), y1: msgStartY + msgGap * 2, x2: colX(1), y2: msgStartY + msgGap * 2, color: THEME.purple },
      { x1: colX(1), y1: msgStartY + msgGap * 3, x2: colX(3), y2: msgStartY + msgGap * 3, color: THEME.green },
      { x1: colX(1), y1: msgStartY + msgGap * 4, x2: colX(4), y2: msgStartY + msgGap * 4, color: THEME.orange },
      { x1: colX(3), y1: msgStartY + msgGap * 5, x2: colX(1), y2: msgStartY + msgGap * 5, color: THEME.green },
      { x1: colX(4), y1: msgStartY + msgGap * 6, x2: colX(1), y2: msgStartY + msgGap * 6, color: THEME.orange },
      { x1: colX(1), y1: msgStartY + msgGap * 7, x2: colX(5), y2: msgStartY + msgGap * 7, color: THEME.purple },
      { x1: colX(5), y1: msgStartY + msgGap * 8, x2: colX(0), y2: msgStartY + msgGap * 8, color: THEME.cyan },
    ];

    if (currentStep < arrowDefs.length) {
      const a = arrowDefs[currentStep];
      const px = a.x1 + (a.x2 - a.x1) * stepT;
      const py = a.y1 + (a.y2 - a.y1) * stepT;

      ctx.beginPath();
      ctx.arc(px, py, 5 * s, 0, Math.PI * 2);
      ctx.fillStyle = a.color;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 12 * s;
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
