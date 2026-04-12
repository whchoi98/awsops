'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 400;

interface FlowNode {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  type: 'box' | 'diamond';
  x: number;
  y: number;
}

export default function DeploymentSafetyFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Helpers
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
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

    // Background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    // Layout
    const centerX = width / 2;
    const boxW = 180 * s;
    const boxH = 40 * s;
    const diamondSize = 40 * s;
    const stepGap = 55 * s;

    // Flow nodes (top-down)
    const startY = 25 * s;
    const checkY = startY + stepGap;
    const runtimeY = checkY + stepGap + 10 * s;
    const gwY = runtimeY + stepGap;
    const lambdaY = gwY + stepGap;
    const cfY = lambdaY + stepGap;

    // Fail branch position
    const failX = centerX + 180 * s;

    // Animation
    const totalFrames = 360;
    const progress = (frame % totalFrames) / totalFrames;

    // Determine how many nodes are "active" (lit up)
    const activeSteps = Math.floor(progress * 7); // 0..6

    function drawRoundBox(x: number, y: number, w: number, h: number, color: string, glow = false, isActive = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 * s;
      }
      ctx.fillStyle = isActive ? color + '22' : THEME.card;
      roundRect(ctx, x, y, w, h, 6 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function drawDiamond(cx: number, cy: number, size: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 * s;
      }
      ctx.fillStyle = THEME.card;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size / 2);
      ctx.lineTo(cx + size / 2, cy);
      ctx.lineTo(cx, cy + size / 2);
      ctx.lineTo(cx - size / 2, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 1. Deploy Start
    const startActive = activeSteps >= 0;
    drawRoundBox(centerX - boxW / 2, startY, boxW, boxH, THEME.cyan, startActive, startActive);
    drawText('Deploy Start', centerX, startY + boxH / 2, THEME.text, 12);

    // Arrow: Start -> Check
    drawArrow(centerX, startY + boxH, centerX, checkY - diamondSize / 2, startActive ? THEME.green : THEME.dim);

    // 2. AWS Credentials Check (diamond)
    const checkActive = activeSteps >= 1;
    const checkHovered = isHover(mouse.x, mouse.y, centerX - diamondSize / 2, checkY - diamondSize / 2, diamondSize, diamondSize);
    drawDiamond(centerX, checkY, diamondSize, THEME.orange, checkActive || checkHovered);
    drawText('Credentials', centerX, checkY - 2 * s, THEME.text, 9);
    drawText('Check', centerX, checkY + 10 * s, THEME.muted, 8);

    // Fail branch (right)
    drawArrow(centerX + diamondSize / 2, checkY, failX - boxW / 2 + 10 * s, checkY, THEME.red);
    const failBoxW = 140 * s;
    ctx.shadowColor = THEME.red;
    ctx.shadowBlur = 12 * s;
    drawRoundBox(failX - failBoxW / 2, checkY - boxH / 2, failBoxW, boxH, THEME.red, false);
    ctx.shadowBlur = 0;
    drawText('Abort + Error', failX, checkY, THEME.red, 11);
    drawText('fail', centerX + diamondSize / 2 + 20 * s, checkY - 10 * s, THEME.red, 8);

    // Success arrow down
    drawArrow(centerX, checkY + diamondSize / 2, centerX, runtimeY, checkActive ? THEME.green : THEME.dim);
    drawText('success', centerX + 20 * s, checkY + diamondSize / 2 + 8 * s, THEME.green, 8, 'left');

    // 3. Runtime Create
    const rtActive = activeSteps >= 2;
    drawRoundBox(centerX - boxW / 2, runtimeY, boxW, boxH, THEME.green, rtActive, rtActive);
    drawText('Runtime Create/Update', centerX, runtimeY + boxH / 2, THEME.text, 11);

    // Arrow
    drawArrow(centerX, runtimeY + boxH, centerX, gwY, rtActive ? THEME.green : THEME.dim);

    // 4. 8 Gateways
    const gwActive = activeSteps >= 3;
    drawRoundBox(centerX - boxW / 2, gwY, boxW, boxH, THEME.purple, gwActive, gwActive);
    drawText('8 Gateway Creation', centerX, gwY + boxH / 2, THEME.text, 11);

    // Arrow
    drawArrow(centerX, gwY + boxH, centerX, lambdaY, gwActive ? THEME.green : THEME.dim);

    // 5. 19 Lambda + Targets
    const lambdaActive = activeSteps >= 4;
    drawRoundBox(centerX - boxW / 2, lambdaY, boxW, boxH, THEME.orange, lambdaActive, lambdaActive);
    drawText('19 Lambda + Targets', centerX, lambdaY + boxH / 2, THEME.text, 11);

    // Arrow
    drawArrow(centerX, lambdaY + boxH, centerX, cfY - diamondSize / 2, lambdaActive ? THEME.green : THEME.dim);

    // 6. CloudFront Auto-detect (diamond)
    const cfActive = activeSteps >= 5;
    const cfHovered = isHover(mouse.x, mouse.y, centerX - diamondSize / 2, cfY - diamondSize / 2, diamondSize, diamondSize);
    drawDiamond(centerX, cfY, diamondSize, THEME.cyan, cfActive || cfHovered);
    drawText('CF', centerX, cfY - 2 * s, THEME.text, 9);
    drawText('Detect', centerX, cfY + 10 * s, THEME.muted, 8);

    // CDK branch (left)
    const cdkX = centerX - 160 * s;
    const cdkBoxW = 140 * s;
    drawArrow(centerX - diamondSize / 2, cfY, cdkX + cdkBoxW / 2 + 10 * s, cfY, THEME.green);
    drawRoundBox(cdkX - cdkBoxW / 2 + 20 * s, cfY - boxH / 2, cdkBoxW, boxH, THEME.green, cfActive);
    drawText('CDK Output', cdkX + 20 * s, cfY, THEME.green, 11);
    drawText('CDK stack', centerX - diamondSize / 2 - 20 * s, cfY - 12 * s, THEME.green, 8);

    // ALB fallback branch (right)
    const albX = centerX + 160 * s;
    const albBoxW = 140 * s;
    drawArrow(centerX + diamondSize / 2, cfY, albX - albBoxW / 2 - 10 * s, cfY, THEME.orange);
    drawRoundBox(albX - albBoxW / 2 - 20 * s + albBoxW / 2, cfY - boxH / 2, albBoxW, boxH, THEME.orange, false);
    drawText('ALB Fallback', albX + 20 * s, cfY, THEME.orange, 11);
    drawText('not found', centerX + diamondSize / 2 + 20 * s, cfY - 12 * s, THEME.orange, 8);

    // 7. Animated particle along success path
    const particleSteps = [
      { x: centerX, y: startY + boxH },
      { x: centerX, y: checkY - diamondSize / 2 },
      { x: centerX, y: checkY + diamondSize / 2 },
      { x: centerX, y: runtimeY },
      { x: centerX, y: runtimeY + boxH },
      { x: centerX, y: gwY },
      { x: centerX, y: gwY + boxH },
      { x: centerX, y: lambdaY },
      { x: centerX, y: lambdaY + boxH },
      { x: centerX, y: cfY - diamondSize / 2 },
    ];

    const particleIdx = Math.min(Math.floor(progress * particleSteps.length), particleSteps.length - 1);
    const nextIdx = Math.min(particleIdx + 1, particleSteps.length - 1);
    const localT = (progress * particleSteps.length) - particleIdx;

    const pX = particleSteps[particleIdx].x + (particleSteps[nextIdx].x - particleSteps[particleIdx].x) * localT;
    const pY = particleSteps[particleIdx].y + (particleSteps[nextIdx].y - particleSteps[particleIdx].y) * localT;

    ctx.beginPath();
    ctx.arc(pX, pY, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = THEME.green;
    ctx.shadowColor = THEME.green;
    ctx.shadowBlur = 15 * s;
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
