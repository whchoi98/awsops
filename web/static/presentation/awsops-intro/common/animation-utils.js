/**
 * Reactive Presentation - Canvas/SVG Animation Utilities
 */

/* ── Color Helpers ── */
const Colors = {
  bg:        '#0f1117',
  bgSecond:  '#1a1d2e',
  surface:   '#282d45',
  border:    '#2d3250',
  accent:    '#6c5ce7',
  accentLt:  '#a29bfe',
  green:     '#00b894',
  yellow:    '#fdcb6e',
  red:       '#e17055',
  blue:      '#74b9ff',
  cyan:      '#00cec9',
  pink:      '#fd79a8',
  orange:    '#f39c12',
  textPri:   '#e8eaf0',
  textSec:   '#9ba1b8',
  textMuted: '#6b7194',
};

// Merge PPTX theme colors if available
if (window.__remarpTheme && window.__remarpTheme.colors) {
  const tc = window.__remarpTheme.colors;
  if (tc.accent1) Colors.pptxAccent1 = tc.accent1;
  if (tc.accent2) Colors.pptxAccent2 = tc.accent2;
  if (tc.accent3) Colors.pptxAccent3 = tc.accent3;
  if (tc.accent4) Colors.pptxAccent4 = tc.accent4;
  if (tc.accent5) Colors.pptxAccent5 = tc.accent5;
  if (tc.accent6) Colors.pptxAccent6 = tc.accent6;
  if (tc.dk1) Colors.pptxDk1 = tc.dk1;
  if (tc.lt1) Colors.pptxLt1 = tc.lt1;
  if (tc.dk2) Colors.pptxDk2 = tc.dk2;
  if (tc.lt2) Colors.pptxLt2 = tc.lt2;
}

/** Resolve color reference - supports 'theme-accent1' style refs */
function resolveColor(ref) {
  if (typeof ref !== 'string') return ref;
  if (ref.startsWith('theme-')) {
    const key = 'pptx' + ref.slice(6).charAt(0).toUpperCase() + ref.slice(7);
    return Colors[key] || Colors.accent;
  }
  return Colors[ref] || ref;
}

/* ── Canvas Setup ── */
function setupCanvas(canvasId, width, height) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = width + 'px';
  canvas.style.height = 'auto';
  canvas.style.aspectRatio = width + '/' + height;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx, width, height };
}

/* ── Drawing Primitives ── */
function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function drawBox(ctx, x, y, w, h, label, color, textColor) {
  drawRoundRect(ctx, x, y, w, h, 8, color + '22', color);
  ctx.fillStyle = textColor || Colors.textPri;
  ctx.font = '600 13px Pretendard, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for long labels
  const words = label.split(' ');
  const maxWidth = w - 12;
  let lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = currentLine + ' ' + words[i];
    if (ctx.measureText(test).width < maxWidth) {
      currentLine = test;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  const lineHeight = 16;
  const startY = y + h / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, startY + i * lineHeight);
  });
}

