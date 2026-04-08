'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 350;

interface MetricRoute {
  api: string;
  label: string;
  metrics: string;
  color: string;
}

const ROUTES: MetricRoute[] = [
  { api: '/api/msk', label: 'MSK', metrics: 'CPU / Memory\nBytesIn / BytesOut', color: THEME.cyan },
  { api: '/api/rds', label: 'RDS', metrics: 'CPU / Memory\nConnections / IOPS', color: THEME.green },
  { api: '/api/elasticache', label: 'ElastiCache', metrics: 'CPU / Memory\nNetwork / Connections', color: THEME.purple },
  { api: '/api/opensearch', label: 'OpenSearch', metrics: 'CPU / JVM\nStatus / SearchRate', color: THEME.red },
];

export default function CloudWatchMetricsFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const margin = 20 * s;
    const count = ROUTES.length;

    // Layout: 3 columns - CloudWatch | APIs | Metrics
    const col1X = margin;
    const col1W = 130 * s;
    const col3W = 150 * s;
    const col3X = width - margin - col3W;
    const col2X = col1X + col1W + 30 * s;
    const col2W = col3X - col2X - 30 * s;
    const apiBoxW = Math.min(col2W, 120 * s);
    const apiCenterX = col2X + col2W / 2;

    const topY = margin + 10 * s;
    const rowGap = 12 * s;
    const totalH = height - margin * 2 - 20 * s;
    const apiBoxH = (totalH - (count - 1) * rowGap) / count;

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

    function drawArrowH(x1: number, y: number, x2: number, color: string) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      const dir = x2 > x1 ? 1 : -1;
      const headLen = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - dir * headLen, y - headLen * 0.6);
      ctx.lineTo(x2 - dir * headLen, y + headLen * 0.6);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // --- CloudWatch box (centered vertically) ---
    const cwH = Math.min(100 * s, totalH * 0.5);
    const cwY = topY + totalH / 2 - cwH / 2;
    const cwHovered = isHover(mouse.x, mouse.y, col1X, cwY, col1W, cwH);

    if (cwHovered) {
      ctx.shadowColor = THEME.orange;
      ctx.shadowBlur = 15 * s;
    }
    ctx.fillStyle = THEME.card;
    roundRect(ctx, col1X, cwY, col1W, cwH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.orange;
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawText('CloudWatch', col1X + col1W / 2, cwY + cwH * 0.38, THEME.text, 12);
    drawText('GetMetricData', col1X + col1W / 2, cwY + cwH * 0.62, THEME.orange, 9);

    // --- API + Metric boxes ---
    const apiPositions: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let i = 0; i < count; i++) {
      const route = ROUTES[i];
      const ay = topY + i * (apiBoxH + rowGap);
      const ax = apiCenterX - apiBoxW / 2;
      apiPositions.push({ x: ax, y: ay, w: apiBoxW, h: apiBoxH });

      const apiHovered = isHover(mouse.x, mouse.y, ax, ay, apiBoxW, apiBoxH);

      if (apiHovered) {
        ctx.shadowColor = route.color;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, ax, ay, apiBoxW, apiBoxH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = apiHovered ? route.color : THEME.border;
      ctx.lineWidth = (apiHovered ? 2 : 1.5) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      drawText(route.api, ax + apiBoxW / 2, ay + apiBoxH / 2, THEME.text, 10);

      // Arrow from CloudWatch to API
      const cwRight = col1X + col1W;
      drawArrowH(cwRight + 4 * s, ay + apiBoxH / 2, ax - 4 * s, THEME.orange + '88');

      // Metric box
      const mx = col3X;
      const mw = col3W;
      const mh = apiBoxH;
      const my = ay;
      const metricHovered = isHover(mouse.x, mouse.y, mx, my, mw, mh);

      if (metricHovered) {
        ctx.shadowColor = route.color;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, mx, my, mw, mh, 6 * s);
      ctx.fill();
      ctx.strokeStyle = metricHovered ? route.color : THEME.border;
      ctx.lineWidth = (metricHovered ? 2 : 1.5) * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label badge
      const badgeW = (route.label.length * 7 + 14) * s;
      const badgeX = mx + 8 * s;
      const badgeY = my + 6 * s;
      ctx.fillStyle = route.color + '33';
      roundRect(ctx, badgeX, badgeY, badgeW, 16 * s, 4 * s);
      ctx.fill();
      drawText(route.label, badgeX + badgeW / 2, badgeY + 8 * s, route.color, 8);

      // Metric text
      drawMultiText(route.metrics, mx + mw / 2, my + mh / 2 + 8 * s, THEME.muted, 8);

      // Arrow from API to Metric
      drawArrowH(ax + apiBoxW + 4 * s, ay + apiBoxH / 2, mx - 4 * s, route.color + '88');
    }

    // --- Animated particles ---
    const cycleDuration = 180;
    const progress = (frame % cycleDuration) / cycleDuration;

    for (let i = 0; i < count; i++) {
      const route = ROUTES[i];
      const ap = apiPositions[i];
      const stagger = (i * 0.15) % 1;
      const p = (progress + stagger) % 1;

      let px: number;
      let py: number;
      let pColor: string;

      if (p < 0.5) {
        // CW -> API
        const t = p / 0.5;
        const x1 = col1X + col1W;
        const x2 = ap.x;
        px = x1 + (x2 - x1) * t;
        py = cwY + cwH / 2 + (ap.y + ap.h / 2 - cwY - cwH / 2) * t;
        pColor = THEME.orange;
      } else {
        // API -> Metric
        const t = (p - 0.5) / 0.5;
        const x1 = ap.x + ap.w;
        const x2 = col3X;
        px = x1 + (x2 - x1) * t;
        py = ap.y + ap.h / 2;
        pColor = route.color;
      }

      ctx.beginPath();
      ctx.arc(px, py, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = pColor;
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 10 * s;
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
