'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

interface Gateway {
  name: string;
  tools: number;
  color: string;
  lambdas: string[];
}

const GATEWAYS: Gateway[] = [
  { name: 'Network', tools: 17, color: THEME.green, lambdas: ['network_analyzer', 'reachability_analyzer', 'tgw_analyzer', 'vpn_analyzer', 'firewall_analyzer'] },
  { name: 'Container', tools: 24, color: THEME.green, lambdas: ['eks_analyzer', 'ecs_analyzer', 'istio_analyzer'] },
  { name: 'IaC', tools: 12, color: THEME.purple, lambdas: ['cfn_analyzer'] },
  { name: 'Data', tools: 24, color: THEME.purple, lambdas: ['dynamodb_analyzer', 'rds_analyzer', 'elasticache_analyzer', 'msk_analyzer'] },
  { name: 'Security', tools: 14, color: THEME.red, lambdas: ['iam_analyzer'] },
  { name: 'Monitoring', tools: 16, color: THEME.orange, lambdas: ['cloudwatch_analyzer', 'cloudtrail_analyzer'] },
  { name: 'Cost', tools: 9, color: THEME.orange, lambdas: ['cost_analyzer', 'budget_analyzer'] },
];

const CANVAS_HEIGHT = 500;

export default function GatewayRoutingFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Layout
    const userBoxY = 25 * s;
    const userBoxH = 45 * s;
    const classifierY = 110 * s;
    const classifierH = 55 * s;
    const gwY = 220 * s;
    const gwH = 80 * s;
    const lambdaY = 350 * s;
    const lambdaH = 40 * s;

    const centerX = width / 2;
    const gwCount = GATEWAYS.length;
    const gwW = Math.min(100 * s, (width - 40 * s) / gwCount - 8 * s);
    const gwSpacing = 8 * s;
    const totalGwW = gwCount * gwW + (gwCount - 1) * gwSpacing;
    const gwStartX = (width - totalGwW) / 2;

    // Animation: cycle through gateways
    const cycleFrames = 150;
    const activeGwIdx = Math.floor((frame % (cycleFrames * gwCount)) / cycleFrames);
    const cycleProgress = (frame % cycleFrames) / cycleFrames;

    // Helpers
    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20 * s;
      }
      ctx.fillStyle = THEME.card;
      roundRect(ctx, x, y, w, h, 8 * s);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

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

    // 1. User Question box
    const userBoxW = 180 * s;
    const userBoxX = centerX - userBoxW / 2;
    drawBox(userBoxX, userBoxY, userBoxW, userBoxH, THEME.cyan);
    drawText('User Question', centerX, userBoxY + userBoxH / 2, THEME.text, 13);

    // Arrow: User -> Classifier
    drawArrow(centerX, userBoxY + userBoxH, centerX, classifierY, THEME.dim);

    // 2. Sonnet Intent Classifier box (with glow)
    const clW = 280 * s;
    const clX = centerX - clW / 2;
    drawBox(clX, classifierY, clW, classifierH, THEME.purple, true);
    drawText('Sonnet Intent Classifier', centerX, classifierY + 20 * s, THEME.text, 13);
    drawText('Natural Language Classification', centerX, classifierY + 40 * s, THEME.muted, 9);

    // Arrows: Classifier -> Gateways
    for (let i = 0; i < gwCount; i++) {
      const gwCenterX = gwStartX + i * (gwW + gwSpacing) + gwW / 2;
      const color = i === activeGwIdx ? GATEWAYS[i].color : THEME.dim;
      drawArrow(centerX, classifierY + classifierH, gwCenterX, gwY, color);
    }

    // 3. Gateway boxes
    let hoveredGw: Gateway | null = null;
    let hoverBoxX = 0;
    let hoverBoxY = 0;

    for (let i = 0; i < gwCount; i++) {
      const gw = GATEWAYS[i];
      const x = gwStartX + i * (gwW + gwSpacing);
      const y = gwY;
      const isActive = i === activeGwIdx && cycleProgress >= 0.4 && cycleProgress < 0.7;
      const isHovered = isHover(mouse.x, mouse.y, x, y, gwW, gwH);

      if (isHovered) {
        hoveredGw = gw;
        hoverBoxX = x + gwW / 2;
        hoverBoxY = y;
      }

      drawBox(x, y, gwW, gwH, gw.color, isActive || isHovered);

      // Gateway name
      drawText(gw.name, x + gwW / 2, y + 22 * s, THEME.text, 11);
      drawText('GW', x + gwW / 2, y + 38 * s, THEME.muted, 9);

      // Tool count badge
      const toolStr = String(gw.tools);
      const badgeW = (toolStr.length * 7 + 16) * s;
      const badgeX = x + gwW / 2 - badgeW / 2;
      const badgeY = y + gwH - 24 * s;
      ctx.fillStyle = gw.color + '33';
      roundRect(ctx, badgeX, badgeY, badgeW, 16 * s, 4 * s);
      ctx.fill();
      drawText(toolStr + ' tools', x + gwW / 2, badgeY + 8 * s, gw.color, 8);

      // Arrow: Gateway -> Lambda labels
      const gwCenterX = x + gwW / 2;
      drawArrow(gwCenterX, y + gwH, gwCenterX, lambdaY, i === activeGwIdx ? gw.color : THEME.dim);

      // Lambda label below
      const lambdaLabel = gw.lambdas.length <= 2 ? gw.lambdas.join(', ') : gw.lambdas[0] + ' +' + (gw.lambdas.length - 1);
      drawText(lambdaLabel, gwCenterX, lambdaY + lambdaH / 2, THEME.muted, 7);
    }

    // 4. Particle animation
    const activeGwCenterX = gwStartX + activeGwIdx * (gwW + gwSpacing) + gwW / 2;
    let particleX = centerX;
    let particleY = userBoxY + userBoxH;

    if (cycleProgress < 0.2) {
      const t = cycleProgress / 0.2;
      particleY = userBoxY + userBoxH + t * (classifierY - userBoxY - userBoxH);
    } else if (cycleProgress < 0.4) {
      const t = (cycleProgress - 0.2) / 0.2;
      particleX = centerX + t * (activeGwCenterX - centerX);
      particleY = classifierY + classifierH + t * (gwY - classifierY - classifierH);
    } else if (cycleProgress < 0.7) {
      particleX = activeGwCenterX;
      particleY = gwY + gwH / 2;
    } else {
      const t = (cycleProgress - 0.7) / 0.3;
      particleX = activeGwCenterX;
      particleY = gwY + gwH + t * (lambdaY - gwY - gwH);
    }

    const activeColor = GATEWAYS[activeGwIdx].color;
    ctx.beginPath();
    ctx.arc(particleX, particleY, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = activeColor;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 15 * s;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Tooltip on hover
    if (hoveredGw) {
      const tooltipW = 180 * s;
      const tooltipH = (hoveredGw.lambdas.length * 14 + 40) * s;
      let tooltipX = hoverBoxX - tooltipW / 2;
      let tooltipY = hoverBoxY - tooltipH - 10 * s;

      if (tooltipX < 10 * s) tooltipX = 10 * s;
      if (tooltipX + tooltipW > width - 10 * s) tooltipX = width - tooltipW - 10 * s;
      if (tooltipY < 10 * s) tooltipY = hoverBoxY + gwH + 10 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tooltipX, tooltipY, tooltipW, tooltipH, 8 * s);
      ctx.fill();
      ctx.strokeStyle = hoveredGw.color;
      ctx.lineWidth = 1 * s;
      ctx.stroke();

      drawText(hoveredGw.name + ' Gateway', tooltipX + tooltipW / 2, tooltipY + 14 * s, hoveredGw.color, 11);
      drawText(hoveredGw.tools + ' tools', tooltipX + tooltipW / 2, tooltipY + 28 * s, THEME.muted, 9);

      for (let i = 0; i < hoveredGw.lambdas.length; i++) {
        drawText(hoveredGw.lambdas[i], tooltipX + 10 * s, tooltipY + 44 * s + i * 14 * s, THEME.text, 8, 'left');
      }
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
