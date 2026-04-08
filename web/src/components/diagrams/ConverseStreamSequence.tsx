'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 500;

export default function ConverseStreamSequence(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // 5 Participants
    const participants = [
      { name: 'User', color: THEME.muted },
      { name: 'route.ts', color: THEME.cyan },
      { name: 'Network GW', color: THEME.green },
      { name: 'Cost GW', color: THEME.orange },
      { name: 'Bedrock', color: THEME.purple },
    ];

    const topY = 16 * s;
    const boxH = 32 * s;
    const boxW = Math.min(100 * s, (width - 20 * s) / 5 - 8 * s);
    const colSpacing = width / (participants.length + 1);

    // Full animation cycle
    const totalFrames = 420;
    const progress = (frame % totalFrames) / totalFrames;

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
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawMsgArrow(fromCol: number, toCol: number, y: number, label: string, color: string, dashed = false) {
      const x1 = colSpacing * (fromCol + 1);
      const x2 = colSpacing * (toCol + 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      if (dashed) ctx.setLineDash([4 * s, 3 * s]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const dir = x2 > x1 ? 1 : -1;
      const hl = 6 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y);
      ctx.lineTo(x2 - dir * hl, y - hl * 0.5);
      ctx.lineTo(x2 - dir * hl, y + hl * 0.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      const lx = (x1 + x2) / 2;
      drawText(label, lx, y - 9 * s, color, 7);
    }

    function drawSelfArrow(col: number, y: number, label: string, color: string) {
      const cx = colSpacing * (col + 1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(cx, y - 6 * s);
      ctx.lineTo(cx + 24 * s, y - 6 * s);
      ctx.lineTo(cx + 24 * s, y + 6 * s);
      ctx.lineTo(cx, y + 6 * s);
      ctx.stroke();
      const hl = 5 * s;
      ctx.beginPath();
      ctx.moveTo(cx, y + 6 * s);
      ctx.lineTo(cx + hl, y + 6 * s - hl * 0.5);
      ctx.lineTo(cx + hl, y + 6 * s + hl * 0.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      drawText(label, cx + 28 * s, y, color, 7, 'left');
    }

    function drawBlock(y: number, h: number, color: string, label: string) {
      const bx = colSpacing * 0.35;
      const bw = colSpacing * 5.3;
      ctx.fillStyle = color + '08';
      roundRect(ctx, bx, y, bw, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1.5 * s;
      roundRect(ctx, bx, y, bw, h, 6 * s);
      ctx.stroke();
      const lw = Math.max(label.length * 6 + 14, 50) * s;
      const lh = 16 * s;
      ctx.fillStyle = color + '33';
      roundRect(ctx, bx, y, lw, lh, 4 * s);
      ctx.fill();
      drawText(label, bx + lw / 2, y + lh / 2, color, 8);
    }

    function drawParticle(x: number, y: number, color: string) {
      ctx.beginPath();
      ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw participant boxes and lifelines
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const cx2 = colSpacing * (i + 1);
      const bx = cx2 - boxW / 2;
      const hovered = isHover(mouse.x, mouse.y, bx, topY, boxW, boxH);
      drawBox(bx, topY, boxW, boxH, p.color, hovered);
      drawText(p.name, cx2, topY + boxH / 2, THEME.text, 9);

      ctx.strokeStyle = p.color + '25';
      ctx.lineWidth = 1 * s;
      ctx.setLineDash([3 * s, 3 * s]);
      ctx.beginPath();
      ctx.moveTo(cx2, topY + boxH);
      ctx.lineTo(cx2, height - 10 * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Message sequence
    const mY = topY + boxH + 22 * s;
    const mG = 28 * s;

    // 1. User → route.ts: Request
    drawMsgArrow(0, 1, mY, '"VPC security + cost analysis"', THEME.cyan);

    // 2. route.ts self: intent classification
    drawSelfArrow(1, mY + mG, 'Intent: [network, cost]', THEME.cyan);

    // PAR block
    const parY = mY + mG * 1.8;
    const parH = mG * 3.2;
    drawBlock(parY, parH, THEME.green, 'PAR');

    // 3. Parallel: route.ts → Network GW
    drawMsgArrow(1, 2, parY + 22 * s, 'Network Analysis', THEME.green);
    // 4. Parallel: route.ts → Cost GW
    drawMsgArrow(1, 3, parY + 22 * s + mG, 'Cost Analysis', THEME.orange);

    // 5. Network GW → route.ts: result
    drawMsgArrow(2, 1, parY + 22 * s + mG * 2, 'Network Result', THEME.green, true);
    // 6. Cost GW → route.ts: result
    drawMsgArrow(3, 1, parY + 22 * s + mG * 2.7, 'Cost Result', THEME.orange, true);

    // 7. route.ts → Bedrock: ConverseStreamCommand
    const csY = parY + parH + 18 * s;
    drawMsgArrow(1, 4, csY, 'ConverseStreamCommand', THEME.purple);

    // LOOP block
    const loopY = csY + mG * 0.8;
    const loopH = mG * 3;
    drawBlock(loopY, loopH, THEME.purple, 'LOOP: contentBlockDelta');

    // 8. Bedrock → route.ts: delta token
    drawMsgArrow(4, 1, loopY + 22 * s, 'delta.text token', THEME.purple, true);
    // 9. route.ts → User: SSE chunk
    drawMsgArrow(1, 0, loopY + 22 * s + mG, 'SSE chunk {delta}', THEME.cyan, true);

    // 10. Done
    const doneY = loopY + loopH + 18 * s;
    drawMsgArrow(1, 0, doneY, 'SSE done {content, tools}', THEME.green);

    // Animated particles - phase based
    if (progress < 0.08) {
      // User → route.ts
      const t = progress / 0.08;
      const x1 = colSpacing;
      const x2 = colSpacing * 2;
      drawParticle(x1 + t * (x2 - x1), mY, THEME.cyan);
    } else if (progress < 0.15) {
      // Self-arrow intent
      const t = (progress - 0.08) / 0.07;
      const cx2 = colSpacing * 2;
      drawParticle(cx2 + 24 * s * Math.sin(t * Math.PI), mY + mG, THEME.cyan);
    } else if (progress < 0.35) {
      // PAR block: two particles simultaneously
      const t = (progress - 0.15) / 0.2;
      if (t < 0.5) {
        // route.ts → GWs
        const tt = t / 0.5;
        const x1 = colSpacing * 2;
        drawParticle(x1 + tt * (colSpacing * 3 - x1), parY + 22 * s, THEME.green);
        drawParticle(x1 + tt * (colSpacing * 4 - x1), parY + 22 * s + mG, THEME.orange);
      } else {
        // GWs → route.ts
        const tt = (t - 0.5) / 0.5;
        drawParticle(colSpacing * 3 + tt * (colSpacing * 2 - colSpacing * 3), parY + 22 * s + mG * 2, THEME.green);
        drawParticle(colSpacing * 4 + tt * (colSpacing * 2 - colSpacing * 4), parY + 22 * s + mG * 2.7, THEME.orange);
      }
    } else if (progress < 0.45) {
      // route.ts → Bedrock
      const t = (progress - 0.35) / 0.1;
      const x1 = colSpacing * 2;
      const x2 = colSpacing * 5;
      drawParticle(x1 + t * (x2 - x1), csY, THEME.purple);
    } else if (progress < 0.85) {
      // Loop: fast cycling
      const loopT = (progress - 0.45) / 0.4;
      const cycles = 5;
      const cycleT = (loopT * cycles) % 1;
      if (cycleT < 0.5) {
        // Bedrock → route.ts
        const t = cycleT / 0.5;
        drawParticle(
          colSpacing * 5 + t * (colSpacing * 2 - colSpacing * 5),
          loopY + 22 * s,
          THEME.purple,
        );
      } else {
        // route.ts → User
        const t = (cycleT - 0.5) / 0.5;
        drawParticle(
          colSpacing * 2 + t * (colSpacing - colSpacing * 2),
          loopY + 22 * s + mG,
          THEME.cyan,
        );
      }
    } else {
      // Done: route.ts → User
      const t = (progress - 0.85) / 0.15;
      drawParticle(
        colSpacing * 2 + t * (colSpacing - colSpacing * 2),
        doneY,
        THEME.green,
      );
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
