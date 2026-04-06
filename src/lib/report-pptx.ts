import PptxGenJS from 'pptxgenjs';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
const THEME = {
  bg: '0a0e1a',       // navy-900
  bgLight: '0f1629',  // navy-800
  bgCard: '151d30',   // navy-700
  bgCardAlt: '1a2540', // navy-600
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

// Section accent colors for visual variety
const SECTION_ACCENTS: Record<string, string> = {
  'executive-summary': THEME.cyan,
  'cost-overview': THEME.green,
  'cost-compute': THEME.green,
  'cost-network': THEME.green,
  'cost-storage': THEME.green,
  'idle-resources': THEME.orange,
  'security-posture': THEME.red,
  'network-architecture': THEME.purple,
  'compute-analysis': THEME.cyan,
  'eks-analysis': THEME.purple,
  'database-analysis': THEME.cyan,
  'msk-analysis': THEME.orange,
  'storage-analysis': THEME.cyan,
  'recommendations': THEME.green,
  'appendix': THEME.gray,
};

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------
export interface ReportSection {
  section?: string;       // section key (e.g. 'cost-overview')
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
const SLIDE_H = 7.5;
const MARGIN_X = 0.5;
const CONTENT_W = SLIDE_W - MARGIN_X * 2; // ~12.33
const FONT_FACE = 'Segoe UI';

// Title bar
const TITLE_BAR_H = 0.55;
const TITLE_BAR_Y = 0;
const ACCENT_LINE_H = 0.025;

// Content area
const CONTENT_TOP = TITLE_BAR_H + ACCENT_LINE_H + 0.15; // ~0.725
const FOOTER_Y = 7.1;
const CONTENT_BOTTOM = FOOTER_Y - 0.05; // ~7.05
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP; // ~6.325

// Two-column
const COL_GAP = 0.35;
const COL_W = (CONTENT_W - COL_GAP) / 2; // ~5.99

// Font sizes — compact for dense content
const FONT_H1 = 13;
const FONT_H3 = 11;
const FONT_H4 = 10;
const FONT_BODY = 9;
const FONT_TABLE = 8.5;
const FONT_SMALL = 7;

// Height estimation (inches per element) — tight packing
const H_H3 = 0.23;
const H_H4 = 0.20;
const H_BODY_LINE = 0.15;
const H_BULLET_LINE = 0.15;
const H_TABLE_ROW = 0.18;
const H_BLOCKQUOTE_LINE = 0.16;
const H_DIVIDER = 0.06;
const H_GAP = 0.04;

// Characters per inch at 9pt Segoe UI (more chars per inch at smaller font)
const CHARS_PER_INCH = 16;

// ---------------------------------------------------------------------------
// Markdown Parser (Phase 1)
// ---------------------------------------------------------------------------

type LineType = 'h1' | 'h2' | 'h3' | 'h4' | 'text' | 'bullet' | 'table-row' | 'table-sep' | 'blockquote' | 'divider' | 'checkbox';

interface ParsedLine {
  type: LineType;
  raw: string;        // text content (stripped of markdown markers)
  cells?: string[];   // table cells
  checked?: boolean;  // checkbox state
}

interface ParsedBlock {
  heading?: string;
  headingLevel?: number;
  lines: ParsedLine[];
}

function classifyLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Headings
  if (trimmed.startsWith('#### ')) return { type: 'h4', raw: trimmed.replace(/^####\s+/, '') };
  if (trimmed.startsWith('### '))  return { type: 'h3', raw: trimmed.replace(/^###\s+/, '') };
  if (trimmed.startsWith('## '))   return { type: 'h2', raw: trimmed.replace(/^##\s+/, '') };
  if (trimmed.startsWith('# '))    return { type: 'h1', raw: trimmed.replace(/^#\s+/, '') };

  // Divider
  if (/^[-]{3,}$/.test(trimmed) || /^[*]{3,}$/.test(trimmed)) return { type: 'divider', raw: '' };

  // Table separator (|---|---|)
  if (trimmed.startsWith('|') && trimmed.endsWith('|') && /^[|:\s-]+$/.test(trimmed)) {
    return { type: 'table-sep', raw: trimmed };
  }

  // Table row
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
    return { type: 'table-row', raw: trimmed, cells };
  }

  // Blockquote
  if (trimmed.startsWith('> ')) {
    return { type: 'blockquote', raw: trimmed.replace(/^>\s*/, '').replace(/\*\*/g, '') };
  }

  // Checkbox
  if (/^- \[([ xX])\]\s/.test(trimmed)) {
    const checked = trimmed[3] !== ' ';
    return { type: 'checkbox', raw: trimmed.replace(/^- \[[ xX]\]\s*/, ''), checked };
  }

  // Bullet
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return { type: 'bullet', raw: trimmed.replace(/^[-*]\s+/, '') };
  }

  // Bold-only line (treat as text, formatting handled inline)
  return { type: 'text', raw: trimmed };
}

/** Split section content into blocks by ### headings. Skip h1 (section-level duplicate) and standalone dividers. */
function splitIntoBlocks(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock = { lines: [] };

  for (const line of lines) {
    const parsed = classifyLine(line);
    if (!parsed) continue;

    // Skip h1 lines (duplicate of section title)
    if (parsed.type === 'h1') continue;

    // Split on ### headings
    if (parsed.type === 'h3' || parsed.type === 'h2') {
      if (current.heading || current.lines.length > 0) {
        blocks.push(current);
      }
      current = {
        heading: parsed.raw,
        headingLevel: parsed.type === 'h2' ? 2 : 3,
        lines: [],
      };
    } else if (parsed.type === 'divider') {
      // Skip standalone dividers between blocks
      continue;
    } else {
      current.lines.push(parsed);
    }
  }
  if (current.heading || current.lines.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

/** Parse inline markdown (bold, italic, code) into styled TextProps */
function parseInlineMarkdown(text: string, baseColor: string = THEME.grayLight, baseFontSize: number = FONT_BODY): PptxGenJS.TextProps[] {
  const items: PptxGenJS.TextProps[] = [];
  // Pattern: **bold**, `code`, *italic* (in priority order)
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/;
  const parts = text.split(pattern);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      items.push({
        text: part.slice(2, -2),
        options: { bold: true, color: THEME.white, fontSize: baseFontSize, fontFace: FONT_FACE },
      });
    } else if (part.startsWith('`') && part.endsWith('`')) {
      items.push({
        text: part.slice(1, -1),
        options: { color: THEME.cyan, fontSize: baseFontSize - 1, fontFace: 'Consolas' },
      });
    } else if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      items.push({
        text: part.slice(1, -1),
        options: { italic: true, color: baseColor, fontSize: baseFontSize, fontFace: FONT_FACE },
      });
    } else {
      items.push({
        text: part,
        options: { color: baseColor, fontSize: baseFontSize, fontFace: FONT_FACE },
      });
    }
  }
  return items.length > 0 ? items : [{ text, options: { color: baseColor, fontSize: baseFontSize, fontFace: FONT_FACE } }];
}

/** Strip all markdown formatting from text */
function stripMd(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

// ---------------------------------------------------------------------------
// Height Estimation (Phase 2)
// ---------------------------------------------------------------------------

function wrapLineCount(text: string, widthInches: number): number {
  const charsPerLine = Math.floor(widthInches * CHARS_PER_INCH);
  const stripped = stripMd(text);
  return Math.max(1, Math.ceil(stripped.length / charsPerLine));
}

function estimateLineHeight(line: ParsedLine, regionW: number): number {
  switch (line.type) {
    case 'h3': return H_H3;
    case 'h4': return H_H4;
    case 'h2': return H_H3 + 0.05;
    case 'divider': return H_DIVIDER;
    case 'table-row': return H_TABLE_ROW;
    case 'table-sep': return 0;
    case 'blockquote': return wrapLineCount(line.raw, regionW - 0.3) * H_BLOCKQUOTE_LINE;
    case 'bullet':
    case 'checkbox':
      return wrapLineCount(line.raw, regionW - 0.3) * H_BULLET_LINE;
    default:
      return wrapLineCount(line.raw, regionW) * H_BODY_LINE;
  }
}

function estimateBlockHeight(block: ParsedBlock, regionW: number): number {
  let h = 0;
  if (block.heading) h += (block.headingLevel === 2 ? H_H3 + 0.05 : H_H3) + H_GAP;
  for (const line of block.lines) {
    h += estimateLineHeight(line, regionW);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyBackground(slide: PptxGenJS.Slide): void {
  slide.background = { color: THEME.bg };
}

function addFooter(slide: PptxGenJS.Slide, text: string): void {
  slide.addText(text, {
    x: MARGIN_X,
    y: FOOTER_Y,
    w: CONTENT_W,
    h: 0.3,
    fontSize: FONT_SMALL,
    color: THEME.gray,
    fontFace: FONT_FACE,
    align: 'right',
  });
}

function resolveColor(color?: string): string {
  if (!color) return THEME.cyan;
  const key = color.toLowerCase();
  if (key in THEME) return (THEME as Record<string, string>)[key];
  return color.replace(/^#/, '');
}

function getSectionAccent(sectionKey?: string): string {
  if (!sectionKey) return THEME.cyan;
  return SECTION_ACCENTS[sectionKey] || THEME.cyan;
}

// ---------------------------------------------------------------------------
// Slide Renderers (Phase 3)
// ---------------------------------------------------------------------------

/** Add a WADD-style title bar at the top of a content slide */
function addTitleBar(
  slide: PptxGenJS.Slide,
  sectionTitle: string,
  slideNum: number,
  totalSlides: number,
  accentColor: string,
): void {
  // Dark bar background
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: TITLE_BAR_Y, w: SLIDE_W, h: TITLE_BAR_H,
    fill: { color: THEME.bgCard },
  });

  // Title text
  slide.addText(sectionTitle, {
    x: MARGIN_X, y: TITLE_BAR_Y, w: CONTENT_W - 1.5, h: TITLE_BAR_H,
    fontSize: 14, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
  });

  // Slide number
  slide.addText(`${slideNum} / ${totalSlides}`, {
    x: SLIDE_W - MARGIN_X - 1.5, y: TITLE_BAR_Y, w: 1.5, h: TITLE_BAR_H,
    fontSize: 9, color: THEME.gray, fontFace: FONT_FACE, align: 'right', valign: 'middle',
  });

  // Accent line below
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: TITLE_BAR_H, w: SLIDE_W, h: ACCENT_LINE_H,
    fill: { color: accentColor },
  });
}

/** Add a summary/blockquote bar below the title bar */
function addSummaryBar(slide: PptxGenJS.Slide, summary: string, y: number): number {
  const barH = 0.40;
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y, w: SLIDE_W, h: barH,
    fill: { color: THEME.bgLight },
  });
  slide.addText(stripMd(summary), {
    x: MARGIN_X + 0.15, y, w: CONTENT_W - 0.3, h: barH,
    fontSize: 9.5, color: THEME.cyan, italic: true, fontFace: FONT_FACE, valign: 'middle',
  });
  return y + barH + 0.08;
}

// ---------------------------------------------------------------------------
// Content Region Renderer
// ---------------------------------------------------------------------------

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Render a table from ParsedLine[] within a region. Returns height used. */
function renderTableInRegion(
  slide: PptxGenJS.Slide,
  tableLines: ParsedLine[],
  region: Region,
): number {
  const rows = tableLines.filter(l => l.type === 'table-row' && l.cells);
  if (rows.length === 0) return 0;

  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  const colCount = headerRow.cells!.length || 1;
  const colW = Array(colCount).fill(region.w / colCount);

  const header: PptxGenJS.TableCell[] = headerRow.cells!.map(h => ({
    text: stripMd(h),
    options: {
      bold: true, color: THEME.bgCard, fill: { color: THEME.cyan },
      fontSize: FONT_TABLE, fontFace: FONT_FACE,
      align: 'left' as PptxGenJS.HAlign,
      margin: [2, 3, 2, 3] as [number, number, number, number],
    },
  }));

  const tblDataRows: PptxGenJS.TableRow[] = dataRows.map((r, idx) =>
    r.cells!.map(cell => ({
      text: stripMd(cell),
      options: {
        color: THEME.grayLight,
        fill: { color: idx % 2 === 0 ? THEME.bgLight : THEME.bgCard },
        fontSize: FONT_TABLE, fontFace: FONT_FACE,
        align: 'left' as PptxGenJS.HAlign,
        margin: [2, 3, 2, 3] as [number, number, number, number],
      },
    })),
  );

  const allRows: PptxGenJS.TableRow[] = [header, ...tblDataRows];

  slide.addTable(allRows, {
    x: region.x,
    y: region.y,
    w: region.w,
    colW,
    border: { type: 'solid', pt: 0.5, color: THEME.bgCardAlt },
  });

  return (allRows.length + 0.5) * H_TABLE_ROW;
}

/** Render a parsed block's content within a region. Returns height used. */
function renderBlockInRegion(
  slide: PptxGenJS.Slide,
  block: ParsedBlock,
  region: Region,
  accentColor: string,
): number {
  let y = region.y;
  const maxY = region.y + region.h;

  // Block heading (h3/h4)
  if (block.heading && y < maxY) {
    const headingFontSize = block.headingLevel === 2 ? FONT_H1 : FONT_H3;
    const headingH = block.headingLevel === 2 ? H_H3 + 0.05 : H_H3;

    // Small accent bar before heading
    slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
      x: region.x, y: y + 0.04, w: 0.06, h: headingH - 0.08,
      fill: { color: accentColor },
    });

    slide.addText(stripMd(block.heading), {
      x: region.x + 0.15, y, w: region.w - 0.15, h: headingH,
      fontSize: headingFontSize, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
    });
    y += headingH + H_GAP;
  }

  // Group consecutive lines by type for batch rendering
  let i = 0;
  while (i < block.lines.length && y < maxY) {
    const line = block.lines[i];

    // Table: collect consecutive table rows
    if (line.type === 'table-row' || line.type === 'table-sep') {
      const tableStart = i;
      while (i < block.lines.length && (block.lines[i].type === 'table-row' || block.lines[i].type === 'table-sep')) {
        i++;
      }
      const tableLines = block.lines.slice(tableStart, i).filter(l => l.type === 'table-row');
      const usedH = renderTableInRegion(slide, tableLines, { x: region.x, y, w: region.w, h: maxY - y });
      y += usedH + H_GAP;
      continue;
    }

    // Blockquote
    if (line.type === 'blockquote') {
      const lines = wrapLineCount(line.raw, region.w - 0.3);
      const h = lines * H_BLOCKQUOTE_LINE;
      // Left accent bar
      slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
        x: region.x, y, w: 0.04, h,
        fill: { color: THEME.cyan },
      });
      slide.addText(parseInlineMarkdown(line.raw, THEME.cyan, FONT_BODY - 0.5), {
        x: region.x + 0.15, y, w: region.w - 0.15, h,
        fontSize: FONT_BODY - 0.5, italic: true, color: THEME.cyan, fontFace: FONT_FACE, valign: 'top',
      });
      y += h + H_GAP;
      i++;
      continue;
    }

    // Heading inline (h4)
    if (line.type === 'h4') {
      slide.addText(stripMd(line.raw), {
        x: region.x + 0.05, y, w: region.w - 0.05, h: H_H4,
        fontSize: FONT_H4, color: accentColor, bold: true, fontFace: FONT_FACE, valign: 'middle',
      });
      y += H_H4 + H_GAP * 0.5;
      i++;
      continue;
    }

    // Bullets / Checkboxes: collect consecutive
    if (line.type === 'bullet' || line.type === 'checkbox') {
      const bulletItems: PptxGenJS.TextProps[] = [];
      let bulletH = 0;
      while (i < block.lines.length && (block.lines[i].type === 'bullet' || block.lines[i].type === 'checkbox') && y + bulletH < maxY) {
        const bl = block.lines[i];
        const prefix = bl.type === 'checkbox' ? (bl.checked ? '☑ ' : '☐ ') : '';
        const lineH = wrapLineCount(bl.raw, region.w - 0.4) * H_BULLET_LINE;
        bulletItems.push({
          text: prefix + stripMd(bl.raw),
          options: {
            bullet: bl.type === 'bullet' ? { code: '25CF', color: accentColor } : false,
            color: THEME.grayLight, fontSize: FONT_BODY, fontFace: FONT_FACE,
            breakLine: true,
            indentLevel: 0,
          } as PptxGenJS.TextPropsOptions,
        });
        bulletH += lineH;
        i++;
      }
      if (bulletItems.length > 0) {
        slide.addText(bulletItems, {
          x: region.x + 0.1, y, w: region.w - 0.1, h: Math.min(bulletH + 0.1, maxY - y),
          valign: 'top', fontFace: FONT_FACE,
          paraSpaceAfter: 2,
        });
        y += bulletH + H_GAP;
      }
      continue;
    }

    // Regular text: collect consecutive text lines
    if (line.type === 'text') {
      const textItems: PptxGenJS.TextProps[] = [];
      let textH = 0;
      while (i < block.lines.length && block.lines[i].type === 'text' && y + textH < maxY) {
        const tl = block.lines[i];
        const parsed = parseInlineMarkdown(tl.raw);
        // Add line break to last item
        if (parsed.length > 0) {
          parsed[parsed.length - 1].options = { ...parsed[parsed.length - 1].options, breakLine: true };
        }
        textItems.push(...parsed);
        textH += wrapLineCount(tl.raw, region.w) * H_BODY_LINE;
        i++;
      }
      if (textItems.length > 0) {
        slide.addText(textItems, {
          x: region.x, y, w: region.w, h: Math.min(textH + 0.05, maxY - y),
          valign: 'top', fontFace: FONT_FACE,
        });
        y += textH + H_GAP;
      }
      continue;
    }

    // Divider
    if (line.type === 'divider') {
      slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
        x: region.x, y: y + H_DIVIDER / 2 - 0.01, w: region.w * 0.3, h: 0.015,
        fill: { color: THEME.bgCardAlt },
      });
      y += H_DIVIDER;
      i++;
      continue;
    }

    // Fallback: skip
    i++;
  }

  return y - region.y;
}

