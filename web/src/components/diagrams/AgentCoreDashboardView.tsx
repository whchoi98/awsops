'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

interface GatewayCard {
  name: string;
  tools: number;
  color: string;
}

const GATEWAYS: GatewayCard[] = [
  { name: 'Network', tools: 17, color: THEME.cyan },
  { name: 'Container', tools: 24, color: THEME.green },
  { name: 'IaC', tools: 12, color: THEME.purple },
  { name: 'Data', tools: 24, color: THEME.cyan },
  { name: 'Security', tools: 14, color: THEME.red },
  { name: 'Monitoring', tools: 16, color: THEME.orange },
  { name: 'Cost', tools: 9, color: THEME.green },
  { name: 'Ops', tools: 9, color: THEME.muted },
];

export default function AgentCoreDashboardView(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const margin = 20 * s;
    const apiArrowW = 110 * s;
    const dashLeft = margin + apiArrowW;
    const dashRight = width - margin;
    const dashW = dashRight - dashLeft;
    const dashTop = margin;
    const dashBottom = height - margin;
    const dashH = dashBottom - dashTop;

    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    // --- Outer container ---
    ctx.fillStyle = THEME.bg;
    roundRect(ctx, dashLeft, dashTop, dashW, dashH, 10 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // Dashboard title
    const titleY = dashTop + 24 * s;
    drawText('AgentCore \uB300\uC2DC\uBCF4\uB4DC', dashLeft + dashW / 2, titleY, THEME.text, 14);

    // --- Runtime Status ---
    const rtY = dashTop + 48 * s;
    const rtH = 40 * s;
    const rtW = dashW - 40 * s;
    const rtX = dashLeft + 20 * s;

    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.05);
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = (8 + pulse * 10) * s;
    ctx.fillStyle = THEME.card;
    roundRect(ctx, rtX, rtY, rtW, rtH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.green;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Status dot
    const dotR = 5 * s;
    const dotX = rtX + 20 * s;
    const dotY = rtY + rtH / 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = THEME.green;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 8 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    drawText('Runtime Status: ACTIVE', rtX + rtW / 2, rtY + rtH / 2, THEME.green, 11);

    // --- Gateway Grid 2x4 ---
    const gwTop = rtY + rtH + 16 * s;
    const gwCols = 4;
    const gwRows = 2;
    const gwGapX = 10 * s;
    const gwGapY = 10 * s;
    const gwTotalW = rtW;
    const gwCardW = (gwTotalW - (gwCols - 1) * gwGapX) / gwCols;
    const gwCardH = 60 * s;

    let hoveredGw: GatewayCard | null = null;
    let hoverGwX = 0;
    let hoverGwY = 0;

    for (let i = 0; i < GATEWAYS.length; i++) {
      const gw = GATEWAYS[i];
      const col = i % gwCols;
      const row = Math.floor(i / gwCols);
      const gx = rtX + col * (gwCardW + gwGapX);
      const gy = gwTop + row * (gwCardH + gwGapY);
      const hovered = isHover(mouse.x, mouse.y, gx, gy, gwCardW, gwCardH);

      if (hovered) {
        hoveredGw = gw;
        hoverGwX = gx + gwCardW / 2;
        hoverGwY = gy;
        ctx.shadowColor = gw.color;
        ctx.shadowBlur = 12 * s;
      }

      ctx.fillStyle = THEME.card;
      roundRect(ctx, gx, gy, gwCardW, gwCardH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = hovered ? gw.color : THEME.border;
      ctx.lineWidth = (hovered ? 2 : 1) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      drawText(gw.name, gx + gwCardW / 2, gy + gwCardH * 0.38, THEME.text, 10);

      // Tool count badge
      const badgeText = `${gw.tools} tools`;
      const badgeW = (badgeText.length * 6 + 12) * s;
      const badgeX = gx + gwCardW / 2 - badgeW / 2;
      const badgeY = gy + gwCardH * 0.6;
      ctx.fillStyle = gw.color + '22';
      roundRect(ctx, badgeX, badgeY, badgeW, 16 * s, 4 * s);
      ctx.fill();
      drawText(badgeText, gx + gwCardW / 2, badgeY + 8 * s, gw.color, 8);
    }

    // --- Tools List bar ---
    const toolsY = gwTop + gwRows * (gwCardH + gwGapY) + 8 * s;
    const toolsH = 34 * s;
    ctx.fillStyle = THEME.card;
    roundRect(ctx, rtX, toolsY, rtW, toolsH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Search icon (simple magnifier)
    const iconX = rtX + 16 * s;
    const iconY = toolsY + toolsH / 2;
    ctx.strokeStyle = THEME.muted;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(iconX, iconY - 1 * s, 5 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(iconX + 4 * s, iconY + 3 * s);
    ctx.lineTo(iconX + 7 * s, iconY + 6 * s);
    ctx.stroke();

    drawText('125 \uB3C4\uAD6C \uC804\uCCB4 \uBAA9\uB85D', rtX + rtW / 2, toolsY + toolsH / 2, THEME.text, 10);

    // --- API Arrow from left ---
    const apiBoxW = 90 * s;
    const apiBoxH = 36 * s;
    const apiBoxX = margin;
    const apiBoxY = dashTop + dashH / 2 - apiBoxH / 2;

    ctx.fillStyle = THEME.card;
    roundRect(ctx, apiBoxX, apiBoxY, apiBoxW, apiBoxH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    drawText('/api/agentcore', apiBoxX + apiBoxW / 2, apiBoxY + apiBoxH * 0.38, THEME.cyan, 8);
    drawText('config \uAE30\uBC18', apiBoxX + apiBoxW / 2, apiBoxY + apiBoxH * 0.72, THEME.muted, 7);

    // Arrow
    const arrowX1 = apiBoxX + apiBoxW + 4 * s;
    const arrowX2 = dashLeft - 2 * s;
    const arrowY = apiBoxY + apiBoxH / 2;
    ctx.strokeStyle = THEME.cyan;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(arrowX1, arrowY);
    ctx.lineTo(arrowX2, arrowY);
    ctx.stroke();
    const headLen = 8 * s;
    ctx.beginPath();
    ctx.moveTo(arrowX2, arrowY);
    ctx.lineTo(arrowX2 - headLen, arrowY - headLen * 0.6);
    ctx.lineTo(arrowX2 - headLen, arrowY + headLen * 0.6);
    ctx.closePath();
    ctx.fillStyle = THEME.cyan;
    ctx.fill();

    // --- Tooltip ---
    if (hoveredGw) {
      const tooltipW = 120 * s;
      const tooltipH = 50 * s;
      let tx = hoverGwX - tooltipW / 2;
      let ty = hoverGwY - tooltipH - 8 * s;
      if (tx < 5 * s) tx = 5 * s;
      if (tx + tooltipW > width - 5 * s) tx = width - tooltipW - 5 * s;
      if (ty < 5 * s) ty = hoverGwY + gwCardH + 8 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tx, ty, tooltipW, tooltipH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = hoveredGw.color;
      ctx.lineWidth = 1 * s;
      ctx.stroke();

      drawText(`${hoveredGw.name} Gateway`, tx + tooltipW / 2, ty + 18 * s, hoveredGw.color, 10);
      drawText(`${hoveredGw.tools} MCP tools`, tx + tooltipW / 2, ty + 36 * s, THEME.muted, 9);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
