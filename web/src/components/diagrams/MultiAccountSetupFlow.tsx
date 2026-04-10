import React, { useCallback } from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle, DrawContext } from './useCanvas';

const CANVAS_HEIGHT = 540;

interface Node {
  id: string;
  label: string;
  sublabel: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Particle {
  fromNode: string;
  toNode: string;
  color: string;
  startFrame: number;
  duration: number;
}

// Durations
const PHASE_DURATION = 120; // frames per step
const TOTAL_CYCLE = PHASE_DURATION * 8 + 60; // 8 phases + pause

export default function MultiAccountSetupFlow() {
  const draw = useCallback((dc: DrawContext) => {
    const { ctx, width, height, frame, mouse, dpr } = dc;
    const s = dpr;

    // Background
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const pad = 20 * s;

    // Layout constants
    const colW = (width - pad * 3) / 2;
    const nodeW = colW - 10 * s;
    const nodeH = 38 * s;
    const nodeR = 6 * s;

    // Column positions
    const leftX = pad;
    const rightX = cx + pad / 2;

    // Row positions
    const titleH = 32 * s;
    const sectionGap = 14 * s;
    const nodeGap = 8 * s;

    // -- SECTION HEADERS --
    // Title
    ctx.font = `bold ${14 * s}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center';
    ctx.fillText('Multi-Account Setup Flow', cx, 18 * s);

    // Column headers
    const headerY = titleH + 4 * s;
    const headerH = 22 * s;

    // Host Account header
    roundRect(ctx, leftX, headerY, colW, headerH, 4 * s);
    ctx.fillStyle = THEME.cyan + '18';
    ctx.fill();
    ctx.strokeStyle = THEME.cyan + '44';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.font = `bold ${10 * s}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = THEME.cyan;
    ctx.textAlign = 'center';
    ctx.fillText('Host Account', leftX + colW / 2, headerY + headerH / 2 + 3.5 * s);

    // Target Account header
    roundRect(ctx, rightX, headerY, colW, headerH, 4 * s);
    ctx.fillStyle = THEME.purple + '18';
    ctx.fill();
    ctx.strokeStyle = THEME.purple + '44';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.font = `bold ${10 * s}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = THEME.purple;
    ctx.textAlign = 'center';
    ctx.fillText('Target Account', rightX + colW / 2, headerY + headerH / 2 + 3.5 * s);

    // Node start Y
    const startY = headerY + headerH + sectionGap;

    // Define nodes
    const hostNodes: Node[] = [
      { id: 'sts', label: 'STS GetCallerIdentity', sublabel: 'Detect host account ID', color: THEME.cyan, x: leftX + 5 * s, y: startY, w: nodeW, h: nodeH },
      { id: 'feature', label: 'Feature Detection', sublabel: 'Cost / EKS / K8s probes', color: THEME.cyan, x: leftX + 5 * s, y: startY + (nodeH + nodeGap), w: nodeW, h: nodeH },
      { id: 'config', label: 'Register in config.json', sublabel: 'accounts[] array update', color: THEME.cyan, x: leftX + 5 * s, y: startY + 2 * (nodeH + nodeGap), w: nodeW, h: nodeH },
      { id: 'steampipe', label: 'Steampipe Connection', sublabel: 'aws_{accountId} connection', color: THEME.cyan, x: leftX + 5 * s, y: startY + 3 * (nodeH + nodeGap), w: nodeW, h: nodeH },
    ];

    const targetNodes: Node[] = [
      { id: 'cfn', label: 'Deploy CFN Template', sublabel: 'cfn-target-account-role.yaml', color: THEME.purple, x: rightX + 5 * s, y: startY, w: nodeW, h: nodeH },
      { id: 'iam', label: 'Create IAM Role', sublabel: 'AWSopsReadOnlyRole', color: THEME.purple, x: rightX + 5 * s, y: startY + (nodeH + nodeGap), w: nodeW, h: nodeH },
      { id: 'assume', label: 'AssumeRole Test', sublabel: 'STS cross-account validation', color: THEME.purple, x: rightX + 5 * s, y: startY + 2 * (nodeH + nodeGap), w: nodeW, h: nodeH },
      { id: 'aggregator', label: 'Steampipe Aggregator', sublabel: 'Add to aws connection', color: THEME.purple, x: rightX + 5 * s, y: startY + 3 * (nodeH + nodeGap), w: nodeW, h: nodeH },
    ];

    // Admin section
    const adminY = startY + 4 * (nodeH + nodeGap) + sectionGap;

    // Admin header
    const adminHeaderW = width - pad * 2;
    roundRect(ctx, pad, adminY, adminHeaderW, headerH, 4 * s);
    ctx.fillStyle = THEME.orange + '18';
    ctx.fill();
    ctx.strokeStyle = THEME.orange + '44';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.font = `bold ${10 * s}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = THEME.orange;
    ctx.textAlign = 'center';
    ctx.fillText('Admin Access Control', cx, adminY + headerH / 2 + 3.5 * s);

    const adminStartY = adminY + headerH + sectionGap;
    const adminNodeW = (width - pad * 2 - 16 * s) / 3;

    const adminNodes: Node[] = [
      { id: 'adminCheck', label: 'adminEmails Check', sublabel: 'config.json lookup', color: THEME.orange, x: pad, y: adminStartY, w: adminNodeW, h: nodeH },
      { id: 'jwt', label: 'JWT Verification', sublabel: 'Cognito token validation', color: THEME.orange, x: pad + adminNodeW + 8 * s, y: adminStartY, w: adminNodeW, h: nodeH },
      { id: 'decision', label: 'Allow / Deny', sublabel: 'Rate limit: 5 req/min', color: THEME.orange, x: pad + 2 * (adminNodeW + 8 * s), y: adminStartY, w: adminNodeW, h: nodeH },
    ];

    const allNodes = [...hostNodes, ...targetNodes, ...adminNodes];

    // Animation phase
    const cycleFrame = frame % TOTAL_CYCLE;
    const currentPhase = Math.min(7, Math.floor(cycleFrame / PHASE_DURATION));
    const phaseProgress = Math.min(1, (cycleFrame % PHASE_DURATION) / PHASE_DURATION);

    // Node activation mapping: phase -> node index in its group
    // Phases 0-3: host nodes, Phases 4-7: target nodes (right side)
    // Admin nodes light up at phase 6-7

    function isNodeActive(node: Node): boolean {
      const hostIdx = hostNodes.findIndex(n => n.id === node.id);
      const targetIdx = targetNodes.findIndex(n => n.id === node.id);
      const adminIdx = adminNodes.findIndex(n => n.id === node.id);

      if (hostIdx >= 0) return currentPhase >= hostIdx;
      if (targetIdx >= 0) return currentPhase >= targetIdx + 4 || (currentPhase >= targetIdx && currentPhase < 4);
      if (adminIdx >= 0) return currentPhase >= 6 + adminIdx;
      return false;
    }

    function isNodeCurrent(node: Node): boolean {
      const hostIdx = hostNodes.findIndex(n => n.id === node.id);
      const targetIdx = targetNodes.findIndex(n => n.id === node.id);
      const adminIdx = adminNodes.findIndex(n => n.id === node.id);

      if (hostIdx >= 0) return currentPhase === hostIdx;
      if (targetIdx >= 0) return currentPhase === targetIdx + 4;
      if (adminIdx >= 0) return currentPhase === 6 + adminIdx;
      return false;
    }

    // Draw connecting arrows between sequential nodes
    function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string, active: boolean) {
      const alpha = active ? 'cc' : '33';
      ctx.strokeStyle = color + alpha;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const hl = 6 * s;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(angle - Math.PI / 6), y2 - hl * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - hl * Math.cos(angle + Math.PI / 6), y2 - hl * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = color + alpha;
      ctx.fill();
    }

    // Draw vertical arrows for host column
    for (let i = 0; i < hostNodes.length - 1; i++) {
      const from = hostNodes[i];
      const to = hostNodes[i + 1];
      const active = currentPhase > i;
      drawArrow(
        from.x + from.w / 2, from.y + from.h,
        to.x + to.w / 2, to.y,
        THEME.cyan, active
      );
    }

    // Draw vertical arrows for target column
    for (let i = 0; i < targetNodes.length - 1; i++) {
      const from = targetNodes[i];
      const to = targetNodes[i + 1];
      const active = currentPhase > i + 4;
      drawArrow(
        from.x + from.w / 2, from.y + from.h,
        to.x + to.w / 2, to.y,
        THEME.purple, active
      );
    }

    // Draw horizontal arrows for admin row
    for (let i = 0; i < adminNodes.length - 1; i++) {
      const from = adminNodes[i];
      const to = adminNodes[i + 1];
      const active = currentPhase > 6 + i;
      drawArrow(
        from.x + from.w, from.y + from.h / 2,
        to.x, to.y + to.h / 2,
        THEME.orange, active
      );
    }

    // Cross-column arrow: Steampipe → Aggregator (connecting the two flows)
    const sp = hostNodes[3];
    const ag = targetNodes[3];
    if (currentPhase >= 4) {
      const midY = sp.y + sp.h / 2;
      ctx.strokeStyle = THEME.green + '66';
      ctx.lineWidth = 1.5 * s;
      ctx.setLineDash([4 * s, 3 * s]);
      ctx.beginPath();
      ctx.moveTo(sp.x + sp.w, midY);
      ctx.lineTo(ag.x, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.font = `${8 * s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = THEME.green + 'aa';
      ctx.textAlign = 'center';
      ctx.fillText('Aggregator merge', (sp.x + sp.w + ag.x) / 2, midY - 6 * s);
    }

    // Draw all nodes
    allNodes.forEach(node => {
      const active = isNodeActive(node);
      const current = isNodeCurrent(node);
      const hovered = isHover(mouse.x, mouse.y, node.x, node.y, node.w, node.h);

      // Glow effect for current node
      if (current) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 14 * s;
      }

      // Node background
      roundRect(ctx, node.x, node.y, node.w, node.h, nodeR);
      ctx.fillStyle = hovered ? node.color + '25' : active ? THEME.card : THEME.card + '88';
      ctx.fill();
      ctx.strokeStyle = current ? node.color : active ? node.color + '88' : THEME.border;
      ctx.lineWidth = current ? 2 * s : 1 * s;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Label
      ctx.font = `bold ${10 * s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = active ? (hovered ? node.color : THEME.text) : THEME.muted;
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x + node.w / 2, node.y + 15 * s);

      // Sublabel
      ctx.font = `${8 * s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = active ? THEME.muted : THEME.dim;
      ctx.fillText(node.sublabel, node.x + node.w / 2, node.y + 28 * s);

      // Tooltip on hover
      if (hovered) {
        drawTooltip(ctx, node, s, width);
      }
    });

    // Animated particles
    drawAnimatedParticles(ctx, hostNodes, targetNodes, adminNodes, currentPhase, phaseProgress, s);

    // Phase indicator
    const phases = ['STS Detect', 'Features', 'Config', 'Connection', 'CFN Deploy', 'IAM Role', 'AssumeRole', 'Aggregator'];
    const indicatorY = height - 18 * s;
    const indicatorW = (width - pad * 2) / phases.length;

    phases.forEach((label, i) => {
      const ix = pad + i * indicatorW;
      const active = i <= currentPhase;
      const current = i === currentPhase;

      ctx.fillStyle = current ? (i < 4 ? THEME.cyan : THEME.purple) + '33' : 'transparent';
      roundRect(ctx, ix + 1 * s, indicatorY - 8 * s, indicatorW - 2 * s, 16 * s, 3 * s);
      ctx.fill();

      ctx.font = `${7 * s}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = current ? (i < 4 ? THEME.cyan : THEME.purple) : active ? THEME.muted : THEME.dim;
      ctx.textAlign = 'center';
      ctx.fillText(label, ix + indicatorW / 2, indicatorY + 1 * s);

      // Progress dot
      if (current) {
        ctx.beginPath();
        ctx.arc(ix + indicatorW / 2, indicatorY - 12 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = i < 4 ? THEME.cyan : THEME.purple;
        ctx.fill();
      }
    });

  }, []);

  const canvasRef = useCanvas(draw, CANVAS_HEIGHT);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawAnimatedParticles(
  ctx: CanvasRenderingContext2D,
  hostNodes: Node[],
  targetNodes: Node[],
  adminNodes: Node[],
  currentPhase: number,
  progress: number,
  s: number
) {
  // Host column particles (cyan)
  if (currentPhase < 4 && currentPhase < hostNodes.length - 1) {
    const from = hostNodes[currentPhase];
    const to = hostNodes[currentPhase + 1];
    const px = from.x + from.w / 2;
    const py = from.y + from.h + (to.y - from.y - from.h) * progress;
    drawGlowParticle(ctx, px, py, s, THEME.cyan);
  }

  // Target column particles (purple) — mapped to phases 4-7
  if (currentPhase >= 4 && currentPhase < 7) {
    const idx = currentPhase - 4;
    if (idx < targetNodes.length - 1) {
      const from = targetNodes[idx];
      const to = targetNodes[idx + 1];
      const px = from.x + from.w / 2;
      const py = from.y + from.h + (to.y - from.y - from.h) * progress;
      drawGlowParticle(ctx, px, py, s, THEME.purple);
    }
  }

  // Admin row particles (orange)
  if (currentPhase >= 6 && currentPhase <= 7) {
    const idx = currentPhase - 6;
    if (idx < adminNodes.length - 1) {
      const from = adminNodes[idx];
      const to = adminNodes[idx + 1];
      const px = from.x + from.w + (to.x - from.x - from.w) * progress;
      const py = from.y + from.h / 2;
      drawGlowParticle(ctx, px, py, s, THEME.orange);
    }
  }
}

function drawGlowParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10 * s);
  gradient.addColorStop(0, color + 'cc');
  gradient.addColorStop(0.5, color + '44');
  gradient.addColorStop(1, color + '00');

