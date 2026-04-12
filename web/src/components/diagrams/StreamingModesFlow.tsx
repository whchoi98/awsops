'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

interface StreamMode {
  name: string;
  impl: string;
  color: string;
}

const MODES: StreamMode[] = [
  { name: 'Real Streaming', impl: 'InvokeModelWithResponseStream', color: THEME.green },
  { name: 'Converse Stream', impl: 'ConverseStreamCommand', color: THEME.cyan },
  { name: 'Simulated Streaming', impl: 'simulateStreaming()', color: THEME.orange },
];

export default function StreamingModesFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const cx = width / 2;
    const boxR = 6 * s;

    // Animation: cycle active path every 3s
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
        ctx.shadowBlur = 16 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, boxR);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawDiamond(cx2: number, cy: number, size2: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.card;
      ctx.beginPath();
      ctx.moveTo(cx2, cy - size2);
      ctx.lineTo(cx2 + size2, cy);
      ctx.lineTo(cx2, cy + size2);
      ctx.lineTo(cx2 - size2, cy);
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

    // Layout positions
    const reqY = 24 * s;
    const reqH = 38 * s;
    const reqW = 160 * s;

    const diamondY = reqY + reqH + 50 * s;
    const diamondSize = 30 * s;

    const modeY = diamondY + diamondSize + 50 * s;
    const modeH = 50 * s;
    const modeW = Math.min(180 * s, (width - 60 * s) / 3);
    const modeSpacing = 16 * s;
    const totalModeW = 3 * modeW + 2 * modeSpacing;
    const modeStartX = cx - totalModeW / 2;

    const sseY = modeY + modeH + 50 * s;
    const sseH = 36 * s;
    const sseW = 160 * s;

    const clientY = sseY + sseH + 40 * s;
    const clientH = 38 * s;
    const clientW = 220 * s;

    // Labels for diamond → modes
    const branchLabels = ['Single Bedrock', 'Multi-route', 'AgentCore GW'];

    // 1. AI Request box
    const reqHover = isHover(mouse.x, mouse.y, cx - reqW / 2, reqY, reqW, reqH);
    drawBox(cx - reqW / 2, reqY, reqW, reqH, THEME.cyan, reqHover);
    drawText('AI Request', cx, reqY + reqH / 2, THEME.text, 12);

    // Arrow: request → diamond
    drawArrow(cx, reqY + reqH, cx, diamondY - diamondSize, THEME.dim);

    // 2. Diamond
    const diamondHover = isHover(mouse.x, mouse.y, cx - diamondSize, diamondY - diamondSize, diamondSize * 2, diamondSize * 2);
    drawDiamond(cx, diamondY, diamondSize, THEME.purple, diamondHover);
    drawText('Routing', cx, diamondY - 4 * s, THEME.text, 9);
    drawText('Result', cx, diamondY + 8 * s, THEME.text, 9);

    // 3. Mode boxes
    for (let i = 0; i < 3; i++) {
      const mode = MODES[i];
      const mx = modeStartX + i * (modeW + modeSpacing);
      const modeCx = mx + modeW / 2;
      const isActive = i === activeIdx;
      const dimmed = !isActive;
      const color = dimmed ? mode.color + '55' : mode.color;
      const modeHover = isHover(mouse.x, mouse.y, mx, modeY, modeW, modeH);

      // Arrow: diamond → mode
      drawArrow(cx, diamondY + diamondSize, modeCx, modeY, isActive ? mode.color : THEME.dim);
      // Branch label
      const labelX = (cx + modeCx) / 2;
      const labelY = (diamondY + diamondSize + modeY) / 2;
      drawText(branchLabels[i], labelX, labelY - 6 * s, isActive ? mode.color : THEME.dim, 7);

      drawBox(mx, modeY, modeW, modeH, color, modeHover || isActive);
      drawText(mode.name, modeCx, modeY + 16 * s, dimmed ? THEME.muted : THEME.text, 10);
      drawText(mode.impl, modeCx, modeY + 34 * s, dimmed ? THEME.dim : mode.color, 7);

      // Arrow: mode → SSE
      drawArrow(modeCx, modeY + modeH, cx, sseY, isActive ? mode.color : THEME.dim);
    }

    // 4. SSE box
    const sseHover = isHover(mouse.x, mouse.y, cx - sseW / 2, sseY, sseW, sseH);
    drawBox(cx - sseW / 2, sseY, sseW, sseH, THEME.cyan, sseHover);
    drawText('SSE chunk events', cx, sseY + sseH / 2, THEME.text, 11);

    // Arrow: SSE → Client
    drawArrow(cx, sseY + sseH, cx, clientY, THEME.dim);

    // 5. Client box
    const clientHover = isHover(mouse.x, mouse.y, cx - clientW / 2, clientY, clientW, clientH);
    drawBox(cx - clientW / 2, clientY, clientW, clientH, THEME.muted, clientHover);
    drawText('Client  (ReactMarkdown)', cx, clientY + clientH / 2, THEME.text, 11);

    // 6. Animated particle along active path
    const activeMode = MODES[activeIdx];
    const activeMx = modeStartX + activeIdx * (modeW + modeSpacing) + modeW / 2;

    if (progress < 0.2) {
      // Request → Diamond
      const t = progress / 0.2;
      drawParticle(cx, reqY + reqH + t * (diamondY - diamondSize - reqY - reqH), activeMode.color);
    } else if (progress < 0.4) {
      // Diamond → Mode
      const t = (progress - 0.2) / 0.2;
      const py = diamondY + diamondSize + t * (modeY - diamondY - diamondSize);
      const px = cx + t * (activeMx - cx);
      drawParticle(px, py, activeMode.color);
    } else if (progress < 0.6) {
      // Mode → SSE
      const t = (progress - 0.4) / 0.2;
      const px = activeMx + t * (cx - activeMx);
      const py = modeY + modeH + t * (sseY - modeY - modeH);
      drawParticle(px, py, activeMode.color);
    } else if (progress < 0.8) {
      // SSE → Client
      const t = (progress - 0.6) / 0.2;
      drawParticle(cx, sseY + sseH + t * (clientY - sseY - sseH), activeMode.color);
    } else {
      // Glow at client
      const t = (progress - 0.8) / 0.2;
      const alpha = 1 - t;
      ctx.beginPath();
      ctx.arc(cx, clientY + clientH / 2, (10 + t * 20) * s, 0, Math.PI * 2);
      ctx.strokeStyle = activeMode.color + Math.floor(alpha * 200).toString(16).padStart(2, '0');
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
