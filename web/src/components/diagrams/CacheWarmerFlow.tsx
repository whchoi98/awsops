'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 300;

export default function CacheWarmerFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const cx = width / 2;
    const boxH = 40 * s;
    const boxR = 6 * s;

    // Animation: pulse every ~180 frames (3s at 60fps)
    const pulseFrame = frame % 180;
    const isPulse = pulseFrame < 60;
    const pulseT = isPulse ? pulseFrame / 60 : 0;

    // Helpers
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false, label?: string, sub?: string) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, boxR);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (label) drawText(label, x + w / 2, y + (sub ? h / 2 - 7 * s : h / 2), THEME.text, 10);
      if (sub) drawText(sub, x + w / 2, y + h / 2 + 8 * s, THEME.muted, 8);
    }

    function drawBadge(x: number, y: number, text: string, color: string) {
      const bw = (text.length * 6 + 14) * s;
      const bh = 18 * s;
      ctx.fillStyle = color + '33';
      roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 4 * s);
      ctx.fill();
      drawText(text, x, y, color, 9);
    }

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const hl = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(angle - Math.PI / 6), y2 - hl * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - hl * Math.cos(angle + Math.PI / 6), y2 - hl * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
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

    // Layout: left subgroup (cache-warmer.ts) and right subgroup (node-cache)
    const leftW = width * 0.62;
    const rightW = width * 0.28;
    const gapX = width * 0.05;
    const leftX = 12 * s;
    const rightX = leftX + leftW + gapX;
    const groupY = 20 * s;
    const groupH = height - 40 * s;

    // Left subgroup: cache-warmer.ts
    ctx.fillStyle = THEME.cyan + '0a';
    roundRect(ctx, leftX, groupY, leftW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '44';
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    roundRect(ctx, leftX, groupY, leftW, groupH, 8 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText('cache-warmer.ts', leftX + 12 * s, groupY + 14 * s, THEME.cyan, 10, 'left');

    // Boxes inside left group
    const innerPad = 14 * s;
    const innerW = (leftW - innerPad * 3) / 2;
    const row1Y = groupY + 32 * s;
    const row2Y = row1Y + boxH + 16 * s;

    // Init box
    const initX = leftX + innerPad;
    const initHover = isHover(mouse.x, mouse.y, initX, row1Y, innerW, boxH);
    drawBox(initX, row1Y, innerW, boxH, THEME.cyan, initHover, 'ensureCacheWarmerStarted()', 'lazy-init');

    // Timer box
    const timerX = leftX + innerPad * 2 + innerW;
    const timerGlow = isPulse;
    const timerHover = isHover(mouse.x, mouse.y, timerX, row1Y, innerW, boxH);
    drawBox(timerX, row1Y, innerW, boxH, THEME.orange, timerHover || timerGlow, 'setInterval', '4 min cycle');

    // Dashboard queries
    const dashX = leftX + innerPad;
    const dashHover = isHover(mouse.x, mouse.y, dashX, row2Y, innerW, boxH);
    const dashGlow = isPulse && pulseT > 0.3;
    drawBox(dashX, row2Y, innerW, boxH, THEME.cyan, dashHover || dashGlow, 'Dashboard Queries');
    drawBadge(dashX + innerW / 2, row2Y + boxH + 12 * s, '23', THEME.cyan);

    // Monitoring queries
    const monX = leftX + innerPad * 2 + innerW;
    const monHover = isHover(mouse.x, mouse.y, monX, row2Y, innerW, boxH);
    const monGlow = isPulse && pulseT > 0.3;
    drawBox(monX, row2Y, innerW, boxH, THEME.cyan, monHover || monGlow, 'Monitoring Queries');
    drawBadge(monX + innerW / 2, row2Y + boxH + 12 * s, '10', THEME.cyan);

    // Arrows inside left group
    drawArrow(initX + innerW, row1Y + boxH / 2, timerX, row1Y + boxH / 2, THEME.dim);
    drawArrow(timerX + innerW / 2, row1Y + boxH, dashX + innerW / 2, row2Y, THEME.orange + '88');
    drawArrow(timerX + innerW / 2, row1Y + boxH, monX + innerW / 2, row2Y, THEME.orange + '88');

    // Right subgroup: node-cache
    ctx.fillStyle = THEME.green + '0a';
    roundRect(ctx, rightX, groupY, rightW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.green + '44';
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    roundRect(ctx, rightX, groupY, rightW, groupH, 8 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText('node-cache', rightX + 12 * s, groupY + 14 * s, THEME.green, 10, 'left');

    // Cache box
    const cacheY = groupY + 32 * s + (boxH + 16 * s) / 2;
    const cacheW = rightW - innerPad * 2;
    const cacheX = rightX + innerPad;
    const cacheGlow = isPulse && pulseT > 0.6;
    const cacheHover = isHover(mouse.x, mouse.y, cacheX, cacheY, cacheW, boxH * 1.5);
    drawBox(cacheX, cacheY, cacheW, boxH * 1.5, THEME.green, cacheHover || cacheGlow);
    drawText('TTL: 5 min', cacheX + cacheW / 2, cacheY + boxH * 0.45, THEME.green, 12);
    drawText('33 queries cached', cacheX + cacheW / 2, cacheY + boxH * 1.05, THEME.muted, 9);

    // Arrows: queries → cache
    const arrowFromDash = dashX + innerW;
    const arrowFromMon = monX + innerW;
    const arrowTo = cacheX;
    const arrowMidY = row2Y + boxH / 2;
    drawArrow(arrowFromDash, arrowMidY, arrowTo, cacheY + boxH * 0.5, THEME.green + '88');
    drawArrow(arrowFromMon, arrowMidY, arrowTo, cacheY + boxH * 1.0, THEME.green + '88');

    // Animated particles during pulse
    if (isPulse) {
      if (pulseT < 0.3) {
        // Timer pulse glow effect
        const timerCx = timerX + innerW / 2;
        const timerCy = row1Y + boxH / 2;
        const radius = (10 + pulseT * 30) * s;
        const alpha = Math.max(0, 1 - pulseT * 3);
        ctx.beginPath();
        ctx.arc(timerCx, timerCy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = THEME.orange + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 2 * s;
        ctx.stroke();
      } else if (pulseT < 0.6) {
        // Timer → queries
        const t = (pulseT - 0.3) / 0.3;
        drawParticle(
          timerX + innerW / 2 + t * (dashX + innerW / 2 - timerX - innerW / 2),
          row1Y + boxH + t * (row2Y - row1Y - boxH),
          THEME.cyan,
        );
        drawParticle(
          timerX + innerW / 2 + t * (monX + innerW / 2 - timerX - innerW / 2),
          row1Y + boxH + t * (row2Y - row1Y - boxH),
          THEME.cyan,
        );
      } else {
        // Queries → cache
        const t = (pulseT - 0.6) / 0.4;
        drawParticle(
          arrowFromDash + t * (arrowTo - arrowFromDash),
          arrowMidY + t * (cacheY + boxH * 0.5 - arrowMidY),
          THEME.green,
        );
        drawParticle(
          arrowFromMon + t * (arrowTo - arrowFromMon),
          arrowMidY + t * (cacheY + boxH * 1.0 - arrowMidY),
          THEME.green,
        );
      }
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
