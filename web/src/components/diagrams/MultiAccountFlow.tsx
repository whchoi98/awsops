'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 500;

const ACCOUNTS = [
  { id: '111111111111', alias: 'Host', color: THEME.cyan },
  { id: '222222222222', alias: 'Staging', color: THEME.orange },
];

export default function MultiAccountFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Layout
    const layerPad = 12 * s;
    const layerGap = 16 * s;
    const boxH = 38 * s;
    const boxR = 6 * s;

    // Layer Y positions
    const uiY = 20 * s;
    const uiH = boxH + layerPad * 2 + 16 * s;
    const apiY = uiY + uiH + layerGap;
    const apiH = boxH + layerPad * 2 + 16 * s;
    const spY = apiY + apiH + layerGap;
    const spH = boxH + layerPad * 2 + 16 * s;
    const agY = spY + spH + layerGap;
    const agH = boxH + layerPad * 2 + 16 * s;

    const cx = width / 2;
    const layerW = Math.min(680 * s, width - 30 * s);
    const layerX = cx - layerW / 2;

    // Animation: cycle accounts every 3s
    const cycleFrames = 180;
    const activeIdx = Math.floor((frame % (cycleFrames * ACCOUNTS.length)) / cycleFrames);
    const progress = (frame % cycleFrames) / cycleFrames;
    const activeAccount = ACCOUNTS[activeIdx];

    // Helpers
    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    function drawBox(x: number, y: number, w: number, h: number, color: string, glow = false, label?: string) {
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
      if (label) {
        drawText(label, x + w / 2, y + h / 2, THEME.text, 10);
      }
    }

    function drawLayer(y: number, h: number, color: string, label: string) {
      ctx.fillStyle = color + '0d';
      roundRect(ctx, layerX, y, layerW, h, 8 * s);
      ctx.fill();
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1.5 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      roundRect(ctx, layerX, y, layerW, h, 8 * s);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(label, layerX + layerPad, y + 12 * s, color, 9, 'left');
    }

    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const hl = 8 * s;
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
      ctx.shadowBlur = 12 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 1. UI Layer
    drawLayer(uiY, uiH, THEME.cyan, 'UI');
    const uiBoxY = uiY + 22 * s;
    const uiBoxW = (layerW - layerPad * 2 - 16 * s) / 3;
    const boxes = ['AccountSelector', 'AccountBadge', 'AccountContext'];
    const uiSubs = ['Dropdown', 'Color Dot + Alias', 'useAccount() Hook'];
    for (let i = 0; i < 3; i++) {
      const bx = layerX + layerPad + i * (uiBoxW + 8 * s);
      const hovered = isHover(mouse.x, mouse.y, bx, uiBoxY, uiBoxW, boxH);
      const glowing = i === 0 && progress < 0.2;
      drawBox(bx, uiBoxY, uiBoxW, boxH, THEME.cyan, hovered || glowing);
      drawText(boxes[i], bx + uiBoxW / 2, uiBoxY + 14 * s, THEME.text, 10);
      drawText(uiSubs[i], bx + uiBoxW / 2, uiBoxY + 28 * s, THEME.muted, 8);
    }

    // 2. API Layer
    drawLayer(apiY, apiH, THEME.green, 'API');
    const apiBoxY = apiY + 22 * s;
    const apiBoxW = (layerW - layerPad * 2 - 16 * s) / 2;
    const apiBoxes = ['buildSearchPath(accountId)', 'runCostQueriesPerAccount()'];
    const apiSubs = ['search_path switching', 'Per-account Cost'];
    for (let i = 0; i < 2; i++) {
      const bx = layerX + layerPad + i * (apiBoxW + 16 * s);
      const hovered = isHover(mouse.x, mouse.y, bx, apiBoxY, apiBoxW, boxH);
      const glowing = i === 0 && progress >= 0.2 && progress < 0.4;
      drawBox(bx, apiBoxY, apiBoxW, boxH, THEME.green, hovered || glowing);
      drawText(apiBoxes[i], bx + apiBoxW / 2, apiBoxY + 14 * s, THEME.text, 10);
      drawText(apiSubs[i], bx + apiBoxW / 2, apiBoxY + 28 * s, THEME.muted, 8);
    }

    // 3. Steampipe Layer
    drawLayer(spY, spH, THEME.purple, 'Steampipe Aggregator');
    const spBoxY = spY + 22 * s;
    const spBoxW = (layerW - layerPad * 2 - 16 * s) / 3;
    const spLabels = ['aws', `aws_${ACCOUNTS[0].id.slice(0, 6)}...`, `aws_${ACCOUNTS[1].id.slice(0, 6)}...`];
    const spSubs = ['All Accounts', ACCOUNTS[0].alias, ACCOUNTS[1].alias];
    const spColors = [THEME.purple, ACCOUNTS[0].color, ACCOUNTS[1].color];
    for (let i = 0; i < 3; i++) {
      const bx = layerX + layerPad + i * (spBoxW + 8 * s);
      const hovered = isHover(mouse.x, mouse.y, bx, spBoxY, spBoxW, boxH);
      const isActive = (i === 0) || (i === activeIdx + 1);
      const glowing = isActive && progress >= 0.4 && progress < 0.7;
      drawBox(bx, spBoxY, spBoxW, boxH, spColors[i], hovered || glowing);
      drawText(spLabels[i], bx + spBoxW / 2, spBoxY + 14 * s, THEME.text, 10);
      drawText(spSubs[i], bx + spBoxW / 2, spBoxY + 28 * s, THEME.muted, 8);
    }

    // 4. AgentCore Layer
    drawLayer(agY, agH, THEME.orange, 'AgentCore');
    const agBoxY = agY + 22 * s;
    const agBoxW = layerW - layerPad * 2;
    const agGlow = progress >= 0.7;
    drawBox(layerX + layerPad, agBoxY, agBoxW, boxH, THEME.orange, agGlow);
    drawText('cross_account.py — STS AssumeRole', layerX + layerPad + agBoxW / 2, agBoxY + 14 * s, THEME.text, 10);
    drawText(`Active: ${activeAccount.alias} (${activeAccount.id})`, layerX + layerPad + agBoxW / 2, agBoxY + 28 * s, activeAccount.color, 8);

    // Arrows between layers
    const arrowColor = activeAccount.color + '88';

    // AccountSelector → AccountContext
    const sel0X = layerX + layerPad + uiBoxW / 2;
    const sel2X = layerX + layerPad + 2 * (uiBoxW + 8 * s) + uiBoxW / 2;
    drawArrow(sel0X + uiBoxW * 0.3, uiBoxY + boxH / 2, sel2X - uiBoxW * 0.3, uiBoxY + boxH / 2, THEME.cyan + '66');

    // AccountContext → buildSearchPath
    const ctxCx = sel2X;
    const bspCx = layerX + layerPad + apiBoxW / 2;
    drawArrow(ctxCx, uiBoxY + boxH, bspCx, apiBoxY, arrowColor);

    // Label on arrow
    const midLabelY = (uiBoxY + boxH + apiBoxY) / 2;
    drawText('accountId', (ctxCx + bspCx) / 2 + 30 * s, midLabelY, THEME.muted, 8);

    // buildSearchPath → Steampipe
    const bspBottom = apiBoxY + boxH;
    const spTarget = layerX + layerPad + (activeIdx + 1) * (spBoxW + 8 * s) + spBoxW / 2;
    drawArrow(bspCx, bspBottom, spTarget, spBoxY, arrowColor);

    // search_path label
    const spLabelY = (bspBottom + spBoxY) / 2;
    drawText('search_path: public, aws_{id}, k8s, trivy', cx, spLabelY, THEME.muted, 8);

    // runCostQueriesPerAccount → both SP accounts
    const rcqCx = layerX + layerPad + apiBoxW + 16 * s + apiBoxW / 2;
    const sp1Cx = layerX + layerPad + 1 * (spBoxW + 8 * s) + spBoxW / 2;
    const sp2Cx = layerX + layerPad + 2 * (spBoxW + 8 * s) + spBoxW / 2;
    drawArrow(rcqCx, bspBottom, sp1Cx, spBoxY, ACCOUNTS[0].color + '55');
    drawArrow(rcqCx, bspBottom, sp2Cx, spBoxY, ACCOUNTS[1].color + '55');

    // Steampipe → AgentCore (for cross-account)
    const spAllCx = layerX + layerPad + spBoxW / 2;
    drawArrow(spAllCx, spBoxY + boxH, layerX + layerPad + agBoxW / 2, agBoxY, THEME.orange + '44');

    // Animated particle
    let px = ctxCx;
    let py = uiBoxY + boxH;
    if (progress < 0.2) {
      // In UI layer
      const t = progress / 0.2;
      px = sel0X + t * (sel2X - sel0X);
      py = uiBoxY + boxH / 2;
    } else if (progress < 0.4) {
      // UI → API
      const t = (progress - 0.2) / 0.2;
      px = ctxCx + t * (bspCx - ctxCx);
      py = (uiBoxY + boxH) + t * (apiBoxY - uiBoxY - boxH);
    } else if (progress < 0.7) {
      // API → Steampipe
      const t = (progress - 0.4) / 0.3;
      px = bspCx + t * (spTarget - bspCx);
      py = bspBottom + t * (spBoxY - bspBottom);
    } else {
      // Steampipe → AgentCore
      const t = (progress - 0.7) / 0.3;
      px = spTarget + t * (layerX + layerPad + agBoxW / 2 - spTarget);
      py = (spBoxY + boxH) + t * (agBoxY - spBoxY - boxH);
    }
    drawParticle(px, py, activeAccount.color);

    // Account indicator badge
    const badgeW = 120 * s;
    const badgeH = 22 * s;
    const badgeX = width - badgeW - 12 * s;
    const badgeY2 = 8 * s;
    ctx.fillStyle = activeAccount.color + '22';
    roundRect(ctx, badgeX, badgeY2, badgeW, badgeH, 4 * s);
    ctx.fill();
    ctx.strokeStyle = activeAccount.color + '66';
    ctx.lineWidth = 1 * s;
    roundRect(ctx, badgeX, badgeY2, badgeW, badgeH, 4 * s);
    ctx.stroke();
    // Color dot
    ctx.beginPath();
    ctx.arc(badgeX + 10 * s, badgeY2 + badgeH / 2, 4 * s, 0, Math.PI * 2);
    ctx.fillStyle = activeAccount.color;
    ctx.fill();
    drawText(activeAccount.alias, badgeX + 22 * s, badgeY2 + badgeH / 2, activeAccount.color, 9, 'left');
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
