'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

interface PageInfo {
  path: string;
  label: string;
  query: string;
  features: string;
}

const PAGES: PageInfo[] = [
  { path: '/ebs', label: 'EBS Volumes', query: 'queries/ebs.ts', features: 'Volumes, Snapshots, Encryption, Idle detection' },
  { path: '/msk', label: 'MSK Kafka', query: 'queries/msk.ts', features: 'Clusters, Broker metrics, KRaft mode' },
  { path: '/opensearch', label: 'OpenSearch', query: 'queries/opensearch.ts', features: 'Domains, N2N/At-Rest encryption, VPC' },
  { path: '/inventory', label: 'Resource Inventory', query: 'resource-inventory.ts', features: '18 resource types, snapshot-based, 0 queries' },
];

const CANVAS_HEIGHT = 280;

export default function NewPagesFlow(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    const margin = 20 * s;
    const groupPad = 12 * s;
    const boxH = 40 * s;
    const gap = 12 * s;
    const totalContentH = PAGES.length * boxH + (PAGES.length - 1) * gap;
    const groupH = totalContentH + groupPad * 2 + 24 * s;
    const groupY = (height - groupH) / 2;

    // Two groups side by side
    const availW = width - margin * 2;
    const arrowZone = 60 * s;
    const groupW = (availW - arrowZone) / 2;
    const leftX = margin;
    const rightX = margin + groupW + arrowZone;

    // Left group: "v1.5 New Pages"
    ctx.fillStyle = THEME.card;
    roundRect(ctx, leftX, groupY, groupW, groupH, 8 * s);
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '66';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    ctx.fillStyle = THEME.cyan;
    ctx.font = `bold ${11 * s}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('v1.5 New Pages', leftX + groupW / 2, groupY + groupPad + 6 * s);

    // Right group label
    ctx.fillStyle = THEME.text;
    ctx.font = `bold ${11 * s}px Inter, system-ui, sans-serif`;
    ctx.fillText('Query Files', rightX + groupW / 2, groupY + groupPad + 6 * s);

    let hoveredPage: PageInfo | null = null;
    let hoverBoxX = 0;
    let hoverBoxY = 0;

    for (let i = 0; i < PAGES.length; i++) {
      const page = PAGES[i];
      const itemY = groupY + groupPad + 24 * s + i * (boxH + gap);

      // Page box (left)
      const pageX = leftX + groupPad;
      const pageW = groupW - groupPad * 2;
      const pageHovered = isHover(mouse.x, mouse.y, pageX, itemY, pageW, boxH);
      if (pageHovered) {
        hoveredPage = page;
        hoverBoxX = pageX + pageW;
        hoverBoxY = itemY;
      }

      if (pageHovered) {
        ctx.shadowColor = THEME.cyan;
        ctx.shadowBlur = 12 * s;
      }
      ctx.fillStyle = THEME.bg;
      roundRect(ctx, pageX, itemY, pageW, boxH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = THEME.cyan;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = THEME.text;
      ctx.font = `${11 * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(page.path, pageX + pageW / 2, itemY + 14 * s);
      ctx.fillStyle = THEME.muted;
      ctx.font = `${9 * s}px Inter, system-ui, sans-serif`;
      ctx.fillText(page.label, pageX + pageW / 2, itemY + 28 * s);

      // Query box (right)
      const queryX = rightX + groupPad;
      const queryW = groupW - groupPad * 2;
      ctx.fillStyle = THEME.bg;
      roundRect(ctx, queryX, itemY, queryW, boxH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = THEME.green;
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();

      ctx.fillStyle = THEME.green;
      ctx.font = `${10 * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(page.query, queryX + queryW / 2, itemY + boxH / 2);

      // Arrow: page -> query
      const arrowStartX = pageX + pageW;
      const arrowEndX = queryX;
      const arrowY = itemY + boxH / 2;
      ctx.strokeStyle = THEME.dim;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(arrowStartX, arrowY);
      ctx.lineTo(arrowEndX, arrowY);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowY);
      ctx.lineTo(arrowEndX - 7 * s, arrowY - 4 * s);
      ctx.lineTo(arrowEndX - 7 * s, arrowY + 4 * s);
      ctx.closePath();
      ctx.fillStyle = THEME.dim;
      ctx.fill();

      // Animated particle along arrow
      const cycleLen = 120;
      const offset = i * 30;
      const p = ((frame + offset) % cycleLen) / cycleLen;
      const px = arrowStartX + (arrowEndX - arrowStartX) * p;
      ctx.beginPath();
      ctx.arc(px, arrowY, 3 * s, 0, Math.PI * 2);
      ctx.fillStyle = THEME.cyan;
      ctx.shadowColor = THEME.cyan;
      ctx.shadowBlur = 10 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Tooltip on hover
    if (hoveredPage) {
      const tipW = 200 * s;
      const tipH = 44 * s;
      let tipX = hoverBoxX + 10 * s;
      let tipY = hoverBoxY;
      if (tipX + tipW > width - 10 * s) tipX = hoverBoxX - tipW - 10 * s;

      ctx.fillStyle = THEME.bg + 'ee';
      roundRect(ctx, tipX, tipY, tipW, tipH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = THEME.cyan;
      ctx.lineWidth = 1 * s;
      ctx.stroke();

      ctx.fillStyle = THEME.cyan;
      ctx.font = `bold ${9 * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(hoveredPage.path, tipX + 8 * s, tipY + 14 * s);
      ctx.fillStyle = THEME.text;
      ctx.font = `${8 * s}px Inter, system-ui, sans-serif`;
      ctx.fillText(hoveredPage.features, tipX + 8 * s, tipY + 30 * s);
    }
  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}
