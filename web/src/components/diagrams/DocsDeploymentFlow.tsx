'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 250;

export default function DocsDeploymentFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const margin = 20 * s;

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
        ctx.shadowBlur = 15 * s;
      }
      ctx.fillStyle = THEME.bg;
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 8 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Main flow: 4 boxes left to right
    const mainFlowY = 40 * s;
    const boxH = 60 * s;
    const boxGap = 16 * s;
    const availW = width - margin * 2;
    const boxW = (availW - boxGap * 3) / 4;

    interface FlowBox { label: string; sub: string; color: string }
    const mainBoxes: FlowBox[] = [
      { label: 'web/ source', sub: 'Docusaurus', color: THEME.cyan },
      { label: 'npm run build', sub: 'Static generation', color: THEME.orange },
      { label: 'GitHub Pages', sub: 'gh-pages branch', color: THEME.green },
      { label: 'Site URL', sub: 'atomai.click/awsops/', color: THEME.text },
    ];

    for (let i = 0; i < mainBoxes.length; i++) {
      const bx = margin + i * (boxW + boxGap);
      const b = mainBoxes[i];
      const hovered = isHover(mouse.x, mouse.y, bx, mainFlowY, boxW, boxH);
      drawBox(bx, mainFlowY, boxW, boxH, b.color, hovered);
      drawText(b.label, bx + boxW / 2, mainFlowY + 22 * s, b.color, 10);
      drawText(b.sub, bx + boxW / 2, mainFlowY + 42 * s, THEME.muted, 8);

      // Arrows between main boxes
      if (i < mainBoxes.length - 1) {
        drawArrow(bx + boxW, mainFlowY + boxH / 2, bx + boxW + boxGap, mainFlowY + boxH / 2, THEME.dim);
      }
    }

    // Main flow animated particle
    const mainCycle = 180;
    const mainP = (frame % mainCycle) / mainCycle;
    const mainStartX = margin + boxW;
    const mainEndX = margin + 3 * (boxW + boxGap);
    const mainPX = mainStartX + (mainEndX - mainStartX) * mainP;
    ctx.beginPath();
    ctx.arc(mainPX, mainFlowY + boxH / 2, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.green;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Secondary flow: Playwright -> Screenshots -> source
    const secFlowY = mainFlowY + boxH + 50 * s;
    const secBoxH = 50 * s;
    const secBoxW = (availW - boxGap * 2) / 3;

    interface SecBox { label: string; sub: string; color: string }
    const secBoxes: SecBox[] = [
      { label: 'Playwright', sub: 'Browser automation', color: THEME.purple },
      { label: 'Screenshots', sub: 'Multi-DPR generation', color: THEME.purple },
      { label: 'web/ source', sub: 'Static assets', color: THEME.cyan },
    ];

    for (let i = 0; i < secBoxes.length; i++) {
      const bx = margin + i * (secBoxW + boxGap);
      const b = secBoxes[i];
      const hovered = isHover(mouse.x, mouse.y, bx, secFlowY, secBoxW, secBoxH);
      drawBox(bx, secFlowY, secBoxW, secBoxH, b.color, hovered);
      drawText(b.label, bx + secBoxW / 2, secFlowY + 18 * s, b.color, 10);
      drawText(b.sub, bx + secBoxW / 2, secFlowY + 34 * s, THEME.muted, 8);

      if (i < secBoxes.length - 1) {
        drawArrow(bx + secBoxW, secFlowY + secBoxH / 2, bx + secBoxW + boxGap, secFlowY + secBoxH / 2, THEME.dim);
      }
    }

    // Arrow from Screenshots row -> main source (upward)
    const srcBoxEndX = margin + boxW / 2;
    const ssBoxX = margin + 2 * (secBoxW + boxGap) + secBoxW / 2;
    drawArrow(ssBoxX, secFlowY, srcBoxEndX, mainFlowY + boxH, THEME.dim);

    // Secondary flow animated particle
    const secP = ((frame + 90) % mainCycle) / mainCycle;
    const secStartX = margin + secBoxW;
    const secEndX = margin + 2 * (secBoxW + boxGap);
    const secPX = secStartX + (secEndX - secStartX) * secP;
    ctx.beginPath();
    ctx.arc(secPX, secFlowY + secBoxH / 2, 3 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.purple;
    ctx.shadowColor = THEME.purple;
    ctx.shadowBlur = 10 * s;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
