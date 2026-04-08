'use client';

import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 350;

interface CardInfo {
  name: string;
  metric: string;
}

interface RowInfo {
  label: string;
  color: string;
  cards: CardInfo[];
}

const ROWS: RowInfo[] = [
  {
    label: 'Compute & Network',
    color: THEME.cyan,
    cards: [
      { name: 'EC2', metric: '18 running \u00b7 4 stopped' },
      { name: 'VPC', metric: '3 VPCs \u00b7 12 subnets' },
      { name: 'Security Groups', metric: '24 groups' },
    ],
  },
  {
    label: 'Data & Storage',
    color: THEME.green,
    cards: [
      { name: 'S3', metric: '42 buckets' },
      { name: 'RDS', metric: '6 instances' },
      { name: 'DynamoDB', metric: '12 tables' },
    ],
  },
  {
    label: 'Container & Cost',
    color: THEME.purple,
    cards: [
      { name: 'EKS', metric: '2 clusters' },
      { name: 'ECS', metric: '5 services' },
      { name: 'Monthly Cost', metric: '$12,345' },
    ],
  },
];

export default function DashboardCardsLayout(): React.ReactElement {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, mouse, dpr } = dc;
    const s = dpr;

    const marginX = 30 * s;
    const marginY = 20 * s;
    const labelW = 130 * s;
    const gridLeft = marginX + labelW + 10 * s;
    const gridRight = width - marginX;
    const gridW = gridRight - gridLeft;
    const cardGap = 12 * s;
    const rowGap = 14 * s;
    const cols = 3;
    const rowCount = ROWS.length;
    const cardW = (gridW - (cols - 1) * cardGap) / cols;
    const totalH = height - marginY * 2;
    const cardH = (totalH - (rowCount - 1) * rowGap) / rowCount;

    function drawText(text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${size * s}px Inter, system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    }

    // Title
    drawText('Dashboard (3x3 Cards)', width / 2, marginY - 5 * s, THEME.muted, 10);

    for (let r = 0; r < rowCount; r++) {
      const row = ROWS[r];
      const rowY = marginY + r * (cardH + rowGap) + 10 * s;

      // Row label
      const labelX = marginX;
      const labelBgH = cardH;
      ctx.fillStyle = row.color + '0d';
      roundRect(ctx, labelX, rowY, labelW, labelBgH, 6 * s);
      ctx.fill();
      ctx.strokeStyle = row.color + '33';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      drawText(row.label, labelX + labelW / 2, rowY + labelBgH / 2, row.color, 10);

      for (let c = 0; c < cols; c++) {
        const card = row.cards[c];
        const cx = gridLeft + c * (cardW + cardGap);
        const cy = rowY;
        const hovered = isHover(mouse.x, mouse.y, cx, cy, cardW, cardH);

        if (hovered) {
          ctx.shadowColor = row.color;
          ctx.shadowBlur = 18 * s;
        }

        ctx.fillStyle = THEME.card;
        roundRect(ctx, cx, cy, cardW, cardH, 8 * s);
        ctx.fill();
        ctx.strokeStyle = hovered ? row.color : THEME.border;
        ctx.lineWidth = (hovered ? 2 : 1.5) * s;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Card name
        drawText(card.name, cx + cardW / 2, cy + cardH * 0.38, THEME.text, 12);

        // Card metric
        drawText(card.metric, cx + cardW / 2, cy + cardH * 0.65, row.color, 9);
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
