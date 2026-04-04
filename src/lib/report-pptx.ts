import PptxGenJS from 'pptxgenjs';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const THEME = {
  bg: '0a0e1a',       // navy-900
  bgLight: '0f1629',  // navy-800
  bgCard: '151d30',   // navy-700
  cyan: '00d4ff',
  green: '00ff88',
  purple: 'a855f7',
  orange: 'f59e0b',
  red: 'ef4444',
  white: 'ffffff',
  gray: '8b95a5',
  grayLight: 'c0c8d4',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: THEME.red,
  warning: THEME.orange,
  info: THEME.cyan,
};

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------
export interface ReportSection {
  title: string;
  subtitle?: string;
  content: string;
  findings?: Finding[];
  metrics?: Metric[];
}

export interface Finding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  impact?: string;
  action?: string;
}

export interface Metric {
  label: string;
  value: string;
  change?: string;
  color?: string;
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  accountAlias?: string;
  generatedAt: string;
  sections: ReportSection[];
  totalSavings?: string;
  healthScore?: number;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const SLIDE_W = 13.33;
const MARGIN_X = 0.7;
const CONTENT_W = SLIDE_W - MARGIN_X * 2; // ~11.93
const MAX_LINES_PER_SLIDE = 12;
const FONT_FACE = 'Segoe UI';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply navy background to a slide */
function applyBackground(slide: PptxGenJS.Slide): void {
  slide.background = { color: THEME.bg };
}

/** Add a thin footer line at the bottom of a slide */
function addFooter(slide: PptxGenJS.Slide, text: string): void {
  slide.addText(text, {
    x: MARGIN_X,
    y: 6.9,
    w: CONTENT_W,
    h: 0.35,
    fontSize: 8,
    color: THEME.gray,
    fontFace: FONT_FACE,
    align: 'right',
  });
}

/** Resolve a color name to a THEME hex value (passthrough if already hex) */
function resolveColor(color?: string): string {
  if (!color) return THEME.cyan;
  const key = color.toLowerCase();
  if (key in THEME) return (THEME as Record<string, string>)[key];
  return color.replace(/^#/, '');
}

// ---------------------------------------------------------------------------
// Markdown parsing utilities
// ---------------------------------------------------------------------------

interface ParsedBlock {
  heading?: string;
  lines: ParsedLine[];
}

interface ParsedLine {
  type: 'text' | 'bullet' | 'table-row' | 'bold-text';
  raw: string;
  cells?: string[]; // for table-row
}

/** Classify a single markdown line */
function classifyLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return { type: 'bullet', raw: trimmed.replace(/^[-*]\s+/, '') };
  }
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    return { type: 'table-row', raw: trimmed, cells };
  }
  if (/^\*\*.*\*\*$/.test(trimmed)) {
    return { type: 'bold-text', raw: trimmed.replace(/\*\*/g, '') };
  }
  return { type: 'text', raw: trimmed };
}

