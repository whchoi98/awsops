'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 350;

export default function ContainerCostFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const margin = 20 * s;
    const gap = 20 * s;
    const groupW = (width - margin * 2 - gap) / 2;
    const groupH = height - margin * 2;
    const leftX = margin;
    const rightX = margin + groupW + gap;
    const groupY = margin;

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

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string, dashed = false) {
      if (dashed) ctx.setLineDash([4 * s, 4 * s]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
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

    // --- ECS Group (left) ---
    ctx.fillStyle = THEME.card;
    roundRect(ctx, leftX, groupY, groupW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '66';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('ECS Cost Analysis', leftX + groupW / 2, groupY + 20 * s, THEME.cyan, 12);

    const ecsBoxW = groupW - 30 * s;
    const ecsBoxH = 60 * s;
    const ecsBoxX = leftX + 15 * s;
    const ecsGap = 25 * s;
    const ecsStartY = groupY + 45 * s;

    // Box 1: Container Insights
    const ciY = ecsStartY;
    const ciHover = isHover(mouse.x, mouse.y, ecsBoxX, ciY, ecsBoxW, ecsBoxH);
    drawBox(ecsBoxX, ciY, ecsBoxW, ecsBoxH, THEME.cyan, ciHover);
    drawText('Container Insights', ecsBoxX + ecsBoxW / 2, ciY + 22 * s, THEME.text, 11);
    drawText('CPU / Memory Usage', ecsBoxX + ecsBoxW / 2, ciY + 40 * s, THEME.muted, 9);

    drawArrow(ecsBoxX + ecsBoxW / 2, ciY + ecsBoxH, ecsBoxX + ecsBoxW / 2, ciY + ecsBoxH + ecsGap, THEME.cyan);

    // Box 2: Fargate Pricing
    const fpY = ciY + ecsBoxH + ecsGap;
    const fpHover = isHover(mouse.x, mouse.y, ecsBoxX, fpY, ecsBoxW, ecsBoxH);
    drawBox(ecsBoxX, fpY, ecsBoxW, ecsBoxH, THEME.cyan, fpHover);
    drawText('Fargate Pricing', ecsBoxX + ecsBoxW / 2, fpY + 16 * s, THEME.text, 11);
    drawText('vCPU: $0.04048/h', ecsBoxX + ecsBoxW / 2, fpY + 32 * s, THEME.orange, 9);
    drawText('GB: $0.004445/h', ecsBoxX + ecsBoxW / 2, fpY + 46 * s, THEME.orange, 9);

    drawArrow(ecsBoxX + ecsBoxW / 2, fpY + ecsBoxH, ecsBoxX + ecsBoxW / 2, fpY + ecsBoxH + ecsGap, THEME.cyan);

    // Box 3: ECS Task Cost
    const ecY = fpY + ecsBoxH + ecsGap;
    const ecHover = isHover(mouse.x, mouse.y, ecsBoxX, ecY, ecsBoxW, ecsBoxH);
    drawBox(ecsBoxX, ecY, ecsBoxW, ecsBoxH, THEME.cyan, ecHover);
    drawText('ECS Task Cost', ecsBoxX + ecsBoxW / 2, ecY + 22 * s, THEME.text, 11);
    drawText('Per-task calculation', ecsBoxX + ecsBoxW / 2, ecY + 40 * s, THEME.muted, 9);

    // ECS animated particle
    const ecsCycle = 150;
    const ecsP = (frame % ecsCycle) / ecsCycle;
    let ecsPY: number;
    if (ecsP < 0.5) {
      ecsPY = ciY + ecsBoxH + (fpY - ciY - ecsBoxH) * (ecsP / 0.5);
    } else {
      ecsPY = fpY + ecsBoxH + (ecY - fpY - ecsBoxH) * ((ecsP - 0.5) / 0.5);
    }
    ctx.beginPath();
    ctx.arc(ecsBoxX + ecsBoxW / 2, ecsPY, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.cyan;
    ctx.shadowColor = THEME.cyan;
    ctx.shadowBlur = 12 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // --- EKS Group (right) ---
    ctx.fillStyle = THEME.card;
    roundRect(ctx, rightX, groupY, groupW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.green + '66';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    drawText('EKS Cost Analysis', rightX + groupW / 2, groupY + 20 * s, THEME.green, 12);

    const eksBoxW = groupW - 30 * s;
    const eksBoxH = 60 * s;
    const eksBoxX = rightX + 15 * s;
    const eksStartY = groupY + 45 * s;

    // Box 1: OpenCost API
    const ocY = eksStartY;
    const ocHover = isHover(mouse.x, mouse.y, eksBoxX, ocY, eksBoxW, eksBoxH);
    drawBox(eksBoxX, ocY, eksBoxW, eksBoxH, THEME.green, ocHover);
    drawText('OpenCost API', eksBoxX + eksBoxW / 2, ocY + 22 * s, THEME.text, 11);
    drawText('Pod Cost Data', eksBoxX + eksBoxW / 2, ocY + 40 * s, THEME.muted, 9);

    drawArrow(eksBoxX + eksBoxW / 2, ocY + eksBoxH, eksBoxX + eksBoxW / 2, ocY + eksBoxH + ecsGap * 2.5, THEME.green);

    // Box 2: Pod Cost Allocation
    const ekY = ocY + eksBoxH + ecsGap * 2.5;
    const ekHover = isHover(mouse.x, mouse.y, eksBoxX, ekY, eksBoxW, eksBoxH);
    drawBox(eksBoxX, ekY, eksBoxW, eksBoxH, THEME.green, ekHover);
    drawText('Pod Cost Allocation', eksBoxX + eksBoxW / 2, ekY + 22 * s, THEME.text, 11);
    drawText('CPU / Memory cost per pod', eksBoxX + eksBoxW / 2, ekY + 40 * s, THEME.muted, 9);

    // Box 3: Request-based Fallback (dashed)
    const fbY = ocY + eksBoxH + ecsGap * 0.8;
    const fbW = eksBoxW * 0.75;
    const fbX = eksBoxX + eksBoxW - fbW;
    const fbH = 44 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.fillStyle = THEME.bg;
    roundRect(ctx, fbX, fbY, fbW, fbH, 6 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.muted;
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.setLineDash([]);
    drawText('Request-based Fallback', fbX + fbW / 2, fbY + fbH / 2, THEME.muted, 9);

    // Dashed arrow from fallback to pod cost
    drawArrow(fbX + fbW / 2, fbY + fbH, eksBoxX + eksBoxW / 2, ekY, THEME.muted, true);

    // EKS animated particle
    const eksP = ((frame + 75) % ecsCycle) / ecsCycle;
    if (eksP < 0.6) {
      const pY = ocY + eksBoxH + (ekY - ocY - eksBoxH) * (eksP / 0.6);
      ctx.beginPath();
      ctx.arc(eksBoxX + eksBoxW / 2, pY, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = THEME.green;
      ctx.shadowColor = THEME.green;
      ctx.shadowBlur = 12 * s;
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
