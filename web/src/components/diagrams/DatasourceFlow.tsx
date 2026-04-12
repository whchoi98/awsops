'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

const DATASOURCES = [
  { name: 'Prometheus', sub: 'PromQL', color: THEME.cyan },
  { name: 'Loki', sub: 'LogQL', color: THEME.cyan },
  { name: 'Tempo', sub: 'TraceQL', color: THEME.cyan },
  { name: 'ClickHouse', sub: 'SQL', color: THEME.orange },
  { name: 'Jaeger', sub: 'Trace ID', color: THEME.green },
  { name: 'Dynatrace', sub: 'DQL', color: THEME.purple },
  { name: 'Datadog', sub: 'Query', color: THEME.purple },
];

export default function DatasourceFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

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

    const margin = 20 * s;
    const colLeft = margin;
    const colLeftW = width * 0.28;
    const colMidX = colLeft + colLeftW + 20 * s;
    const colMidW = width * 0.30;
    const colRightX = colMidX + colMidW + 20 * s;
    const colRightW = width - colRightX - margin;

    // --- Left column: Datasource types ---
    const dsBoxH = 38 * s;
    const dsGap = 6 * s;
    const totalDsH = DATASOURCES.length * dsBoxH + (DATASOURCES.length - 1) * dsGap;
    const dsStartY = (height - totalDsH) / 2;

    for (let i = 0; i < DATASOURCES.length; i++) {
      const ds = DATASOURCES[i];
      const y = dsStartY + i * (dsBoxH + dsGap);
      const hovered = isHover(mouse.x, mouse.y, colLeft, y, colLeftW, dsBoxH);
      drawBox(colLeft, y, colLeftW, dsBoxH, ds.color, hovered);
      drawText(ds.name, colLeft + colLeftW / 2, y + 14 * s, THEME.text, 10);
      drawText(ds.sub, colLeft + colLeftW / 2, y + 28 * s, THEME.muted, 8);

      // Arrow from datasource to center
      drawArrow(colLeft + colLeftW, y + dsBoxH / 2, colMidX, y + dsBoxH / 2, ds.color + '88');
    }

    // --- Center column: Datasource Manager ---
    const centerH = totalDsH;
    const centerY = dsStartY;

    ctx.fillStyle = THEME.card;
    roundRect(ctx, colMidX, centerY, colMidW, centerH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '66';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('AWSops', colMidX + colMidW / 2, centerY + 22 * s, THEME.cyan, 12);
    drawText('Datasource Manager', colMidX + colMidW / 2, centerY + 42 * s, THEME.text, 11);

    // Feature boxes inside center
    const features = [
      { label: 'CRUD', sub: 'Add / Edit / Delete', color: THEME.cyan },
      { label: 'Test', sub: 'Connection Verify', color: THEME.green },
      { label: 'Query', sub: 'Execute & Visualize', color: THEME.orange },
      { label: 'Security', sub: 'SSRF Prevention', color: THEME.red },
    ];

    const fBoxW = colMidW - 30 * s;
    const fBoxH = 40 * s;
    const fGap = 10 * s;
    const fStartY = centerY + 60 * s;

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const y = fStartY + i * (fBoxH + fGap);
      const fX = colMidX + 15 * s;
      const hovered = isHover(mouse.x, mouse.y, fX, y, fBoxW, fBoxH);
      drawBox(fX, y, fBoxW, fBoxH, f.color, hovered);
      drawText(f.label, fX + fBoxW / 2, y + 14 * s, THEME.text, 10);
      drawText(f.sub, fX + fBoxW / 2, y + 28 * s, THEME.muted, 8);
    }

    // --- Right column: Outputs ---
    const outBoxH = 70 * s;
    const outGap = 40 * s;
    const outTotalH = 2 * outBoxH + outGap;
    const outStartY = (height - outTotalH) / 2;

    // Output 1: Dashboard Visualizations
    const out1Y = outStartY;
    const out1Hover = isHover(mouse.x, mouse.y, colRightX, out1Y, colRightW, outBoxH);
    drawBox(colRightX, out1Y, colRightW, outBoxH, THEME.green, out1Hover);
    drawText('Dashboard', colRightX + colRightW / 2, out1Y + 25 * s, THEME.text, 11);
    drawText('Visualizations', colRightX + colRightW / 2, out1Y + 45 * s, THEME.muted, 9);

    // Output 2: AI Analysis
    const out2Y = out1Y + outBoxH + outGap;
    const out2Hover = isHover(mouse.x, mouse.y, colRightX, out2Y, colRightW, outBoxH);
    drawBox(colRightX, out2Y, colRightW, outBoxH, THEME.purple, out2Hover);
    drawText('AI Analysis', colRightX + colRightW / 2, out2Y + 25 * s, THEME.text, 11);
    drawText('(AgentCore)', colRightX + colRightW / 2, out2Y + 45 * s, THEME.muted, 9);

    // Arrows from center to outputs
    const centerRight = colMidX + colMidW;
    drawArrow(centerRight, centerY + centerH * 0.35, colRightX, out1Y + outBoxH / 2, THEME.green + '88');
    drawArrow(centerRight, centerY + centerH * 0.65, colRightX, out2Y + outBoxH / 2, THEME.purple + '88');

    // --- Animated particles ---
    const cycle = 120;

    // Particles flowing from left to center
    for (let i = 0; i < DATASOURCES.length; i++) {
      const ds = DATASOURCES[i];
      const y = dsStartY + i * (dsBoxH + dsGap) + dsBoxH / 2;
      const p = ((frame + i * 17) % cycle) / cycle;
      const px = colLeft + colLeftW + (colMidX - colLeft - colLeftW) * p;
      ctx.beginPath();
      ctx.arc(px, y, 3 * s, 0, Math.PI * 2);
      ctx.fillStyle = ds.color;
      ctx.shadowColor = ds.color;
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Particles flowing from center to outputs
    const pOut1 = ((frame + 30) % cycle) / cycle;
    const pOut2 = ((frame + 60) % cycle) / cycle;

    const out1MidY = out1Y + outBoxH / 2;
    const out2MidY = out2Y + outBoxH / 2;
    const cRightEdge = colMidX + colMidW;
    const spanX = colRightX - cRightEdge;

    // Particle to Dashboard
    const p1x = cRightEdge + spanX * pOut1;
    const p1y = centerY + centerH * 0.35 + (out1MidY - centerY - centerH * 0.35) * pOut1;
    ctx.beginPath();
    ctx.arc(p1x, p1y, 3 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.green;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 10 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Particle to AI
    const p2x = cRightEdge + spanX * pOut2;
    const p2y = centerY + centerH * 0.65 + (out2MidY - centerY - centerH * 0.65) * pOut2;
    ctx.beginPath();
    ctx.arc(p2x, p2y, 3 * s, 0, Math.PI * 2);
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