/** Split section content by ### headings into blocks */
function splitIntoBlocks(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock = { lines: [] };

  for (const line of lines) {
    if (line.trim().startsWith('### ')) {
      if (current.heading || current.lines.length > 0) {
        blocks.push(current);
      }
      current = { heading: line.trim().replace(/^###\s+/, ''), lines: [] };
    } else if (line.trim() !== '') {
      current.lines.push(classifyLine(line));
    }
  }
  if (current.heading || current.lines.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Slide builders
// ---------------------------------------------------------------------------

function createCoverSlide(
  pres: PptxGenJS,
  input: ReportInput,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  // Decorative accent line at top
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X,
    y: 2.2,
    w: 3,
    h: 0.05,
    fill: { color: THEME.cyan },
  });

  // Title
  slide.addText(input.title, {
    x: MARGIN_X,
    y: 2.5,
    w: CONTENT_W,
    h: 1.4,
    fontSize: 36,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  // Subtitle
  const subtitleParts: string[] = [];
  if (input.subtitle) subtitleParts.push(input.subtitle);
  if (input.accountAlias) subtitleParts.push(`Account: ${input.accountAlias}`);
  if (subtitleParts.length > 0) {
    slide.addText(subtitleParts.join('  |  '), {
      x: MARGIN_X,
      y: 3.9,
      w: CONTENT_W,
      h: 0.6,
      fontSize: 18,
      color: THEME.cyan,
      fontFace: FONT_FACE,
    });
  }

  // Date
  slide.addText(input.generatedAt, {
    x: MARGIN_X,
    y: 4.7,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 14,
    color: THEME.gray,
    fontFace: FONT_FACE,
  });
}

function createExecutiveSummarySlide(
  pres: PptxGenJS,
  input: ReportInput,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addText('Executive Summary', {
    x: MARGIN_X,
    y: 0.3,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 28,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X,
    y: 1.05,
    w: 2,
    h: 0.04,
    fill: { color: THEME.cyan },
  });

  let yPos = 1.5;

  // Health score card
  if (input.healthScore !== undefined) {
    const scoreColor =
      input.healthScore >= 80
        ? THEME.green
        : input.healthScore >= 50
          ? THEME.orange
          : THEME.red;

    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: MARGIN_X,
      y: yPos,
      w: 3.5,
      h: 2.0,
      fill: { color: THEME.bgCard },
      rectRadius: 0.1,
    });
    slide.addText('Health Score', {
      x: MARGIN_X + 0.3,
      y: yPos + 0.2,
      w: 2.9,
      h: 0.4,
      fontSize: 14,
      color: THEME.gray,
      fontFace: FONT_FACE,
    });
    slide.addText(`${input.healthScore}`, {
      x: MARGIN_X + 0.3,
      y: yPos + 0.6,
      w: 2.9,
      h: 1.0,
      fontSize: 48,
      color: scoreColor,
      bold: true,
      fontFace: FONT_FACE,
    });
  }

  // Total savings card
  if (input.totalSavings) {
    const savingsX = input.healthScore !== undefined ? MARGIN_X + 4.0 : MARGIN_X;
    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: savingsX,
      y: yPos,
      w: 3.5,
      h: 2.0,
      fill: { color: THEME.bgCard },
      rectRadius: 0.1,
    });
    slide.addText('Potential Savings', {
      x: savingsX + 0.3,
      y: yPos + 0.2,
      w: 2.9,
      h: 0.4,
      fontSize: 14,
      color: THEME.gray,
      fontFace: FONT_FACE,
    });
    slide.addText(input.totalSavings, {
      x: savingsX + 0.3,
      y: yPos + 0.6,
      w: 2.9,
      h: 1.0,
      fontSize: 36,
      color: THEME.green,
      bold: true,
      fontFace: FONT_FACE,
    });
  }

  // Top metrics from first section (if available)
  const firstMetrics = input.sections.find((s) => s.metrics && s.metrics.length > 0)?.metrics;
  if (firstMetrics && firstMetrics.length > 0) {
    yPos = 4.0;
    const metricsToShow = firstMetrics.slice(0, 4);
    const cardWidth = (CONTENT_W - 0.3 * (metricsToShow.length - 1)) / metricsToShow.length;

    metricsToShow.forEach((metric, i) => {
      const mx = MARGIN_X + i * (cardWidth + 0.3);
      slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
        x: mx,
        y: yPos,
        w: cardWidth,
        h: 1.5,
        fill: { color: THEME.bgCard },
        rectRadius: 0.1,
      });
      slide.addText(metric.label, {
        x: mx + 0.2,
        y: yPos + 0.15,
        w: cardWidth - 0.4,
        h: 0.35,
        fontSize: 11,
        color: THEME.gray,
        fontFace: FONT_FACE,
      });
      slide.addText(metric.value, {
        x: mx + 0.2,
        y: yPos + 0.5,
        w: cardWidth - 0.4,
        h: 0.5,
        fontSize: 24,
        color: resolveColor(metric.color),
        bold: true,
        fontFace: FONT_FACE,
      });
      if (metric.change) {
        slide.addText(metric.change, {
          x: mx + 0.2,
          y: yPos + 1.0,
          w: cardWidth - 0.4,
          h: 0.3,
          fontSize: 10,
          color: metric.change.startsWith('-') ? THEME.green : THEME.red,
          fontFace: FONT_FACE,
        });
      }
    });
  }

  addFooter(slide, 'AWSops Dashboard');
}