  ctx.beginPath();
  ctx.arc(x, y, 10 * s, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 3 * s, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  node: Node,
  s: number,
  canvasWidth: number
) {
  const tooltips: Record<string, string> = {
    sts: 'Calls STS GetCallerIdentity to detect the AWS account ID of the EC2 instance',
    feature: 'Probes Cost Explorer, EKS, and K8s APIs to detect available features',
    config: 'Writes the account entry to data/config.json accounts[] array',
    steampipe: 'Creates aws_{accountId} Steampipe connection for isolated queries',
    cfn: 'Deploys cfn-target-account-role.yaml CloudFormation stack in target account',
    iam: 'Creates AWSopsReadOnlyRole with trust policy for cross-account access',
    assume: 'Tests STS AssumeRole from host account to validate connectivity',
    aggregator: 'Adds the new connection to the Steampipe Aggregator for unified queries',
    adminCheck: 'Checks if the user email is in adminEmails array (empty = all allowed)',
    jwt: 'Extracts and validates the Cognito JWT token from the request cookie',
    decision: 'Returns 403 or allows access. Rate limited to 5 requests per minute',
  };

  const text = tooltips[node.id];
  if (!text) return;

  ctx.font = `${9 * s}px Inter, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const tipW = Math.min(metrics.width + 16 * s, canvasWidth - 20 * s);
  const tipH = 24 * s;

  let tipX = node.x + node.w / 2 - tipW / 2;
  if (tipX < 5 * s) tipX = 5 * s;
  if (tipX + tipW > canvasWidth - 5 * s) tipX = canvasWidth - 5 * s - tipW;

  const tipY = node.y - tipH - 4 * s;

  roundRect(ctx, tipX, tipY, tipW, tipH, 4 * s);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.strokeStyle = node.color + '66';
  ctx.lineWidth = 1 * s;
  ctx.stroke();

  ctx.fillStyle = THEME.text;
  ctx.textAlign = 'center';
  ctx.font = `${8 * s}px Inter, system-ui, sans-serif`;
  ctx.fillText(text, tipX + tipW / 2, tipY + tipH / 2 + 3 * s, tipW - 12 * s);
}