function drawArrow(ctx, x1, y1, x2, y2, color, dashed, showHead) {
  if (showHead === undefined) showHead = true;
  ctx.beginPath();
  if (dashed) ctx.setLineDash([6, 4]);
  else ctx.setLineDash([]);
  ctx.strokeStyle = color || Colors.accent;
  ctx.lineWidth = 2;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead (skip when showHead is false, e.g. first segment of a routed arrow)
  if (!showHead) return;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 10;
  ctx.beginPath();
  ctx.fillStyle = color || Colors.accent;
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawOrthogonalArrow(ctx, points, color, dashed) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  if (dashed) ctx.setLineDash([6, 4]);
  else ctx.setLineDash([]);
  ctx.strokeStyle = color || Colors.accent;
  ctx.lineWidth = 2;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead on last segment
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const headLen = 10;
  ctx.beginPath();
  ctx.fillStyle = color || Colors.accent;
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(last.x - headLen * Math.cos(angle - Math.PI / 6), last.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(last.x - headLen * Math.cos(angle + Math.PI / 6), last.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawCircle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawText(ctx, text, x, y, opts = {}) {
  ctx.fillStyle = opts.color || Colors.textPri;
  ctx.font = (opts.weight || '400') + ' ' + (opts.size || 13) + 'px ' + (opts.font || 'Pretendard, sans-serif');
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.fillText(text, x, y);
}

/* ── Animation Loop Manager ── */
class AnimationLoop {
  constructor(drawFn) {
    this.drawFn = drawFn;
    this.running = false;
    this.rafId = null;
    this.startTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const elapsed = (now - this.startTime) / 1000;
      this.drawFn(elapsed);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  restart() {
    this.stop();
    this.start();
  }
}

/* ── Timeline Animation ── */
class TimelineAnimation {
  constructor(steps, duration) {
    this.steps = steps; // [{at: 0.1, action: fn}, ...]
    this.duration = duration;
    this.progress = 0;
    this.speed = 1;
    this.playing = false;
    this.executedSteps = new Set();
    this.currentStep = -1;
  }

  play()  { this.playing = true; }
  pause() { this.playing = false; }
  reset() {
    this.progress = 0;
    this.playing = false;
    this.executedSteps.clear();
  }
  setSpeed(s) { this.speed = s; }

  // Manual step control — for ↑↓ keyboard navigation
  goToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) return;
    this.currentStep = stepIndex;
    this.progress = this.steps[stepIndex].at;
    this.executedSteps.clear();
    for (let i = 0; i <= stepIndex; i++) this.executedSteps.add(i);
    this.steps[stepIndex].action();
  }

  nextStep() {
    const next = (this.currentStep ?? -1) + 1;
    if (next < this.steps.length) this.goToStep(next);
  }

  prevStep() {
    const prev = (this.currentStep ?? 0) - 1;
    if (prev >= 0) this.goToStep(prev);
  }

  update(dt) {
    if (!this.playing) return;
    this.progress = Math.min(1, this.progress + (dt * this.speed) / this.duration);
    this.steps.forEach((step, i) => {
      if (this.progress >= step.at && !this.executedSteps.has(i)) {
        this.executedSteps.add(i);
        step.action();
      }
    });
    if (this.progress >= 1) this.playing = false;
  }
}

/* ── Particle System (for decorative effects) ── */
class ParticleSystem {
  constructor(count, bounds) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * bounds.w,
        y: Math.random() * bounds.h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }
    this.bounds = bounds;
  }

  update() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = this.bounds.w;
      if (p.x > this.bounds.w) p.x = 0;
      if (p.y < 0) p.y = this.bounds.h;
      if (p.y > this.bounds.h) p.y = 0;
    });
  }

  draw(ctx) {
    this.particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108, 92, 231, ${p.alpha})`;
      ctx.fill();
    });
  }
}

/* ── Easing Functions ── */
const Ease = {
  linear: t => t,
  inOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  out: t => t * (2 - t),
  in: t => t * t,
  elastic: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  bounce: t => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
};

/* ── Value Interpolation ── */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ── Canvas DSL Renderer ── */

/**
 * Draw a labeled group border (for grouping elements)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {string} label - Group label
 * @param {string} color - Border color
 */
function drawGroup(ctx, x, y, w, h, label, color) {
  const borderColor = color || Colors.border;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  if (label) {
    ctx.fillStyle = Colors.bgSecond;
    const textWidth = ctx.measureText(label).width + 12;
    ctx.fillRect(x + 10, y - 10, textWidth, 20);
    ctx.fillStyle = color || Colors.textSec;
    ctx.font = '500 12px Pretendard, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 16, y);
  }
}

/**
 * Draw an icon/image on canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|string} src - Image element or URL
 * @param {number} x - X position (center)
 * @param {number} y - Y position (center)
 * @param {number} size - Icon size
 * @param {function} [onLoad] - Callback when image loads (if src is URL)
 */
function drawIcon(ctx, src, x, y, size, onLoad) {
  const drawImage = (img) => {
    const halfSize = size / 2;
    ctx.drawImage(img, x - halfSize, y - halfSize, size, size);
  };

  if (src instanceof HTMLImageElement) {
    if (src.complete) {
      drawImage(src);
    } else {
      src.onload = () => {
        drawImage(src);
        if (onLoad) onLoad();
      };
    }
  } else if (typeof src === 'string') {
    const img = new Image();
    img.onload = () => {
      drawImage(img);
      if (onLoad) onLoad();
    };
    img.src = src;
  }
}

/** Draw a Kubernetes pod circle with status color */
function drawPod(ctx, x, y, size, status, label) {
  const statusColors = {
    running: Colors.green, pending: Colors.yellow, failed: Colors.red,
    terminating: Colors.textMuted, creating: Colors.cyan
  };
  const color = statusColors[status] || Colors.accent;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = Colors.textPri;
    ctx.font = Math.max(8, size / 3) + 'px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }
}

/** Draw a Kubernetes node box with pod grid */
function drawNode(ctx, x, y, w, h, name, pods, maxPods, opts) {
  opts = opts || {};
  const borderColor = opts.borderColor || Colors.accent;
  const bgColor = opts.bgColor || 'rgba(255,255,255,0.05)';

  // Node box
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // Node name
  ctx.fillStyle = Colors.textPri;
  ctx.font = 'bold 12px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(name, x + 8, y + 6);

  // Pod grid
  const podSize = 10;
  const padding = 4;
  const cols = Math.floor((w - 16) / (podSize + padding));
  const startX = x + 8;
  const startY = y + 24;

  for (var i = 0; i < maxPods; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    var px = startX + col * (podSize + padding);
    var py = startY + row * (podSize + padding);
    var status = i < pods ? 'running' : 'pending';
    if (i >= pods) {
      // Empty slot
      ctx.beginPath();
      ctx.arc(px + podSize / 2, py + podSize / 2, podSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      drawPod(ctx, px + podSize / 2, py + podSize / 2, podSize, status);
    }
  }
}

/** Draw a Kubernetes cluster boundary */
function drawCluster(ctx, x, y, w, h, name) {
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = Colors.cyan;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cluster label
  ctx.fillStyle = Colors.cyan;
  ctx.font = 'bold 13px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(name, x + 12, y + 8);
}

/** Helper for rounded rectangles */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Canvas animation presets for common visualization patterns */
const CanvasPresets = {
  /** EKS pod scaling visualization */
  'eks-pod-scaling': function(ctx, config, step, w, h) {
    ctx.clearRect(0, 0, w, h);
    var clusters = config.clusters || [];
    var steps = config.steps || [];

    // Find current step config
    var currentStep = null;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].step <= step) currentStep = steps[i];
    }

    clusters.forEach(function(cluster, ci) {
      var cx = cluster.x || 40;
      var cy = cluster.y || 30;
      var cw = cluster.width || (w - 80);
      var ch = cluster.height || (h - 60);
      drawCluster(ctx, cx, cy, cw, ch, cluster.name || 'EKS Cluster');

      var nodes = cluster.nodes || [];
      var nodeW = Math.min(180, (cw - 40) / Math.max(nodes.length, 1) - 10);
      var nodeH = ch - 60;

      nodes.forEach(function(node, ni) {
        var nx = cx + 20 + ni * (nodeW + 10);
        var ny = cy + 30;
        var pods = node.pods || 2;

        // Apply step mutations
        if (currentStep && currentStep.node === ni) {
          if (currentStep.action === 'scale-out' || currentStep.action === 'scale-up') {
            pods = currentStep.to || pods;
          } else if (currentStep.action === 'scale-in' || currentStep.action === 'scale-down') {
            pods = currentStep.to || pods;
          }
        }

        drawNode(ctx, nx, ny, nodeW, nodeH, node.name || ('Node ' + (ni + 1)), pods, node.max || 8);
      });
    });

    // Step label
    if (currentStep && currentStep.label) {
      ctx.fillStyle = Colors.accent;
      ctx.font = 'bold 14px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
      ctx.textAlign = 'center';
      ctx.fillText(currentStep.label, w / 2, h - 12);
    }
  },

  /** EKS node scaling visualization */
  'eks-node-scaling': function(ctx, config, step, w, h) {
    ctx.clearRect(0, 0, w, h);
    var clusters = config.clusters || [];
    var steps = config.steps || [];

    var currentStep = null;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].step <= step) currentStep = steps[i];
    }

    var visibleNodes = 1;
    if (currentStep && currentStep.to !== undefined) {
      visibleNodes = currentStep.to;
    } else if (clusters[0] && clusters[0].nodes) {
      visibleNodes = clusters[0].nodes.length;
    }

    clusters.forEach(function(cluster) {
      var cx = cluster.x || 40;
      var cy = cluster.y || 30;
      var cw = cluster.width || (w - 80);
      var ch = cluster.height || (h - 60);
      drawCluster(ctx, cx, cy, cw, ch, cluster.name || 'EKS Cluster');

      var nodes = cluster.nodes || [];
      var nodeW = Math.min(180, (cw - 40) / Math.max(nodes.length, 1) - 10);
      var nodeH = ch - 60;

      for (var ni = 0; ni < Math.min(visibleNodes, nodes.length); ni++) {
        var node = nodes[ni];
        var nx = cx + 20 + ni * (nodeW + 10);
        var ny = cy + 30;
        drawNode(ctx, nx, ny, nodeW, nodeH, node.name || ('Node ' + (ni + 1)), node.pods || 2, node.max || 8);
      }
    });

    if (currentStep && currentStep.label) {
      ctx.fillStyle = Colors.accent;
      ctx.font = 'bold 14px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
      ctx.textAlign = 'center';
      ctx.fillText(currentStep.label, w / 2, h - 12);
    }
  },

  /** Traffic flow between services */
  'traffic-flow': function(ctx, config, step, w, h) {
    ctx.clearRect(0, 0, w, h);
    var services = config.services || [];
    var flows = config.flows || [];

    // Draw services
    var svcW = 100, svcH = 50;
    services.forEach(function(svc, i) {
      var sx = svc.x || (80 + i * 160);
      var sy = svc.y || (h / 2 - svcH / 2);
      var color = resolveColor(svc.color || 'accent');
      drawBox(ctx, sx, sy, svcW, svcH, svc.name, color);
      svc._cx = sx + svcW / 2;
      svc._cy = sy + svcH / 2;
      svc._right = sx + svcW;
      svc._left = sx;
    });

    // Draw flows up to current step
    flows.forEach(function(flow) {
      if (flow.step && flow.step > step) return;
      var from = services.find(function(s) { return s.name === flow.from; });
      var to = services.find(function(s) { return s.name === flow.to; });
      if (from && to) {
        var color = resolveColor(flow.color || 'accent');
        drawArrow(ctx, from._right, from._cy, to._left, to._cy, color, flow.dashed);
        if (flow.label) {
          ctx.fillStyle = Colors.textSec;
          ctx.font = '11px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace');
          ctx.textAlign = 'center';
          ctx.fillText(flow.label, (from._right + to._left) / 2, from._cy - 12);
        }
      }
    });
  },

  /** Rolling update visualization */
  'rolling-update': function(ctx, config, step, w, h) {
    ctx.clearRect(0, 0, w, h);
    var totalPods = config.totalPods || 6;
    var updatedCount = Math.min(step, totalPods);
    var podSize = 28;
    var gap = 12;
    var startX = (w - (totalPods * (podSize + gap) - gap)) / 2;
    var cy = h / 2;

    for (var i = 0; i < totalPods; i++) {
      var px = startX + i * (podSize + gap);
      var isUpdated = i < updatedCount;
      drawPod(ctx, px + podSize / 2, cy, podSize, isUpdated ? 'running' : 'pending', isUpdated ? 'v2' : 'v1');
    }

    // Progress label
    ctx.fillStyle = Colors.textSec;
    ctx.font = '13px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.fillText(updatedCount + '/' + totalPods + ' pods updated', w / 2, cy + podSize + 20);
  },

  /** Failover visualization */
  'failover': function(ctx, config, step, w, h) {
    ctx.clearRect(0, 0, w, h);
    var primary = config.primary || { name: 'Primary', x: w * 0.25 };
    var standby = config.standby || { name: 'Standby', x: w * 0.75 };
    var failedOver = step >= (config.failoverStep || 2);

    var boxW = 140, boxH = 60;
    var cy = h / 2 - boxH / 2;

    // Primary
    var pColor = failedOver ? Colors.red : Colors.green;
    drawBox(ctx, (primary.x || w * 0.25) - boxW / 2, cy, boxW, boxH, primary.name || 'Primary', pColor);

    // Standby
    var sColor = failedOver ? Colors.green : Colors.textMuted;
    drawBox(ctx, (standby.x || w * 0.75) - boxW / 2, cy, boxW, boxH, standby.name || 'Standby', sColor);

    // Arrow indicating active
    var activeX = failedOver ? (standby.x || w * 0.75) : (primary.x || w * 0.25);
    ctx.fillStyle = Colors.accent;
    ctx.font = 'bold 14px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.fillText(failedOver ? '← Failover Complete' : 'Active ↓', activeX, cy - 16);

    // Status
    ctx.fillStyle = Colors.textSec;
    ctx.font = '12px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif');
    ctx.textAlign = 'center';
    ctx.fillText(failedOver ? 'Traffic redirected to standby' : 'Normal operation', w / 2, h - 20);
  }
};

/**
 * Render Canvas DSL data structure
 * @param {string} canvasId - Canvas element ID
 * @param {Array} dslData - Array of DSL elements
 * @param {number} currentStep - Current reveal step (elements with step > currentStep are hidden)
 * @param {Object} [options] - Render options
 * @returns {Object} - { ctx, redraw } for further manipulation
 */
function renderCanvasDSL(canvasId, dslData, currentStep, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const baseWidth = options.width || 960;
  const baseHeight = options.height || 400;

  // Setup canvas with DPR scaling
  canvas.width = baseWidth * dpr;
  canvas.height = baseHeight * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = baseWidth + 'px';
  canvas.style.height = 'auto';
  ctx.scale(dpr, dpr);

  // Track loaded images for redraw
  const loadedImages = {};
  let pendingImages = 0;

  function render() {
    ctx.clearRect(0, 0, baseWidth, baseHeight);

    // Sort by layer/z-index if specified
    const sortedElements = [...dslData].sort((a, b) => (a.layer || 0) - (b.layer || 0));

    sortedElements.forEach(el => {
      // Skip elements not yet revealed
      if (el.step !== undefined && el.step > currentStep) return;

      // Calculate opacity for fade-in effect
      const stepDiff = currentStep - (el.step || 0);
      const opacity = el.step !== undefined ? Math.min(1, stepDiff + 1) : 1;
      ctx.globalAlpha = opacity;

      const x = el.x || 0;
      const y = el.y || 0;
      const w = el.width || el.w || 100;
      const h = el.height || el.h || 60;
      const color = el.color || Colors.accent;
      const label = el.label || el.text || '';

      switch (el.type) {
        case 'box':
          drawBox(ctx, x, y, w, h, label, color, el.textColor);
          break;

        case 'circle':
          drawCircle(ctx, x, y, el.radius || w / 2, color + '22', color);
          if (label) {
            drawText(ctx, label, x, y, { color: el.textColor || Colors.textPri, size: 12 });
          }
          break;

        case 'arrow':
          drawArrow(ctx, el.x1 || x, el.y1 || y, el.x2, el.y2, color, el.dashed);
          if (label) {
            const midX = ((el.x1 || x) + el.x2) / 2;
            const midY = ((el.y1 || y) + el.y2) / 2;
            drawText(ctx, label, midX, midY - 12, { color: Colors.textSec, size: 11 });
          }
          break;

        case 'group':
          drawGroup(ctx, x, y, w, h, label, color);
          break;

        case 'icon':
          if (el.src) {
            if (loadedImages[el.src]) {
              drawIcon(ctx, loadedImages[el.src], x, y, el.size || 48);
            } else {
              pendingImages++;
              const img = new Image();
              img.onload = () => {
                loadedImages[el.src] = img;
                pendingImages--;
                if (pendingImages === 0) render(); // Redraw when all images loaded
              };
              img.onerror = () => {
                pendingImages--;
              };
              img.src = el.src;
            }
          }
          break;

        case 'text':
          drawText(ctx, label, x, y, {
            color: color,
            size: el.size || 13,
            weight: el.weight || '400',
            align: el.align || 'center',
            baseline: el.baseline || 'middle'
          });
          break;

        case 'line':
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = el.lineWidth || 2;
          if (el.dashed) ctx.setLineDash([6, 4]);
          ctx.moveTo(el.x1 || x, el.y1 || y);
          ctx.lineTo(el.x2, el.y2);
          ctx.stroke();
          ctx.setLineDash([]);
          break;

        case 'rect':
          drawRoundRect(ctx, x, y, w, h, el.radius || 4, el.fill || color + '22', el.stroke || color);
          break;
      }

      ctx.globalAlpha = 1;
    });
  }

  render();

  return {
    ctx,
    redraw: render,
    setStep: (step) => {
      currentStep = step;
      render();
    }
  };
}