function createSectionDividerSlide(
  pres: PptxGenJS,
  section: ReportSection,
  footerText: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addText(section.title, {
    x: MARGIN_X,
    y: 2.5,
    w: CONTENT_W,
    h: 1.0,
    fontSize: 32,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X,
    y: 3.5,
    w: 2,
    h: 0.04,
    fill: { color: THEME.cyan },
  });

  if (section.subtitle) {
    slide.addText(section.subtitle, {
      x: MARGIN_X,
      y: 3.7,
      w: CONTENT_W,
      h: 0.6,
      fontSize: 16,
      color: THEME.gray,
      fontFace: FONT_FACE,
    });
  }

  addFooter(slide, footerText);
}

/** Render metrics cards on a dedicated slide */
function createMetricsSlide(
  pres: PptxGenJS,
  sectionTitle: string,
  metrics: Metric[],
  footerText: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addText(sectionTitle + ' — Key Metrics', {
    x: MARGIN_X,
    y: 0.3,
    w: CONTENT_W,
    h: 0.8,
    fontSize: 24,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  const perRow = Math.min(metrics.length, 4);
  const cardW = (CONTENT_W - 0.3 * (perRow - 1)) / perRow;
  const rows = Math.ceil(metrics.length / perRow);

  metrics.forEach((metric, idx) => {
    const col = idx % perRow;
    const row = Math.floor(idx / perRow);
    if (row >= 3) return; // max 3 rows of 4 = 12 metric cards per slide

    const mx = MARGIN_X + col * (cardW + 0.3);
    const my = 1.4 + row * 1.8;

    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: mx,
      y: my,
      w: cardW,
      h: 1.5,
      fill: { color: THEME.bgCard },
      rectRadius: 0.1,
    });
    slide.addText(metric.label, {
      x: mx + 0.2,
      y: my + 0.15,
      w: cardW - 0.4,
      h: 0.35,
      fontSize: 11,
      color: THEME.gray,
      fontFace: FONT_FACE,
    });
    slide.addText(metric.value, {
      x: mx + 0.2,
      y: my + 0.5,
      w: cardW - 0.4,
      h: 0.5,
      fontSize: 24,
      color: resolveColor(metric.color),
      bold: true,
      fontFace: FONT_FACE,
    });
    if (metric.change) {
      slide.addText(metric.change, {
        x: mx + 0.2,
        y: my + 1.0,
        w: cardW - 0.4,
        h: 0.3,
        fontSize: 10,
        color: metric.change.startsWith('-') ? THEME.green : THEME.red,
        fontFace: FONT_FACE,
      });
    }
  });

  // suppress unused variable
  void rows;

  addFooter(slide, footerText);
}

/** Build pptxgenjs table rows from parsed markdown table lines */
function buildTableRows(lines: ParsedLine[]): { headers: string[]; dataRows: string[][] } {
  const headers: string[] = [];
  const dataRows: string[][] = [];
  let headerParsed = false;

  for (const line of lines) {
    if (line.type !== 'table-row' || !line.cells) continue;
    // Skip separator rows like |---|---|
    if (line.cells.every((c) => /^[-:]+$/.test(c))) continue;

    if (!headerParsed) {
      headers.push(...line.cells);
      headerParsed = true;
    } else {
      dataRows.push(line.cells);
    }
  }
  return { headers, dataRows };
}