// ---------------------------------------------------------------------------
// Card Layout Renderer
// ---------------------------------------------------------------------------

/** Blend an accent color with background at ~30% opacity (pre-computed approximation) */
function dimAccent(accent: string): string {
  // Mix accent at 30% with navy-700 (#151d30)
  const DIM_MAP: Record<string, string> = {
    [THEME.cyan]: '0a3d4d',
    [THEME.green]: '0a4d2e',
    [THEME.purple]: '2e1e47',
    [THEME.orange]: '3d2e0a',
    [THEME.red]: '3d1515',
    [THEME.gray]: '2a2e33',
  };
  return DIM_MAP[accent] || THEME.bgCardAlt;
}

/** Render a block as a card (rounded rect with heading bar) */
function renderCardInRegion(
  slide: PptxGenJS.Slide,
  block: ParsedBlock,
  region: Region,
  accentColor: string,
): number {
  const CARD_PAD = 0.12;
  const CARD_HEADER_H = 0.30;

  // Card background
  slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
    x: region.x, y: region.y, w: region.w, h: region.h,
    fill: { color: THEME.bgCard }, rectRadius: 0.06,
  });

  let innerY = region.y;

  // Card header bar (if block has heading)
  if (block.heading) {
    slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
      x: region.x, y: region.y, w: region.w, h: CARD_HEADER_H,
      fill: { color: dimAccent(accentColor) },
      rectRadius: 0.06,
    });
    slide.addText(stripMd(block.heading), {
      x: region.x + CARD_PAD, y: region.y, w: region.w - CARD_PAD * 2, h: CARD_HEADER_H,
      fontSize: FONT_H4, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
    });
    innerY = region.y + CARD_HEADER_H + 0.05;
  }

  // Render block content inside card
  const innerRegion: Region = {
    x: region.x + CARD_PAD,
    y: innerY + CARD_PAD * 0.5,
    w: region.w - CARD_PAD * 2,
    h: region.y + region.h - innerY - CARD_PAD,
  };

  // Create a headingless copy for inner rendering
  const innerBlock: ParsedBlock = { lines: block.lines };
  renderBlockInRegion(slide, innerBlock, innerRegion, accentColor);

  return region.h;
}

