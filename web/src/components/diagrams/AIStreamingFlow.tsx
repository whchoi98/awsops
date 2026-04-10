'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

interface Branch {
  condition: string;
  gateway: string;
  method: string;
  detail: string;
  color: string;
}

const BRANCHES: Branch[] = [
  { condition: '1 route', gateway: 'Single Gateway', method: 'simulateStreaming()', detail: 'Typing 50char/15ms', color: THEME.orange },
  { condition: '2-3 routes', gateway: 'Multi-route', method: 'ConverseStreamCommand', detail: 'Real-time tokens', color: THEME.cyan },
  { condition: 'aws-data', gateway: 'Bedrock Direct', method: 'InvokeModelWithResponseStream', detail: 'Real-time tokens', color: THEME.green },
];

export default function AIStreamingFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const cx = width / 2;
    const boxR = 6 * s;

    // Animation
    const cycleFrames = 180;
    const activeIdx = Math.floor((frame % (cycleFrames * 3)) / cycleFrames);
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
        ctx.shadowBlur = 14 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, boxR);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawDiamond(dcx: number, dcy: number, sz: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      ctx.beginPath();
      ctx.moveTo(dcx, dcy - sz);
      ctx.lineTo(dcx + sz, dcy);
      ctx.lineTo(dcx, dcy + sz);
      ctx.lineTo(dcx - sz, dcy);
      ctx.closePath();
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
      ctx.arc(x, y, 5 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Layout
    const topH = 36 * s;
    const topW = 170 * s;
    const topY = 18 * s;

    const clsY = topY + topH + 14 * s;
    const clsH = 34 * s;
    const clsW = 170 * s;

    const diamY = clsY + clsH + 40 * s;
    const diamSz = 26 * s;

    // 3 branch columns
    const branchW = Math.min(160 * s, (width - 50 * s) / 3);
    const branchGap = 12 * s;
    const totalBrW = 3 * branchW + 2 * branchGap;
    const brStartX = cx - totalBrW / 2;

    const gwY = diamY + diamSz + 40 * s;
    const gwH = 44 * s;

    const methodY = gwY + gwH + 16 * s;
    const methodH = 36 * s;

    const sseY = methodY + methodH + 36 * s;
    const sseH = 32 * s;
    const sseW = 170 * s;

    // 1. User Question
    const topHover = isHover(mouse.x, mouse.y, cx - topW / 2, topY, topW, topH);
    drawBox(cx - topW / 2, topY, topW, topH, THEME.muted, topHover);
    drawText('User Question', cx, topY + topH / 2, THEME.text, 11);

    // Arrow → Intent Classification
    drawArrow(cx, topY + topH, cx, clsY, THEME.dim);

    // 2. Intent Classification
    const clsHover = isHover(mouse.x, mouse.y, cx - clsW / 2, clsY, clsW, clsH);
    drawBox(cx - clsW / 2, clsY, clsW, clsH, THEME.purple, clsHover);
    drawText('Intent Classification', cx, clsY + clsH / 2, THEME.text, 11);

    // Arrow → Diamond
    drawArrow(cx, clsY + clsH, cx, diamY - diamSz, THEME.dim);

    // 3. Diamond: route count
    const dHover = isHover(mouse.x, mouse.y, cx - diamSz, diamY - diamSz, diamSz * 2, diamSz * 2);
    drawDiamond(cx, diamY, diamSz, THEME.purple, dHover);
    drawText('Route', cx, diamY - 3 * s, THEME.text, 8);
    drawText('Count', cx, diamY + 8 * s, THEME.text, 8);

    // 4. Three branches
    for (let i = 0; i < 3; i++) {
      const br = BRANCHES[i];
      const bx = brStartX + i * (branchW + branchGap);
      const bCx = bx + branchW / 2;
      const isActive = i === activeIdx;
      const dimmed = !isActive;
      const color = dimmed ? br.color + '55' : br.color;

      // Diamond → gateway
      drawArrow(cx, diamY + diamSz, bCx, gwY, isActive ? br.color : THEME.dim);
      // Condition label
      const lx = (cx + bCx) / 2;
      const ly = (diamY + diamSz + gwY) / 2 - 6 * s;
      drawText(br.condition, lx, ly, isActive ? br.color : THEME.dim, 7);

      // Gateway box
      const gHover = isHover(mouse.x, mouse.y, bx, gwY, branchW, gwH);
      drawBox(bx, gwY, branchW, gwH, color, gHover || isActive);
      drawText(br.gateway, bCx, gwY + 14 * s, dimmed ? THEME.muted : THEME.text, 9);
      drawText(br.detail, bCx, gwY + 30 * s, dimmed ? THEME.dim : br.color, 7);

      // Arrow: gateway → method
      drawArrow(bCx, gwY + gwH, bCx, methodY, isActive ? br.color : THEME.dim);

      // Method box
      const mHover = isHover(mouse.x, mouse.y, bx, methodY, branchW, methodH);
      drawBox(bx, methodY, branchW, methodH, color, mHover || isActive);
      drawText(br.method, bCx, methodY + methodH / 2, dimmed ? THEME.dim : br.color, 7);

      // Arrow: method → SSE
      drawArrow(bCx, methodY + methodH, cx, sseY, isActive ? br.color : THEME.dim);
    }

    // 5. SSE box
    const sseHover = isHover(mouse.x, mouse.y, cx - sseW / 2, sseY, sseW, sseH);
    drawBox(cx - sseW / 2, sseY, sseW, sseH, THEME.cyan, sseHover);
    drawText('SSE chunk events', cx, sseY + sseH / 2, THEME.text, 11);

    // 6. Animated particle
    const activeBr = BRANCHES[activeIdx];
    const activeBCx = brStartX + activeIdx * (branchW + branchGap) + branchW / 2;

    if (progress < 0.1) {
      // User → Classification
      const t = progress / 0.1;
      drawParticle(cx, topY + topH + t * (clsY - topY - topH), activeBr.color);
    } else if (progress < 0.2) {
      // Classification → Diamond
      const t = (progress - 0.1) / 0.1;
      drawParticle(cx, clsY + clsH + t * (diamY - diamSz - clsY - clsH), activeBr.color);
    } else if (progress < 0.35) {
      // Diamond → Gateway
      const t = (progress - 0.2) / 0.15;
      drawParticle(
        cx + t * (activeBCx - cx),
        diamY + diamSz + t * (gwY - diamY - diamSz),
        activeBr.color,
      );
    } else if (progress < 0.5) {
      // Gateway → Method
      const t = (progress - 0.35) / 0.15;
      drawParticle(activeBCx, gwY + gwH + t * (methodY - gwY - gwH), activeBr.color);
    } else if (progress < 0.7) {
      // Method → SSE
      const t = (progress - 0.5) / 0.2;
      drawParticle(
        activeBCx + t * (cx - activeBCx),
        methodY + methodH + t * (sseY - methodY - methodH),
        activeBr.color,
      );
    } else {
      // Glow at SSE
      const t = (progress - 0.7) / 0.3;
      const alpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(cx, sseY + sseH / 2, (8 + t * 25) * s, 0, Math.PI * 2);
      ctx.strokeStyle = activeBr.color + Math.floor(alpha * 200).toString(16).padStart(2, '0');
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
