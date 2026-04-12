import React, { useState, useCallback, useEffect } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

interface Step {
  id: string;
  num: string;
  script: string;
  where: 'Local' | 'EC2';
  description: string;
  color: string;
  row: number;
}

const STEPS: Step[] = [
  // Row 0 — Required Setup (cyan)
  { id: '0', num: '0', script: '00-deploy-infra.sh', where: 'Local', description: 'CDK Infrastructure (VPC, EC2, ALB, CloudFront)', color: THEME.cyan, row: 0 },
  { id: '1', num: '1', script: '01-install-base.sh', where: 'EC2', description: 'Steampipe + Powerpipe', color: THEME.cyan, row: 0 },
  { id: '2', num: '2', script: '02-setup-nextjs.sh', where: 'EC2', description: 'Next.js + Steampipe Service', color: THEME.cyan, row: 0 },
  { id: '3', num: '3', script: '03-build-deploy.sh', where: 'EC2', description: 'Production Build', color: THEME.cyan, row: 0 },
  // Row 1 — Required Setup continued (cyan)
  { id: '4', num: '4', script: '04-setup-eks-access.sh', where: 'EC2', description: 'EKS Access (kubectl, kubeconfig, access entry)', color: THEME.cyan, row: 1 },
  { id: '5', num: '5', script: '05-setup-cognito.sh', where: 'EC2', description: 'Cognito Auth', color: THEME.cyan, row: 1 },
  { id: '6', num: '6a-6f', script: '06a~06f*.sh', where: 'EC2', description: 'AgentCore (Runtime, Gateway, Tools, Interpreter, Config, Memory, OpenCost)', color: THEME.cyan, row: 1 },
  { id: '7', num: '7', script: '07-setup-cloudfront-auth.sh', where: 'EC2', description: 'Lambda@Edge -> CloudFront', color: THEME.cyan, row: 1 },
  // Row 2 — Operations (green), Verification (purple), Optional (orange)
  { id: '8', num: '8', script: '08-start-all.sh', where: 'EC2', description: 'Start All Services (Steampipe + Next.js + OpenCost)', color: THEME.green, row: 2 },
  { id: '9', num: '9', script: '09-stop-all.sh', where: 'EC2', description: 'Stop All Services', color: THEME.green, row: 2 },
  { id: '10', num: '10', script: '10-verify.sh', where: 'EC2', description: 'Verify & Health Check (5-stage validation)', color: THEME.purple, row: 2 },
  { id: '11', num: '11', script: '11-setup-multi-account.sh', where: 'EC2', description: 'Multi-Account Setup (Aggregator + cross-account IAM)', color: THEME.orange, row: 2 },
];

const CANVAS_HEIGHT = 520;

// Row labels with their colors
const ROW_LABELS = [
  { label: 'Setup', color: THEME.cyan },
  { label: 'Setup', color: THEME.cyan },
  { label: 'Ops / Verify / Optional', color: THEME.green },
];