// ---------------------------------------------------------------------------
// Orchestrator (Phase 4)
// ---------------------------------------------------------------------------

interface SlideLayout {
  type: 'single' | 'merged' | 'two-column' | 'two-card';
  blocks: ParsedBlock[];  // 1+ for single/merged, 2 for two-column/card
}

/** Merge a list of blocks into a single block (for stacking on one slide) */
function mergeBlocks(blocks: ParsedBlock[]): ParsedBlock {
  const merged: ParsedBlock = { lines: [] };
  for (const b of blocks) {
    if (b.heading) {
      merged.lines.push({ type: 'h3', raw: b.heading });
    }
    merged.lines.push(...b.lines);
  }
  return merged;
}

/** Plan how blocks should be laid out across slides */
function planSlideLayouts(blocks: ParsedBlock[], hasSummary: boolean): SlideLayout[] {
  const layouts: SlideLayout[] = [];
  let i = 0;

  while (i < blocks.length) {
    const availH = CONTENT_H - (hasSummary && layouts.length === 0 ? 0.48 : 0);

    // Try two-column with next block
    if (i + 1 < blocks.length) {
      const block = blocks[i];
      const nextBlock = blocks[i + 1];
      const blockHCol = estimateBlockHeight(block, COL_W);
      const nextHCol = estimateBlockHeight(nextBlock, COL_W);
      const maxColH = Math.max(blockHCol, nextHCol);

      if (maxColH <= availH && blockHCol > 0.3 && nextHCol > 0.3) {
        const useCards = block.heading && nextBlock.heading;
        layouts.push({
          type: useCards ? 'two-card' : 'two-column',
          blocks: [block, nextBlock],
        });
        i += 2;
        continue;
      }
    }

    // Try merging consecutive small blocks onto one slide
    const block = blocks[i];
    const blockH = estimateBlockHeight(block, CONTENT_W);

    if (blockH <= availH) {
      // Greedily merge following blocks that fit
      const mergedBlocks: ParsedBlock[] = [block];
      let totalH = blockH;
      let j = i + 1;
      while (j < blocks.length) {
        const nextH = estimateBlockHeight(blocks[j], CONTENT_W);
        if (totalH + nextH + H_GAP * 2 <= availH) {
          mergedBlocks.push(blocks[j]);
          totalH += nextH + H_GAP * 2;
          j++;
        } else {
          break;
        }
      }

      if (mergedBlocks.length > 1) {
        layouts.push({ type: 'merged', blocks: mergedBlocks });
      } else {
        layouts.push({ type: 'single', blocks: [block] });
      }
      i = j;
    } else {
      // Split large block into multiple slides
      const chunks = splitBlockForOverflow(block, availH, CONTENT_W);
      for (const chunk of chunks) {
        layouts.push({ type: 'single', blocks: [chunk] });
      }
      i++;
    }
  }

  return layouts;
}

