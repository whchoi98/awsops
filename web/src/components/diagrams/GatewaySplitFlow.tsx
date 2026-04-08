'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 300;

export default function GatewaySplitFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Layout
    const centerX = width / 2;
    const dividerX = centerX;
    const leftCenterX = width * 0.25;
    const rightCenterX = width * 0.75;

    const boxW = Math.min(200 * s, width * 0.3);
    const boxH = 70 * s;
    const headerY = 25 * s;
    const boxY = height / 2 - boxH / 2 + 10 * s;

    // Helpers
    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, 8 * s);
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

    // Background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    // Divider line
    ctx.strokeStyle = THEME.dim;
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(dividerX, 50 * s);
    ctx.lineTo(dividerX, height - 20 * s);
    ctx.stroke();
    ctx.setLineDash([]);

    // Section headers
    ctx.font = `bold ${14 * s}px Inter, system-ui, sans-serif`;
    drawText('Before (v1.1.0)', leftCenterX, headerY, THEME.muted, 14);
    drawText('After (v1.2.0)', rightCenterX, headerY, THEME.text, 14);

    // Left side: Infra Gateway
    const infraX = leftCenterX - boxW / 2;
    const infraHovered = isHover(mouse.x, mouse.y, infraX, boxY, boxW, boxH);
    drawBox(infraX, boxY, boxW, boxH, THEME.orange, infraHovered);
    drawText('Infra Gateway', leftCenterX, boxY + 22 * s, THEME.text, 13);
    // Tool count badge
    const infraBadgeW = 60 * s;
    ctx.fillStyle = THEME.orange + '33';
    roundRect(ctx, leftCenterX - infraBadgeW / 2, boxY + boxH - 28 * s, infraBadgeW, 18 * s, 4 * s);
    ctx.fill();
    drawText('41 tools', leftCenterX, boxY + boxH - 19 * s, THEME.orange, 10);

    // Right side: Network + Container
    const rightBoxW = Math.min(170 * s, width * 0.25);
    const netY = boxY - 20 * s;
    const conY = boxY + boxH + 10 * s - 20 * s;
    const netX = rightCenterX - rightBoxW / 2;
    const conX = rightCenterX - rightBoxW / 2;

    const netHovered = isHover(mouse.x, mouse.y, netX, netY, rightBoxW, boxH);
    const conHovered = isHover(mouse.x, mouse.y, conX, conY, rightBoxW, boxH);

    drawBox(netX, netY, rightBoxW, boxH, THEME.cyan, netHovered);
    drawText('Network GW', rightCenterX, netY + 22 * s, THEME.text, 12);
    const netBadgeW = 60 * s;
    ctx.fillStyle = THEME.cyan + '33';
    roundRect(ctx, rightCenterX - netBadgeW / 2, netY + boxH - 28 * s, netBadgeW, 18 * s, 4 * s);
    ctx.fill();
    drawText('17 tools', rightCenterX, netY + boxH - 19 * s, THEME.cyan, 10);

    drawBox(conX, conY, rightBoxW, boxH, THEME.green, conHovered);
    drawText('Container GW', rightCenterX, conY + 22 * s, THEME.text, 12);
    const conBadgeW = 60 * s;
    ctx.fillStyle = THEME.green + '33';
    roundRect(ctx, rightCenterX - conBadgeW / 2, conY + boxH - 28 * s, conBadgeW, 18 * s, 4 * s);
    ctx.fill();
    drawText('24 tools', rightCenterX, conY + boxH - 19 * s, THEME.green, 10);

    // Animated split arrows from Infra to Network and Container
    const arrowProgress = (Math.sin(frame * 0.03) + 1) / 2; // oscillate 0..1

    // Arrow to Network
    const fromX = infraX + boxW;
    const fromY = boxY + boxH / 2;
    const toNetX = netX;
    const toNetY = netY + boxH / 2;
    const toConX = conX;
    const toConY = conY + boxH / 2;

    // Draw arrow lines
    ctx.strokeStyle = THEME.cyan + '80';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toNetX, toNetY);
    ctx.stroke();

    ctx.strokeStyle = THEME.green + '80';
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toConX, toConY);
    ctx.stroke();

    // Arrowheads
    function drawArrowHead(tx: number, ty: number, fx: number, fy: number, color: string) {
      const angle = Math.atan2(ty - fy, tx - fx);
      const headLen = 10 * s;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    drawArrowHead(toNetX, toNetY, fromX, fromY, THEME.cyan);
    drawArrowHead(toConX, toConY, fromX, fromY, THEME.green);

    // Animated particles along arrows
    const particleT = (frame % 90) / 90;

    // Particle to Network
    const pNetX = fromX + (toNetX - fromX) * particleT;
    const pNetY = fromY + (toNetY - fromY) * particleT;
    ctx.beginPath();
    ctx.arc(pNetX, pNetY, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.cyan;
    ctx.shadowColor = THEME.cyan;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Particle to Container
    const pConX = fromX + (toConX - fromX) * particleT;
    const pConY = fromY + (toConY - fromY) * particleT;
    ctx.beginPath();
    ctx.arc(pConX, pConY, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.green;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bottom note
    drawText('54% faster container responses (50s \u2192 23s)', centerX, height - 20 * s, THEME.muted, 10);
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
