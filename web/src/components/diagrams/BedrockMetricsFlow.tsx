'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 350;

interface MetricBox {
  label: string;
  sub: string;
  color: string;
  tooltip: string;
}

const METRICS: MetricBox[] = [
  { label: 'Account Total', sub: 'Overall Usage', color: THEME.orange, tooltip: 'CloudWatch Bedrock metrics: calls, tokens per model' },
  { label: 'AWSops Usage', sub: 'In-app Usage', color: THEME.cyan, tooltip: 'App-level tracking via agentcore-stats.ts' },
  { label: 'Comparison Chart', sub: 'Account vs AWSops', color: THEME.purple, tooltip: 'Side-by-side usage comparison' },
  { label: 'Prompt Caching', sub: 'Hit Rate', color: THEME.green, tooltip: 'Cache hit rate and cost savings' },
];

export default function BedrockMetricsFlow(): React.ReactElement {
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

    // Layout: left data sources, right dashboard
    const leftW = width * 0.28;
    const arrowZone = width * 0.12;
    const rightW = width - margin * 2 - leftW - arrowZone;
    const leftX = margin;
    const rightX = margin + leftW + arrowZone;
    const centerY = height / 2;

    // --- Data Sources (left, stacked) ---
    const srcBoxW = leftW - 10 * s;
    const srcBoxH = 70 * s;
    const srcGap = 30 * s;
    const totalSrcH = srcBoxH * 2 + srcGap;
    const srcStartY = centerY - totalSrcH / 2;

    // CloudWatch box
    const cwX = leftX + 5 * s;
    const cwY = srcStartY;
    const cwHover = isHover(mouse.x, mouse.y, cwX, cwY, srcBoxW, srcBoxH);
    drawBox(cwX, cwY, srcBoxW, srcBoxH, THEME.orange, cwHover);
    drawText('CloudWatch', cwX + srcBoxW / 2, cwY + 22 * s, THEME.orange, 11);
    drawText('Bedrock Metrics', cwX + srcBoxW / 2, cwY + 40 * s, THEME.muted, 9);
    drawText('Per-model calls & tokens', cwX + srcBoxW / 2, cwY + 55 * s, THEME.muted, 8);

    // AWSops App box
    const appY = cwY + srcBoxH + srcGap;
    const appHover = isHover(mouse.x, mouse.y, cwX, appY, srcBoxW, srcBoxH);
    drawBox(cwX, appY, srcBoxW, srcBoxH, THEME.cyan, appHover);
    drawText('AWSops App', cwX + srcBoxW / 2, appY + 22 * s, THEME.cyan, 11);
    drawText('agentcore-stats.ts', cwX + srcBoxW / 2, appY + 40 * s, THEME.muted, 9);
    drawText('App-level token tracking', cwX + srcBoxW / 2, appY + 55 * s, THEME.muted, 8);

    // --- Dashboard (right, 2x2 grid) ---
    const dashGroupW = rightW;
    const dashGroupH = height - margin * 2;
    const dashGroupX = rightX;
    const dashGroupY = margin;

    ctx.fillStyle = THEME.card;
    roundRect(ctx, dashGroupX, dashGroupY, dashGroupW, dashGroupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('Bedrock Dashboard', dashGroupX + dashGroupW / 2, dashGroupY + 18 * s, THEME.text, 12);

    const gridPad = 12 * s;
    const gridGap = 10 * s;
    const cellW = (dashGroupW - gridPad * 2 - gridGap) / 2;
    const cellH = (dashGroupH - 40 * s - gridPad - gridGap) / 2;

    let hoveredMetric: MetricBox | null = null;
    let hoverMX = 0;
    let hoverMY = 0;

    for (let i = 0; i < 4; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const cx = dashGroupX + gridPad + col * (cellW + gridGap);
      const cy = dashGroupY + 34 * s + row * (cellH + gridGap);
      const metric = METRICS[i];

      const mHover = isHover(mouse.x, mouse.y, cx, cy, cellW, cellH);
      if (mHover) {
        hoveredMetric = metric;
        hoverMX = cx + cellW / 2;
        hoverMY = cy;
      }
      drawBox(cx, cy, cellW, cellH, metric.color, mHover);
      drawText(metric.label, cx + cellW / 2, cy + cellH / 2 - 8 * s, metric.color, 10);
      drawText(metric.sub, cx + cellW / 2, cy + cellH / 2 + 8 * s, THEME.muted, 8);
    }

    // Arrows: CW -> Account Total (top-left metric)
    const m0X = dashGroupX + gridPad;
    const m0Y = dashGroupY + 34 * s + cellH / 2;
    drawArrow(cwX + srcBoxW, cwY + srcBoxH / 2, m0X, m0Y, THEME.orange);

    // Arrow: App -> AWSops Usage (top-right metric)
    const m1X = dashGroupX + gridPad + cellW + gridGap;
    const m1Y = dashGroupY + 34 * s + cellH / 2;
    drawArrow(cwX + srcBoxW, appY + srcBoxH / 2, m1X, m1Y, THEME.cyan);

    // Arrow: both -> Comparison Chart (bottom-left metric)
    const m2X = dashGroupX + gridPad;
    const m2Y = dashGroupY + 34 * s + cellH + gridGap + cellH / 2;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.strokeStyle = THEME.purple + '88';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(m0X + cellW / 2, dashGroupY + 34 * s + cellH);
    ctx.lineTo(m2X + cellW / 2, m2Y - cellH / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m1X + cellW / 2, dashGroupY + 34 * s + cellH);
    ctx.lineTo(m2X + cellW / 2, m2Y - cellH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated pulse on data flow
    const pulse1P = (frame % 120) / 120;
    const p1sx = cwX + srcBoxW;
    const p1sy = cwY + srcBoxH / 2;
    const p1ex = m0X;
    const p1ey = m0Y;
    const p1x = p1sx + (p1ex - p1sx) * pulse1P;
    const p1y = p1sy + (p1ey - p1sy) * pulse1P;
    ctx.beginPath();
    ctx.arc(p1x, p1y, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.orange;
    ctx.shadowColor = THEME.orange;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    const pulse2P = ((frame + 60) % 120) / 120;
    const p2sx = cwX + srcBoxW;
    const p2sy = appY + srcBoxH / 2;
    const p2ex = m1X;
    const p2ey = m1Y;
    const p2x = p2sx + (p2ex - p2sx) * pulse2P;
    const p2y = p2sy + (p2ey - p2sy) * pulse2P;
    ctx.beginPath();
    ctx.arc(p2x, p2y, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.cyan;
    ctx.shadowColor = THEME.cyan;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tooltip
    if (hoveredMetric) {
      const tipW = 220 * s;
      const tipH = 32 * s;
      let tipX = hoverMX - tipW / 2;
      let tipY = hoverMY - tipH - 8 * s;
      if (tipX < 5 * s) tipX = 5 * s;
      if (tipX + tipW > width - 5 * s) tipX = width - tipW - 5 * s;
      if (tipY < 5 * s) tipY = hoverMY + cellH + 8 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tipX, tipY, tipW, tipH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = hoveredMetric.color;
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      drawText(hoveredMetric.tooltip, tipX + tipW / 2, tipY + tipH / 2, THEME.text, 8);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