/** Split a block that exceeds available height into multiple blocks */
function splitBlockForOverflow(block: ParsedBlock, maxH: number, regionW: number): ParsedBlock[] {
  const result: ParsedBlock[] = [];
  let currentLines: ParsedLine[] = [];
  let currentH = block.heading ? H_H3 + H_GAP : 0;
  let isFirst = true;

  for (const line of block.lines) {
    const lineH = estimateLineHeight(line, regionW);
    if (currentH + lineH > maxH && currentLines.length > 0) {
      result.push({
        heading: isFirst ? block.heading : (block.heading ? block.heading + ' (cont.)' : undefined),
        headingLevel: block.headingLevel,
        lines: currentLines,
      });
      currentLines = [];
      currentH = H_H3 + H_GAP; // heading for continuation
      isFirst = false;
    }
    currentLines.push(line);
    currentH += lineH;
  }

  if (currentLines.length > 0) {
    result.push({
      heading: isFirst ? block.heading : (block.heading ? block.heading + ' (cont.)' : undefined),
      headingLevel: block.headingLevel,
      lines: currentLines,
    });
  }

  return result.length > 0 ? result : [block];
}

/** Extract summary text from blocks (first blockquote) */
function extractSummary(blocks: ParsedBlock[]): string | undefined {
  for (const block of blocks) {
    for (const line of block.lines) {
      if (line.type === 'blockquote') {
        return line.raw;
      }
    }
  }
  return undefined;
}