export default function DeploymentPipeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0);
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  // Auto-play logic
  useEffect(() => {
    if (!autoPlay) return;
    const interval = setInterval(() => {
      setAutoPlayIndex((prev) => {
        const next = (prev + 1) % (STEPS.length + 1);
        if (next === STEPS.length) {
          return 0;
        }
        setActiveStep(STEPS[next].id);
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [autoPlay]);

  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, mouse, dpr } = dc;

    const pad = 24 * dpr;
    const progressBarHeight = 8 * dpr;
    const topMargin = 50 * dpr;
    const rowHeight = 110 * dpr;
    const stepGap = 12 * dpr;
    const arrowSize = 8 * dpr;

    // Calculate step dimensions
    const contentWidth = width - pad * 2;
    const rows = [
      STEPS.filter(s => s.row === 0),
      STEPS.filter(s => s.row === 1),
      STEPS.filter(s => s.row === 2),
    ];

    const stepHeight = 72 * dpr;

    // Step 6 is wider (1.4x) in its row
    function getStepWidth(step: Step, rowSteps: Step[]): number {
      const hasWide = rowSteps.some(s => s.id === '6');
      if (hasWide) {
        const normalCount = rowSteps.length - 1;
        const totalGaps = (rowSteps.length - 1) * stepGap;
        const normalW = (contentWidth - totalGaps) / (normalCount + 1.4);
        return step.id === '6' ? normalW * 1.4 : normalW;
      }
      const totalGaps = (rowSteps.length - 1) * stepGap;
      return (contentWidth - totalGaps) / rowSteps.length;
    }

    // Calculate progress
    const progress = autoPlay ? (autoPlayIndex / STEPS.length) :
                     activeStep ? ((STEPS.findIndex(s => s.id === activeStep) + 1) / STEPS.length) : 0;

    // Draw progress bar background
    ctx.fillStyle = THEME.dim;
    roundRect(ctx, pad, pad, contentWidth, progressBarHeight, 4 * dpr);
    ctx.fill();

    // Draw progress bar fill with multi-color gradient
    if (progress > 0) {
      const gradient = ctx.createLinearGradient(pad, 0, pad + contentWidth * progress, 0);
      gradient.addColorStop(0, THEME.cyan);
      gradient.addColorStop(0.65, THEME.cyan);
      gradient.addColorStop(0.75, THEME.green);
      gradient.addColorStop(0.85, THEME.purple);
      gradient.addColorStop(1, THEME.orange);
      ctx.fillStyle = gradient;
      roundRect(ctx, pad, pad, contentWidth * progress, progressBarHeight, 4 * dpr);
      ctx.fill();
    }

    // Progress text
    ctx.fillStyle = THEME.muted;
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(progress * 100)}% Complete`, width - pad, pad + progressBarHeight + 14 * dpr);

    // Legend
    ctx.textAlign = 'left';
    const legendY = pad + progressBarHeight + 14 * dpr;
    const legendItems = [
      { label: 'Required', color: THEME.cyan },
      { label: 'Operations', color: THEME.green },
      { label: 'Verification', color: THEME.purple },
      { label: 'Optional', color: THEME.orange },
    ];
    let legendX = pad;
    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legendX + 5 * dpr, legendY - 3 * dpr, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.muted;
      ctx.font = `${10 * dpr}px system-ui, sans-serif`;
      ctx.fillText(item.label, legendX + 12 * dpr, legendY);
      legendX += ctx.measureText(item.label).width + 24 * dpr;
    }

    // Helper to draw server icon
    function drawServerIcon(x: number, y: number, size: number) {
      ctx.strokeStyle = THEME.muted;
      ctx.lineWidth = 1.5 * dpr;
      const boxH = size * 0.35;
      ctx.strokeRect(x - size/2, y - size/2, size, boxH);
      ctx.beginPath();
      ctx.arc(x - size/2 + size * 0.2, y - size/2 + boxH/2, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeRect(x - size/2, y - size/2 + boxH + 2 * dpr, size, boxH);
      ctx.beginPath();
      ctx.arc(x - size/2 + size * 0.2, y - size/2 + boxH * 1.5 + 2 * dpr, 2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Helper to draw laptop icon
    function drawLaptopIcon(x: number, y: number, size: number) {
      ctx.strokeStyle = THEME.muted;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x - size/2, y - size/2, size, size * 0.7);
      ctx.beginPath();
      ctx.moveTo(x - size/2 - size * 0.1, y + size * 0.25);
      ctx.lineTo(x + size/2 + size * 0.1, y + size * 0.25);
      ctx.stroke();
    }

    // Helper to draw arrow
    function drawArrow(fromX: number, fromY: number, toX: number, toY: number, color: string) {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX - arrowSize, toY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - arrowSize, toY - arrowSize / 2);
      ctx.lineTo(toX - arrowSize, toY + arrowSize / 2);
      ctx.closePath();
      ctx.fill();
    }

    // Helper to draw step
    function drawStep(step: Step, x: number, y: number, w: number, h: number) {
      const isActive = activeStep === step.id || (autoPlay && STEPS[autoPlayIndex]?.id === step.id);
      const isHovered = isHover(mouse.x, mouse.y, x, y, w, h);

      if (isHovered && hoveredStep !== step.id) {
        setHoveredStep(step.id);
      }

      // Glow effect for active step
      if (isActive) {
        ctx.shadowColor = step.color;
        ctx.shadowBlur = 20 * dpr;
      }

      // Background
      ctx.fillStyle = isHovered ? THEME.border : THEME.card;
      roundRect(ctx, x, y, w, h, 8 * dpr);
      ctx.fill();

      // Border
      ctx.strokeStyle = isActive ? step.color : (isHovered ? step.color : THEME.border);
      ctx.lineWidth = isActive ? 2 * dpr : 1 * dpr;
      roundRect(ctx, x, y, w, h, 8 * dpr);
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Step number badge
      const badgeSize = 22 * dpr;
      ctx.fillStyle = step.color;
      ctx.beginPath();
      ctx.arc(x + badgeSize / 2 + 6 * dpr, y + badgeSize / 2 + 6 * dpr, badgeSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.bg;
      ctx.font = `bold ${10 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(step.num, x + badgeSize / 2 + 6 * dpr, y + badgeSize / 2 + 6 * dpr);

      // Location icon
      const iconX = x + w - 16 * dpr;
      const iconY = y + 16 * dpr;
      const iconSize = 14 * dpr;
      if (step.where === 'Local') {
        drawLaptopIcon(iconX, iconY, iconSize);
      } else {
        drawServerIcon(iconX, iconY, iconSize);
      }

      // Description (truncated)
      ctx.fillStyle = THEME.text;
      ctx.font = `${12 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const maxTextWidth = w - 20 * dpr;
      let desc = step.description;
      if (ctx.measureText(desc).width > maxTextWidth) {
        while (ctx.measureText(desc + '...').width > maxTextWidth && desc.length > 0) {
          desc = desc.slice(0, -1);
        }
        desc += '...';
      }
      ctx.fillText(desc, x + 10 * dpr, y + 34 * dpr);

      // Where label
      ctx.fillStyle = THEME.muted;
      ctx.font = `${10 * dpr}px system-ui, sans-serif`;
      ctx.fillText(step.where, x + 10 * dpr, y + h - 14 * dpr);

      return { x, y, w, h, step, isHovered };
    }

    // Draw all rows
    const drawnSteps: { x: number; y: number; w: number; h: number; step: Step }[] = [];

    rows.forEach((rowSteps, rowIndex) => {
      let xPos = pad;
      const rowY = topMargin + 20 * dpr + rowIndex * rowHeight;

      rowSteps.forEach((step, i) => {
        const w = getStepWidth(step, rowSteps);
        const info = drawStep(step, xPos, rowY, w, stepHeight);
        drawnSteps.push(info);

        // Draw arrow to next step in same row
        if (i < rowSteps.length - 1) {
          drawArrow(xPos + w, rowY + stepHeight / 2, xPos + w + stepGap, rowY + stepHeight / 2, THEME.dim);
        }

        xPos += w + stepGap;
      });
    });

    // Draw connecting arrows between rows
    function drawRowConnection(fromStepId: string, toStepId: string) {
      const fromStep = drawnSteps.find(d => d.step.id === fromStepId);
      const toStep = drawnSteps.find(d => d.step.id === toStepId);
      if (!fromStep || !toStep) return;

      ctx.strokeStyle = THEME.dim;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();

      const midY = fromStep.y + fromStep.h + (rowHeight - stepHeight) / 2;
      ctx.moveTo(fromStep.x + fromStep.w / 2, fromStep.y + fromStep.h);
      ctx.lineTo(fromStep.x + fromStep.w / 2, midY);
      ctx.lineTo(toStep.x + toStep.w / 2, midY);
      ctx.lineTo(toStep.x + toStep.w / 2, toStep.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head
      ctx.fillStyle = THEME.dim;
      ctx.beginPath();
      ctx.moveTo(toStep.x + toStep.w / 2, toStep.y);
      ctx.lineTo(toStep.x + toStep.w / 2 - arrowSize / 2, toStep.y - arrowSize);
      ctx.lineTo(toStep.x + toStep.w / 2 + arrowSize / 2, toStep.y - arrowSize);
      ctx.closePath();
      ctx.fill();
    }

    // Row 0 -> Row 1 (Step 3 -> Step 4)
    drawRowConnection('3', '4');
    // Row 1 -> Row 2 (Step 7 -> Step 8)
    drawRowConnection('7', '8');

    // Draw detail panel for active step
    const lastRowY = topMargin + 20 * dpr + 2 * rowHeight;
    const detailY = lastRowY + stepHeight + 20 * dpr;
    const detailHeight = 60 * dpr;
    const activeStepData = STEPS.find(s => s.id === activeStep);

    if (activeStepData) {
      ctx.fillStyle = THEME.card;
      roundRect(ctx, pad, detailY, contentWidth, detailHeight, 8 * dpr);
      ctx.fill();

      ctx.strokeStyle = activeStepData.color;
      ctx.lineWidth = 1 * dpr;
      roundRect(ctx, pad, detailY, contentWidth, detailHeight, 8 * dpr);
      ctx.stroke();

      // Script name
      ctx.fillStyle = activeStepData.color;
      ctx.font = `bold ${13 * dpr}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(activeStepData.script, pad + 16 * dpr, detailY + 22 * dpr);

      // Full description
      ctx.fillStyle = THEME.text;
      ctx.font = `${12 * dpr}px system-ui, sans-serif`;
      ctx.fillText(activeStepData.description, pad + 16 * dpr, detailY + 42 * dpr);

      // Location badge
      ctx.fillStyle = THEME.muted;
      ctx.font = `${11 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`Runs on: ${activeStepData.where}`, width - pad - 16 * dpr, detailY + 22 * dpr);
    }

    // Check for mouse leave
    const anyHovered = drawnSteps.some(d => isHover(mouse.x, mouse.y, d.x, d.y, d.w, d.h));
    if (!anyHovered && hoveredStep !== null) {
      setHoveredStep(null);
    }
  }, [activeStep, autoPlay, autoPlayIndex, hoveredStep]);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;

    const pad = 24 * dpr;
    const topMargin = 50 * dpr;
    const rowHeight = 110 * dpr;
    const stepGap = 12 * dpr;
    const contentWidth = canvas.width - pad * 2;
    const stepHeight = 72 * dpr;

    const rowConfigs = [
      STEPS.filter(s => s.row === 0),
      STEPS.filter(s => s.row === 1),
      STEPS.filter(s => s.row === 2),
    ];

    for (let rowIdx = 0; rowIdx < rowConfigs.length; rowIdx++) {
      const rowSteps = rowConfigs[rowIdx];
      let xPos = pad;
      const rowY = topMargin + 20 * dpr + rowIdx * rowHeight;

      for (const step of rowSteps) {
        const hasWide = rowSteps.some(s => s.id === '6');
        let w: number;
        if (hasWide) {
          const normalCount = rowSteps.length - 1;
          const totalGaps = (rowSteps.length - 1) * stepGap;
          const normalW = (contentWidth - totalGaps) / (normalCount + 1.4);
          w = step.id === '6' ? normalW * 1.4 : normalW;
        } else {
          const totalGaps = (rowSteps.length - 1) * stepGap;
          w = (contentWidth - totalGaps) / rowSteps.length;
        }

        if (isHover(mx, my, xPos, rowY, w, stepHeight)) {
          setActiveStep(activeStep === step.id ? null : step.id);
          setAutoPlay(false);
          return;
        }
        xPos += w + stepGap;
      }
    }
  }, [activeStep, canvasRef]);

  const toggleAutoPlay = () => {
    setAutoPlay(!autoPlay);
    if (!autoPlay) {
      setAutoPlayIndex(0);
      setActiveStep(STEPS[0].id);
    }
  };

  // Tooltip for hovered step
  const tooltipStep = hoveredStep ? STEPS.find(s => s.id === hoveredStep) : null;

  return (
    <div style={canvasWrapperStyle}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ display: 'block', cursor: 'pointer', background: THEME.bg }}
      />
      <button
        onClick={toggleAutoPlay}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '6px 12px',
          background: autoPlay ? THEME.green : THEME.card,
          color: autoPlay ? THEME.bg : THEME.text,
          border: `1px solid ${autoPlay ? THEME.green : THEME.border}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {autoPlay ? 'Stop' : 'Auto-Play'}
      </button>
      {tooltipStep && !activeStep && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: THEME.card,
            border: `1px solid ${tooltipStep.color}`,
            borderRadius: 6,
            color: THEME.text,
            fontSize: 13,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: tooltipStep.color, fontFamily: 'monospace', fontWeight: 'bold' }}>
            {tooltipStep.script}
          </span>
          <span style={{ color: THEME.muted, marginLeft: 12 }}>{tooltipStep.description}</span>
        </div>
      )}
    </div>
  );
}
