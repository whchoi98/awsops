'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

interface RouteEntry {
  priority: number;
  label: string;
  color: string;
}

const ROUTES: RouteEntry[] = [
  { priority: 1, label: 'Code Interpreter', color: THEME.orange },
  { priority: 2, label: 'Network GW', color: THEME.cyan },
  { priority: 3, label: 'Container GW', color: THEME.green },
  { priority: 4, label: 'IaC GW', color: THEME.purple },
  { priority: 5, label: 'Data GW', color: THEME.purple },
  { priority: 6, label: 'Security GW', color: THEME.red },
  { priority: 7, label: 'Monitoring GW', color: THEME.orange },
  { priority: 8, label: 'Cost GW', color: THEME.orange },
  { priority: 9, label: 'Steampipe SQL', color: THEME.cyan },
];

const CANVAS_HEIGHT = 350;

export default function KeywordClassification(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Layout columns
    const leftX = 30 * s;
    const midX = width * 0.35;
    const rightX = width * 0.65;
    const rightW = Math.min(150 * s, width * 0.3);

    // Helpers
    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
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

    function drawLine(x1: number, y1: number, x2: number, y2: number, color: string, dashed = false) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      if (dashed) ctx.setLineDash([6 * s, 4 * s]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (dashed) ctx.setLineDash([]);
    }

    // Background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    // Animation: cycle through routes
    const cycleFrames = 120;
    const activeIdx = Math.floor((frame % (cycleFrames * ROUTES.length)) / cycleFrames);
    const progress = (frame % cycleFrames) / cycleFrames;

    // 1. Question Input box (left)
    const qW = 130 * s;
    const qH = 50 * s;
    const qY = height / 2 - qH / 2;
    drawBox(leftX, qY, qW, qH, THEME.cyan);
    drawText('Question', leftX + qW / 2, qY + 18 * s, THEME.text, 12);
    drawText('Input', leftX + qW / 2, qY + 34 * s, THEME.muted, 10);

    // 2. Keyword Classification box (middle top)
    const kwW = 160 * s;
    const kwH = 50 * s;
    const kwX = midX - kwW / 2;
    const kwY = height * 0.25 - kwH / 2;
    drawBox(kwX, kwY, kwW, kwH, THEME.green);
    drawText('Keyword', kwX + kwW / 2, kwY + 18 * s, THEME.text, 12);
    drawText('Classification', kwX + kwW / 2, kwY + 34 * s, THEME.muted, 10);

    // 3. Sonnet Classifier box (middle bottom)
    const scW = 160 * s;
    const scH = 50 * s;
    const scX = midX - scW / 2;
    const scY = height * 0.7 - scH / 2;
    drawBox(scX, scY, scW, scH, THEME.purple);
    drawText('Sonnet Classifier', scX + scW / 2, scY + 18 * s, THEME.text, 11);
    drawText('(no keyword match)', scX + scW / 2, scY + 34 * s, THEME.muted, 9);

    // Connection: Question -> Keyword
    drawLine(leftX + qW, qY + qH / 2 - 8 * s, kwX, kwY + kwH / 2, THEME.green);

    // Connection: Question -> Sonnet (dashed)
    drawLine(leftX + qW, qY + qH / 2 + 8 * s, scX, scY + scH / 2, THEME.purple, true);

    // 4. Route boxes (right column)
    const routeH = 24 * s;
    const routeSpacing = 4 * s;
    const totalRouteH = ROUTES.length * routeH + (ROUTES.length - 1) * routeSpacing;
    const routeStartY = (height - totalRouteH) / 2;

    let hoveredRoute: RouteEntry | null = null;
    let hoverRX = 0;
    let hoverRY = 0;

    for (let i = 0; i < ROUTES.length; i++) {
      const route = ROUTES[i];
      const rx = rightX;
      const ry = routeStartY + i * (routeH + routeSpacing);
      const isActive = i === activeIdx && progress >= 0.5;
      const isHovered = isHover(mouse.x, mouse.y, rx, ry, rightW, routeH);

      if (isHovered) {
        hoveredRoute = route;
        hoverRX = rx;
        hoverRY = ry;
      }

      if (isActive || isHovered) {
        ctx.shadowColor = route.color;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, rx, ry, rightW, routeH, 4 * s);
      ctx.fill();
      ctx.strokeStyle = isActive || isHovered ? route.color : THEME.border;
      ctx.lineWidth = (isActive || isHovered ? 2 : 1) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Priority badge
      const badgeW = 18 * s;
      ctx.fillStyle = route.color + '44';
      roundRect(ctx, rx + 3 * s, ry + 3 * s, badgeW, routeH - 6 * s, 3 * s);
      ctx.fill();
      drawText(String(route.priority), rx + 3 * s + badgeW / 2, ry + routeH / 2, route.color, 9);

      // Route label
      drawText(route.label, rx + 28 * s, ry + routeH / 2, isActive || isHovered ? THEME.text : THEME.muted, 9, 'left');
    }

    // Connections: Keyword -> Routes (fan out)
    for (let i = 0; i < ROUTES.length; i++) {
      const ry = routeStartY + i * (routeH + routeSpacing) + routeH / 2;
      const color = i === activeIdx ? ROUTES[i].color : THEME.dim;
      drawLine(kwX + kwW, kwY + kwH / 2, rightX, ry, color);
    }

    // Connection: Sonnet -> Routes (to center route)
    const midRouteY = routeStartY + 4 * (routeH + routeSpacing) + routeH / 2;
    drawLine(scX + scW, scY + scH / 2, rightX, midRouteY, THEME.purple);

    // 5. Animated particle
    const activeRoute = ROUTES[activeIdx];
    const targetRY = routeStartY + activeIdx * (routeH + routeSpacing) + routeH / 2;
    let particleX: number;
    let particleY: number;

    if (progress < 0.3) {
      const t = progress / 0.3;
      particleX = leftX + qW + t * (kwX - leftX - qW);
      particleY = qY + qH / 2 - 8 * s + t * (kwY + kwH / 2 - qY - qH / 2 + 8 * s);
    } else if (progress < 0.6) {
      const t = (progress - 0.3) / 0.3;
      particleX = kwX + kwW + t * (rightX - kwX - kwW);
      particleY = kwY + kwH / 2 + t * (targetRY - kwY - kwH / 2);
    } else {
      particleX = rightX + rightW / 2;
      particleY = targetRY;
    }

    ctx.beginPath();
    ctx.arc(particleX, particleY, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = activeRoute.color;
    ctx.shadowColor = activeRoute.color;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 6. Hover tooltip
    if (hoveredRoute) {
      const tooltipW = 120 * s;
      const tooltipH = 30 * s;
      let tooltipX = hoverRX - tooltipW - 10 * s;
      const tooltipY = hoverRY - 3 * s;
      if (tooltipX < 5 * s) tooltipX = hoverRX + rightW + 10 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tooltipX, tooltipY, tooltipW, tooltipH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = hoveredRoute.color;
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      drawText('Priority ' + hoveredRoute.priority, tooltipX + tooltipW / 2, tooltipY + tooltipH / 2, hoveredRoute.color, 10);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