/** Create all content slides for a section */
function createSectionContentSlides(
  pres: PptxGenJS,
  section: ReportSection,
  footerText: string,
  slideCounter: { current: number; total: number },
  accentColor: string,
): void {
  if (!section.content) return;

  const blocks = splitIntoBlocks(section.content);
  if (blocks.length === 0) return;

  const summary = extractSummary(blocks);
  const layouts = planSlideLayouts(blocks, !!summary);

  for (let li = 0; li < layouts.length; li++) {
    const layout = layouts[li];
    const slide = pres.addSlide();
    applyBackground(slide);

    slideCounter.current++;
    addTitleBar(slide, section.title, slideCounter.current, slideCounter.total, accentColor);

    let contentY = CONTENT_TOP;

    // Summary bar on first slide
    if (li === 0 && summary) {
      contentY = addSummaryBar(slide, summary, contentY);
    }

    const contentH = CONTENT_BOTTOM - contentY;

    if (layout.type === 'single') {
      renderBlockInRegion(slide, layout.blocks[0], {
        x: MARGIN_X, y: contentY, w: CONTENT_W, h: contentH,
      }, accentColor);
    } else if (layout.type === 'merged') {
      // Merge multiple blocks into one and render full-width
      const merged = mergeBlocks(layout.blocks);
      renderBlockInRegion(slide, merged, {
        x: MARGIN_X, y: contentY, w: CONTENT_W, h: contentH,
      }, accentColor);
    } else if (layout.type === 'two-column') {
      renderBlockInRegion(slide, layout.blocks[0], {
        x: MARGIN_X, y: contentY, w: COL_W, h: contentH,
      }, accentColor);
      renderBlockInRegion(slide, layout.blocks[1], {
        x: MARGIN_X + COL_W + COL_GAP, y: contentY, w: COL_W, h: contentH,
      }, accentColor);
    } else if (layout.type === 'two-card') {
      const leftH = estimateBlockHeight(layout.blocks[0], COL_W) + 0.5;
      const rightH = estimateBlockHeight(layout.blocks[1], COL_W) + 0.5;
      const cardH = Math.min(Math.max(leftH, rightH), contentH);
      renderCardInRegion(slide, layout.blocks[0], {
        x: MARGIN_X, y: contentY, w: COL_W, h: cardH,
      }, accentColor);
      renderCardInRegion(slide, layout.blocks[1], {
        x: MARGIN_X + COL_W + COL_GAP, y: contentY, w: COL_W, h: cardH,
      }, accentColor);
    }

    addFooter(slide, footerText);
  }
}

