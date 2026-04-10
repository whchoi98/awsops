'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 450;

interface DiagStep {
  label: string;
  tooltip: string;
}

const DIAG_STEPS: DiagStep[] = [
  { label: 'URL Validation', tooltip: 'Validates URL format, protocol, and allowed network list' },
  { label: 'DNS Resolution', tooltip: 'Resolves hostname to IP and checks reachability' },
  { label: 'NLB Health', tooltip: 'Checks Network Load Balancer target health status' },
  { label: 'SG Chain', tooltip: 'Validates Security Group inbound/outbound rules chain' },
  { label: 'Network Path', tooltip: 'Traces VPC routing, subnets, and NACLs' },
  { label: 'HTTP Test', tooltip: 'Sends HTTP request and validates response code/body' },
  { label: 'K8s Endpoint', tooltip: 'Verifies Kubernetes Service and Pod endpoint status' },
  { label: 'Full Report', tooltip: 'Aggregates all results into diagnostic summary' },
];

export default function DatasourceExploreFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // --- Helpers ---
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawBoldText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `bold ${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false) {
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * s;
      }
      ctx.fillStyle = THEME.card;
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
      const headLen = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function drawParticle(x: number, y: number, color: string, radius = 3) {
      ctx.beginPath();
      ctx.arc(x, y, radius * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // --- Background ---
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    // --- Layout ---
    const margin = 16 * s;
    const topFlowY = 30 * s;
    const dividerY = 185 * s;
    const bottomFlowY = 220 * s;

    // ============================================================
    // TOP FLOW: Natural Language -> Bedrock -> Query -> Execute -> Chart
    // ============================================================
    const topBoxH = 50 * s;
    const topLabels = [
      { label: 'Natural Language', sub: 'User Input', color: THEME.cyan },
      { label: 'Bedrock Sonnet', sub: 'AI Generation', color: THEME.purple },
      { label: 'Generated Query', sub: 'PromQL / LogQL / SQL', color: THEME.cyan },
      { label: 'Execute', sub: 'Datasource API', color: THEME.green },
      { label: 'Multi-Series Chart', sub: 'Up to 8 Series', color: THEME.green },
    ];
    const topCount = topLabels.length;
    const topGap = 12 * s;
    const topBoxW = Math.min(140 * s, (width - margin * 2 - (topCount - 1) * topGap) / topCount);
    const totalTopW = topCount * topBoxW + (topCount - 1) * topGap;
    const topStartX = (width - totalTopW) / 2;

    // Section label
    drawBoldText('AI Query Generation Flow', width / 2, topFlowY - 10 * s, THEME.cyan, 11);

    for (let i = 0; i < topCount; i++) {
      const item = topLabels[i];
      const x = topStartX + i * (topBoxW + topGap);
      const y = topFlowY;
      const hovered = isHover(mouse.x, mouse.y, x, y, topBoxW, topBoxH);
      drawBox(x, y, topBoxW, topBoxH, item.color, hovered);
      drawText(item.label, x + topBoxW / 2, y + 18 * s, THEME.text, 9);
      drawText(item.sub, x + topBoxW / 2, y + 34 * s, THEME.muted, 7);

      // Arrow to next box
      if (i < topCount - 1) {
        const arrowX1 = x + topBoxW;
        const arrowX2 = x + topBoxW + topGap;
        drawArrow(arrowX1, y + topBoxH / 2, arrowX2, y + topBoxH / 2, item.color + '88');
      }
    }

    // Top flow particles
    const topCycle = 200;
    const topT = ((frame) % topCycle) / topCycle;
    const topTotalSpan = totalTopW;
    const topPx = topStartX + topT * topTotalSpan;
    const topPy = topFlowY + topBoxH / 2;
    if (topPx < topStartX + totalTopW) {
      drawParticle(topPx, topPy, THEME.cyan);
    }

    // Second particle offset
    const topT2 = ((frame + 100) % topCycle) / topCycle;
    const topPx2 = topStartX + topT2 * topTotalSpan;
    if (topPx2 < topStartX + totalTopW) {
      drawParticle(topPx2, topPy, THEME.purple);
    }

    // --- Query type badges under the Generated Query box ---
    const queryBoxIdx = 2;
    const qbX = topStartX + queryBoxIdx * (topBoxW + topGap);
    const qbY = topFlowY + topBoxH + 8 * s;
    const queryTypes = ['PromQL', 'LogQL', 'SQL'];
    const badgeW = 42 * s;
    const badgeGap = 4 * s;
    const totalBadgeW = queryTypes.length * badgeW + (queryTypes.length - 1) * badgeGap;
    const badgeStartX = qbX + topBoxW / 2 - totalBadgeW / 2;
    for (let i = 0; i < queryTypes.length; i++) {
      const bx = badgeStartX + i * (badgeW + badgeGap);
      ctx.fillStyle = THEME.cyan + '22';
      roundRect(ctx, bx, qbY, badgeW, 14 * s, 3 * s);
      ctx.fill();
      ctx.strokeStyle = THEME.cyan + '55';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      drawText(queryTypes[i], bx + badgeW / 2, qbY + 7 * s, THEME.cyan, 7);
    }

    // --- Divider ---
    ctx.strokeStyle = THEME.dim;
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(margin, dividerY);
    ctx.lineTo(width - margin, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText('Explore', margin + 30 * s, dividerY, THEME.muted, 8);

    // ============================================================
    // BOTTOM FLOW: Diagnose Button -> datasource-diag -> 8 Steps -> Report
    // ============================================================
    drawBoldText('Datasource Diagnostics Flow', width / 2, bottomFlowY - 5 * s, THEME.orange, 11);

    // Diagnose button
    const diagBtnW = 110 * s;
    const diagBtnH = 40 * s;
    const diagBtnX = margin;
    const diagBtnY = bottomFlowY + 15 * s;
    const diagBtnHover = isHover(mouse.x, mouse.y, diagBtnX, diagBtnY, diagBtnW, diagBtnH);
    drawBox(diagBtnX, diagBtnY, diagBtnW, diagBtnH, THEME.orange, diagBtnHover);
    drawText('Diagnose', diagBtnX + diagBtnW / 2, diagBtnY + 14 * s, THEME.text, 10);
    drawText('Admin Only', diagBtnX + diagBtnW / 2, diagBtnY + 28 * s, THEME.muted, 7);

    // Route box
    const routeW = 110 * s;
    const routeH = 40 * s;
    const routeX = diagBtnX + diagBtnW + 16 * s;
    const routeY = diagBtnY;
    const routeHover = isHover(mouse.x, mouse.y, routeX, routeY, routeW, routeH);
    drawBox(routeX, routeY, routeW, routeH, THEME.orange, routeHover);
    drawText('datasource-diag', routeX + routeW / 2, routeY + 14 * s, THEME.text, 8);
    drawText('AI Route', routeX + routeW / 2, routeY + 28 * s, THEME.muted, 7);

    // Arrow: Diagnose -> Route
    drawArrow(diagBtnX + diagBtnW, diagBtnY + diagBtnH / 2, routeX, routeY + routeH / 2, THEME.orange + '88');

    // 8 diagnostic steps
    const stepsStartX = routeX + routeW + 16 * s;
    const stepsAvailW = width - stepsStartX - margin;
    const stepCount = DIAG_STEPS.length;
    const stepGap = 3 * s;
    const stepW = Math.min(80 * s, (stepsAvailW - (stepCount - 1) * stepGap) / stepCount);
    const stepH = 52 * s;
    const stepY = bottomFlowY + 10 * s;

    // Arrow: Route -> first step
    drawArrow(routeX + routeW, routeY + routeH / 2, stepsStartX, stepY + stepH / 2, THEME.orange + '88');

    // Animation: cycle through diagnostic steps
    const diagCycle = 60;
    const totalDiagFrames = diagCycle * stepCount;
    const activeStepIdx = Math.floor((frame % totalDiagFrames) / diagCycle);
    const stepProgress = (frame % diagCycle) / diagCycle;

    let hoveredStep: DiagStep | null = null;
    let hoverStepX = 0;
    let hoverStepY = 0;

    for (let i = 0; i < stepCount; i++) {
      const step = DIAG_STEPS[i];
      const x = stepsStartX + i * (stepW + stepGap);
      const y = stepY;
      const isActive = i === activeStepIdx;
      const isPast = i < activeStepIdx;
      const hovered = isHover(mouse.x, mouse.y, x, y, stepW, stepH);

      if (hovered) {
        hoveredStep = step;
        hoverStepX = x + stepW / 2;
        hoverStepY = y;
      }

      // Step number badge
      const stepNumColor = isPast ? THEME.green : isActive ? THEME.orange : THEME.dim;
      const boxColor = isPast ? THEME.green + '88' : isActive ? THEME.orange : THEME.dim;
      drawBox(x, y, stepW, stepH, boxColor, isActive || hovered);

      // Step number
      const numBadgeR = 8 * s;
      ctx.beginPath();
      ctx.arc(x + stepW / 2, y + 14 * s, numBadgeR, 0, Math.PI * 2);
      ctx.fillStyle = stepNumColor + '33';
      ctx.fill();
      drawText(String(i + 1), x + stepW / 2, y + 14 * s, stepNumColor, 8);

      // Step label (truncate if needed)
      const displayLabel = step.label.length > 10 ? step.label.substring(0, 9) + '...' : step.label;
      drawText(displayLabel, x + stepW / 2, y + 34 * s, isPast ? THEME.green : THEME.text, 7);

      // Check mark for completed steps
      if (isPast) {
        drawText('\u2713', x + stepW - 10 * s, y + 8 * s, THEME.green, 10);
      }

      // Connector arrows between steps
      if (i < stepCount - 1) {
        const nextX = stepsStartX + (i + 1) * (stepW + stepGap);
        const connColor = isPast ? THEME.green + '88' : THEME.dim;
        drawArrow(x + stepW, y + stepH / 2, nextX, y + stepH / 2, connColor);
      }
    }

    // Animated particle traversing diagnostic steps
    const diagParticleStep = activeStepIdx;
    const diagParticleX = stepsStartX + diagParticleStep * (stepW + stepGap) + stepProgress * stepW;
    const diagParticleY = stepY + stepH / 2;
    drawParticle(diagParticleX, diagParticleY, THEME.orange, 3);

    // Particle on the Diagnose -> Route segment
    const btnParticleT = ((frame + 30) % 80) / 80;
    const btnPx = diagBtnX + diagBtnW + btnParticleT * (routeX - diagBtnX - diagBtnW);
    drawParticle(btnPx, diagBtnY + diagBtnH / 2, THEME.orange, 2);

    // --- Bottom: series count indicator ---
    const chartBoxIdx = 4;
    const chartBoxX = topStartX + chartBoxIdx * (topBoxW + topGap);
    const chartBoxY = topFlowY + topBoxH + 8 * s;
    const seriesColors = [THEME.cyan, THEME.green, THEME.purple, THEME.orange, THEME.red, '#60a5fa', '#f472b6', '#a3e635'];
    const dotR = 4 * s;
    const dotGap = 3 * s;
    const totalDotsW = seriesColors.length * (dotR * 2) + (seriesColors.length - 1) * dotGap;
    const dotsStartX = chartBoxX + topBoxW / 2 - totalDotsW / 2;
    for (let i = 0; i < seriesColors.length; i++) {
      const dx = dotsStartX + i * (dotR * 2 + dotGap) + dotR;
      ctx.beginPath();
      ctx.arc(dx, chartBoxY + 7 * s, dotR, 0, Math.PI * 2);
      ctx.fillStyle = seriesColors[i] + '88';
      ctx.fill();
    }
    drawText('8 series max', chartBoxX + topBoxW / 2, chartBoxY + 20 * s, THEME.muted, 7);

    // --- Tooltip for hovered diagnostic step ---
    if (hoveredStep) {
      const tooltipW = 220 * s;
      const tooltipH = 50 * s;
      let tooltipX = hoverStepX - tooltipW / 2;
      let tooltipY = hoverStepY - tooltipH - 8 * s;

      if (tooltipX < 5 * s) tooltipX = 5 * s;
      if (tooltipX + tooltipW > width - 5 * s) tooltipX = width - tooltipW - 5 * s;
      if (tooltipY < 5 * s) tooltipY = hoverStepY + stepH + 8 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tooltipX, tooltipY, tooltipW, tooltipH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = THEME.orange;
      ctx.lineWidth = 1 * s;
      ctx.stroke();

      drawBoldText(hoveredStep.label, tooltipX + tooltipW / 2, tooltipY + 16 * s, THEME.orange, 9);
      drawText(hoveredStep.tooltip, tooltipX + tooltipW / 2, tooltipY + 34 * s, THEME.text, 7);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