/** Create a pptxgenjs table slide from markdown table data */
function createTableSlide(
  pres: PptxGenJS,
  heading: string,
  headers: string[],
  dataRows: string[][],
  footerText: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addText(heading, {
    x: MARGIN_X,
    y: 0.3,
    w: CONTENT_W,
    h: 0.7,
    fontSize: 20,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  const colCount = headers.length || 1;
  const colW = Array(colCount).fill(CONTENT_W / colCount);

  // Header row
  const headerRow: PptxGenJS.TableCell[] = headers.map((h) => ({
    text: h,
    options: {
      bold: true,
      color: THEME.bgCard,
      fill: { color: THEME.cyan },
      fontSize: 10,
      fontFace: FONT_FACE,
      align: 'left' as PptxGenJS.HAlign,
      margin: [3, 4, 3, 4] as [number, number, number, number],
    },
  }));

  // Data rows
  const tableDataRows: PptxGenJS.TableRow[] = dataRows.map((cells, rowIdx) =>
    cells.map((cell) => ({
      text: cell,
      options: {
        color: THEME.grayLight,
        fill: { color: rowIdx % 2 === 0 ? THEME.bgLight : THEME.bgCard },
        fontSize: 10,
        fontFace: FONT_FACE,
        align: 'left' as PptxGenJS.HAlign,
        margin: [3, 4, 3, 4] as [number, number, number, number],
      },
    })),
  );

  const allRows: PptxGenJS.TableRow[] = [headerRow, ...tableDataRows];

  slide.addTable(allRows, {
    x: MARGIN_X,
    y: 1.2,
    w: CONTENT_W,
    colW,
    border: { type: 'solid', pt: 0.5, color: THEME.bgCard },
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: 0.5,
  });

  addFooter(slide, footerText);
}

/** Create findings table slide with severity color coding */
function createFindingsSlide(
  pres: PptxGenJS,
  sectionTitle: string,
  findings: Finding[],
  footerText: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addText(sectionTitle + ' — Findings', {
    x: MARGIN_X,
    y: 0.3,
    w: CONTENT_W,
    h: 0.7,
    fontSize: 20,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  // Headers
  const colW = [1.5, 3.0, 4.0, 3.43];
  const headerRow: PptxGenJS.TableCell[] = [
    { text: 'Severity', options: { bold: true, color: THEME.bgCard, fill: { color: THEME.cyan }, fontSize: 10, fontFace: FONT_FACE, align: 'center' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
    { text: 'Finding', options: { bold: true, color: THEME.bgCard, fill: { color: THEME.cyan }, fontSize: 10, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
    { text: 'Description', options: { bold: true, color: THEME.bgCard, fill: { color: THEME.cyan }, fontSize: 10, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
    { text: 'Action', options: { bold: true, color: THEME.bgCard, fill: { color: THEME.cyan }, fontSize: 10, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
  ];

  const dataRows: PptxGenJS.TableRow[] = findings.map((f, idx) => {
    const bgColor = idx % 2 === 0 ? THEME.bgLight : THEME.bgCard;
    const sevColor = SEVERITY_COLORS[f.severity] || THEME.gray;
    return [
      { text: f.severity.toUpperCase(), options: { color: sevColor, fill: { color: bgColor }, fontSize: 10, fontFace: FONT_FACE, bold: true, align: 'center' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
      { text: f.title, options: { color: THEME.white, fill: { color: bgColor }, fontSize: 10, fontFace: FONT_FACE, bold: true, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
      { text: f.description, options: { color: THEME.grayLight, fill: { color: bgColor }, fontSize: 9, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
      { text: f.action || '-', options: { color: THEME.grayLight, fill: { color: bgColor }, fontSize: 9, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [3, 4, 3, 4] as [number, number, number, number] } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: MARGIN_X,
    y: 1.2,
    w: CONTENT_W,
    colW,
    border: { type: 'solid', pt: 0.5, color: THEME.bgCard },
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: 0.5,
  });

  addFooter(slide, footerText);
}

/** Build text-prop items with inline bold parsing */
function buildTextItems(line: string): PptxGenJS.TextProps[] {
  const items: PptxGenJS.TextProps[] = [];
  // Split on **bold** segments
  const parts = line.split(/(\*\*[^*]+\*\*)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      items.push({
        text: part.slice(2, -2),
        options: { bold: true, color: THEME.white, fontSize: 12, fontFace: FONT_FACE },
      });
    } else {
      items.push({
        text: part,
        options: { color: THEME.grayLight, fontSize: 12, fontFace: FONT_FACE },
      });
    }
  }
  return items;
}

/** Create content slides from a parsed block (may produce multiple slides if overflow) */
function createContentSlides(
  pres: PptxGenJS,
  block: ParsedBlock,
  footerText: string,
): void {
  // Separate table lines from non-table lines
  const tableLines = block.lines.filter((l) => l.type === 'table-row');
  const textLines = block.lines.filter((l) => l.type !== 'table-row');

  // If the block is entirely a table, create a table slide
  if (tableLines.length > 0 && textLines.length === 0) {
    const { headers, dataRows } = buildTableRows(tableLines);
    if (headers.length > 0) {
      createTableSlide(pres, block.heading || '', headers, dataRows, footerText);
      return;
    }
  }

  // Chunk text lines into groups of MAX_LINES_PER_SLIDE
  const chunks: ParsedLine[][] = [];
  for (let i = 0; i < textLines.length; i += MAX_LINES_PER_SLIDE) {
    chunks.push(textLines.slice(i, i + MAX_LINES_PER_SLIDE));
  }
  if (chunks.length === 0) chunks.push([]);

  chunks.forEach((chunk, chunkIdx) => {
    const slide = pres.addSlide();
    applyBackground(slide);

    const heading = block.heading
      ? chunkIdx === 0
        ? block.heading
        : `${block.heading} (cont.)`
      : chunkIdx > 0
        ? '(cont.)'
        : undefined;

    let yPos = 0.3;
    if (heading) {
      slide.addText(heading, {
        x: MARGIN_X,
        y: yPos,
        w: CONTENT_W,
        h: 0.7,
        fontSize: 20,
        color: THEME.white,
        bold: true,
        fontFace: FONT_FACE,
      });
      yPos = 1.1;
    }

    // Collect bullet items and text items separately for cleaner rendering
    const bulletItems: PptxGenJS.TextProps[] = [];
    const textBlocks: { items: PptxGenJS.TextProps[]; yStart: number }[] = [];
    let currentTextItems: PptxGenJS.TextProps[] = [];

    for (const line of chunk) {
      if (line.type === 'bullet') {
        // Flush any pending text
        if (currentTextItems.length > 0) {
          textBlocks.push({ items: currentTextItems, yStart: yPos });
          yPos += currentTextItems.length * 0.35;
          currentTextItems = [];
        }
        bulletItems.push({
          text: line.raw,
          options: {
            bullet: true,
            color: THEME.grayLight,
            fontSize: 12,
            fontFace: FONT_FACE,
          },
        });
      } else if (line.type === 'bold-text') {
        if (currentTextItems.length > 0) {
          textBlocks.push({ items: currentTextItems, yStart: yPos });
          yPos += currentTextItems.length * 0.35;
          currentTextItems = [];
        }
        // Flush any pending bullets
        if (bulletItems.length > 0) {
          slide.addText(bulletItems.splice(0), {
            x: MARGIN_X,
            y: yPos,
            w: CONTENT_W,
            h: bulletItems.length * 0.35 + 0.35,
            valign: 'top',
            fontFace: FONT_FACE,
          });
          yPos += bulletItems.length * 0.35 + 0.35;
        }
        currentTextItems.push({
          text: line.raw,
          options: {
            bold: true,
            color: THEME.white,
            fontSize: 14,
            fontFace: FONT_FACE,
            breakLine: true,
          },
        });
      } else {
        // Normal text — parse for inline **bold**
        const inlineItems = buildTextItems(line.raw);
        // Add breakLine to last item of this line
        if (inlineItems.length > 0) {
          const last = inlineItems[inlineItems.length - 1];
          last.options = { ...last.options, breakLine: true };
        }
        currentTextItems.push(...inlineItems);
      }
    }

    // Flush remaining bullets
    if (bulletItems.length > 0) {
      slide.addText(bulletItems, {
        x: MARGIN_X,
        y: yPos,
        w: CONTENT_W,
        h: Math.max(bulletItems.length * 0.35, 0.5),
        valign: 'top',
        fontFace: FONT_FACE,
      });
      yPos += bulletItems.length * 0.35;
    }

    // Flush remaining text
    if (currentTextItems.length > 0) {
      slide.addText(currentTextItems, {
        x: MARGIN_X,
        y: yPos,
        w: CONTENT_W,
        h: Math.min(5.5, Math.max(currentTextItems.length * 0.3, 0.5)),
        valign: 'top',
        fontFace: FONT_FACE,
      });
    }

    // Render text blocks
    for (const block of textBlocks) {
      slide.addText(block.items, {
        x: MARGIN_X,
        y: block.yStart,
        w: CONTENT_W,
        h: Math.max(block.items.length * 0.3, 0.5),
        valign: 'top',
        fontFace: FONT_FACE,
      });
    }

    addFooter(slide, footerText);
  });

  // If there were table lines mixed with text, create a separate table slide
  if (tableLines.length > 0 && textLines.length > 0) {
    const { headers, dataRows } = buildTableRows(tableLines);
    if (headers.length > 0) {
      createTableSlide(pres, block.heading || '', headers, dataRows, footerText);
    }
  }
}

function createClosingSlide(pres: PptxGenJS, generatedAt: string): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X,
    y: 3.0,
    w: 2,
    h: 0.04,
    fill: { color: THEME.cyan },
  });

  slide.addText('Thank You', {
    x: MARGIN_X,
    y: 3.2,
    w: CONTENT_W,
    h: 1.2,
    fontSize: 36,
    color: THEME.white,
    bold: true,
    fontFace: FONT_FACE,
  });

  slide.addText(`Generated by AWSops Dashboard  |  ${generatedAt}`, {
    x: MARGIN_X,
    y: 4.5,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 14,
    color: THEME.gray,
    fontFace: FONT_FACE,
  });

  addFooter(slide, 'AWSops Dashboard');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateReportPptx(input: ReportInput): Promise<Buffer> {
  const pres = new PptxGenJS();

  // 16:9 wide layout
  pres.defineLayout({ name: 'WIDE_16x9', width: SLIDE_W, height: 7.5 });
  pres.layout = 'WIDE_16x9';
  pres.author = 'AWSops Dashboard';
  pres.title = input.title;

  const footerText = input.accountAlias
    ? `AWSops Dashboard  |  ${input.accountAlias}  |  ${input.generatedAt}`
    : `AWSops Dashboard  |  ${input.generatedAt}`;

  // 1. Cover slide
  createCoverSlide(pres, input);

  // 2. Executive summary (conditional)
  if (input.healthScore !== undefined || input.totalSavings) {
    createExecutiveSummarySlide(pres, input);
  }

  // 3. Section slides
  for (const section of input.sections) {
    // 3a. Section divider
    createSectionDividerSlide(pres, section, footerText);

    // 3b. Metrics slide (if metrics exist)
    if (section.metrics && section.metrics.length > 0) {
      createMetricsSlide(pres, section.title, section.metrics, footerText);
    }

    // 3c. Content slides
    if (section.content) {
      const blocks = splitIntoBlocks(section.content);
      for (const block of blocks) {
        createContentSlides(pres, block, footerText);
      }
    }

    // 3d. Findings slide (if findings exist)
    if (section.findings && section.findings.length > 0) {
      createFindingsSlide(pres, section.title, section.findings, footerText);
    }
  }

  // 4. Closing slide
  createClosingSlide(pres, input.generatedAt);

  // Generate buffer
  const output = await pres.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