// ---------------------------------------------------------------------------
// Pre-existing slide builders (refined)
// ---------------------------------------------------------------------------

function createCoverSlide(pres: PptxGenJS, input: ReportInput): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  // Top accent line
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: 0, w: SLIDE_W, h: 0.06,
    fill: { color: THEME.cyan },
  });

  // Decorative vertical bar
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X, y: 2.0, w: 0.08, h: 2.4,
    fill: { color: THEME.cyan },
  });

  // Title
  slide.addText(input.title, {
    x: MARGIN_X + 0.3, y: 2.0, w: CONTENT_W - 0.3, h: 1.2,
    fontSize: 34, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
  });

  // Subtitle
  const subtitleParts: string[] = [];
  if (input.subtitle) subtitleParts.push(input.subtitle);
  if (input.accountAlias) subtitleParts.push(`Account: ${input.accountAlias}`);
  if (subtitleParts.length > 0) {
    slide.addText(subtitleParts.join('  |  '), {
      x: MARGIN_X + 0.3, y: 3.2, w: CONTENT_W - 0.3, h: 0.5,
      fontSize: 16, color: THEME.cyan, fontFace: FONT_FACE,
    });
  }

  // Date
  slide.addText(input.generatedAt, {
    x: MARGIN_X + 0.3, y: 3.9, w: CONTENT_W - 0.3, h: 0.4,
    fontSize: 13, color: THEME.gray, fontFace: FONT_FACE,
  });

  // Bottom bar
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: SLIDE_H - 0.06, w: SLIDE_W, h: 0.06,
    fill: { color: THEME.cyan },
  });
}

function createExecutiveSummarySlide(pres: PptxGenJS, input: ReportInput): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  // Title bar
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: 0, w: SLIDE_W, h: TITLE_BAR_H,
    fill: { color: THEME.bgCard },
  });
  slide.addText('Executive Summary', {
    x: MARGIN_X, y: 0, w: CONTENT_W, h: TITLE_BAR_H,
    fontSize: 16, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
  });
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: TITLE_BAR_H, w: SLIDE_W, h: ACCENT_LINE_H,
    fill: { color: THEME.cyan },
  });

  let yPos = 1.0;

  // Health score + Savings cards side by side
  const cardY = yPos;
  if (input.healthScore !== undefined) {
    const scoreColor = input.healthScore >= 80 ? THEME.green : input.healthScore >= 50 ? THEME.orange : THEME.red;
    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: MARGIN_X, y: cardY, w: 3.2, h: 1.8,
      fill: { color: THEME.bgCard }, rectRadius: 0.08,
    });
    slide.addText('Health Score', {
      x: MARGIN_X + 0.25, y: cardY + 0.15, w: 2.7, h: 0.3,
      fontSize: 12, color: THEME.gray, fontFace: FONT_FACE,
    });
    slide.addText(`${input.healthScore}`, {
      x: MARGIN_X + 0.25, y: cardY + 0.45, w: 2.7, h: 0.9,
      fontSize: 44, color: scoreColor, bold: true, fontFace: FONT_FACE,
    });
    slide.addText('/100', {
      x: MARGIN_X + 0.25, y: cardY + 1.3, w: 2.7, h: 0.3,
      fontSize: 12, color: THEME.gray, fontFace: FONT_FACE,
    });
  }

  if (input.totalSavings) {
    const savingsX = input.healthScore !== undefined ? MARGIN_X + 3.5 : MARGIN_X;
    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: savingsX, y: cardY, w: 3.2, h: 1.8,
      fill: { color: THEME.bgCard }, rectRadius: 0.08,
    });
    slide.addText('Potential Savings', {
      x: savingsX + 0.25, y: cardY + 0.15, w: 2.7, h: 0.3,
      fontSize: 12, color: THEME.gray, fontFace: FONT_FACE,
    });
    slide.addText(input.totalSavings, {
      x: savingsX + 0.25, y: cardY + 0.5, w: 2.7, h: 0.8,
      fontSize: 32, color: THEME.green, bold: true, fontFace: FONT_FACE,
    });
  }

  // Metrics row
  const firstMetrics = input.sections.find(s => s.metrics && s.metrics.length > 0)?.metrics;
  if (firstMetrics && firstMetrics.length > 0) {
    yPos = 3.2;
    const metricsToShow = firstMetrics.slice(0, 4);
    const cardWidth = (CONTENT_W - 0.25 * (metricsToShow.length - 1)) / metricsToShow.length;

    metricsToShow.forEach((metric, i) => {
      const mx = MARGIN_X + i * (cardWidth + 0.25);
      slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
        x: mx, y: yPos, w: cardWidth, h: 1.3,
        fill: { color: THEME.bgCard }, rectRadius: 0.08,
      });
      slide.addText(metric.label, {
        x: mx + 0.15, y: yPos + 0.1, w: cardWidth - 0.3, h: 0.3,
        fontSize: 10, color: THEME.gray, fontFace: FONT_FACE,
      });
      slide.addText(metric.value, {
        x: mx + 0.15, y: yPos + 0.4, w: cardWidth - 0.3, h: 0.5,
        fontSize: 22, color: resolveColor(metric.color), bold: true, fontFace: FONT_FACE,
      });
      if (metric.change) {
        slide.addText(metric.change, {
          x: mx + 0.15, y: yPos + 0.9, w: cardWidth - 0.3, h: 0.25,
          fontSize: 9, color: metric.change.startsWith('-') ? THEME.green : THEME.red, fontFace: FONT_FACE,
        });
      }
    });
  }

  addFooter(slide, 'AWSops Dashboard');
}

