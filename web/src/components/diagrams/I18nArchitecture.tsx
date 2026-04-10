'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

export default function I18nArchitecture(): React.ReactElement {
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

    // --- Top subgroup: i18n Architecture ---
    const topGroupH = 200 * s;
    const topGroupY = margin;
    const topGroupW = width - margin * 2;
    const topGroupX = margin;

    ctx.fillStyle = THEME.card;
    roundRect(ctx, topGroupX, topGroupY, topGroupW, topGroupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('i18n Architecture', topGroupX + topGroupW / 2, topGroupY + 18 * s, THEME.text, 12);

    // LanguageContext box (center)
    const lcW = 170 * s;
    const lcH = 55 * s;
    const lcX = topGroupX + topGroupW / 2 - lcW / 2;
    const lcY = topGroupY + 38 * s;
    const lcHover = isHover(mouse.x, mouse.y, lcX, lcY, lcW, lcH);
    drawBox(lcX, lcY, lcW, lcH, THEME.cyan, lcHover);
    drawText('LanguageContext.tsx', lcX + lcW / 2, lcY + 20 * s, THEME.cyan, 10);
    drawText('Provider + useLanguage', lcX + lcW / 2, lcY + 38 * s, THEME.muted, 9);

    // localStorage box (left)
    const lsW = 120 * s;
    const lsH = 45 * s;
    const lsX = topGroupX + 20 * s;
    const lsY = topGroupY + 42 * s;
    const lsHover = isHover(mouse.x, mouse.y, lsX, lsY, lsW, lsH);
    drawBox(lsX, lsY, lsW, lsH, THEME.muted, lsHover);
    drawText('localStorage', lsX + lsW / 2, lsY + 16 * s, THEME.text, 10);

    // Animated lang toggle
    const langCycle = 180;
    const isKo = (frame % langCycle) < langCycle / 2;
    const langLabel = isKo ? 'lang: ko' : 'lang: en';
    const langColor = isKo ? THEME.cyan : THEME.green;
    drawText(langLabel, lsX + lsW / 2, lsY + 32 * s, langColor, 9);

    // Arrow: LanguageContext -> localStorage
    drawArrow(lcX, lcY + lcH / 2, lsX + lsW, lsY + lsH / 2, THEME.dim);

    // Translation files (right side)
    const trW = 130 * s;
    const trH = 38 * s;
    const trGap = 10 * s;
    const trX = topGroupX + topGroupW - 20 * s - trW;
    const koY = topGroupY + 38 * s;
    const enY = koY + trH + trGap;

    const koHover = isHover(mouse.x, mouse.y, trX, koY, trW, trH);
    drawBox(trX, koY, trW, trH, THEME.cyan, koHover);
    drawText('ko.json', trX + trW / 2, koY + 12 * s, THEME.cyan, 10);
    drawText('500+ keys', trX + trW / 2, koY + 28 * s, THEME.muted, 8);

    const enHover = isHover(mouse.x, mouse.y, trX, enY, trW, trH);
    drawBox(trX, enY, trW, trH, THEME.green, enHover);
    drawText('en.json', trX + trW / 2, enY + 12 * s, THEME.green, 10);
    drawText('500+ keys', trX + trW / 2, enY + 28 * s, THEME.muted, 8);

    // Arrows: LanguageContext -> translations
    drawArrow(lcX + lcW, lcY + lcH * 0.3, trX, koY + trH / 2, THEME.dim);
    drawArrow(lcX + lcW, lcY + lcH * 0.7, trX, enY + trH / 2, THEME.dim);

    // Highlight active translation
    const activeY = isKo ? koY : enY;
    const activeColor = isKo ? THEME.cyan : THEME.green;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 12 * s;
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 2 * s;
    roundRect(ctx, trX, activeY, trW, trH, 6 * s);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- Bottom: 35 Pages row ---
    const bottomY = topGroupY + topGroupH + 30 * s;
    const bottomH = height - bottomY - margin;
    const bottomW = width - margin * 2;

    ctx.fillStyle = THEME.card;
    roundRect(ctx, topGroupX, bottomY, bottomW, bottomH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('35 Pages', topGroupX + bottomW / 2, bottomY + 16 * s, THEME.text, 11);

    // Sample page boxes
    const pageLabels = ['Dashboard', 'EC2', 'VPC', 'S3', 'IAM', 'AI', 'Cost', '...'];
    const pageCount = pageLabels.length;
    const pagePad = 12 * s;
    const pageGap = 8 * s;
    const pageBoxH = bottomH - 36 * s;
    const totalPagesW = bottomW - pagePad * 2;
    const pageBoxW = (totalPagesW - (pageCount - 1) * pageGap) / pageCount;

    for (let i = 0; i < pageCount; i++) {
      const px = topGroupX + pagePad + i * (pageBoxW + pageGap);
      const py = bottomY + 28 * s;
      const phover = isHover(mouse.x, mouse.y, px, py, pageBoxW, pageBoxH);
      drawBox(px, py, pageBoxW, pageBoxH, THEME.dim, phover);
      ctx.fillStyle = THEME.muted;
      ctx.font = `${8 * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(pageLabels[i], px + pageBoxW / 2, py + pageBoxH / 2);
    }

    // Arrow: Pages -> LanguageContext (upward)
    const pagesCenterX = topGroupX + bottomW / 2;
    drawArrow(pagesCenterX, bottomY, pagesCenterX, topGroupY + topGroupH, THEME.dim);
    drawText('useLanguage()', pagesCenterX + 50 * s, topGroupY + topGroupH + 15 * s, THEME.cyan, 9);

    // Animated pulse on the active translation connection
    const pulseP = (frame % 90) / 90;
    const pulseStartX = lcX + lcW;
    const pulseEndX = trX;
    const pulseStartY = isKo ? lcY + lcH * 0.3 : lcY + lcH * 0.7;
    const pulseEndY = isKo ? koY + trH / 2 : enY + trH / 2;
    const px = pulseStartX + (pulseEndX - pulseStartX) * pulseP;
    const py = pulseStartY + (pulseEndY - pulseStartY) * pulseP;
    ctx.beginPath();
    ctx.arc(px, py, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 12 * s;
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
