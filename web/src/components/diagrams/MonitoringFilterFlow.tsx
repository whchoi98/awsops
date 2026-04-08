'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 300;

export default function MonitoringFilterFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const halfW = width / 2 - 10 * s;
    const leftX = 8 * s;
    const rightX = width / 2 + 6 * s;
    const groupY = 20 * s;
    const groupH = height - 40 * s;
    const boxH = 32 * s;
    const boxR = 5 * s;

    // Animation
    const cycleFrames = 240;
    const progress = (frame % cycleFrames) / cycleFrames;

    // Helpers
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
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, boxR);
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
      const hl = 6 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(angle - Math.PI / 6), y2 - hl * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - hl * Math.cos(angle + Math.PI / 6), y2 - hl * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function drawParticle(x: number, y: number, color: string, size = 4) {
      ctx.beginPath();
      ctx.arc(x, y, size * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ============ LEFT SIDE: "Before" ============
    ctx.fillStyle = THEME.red + '08';
    roundRect(ctx, leftX, groupY, halfW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.red + '55';
    ctx.lineWidth = 1.5 * s;
    roundRect(ctx, leftX, groupY, halfW, groupH, 8 * s);
    ctx.stroke();
    drawText('Before: No Time Limit', leftX + halfW / 2, groupY + 14 * s, THEME.red, 10);

    const queries = ['ec2CpuHourly', 'ebsIopsHourly', 'rdsCpuDaily'];
    const queryPad = 10 * s;
    const qBoxW = halfW * 0.38;
    const qStartY = groupY + 30 * s;
    const qGap = (groupH - 30 * s - boxH * 3 - 10 * s) / 2;

    // Query boxes (left side of left panel)
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap);
      const qX = leftX + queryPad;
      const hovered = isHover(mouse.x, mouse.y, qX, qY, qBoxW, boxH);
      drawBox(qX, qY, qBoxW, boxH, THEME.red, hovered);
      drawText(queries[i], qX + qBoxW / 2, qY + 12 * s, THEME.text, 8);
      drawText('Full history', qX + qBoxW / 2, qY + 24 * s, THEME.red, 7);
    }

    // pg pool box (left)
    const poolW = halfW * 0.22;
    const poolX = leftX + halfW * 0.52;
    const poolY = qStartY + boxH + qGap - 10 * s;
    const poolH = boxH * 1.4;
    drawBox(poolX, poolY, poolW, poolH, THEME.orange);
    drawText('pg pool', poolX + poolW / 2, poolY + poolH / 2 - 8 * s, THEME.text, 8);
    drawText('5 conn', poolX + poolW / 2, poolY + poolH / 2 + 6 * s, THEME.orange, 7);

    // Blocked dashboard (left)
    const dashW = halfW * 0.2;
    const dashX = leftX + halfW - dashW - queryPad;
    const dashY = poolY;
    const dashH = poolH;
    // Red glow pulsing
    const redPulse = 0.5 + 0.5 * Math.sin(frame * 0.05);
    ctx.shadowColor = THEME.red;
    ctx.shadowBlur = (10 + redPulse * 10) * s;
    drawBox(dashX, dashY, dashW, dashH, THEME.red, true);
    ctx.shadowBlur = 0;
    drawText('Blocked', dashX + dashW / 2, dashY + dashH / 2 - 6 * s, THEME.red, 8);
    drawText('120s wait', dashX + dashW / 2, dashY + dashH / 2 + 8 * s, THEME.red, 7);

    // Arrows: queries → pool → dashboard (left)
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap) + boxH / 2;
      drawArrow(leftX + queryPad + qBoxW, qY, poolX, poolY + poolH / 2, THEME.red + '66');
    }
    drawArrow(poolX + poolW, poolY + poolH / 2, dashX, dashY + dashH / 2, THEME.red + '66');

    // Slow congestion particles (left side)
    const slowT = (progress * 0.3) % 1; // very slow
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap) + boxH / 2;
      const px = leftX + queryPad + qBoxW + slowT * (poolX - leftX - queryPad - qBoxW);
      const py = qY + slowT * (poolY + poolH / 2 - qY);
      drawParticle(px, py, THEME.red, 3);
    }

    // ============ RIGHT SIDE: "After" ============
    ctx.fillStyle = THEME.green + '08';
    roundRect(ctx, rightX, groupY, halfW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.green + '55';
    ctx.lineWidth = 1.5 * s;
    roundRect(ctx, rightX, groupY, halfW, groupH, 8 * s);
    ctx.stroke();
    drawText('After: Time Filter Added', rightX + halfW / 2, groupY + 14 * s, THEME.green, 10);

    const timeLabels = ['24 hours', '24 hours', '30 days'];

    // Query boxes with time labels (right)
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap);
      const qX = rightX + queryPad;
      const hovered = isHover(mouse.x, mouse.y, qX, qY, qBoxW, boxH);
      drawBox(qX, qY, qBoxW, boxH, THEME.green, hovered);
      drawText(queries[i], qX + qBoxW / 2, qY + 12 * s, THEME.text, 8);
      drawText(timeLabels[i], qX + qBoxW / 2, qY + 24 * s, THEME.green, 7);
    }

    // pg pool box (right - green healthy)
    const rPoolX = rightX + halfW * 0.52;
    drawBox(rPoolX, poolY, poolW, poolH, THEME.green);
    drawText('pg pool', rPoolX + poolW / 2, poolY + poolH / 2 - 8 * s, THEME.text, 8);
    drawText('5 conn', rPoolX + poolW / 2, poolY + poolH / 2 + 6 * s, THEME.green, 7);

    // Fast dashboard (right - green)
    const rDashX = rightX + halfW - dashW - queryPad;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 8 * s;
    drawBox(rDashX, dashY, dashW, dashH, THEME.green, true);
    ctx.shadowBlur = 0;
    drawText('Fast', rDashX + dashW / 2, dashY + dashH / 2 - 6 * s, THEME.green, 8);
    drawText('Instant', rDashX + dashW / 2, dashY + dashH / 2 + 8 * s, THEME.green, 7);

    // Arrows (right)
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap) + boxH / 2;
      drawArrow(rightX + queryPad + qBoxW, qY, rPoolX, poolY + poolH / 2, THEME.green + '66');
    }
    drawArrow(rPoolX + poolW, poolY + poolH / 2, rDashX, dashY + dashH / 2, THEME.green + '66');

    // Fast smooth particles (right side)
    const fastT = progress;
    for (let i = 0; i < 3; i++) {
      const qY = qStartY + i * (boxH + qGap) + boxH / 2;
      const offset = (fastT + i * 0.2) % 1;
      if (offset < 0.5) {
        // query → pool
        const t = offset / 0.5;
        const px = rightX + queryPad + qBoxW + t * (rPoolX - rightX - queryPad - qBoxW);
        const py = qY + t * (poolY + poolH / 2 - qY);
        drawParticle(px, py, THEME.green, 3);
      } else {
        // pool → dashboard
        const t = (offset - 0.5) / 0.5;
        const px = rPoolX + poolW + t * (rDashX - rPoolX - poolW);
        drawParticle(px, dashY + dashH / 2, THEME.green, 3);
      }
    }

    // Divider
    ctx.strokeStyle = THEME.dim;
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(width / 2, groupY + 6 * s);
    ctx.lineTo(width / 2, groupY + groupH - 6 * s);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