function createSectionDividerSlide(
  pres: PptxGenJS,
  section: ReportSection,
  sectionIdx: number,
  totalSections: number,
  accentColor: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  // Section number badge
  slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X, y: 2.6, w: 0.9, h: 0.9,
    fill: { color: accentColor }, rectRadius: 0.08,
  });
  slide.addText(`${sectionIdx + 1}`, {
    x: MARGIN_X, y: 2.6, w: 0.9, h: 0.9,
    fontSize: 28, color: THEME.bg, bold: true, fontFace: FONT_FACE, align: 'center', valign: 'middle',
  });

  // Title
  slide.addText(section.title, {
    x: MARGIN_X + 1.2, y: 2.5, w: CONTENT_W - 1.2, h: 0.7,
    fontSize: 28, color: THEME.white, bold: true, fontFace: FONT_FACE, valign: 'middle',
  });

  // Subtitle / section count
  const subText = section.subtitle || `Section ${sectionIdx + 1} of ${totalSections}`;
  slide.addText(subText, {
    x: MARGIN_X + 1.2, y: 3.2, w: CONTENT_W - 1.2, h: 0.5,
    fontSize: 14, color: THEME.gray, fontFace: FONT_FACE,
  });

  // Accent line
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X + 1.2, y: 3.8, w: 2.5, h: 0.035,
    fill: { color: accentColor },
  });

  // Bottom bar
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: SLIDE_H - 0.04, w: SLIDE_W, h: 0.04,
    fill: { color: accentColor },
  });
}

function createMetricsSlide(
  pres: PptxGenJS,
  sectionTitle: string,
  metrics: Metric[],
  footerText: string,
  slideCounter: { current: number; total: number },
  accentColor: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slideCounter.current++;
  addTitleBar(slide, sectionTitle + ' — Key Metrics', slideCounter.current, slideCounter.total, accentColor);

  const perRow = Math.min(metrics.length, 4);
  const cardW = (CONTENT_W - 0.25 * (perRow - 1)) / perRow;

  metrics.slice(0, 12).forEach((metric, idx) => {
    const col = idx % perRow;
    const row = Math.floor(idx / perRow);
    if (row >= 3) return;

    const mx = MARGIN_X + col * (cardW + 0.25);
    const my = CONTENT_TOP + 0.1 + row * 1.7;

    slide.addShape('roundRect' as PptxGenJS.SHAPE_NAME, {
      x: mx, y: my, w: cardW, h: 1.4,
      fill: { color: THEME.bgCard }, rectRadius: 0.08,
    });
    slide.addText(metric.label, {
      x: mx + 0.15, y: my + 0.1, w: cardW - 0.3, h: 0.3,
      fontSize: 10, color: THEME.gray, fontFace: FONT_FACE,
    });
    slide.addText(metric.value, {
      x: mx + 0.15, y: my + 0.4, w: cardW - 0.3, h: 0.5,
      fontSize: 22, color: resolveColor(metric.color), bold: true, fontFace: FONT_FACE,
    });
    if (metric.change) {
      slide.addText(metric.change, {
        x: mx + 0.15, y: my + 0.95, w: cardW - 0.3, h: 0.25,
        fontSize: 9, color: metric.change.startsWith('-') ? THEME.green : THEME.red, fontFace: FONT_FACE,
      });
    }
  });

  addFooter(slide, footerText);
}

function createFindingsSlide(
  pres: PptxGenJS,
  sectionTitle: string,
  findings: Finding[],
  footerText: string,
  slideCounter: { current: number; total: number },
  accentColor: string,
): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  slideCounter.current++;
  addTitleBar(slide, sectionTitle + ' — Findings', slideCounter.current, slideCounter.total, accentColor);

  const colW = [1.4, 2.8, 4.2, 3.43];
  const headerRow: PptxGenJS.TableCell[] = [
    { text: 'Severity', options: { bold: true, color: THEME.bgCard, fill: { color: accentColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, align: 'center' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
    { text: 'Finding', options: { bold: true, color: THEME.bgCard, fill: { color: accentColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
    { text: 'Description', options: { bold: true, color: THEME.bgCard, fill: { color: accentColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
    { text: 'Action', options: { bold: true, color: THEME.bgCard, fill: { color: accentColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
  ];

  const dataRows: PptxGenJS.TableRow[] = findings.map((f, idx) => {
    const bgColor = idx % 2 === 0 ? THEME.bgLight : THEME.bgCard;
    const sevColor = SEVERITY_COLORS[f.severity] || THEME.gray;
    return [
      { text: f.severity.toUpperCase(), options: { color: sevColor, fill: { color: bgColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, bold: true, align: 'center' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
      { text: f.title, options: { color: THEME.white, fill: { color: bgColor }, fontSize: FONT_TABLE, fontFace: FONT_FACE, bold: true, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
      { text: f.description, options: { color: THEME.grayLight, fill: { color: bgColor }, fontSize: FONT_SMALL, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
      { text: f.action || '-', options: { color: THEME.grayLight, fill: { color: bgColor }, fontSize: FONT_SMALL, fontFace: FONT_FACE, align: 'left' as PptxGenJS.HAlign, margin: [2, 3, 2, 3] as [number, number, number, number] } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: MARGIN_X, y: CONTENT_TOP + 0.05, w: CONTENT_W, colW,
    border: { type: 'solid', pt: 0.5, color: THEME.bgCard },
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: 0.5,
  });

  addFooter(slide, footerText);
}

function createClosingSlide(pres: PptxGenJS, generatedAt: string): void {
  const slide = pres.addSlide();
  applyBackground(slide);

  // Top accent
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: 0, w: SLIDE_W, h: 0.06,
    fill: { color: THEME.cyan },
  });

  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: MARGIN_X, y: 2.8, w: 0.08, h: 1.8,
    fill: { color: THEME.cyan },
  });

  slide.addText('Thank You', {
    x: MARGIN_X + 0.3, y: 2.8, w: CONTENT_W, h: 0.9,
    fontSize: 34, color: THEME.white, bold: true, fontFace: FONT_FACE,
  });

  slide.addText(`Generated by AWSops Dashboard  |  ${generatedAt}`, {
    x: MARGIN_X + 0.3, y: 3.8, w: CONTENT_W, h: 0.5,
    fontSize: 13, color: THEME.gray, fontFace: FONT_FACE,
  });

  // Bottom bar
  slide.addShape('rect' as PptxGenJS.SHAPE_NAME, {
    x: 0, y: SLIDE_H - 0.06, w: SLIDE_W, h: 0.06,
    fill: { color: THEME.cyan },
  });
}

// ---------------------------------------------------------------------------
// Pre-count total slides for numbering
// ---------------------------------------------------------------------------

function estimateTotalSlides(input: ReportInput): number {
  let count = 1; // cover
  if (input.healthScore !== undefined || input.totalSavings) count++; // exec summary

  for (const section of input.sections) {
    count++; // section divider
    if (section.metrics && section.metrics.length > 0) count++;
    if (section.content) {
      const blocks = splitIntoBlocks(section.content);
      const layouts = planSlideLayouts(blocks, !!extractSummary(blocks));
      count += layouts.length;
    }
    if (section.findings && section.findings.length > 0) count++;
  }

  count++; // closing
  return count;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateReportPptx(input: ReportInput): Promise<Buffer> {
  const pres = new PptxGenJS();

  pres.defineLayout({ name: 'WIDE_16x9', width: SLIDE_W, height: SLIDE_H });
  pres.layout = 'WIDE_16x9';
  pres.author = 'AWSops Dashboard';
  pres.title = input.title;

  const footerText = input.accountAlias
    ? `AWSops Dashboard  |  ${input.accountAlias}  |  ${input.generatedAt}`
    : `AWSops Dashboard  |  ${input.generatedAt}`;

  const totalSlides = estimateTotalSlides(input);
  const slideCounter = { current: 0, total: totalSlides };

  // 1. Cover slide
  createCoverSlide(pres, input);

  // 2. Executive summary
  if (input.healthScore !== undefined || input.totalSavings) {
    createExecutiveSummarySlide(pres, input);
  }

  // 3. Section slides
  for (let si = 0; si < input.sections.length; si++) {
    const section = input.sections[si];
    const sectionKey = section.section || '';
    const accentColor = getSectionAccent(sectionKey);

    // 3a. Section divider
    createSectionDividerSlide(pres, section, si, input.sections.length, accentColor);

    // 3b. Metrics slide
    if (section.metrics && section.metrics.length > 0) {
      createMetricsSlide(pres, section.title, section.metrics, footerText, slideCounter, accentColor);
    }

    // 3c. Content slides (new layout engine)
    createSectionContentSlides(pres, section, footerText, slideCounter, accentColor);

    // 3d. Findings slide
    if (section.findings && section.findings.length > 0) {
      createFindingsSlide(pres, section.title, section.findings, footerText, slideCounter, accentColor);
    }
  }

  // 4. Closing slide
  createClosingSlide(pres, input.generatedAt);

  const output = await pres.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
