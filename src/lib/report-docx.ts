import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, PageNumber,
  Header, Footer, TableOfContents, ShadingType, NumberFormat,
  type IRunOptions,
} from 'docx';
import type { ReportInput } from './report-pptx';

// ---------------------------------------------------------------------------
// Theme (light document — professional dark text on white)
// ---------------------------------------------------------------------------
const COLORS = {
  primary: '0a0e1a',    // navy — headings
  accent: '0077B6',     // blue — h2/h3/links
  accentGreen: '059669', // green
  accentOrange: 'D97706',
  accentRed: 'DC2626',
  text: '1f2937',       // dark gray body
  textLight: '6b7280',  // gray — captions
  tableBorder: 'd1d5db',
  tableHeaderBg: 'e5e7eb',
  tableStripeBg: 'f9fafb',
};

const SECTION_DOC_COLORS: Record<string, string> = {
  'executive-summary': COLORS.accent,
  'cost-overview': COLORS.accentGreen,
  'cost-compute': COLORS.accentGreen,
  'cost-network': COLORS.accentGreen,
  'cost-storage': COLORS.accentGreen,
  'idle-resources': COLORS.accentOrange,
  'security-posture': COLORS.accentRed,
  'network-architecture': '7C3AED',
  'compute-analysis': COLORS.accent,
  'eks-analysis': '7C3AED',
  'database-analysis': COLORS.accent,
  'msk-analysis': COLORS.accentOrange,
  'storage-analysis': COLORS.accent,
  'recommendations': COLORS.accentGreen,
  'appendix': COLORS.textLight,
};

// ---------------------------------------------------------------------------
// Markdown Parsing (reuse logic from report-pptx.ts)
// ---------------------------------------------------------------------------

type LineType = 'h1' | 'h2' | 'h3' | 'h4' | 'text' | 'bullet' | 'table-row' | 'table-sep' | 'blockquote' | 'divider' | 'checkbox';

interface ParsedLine {
  type: LineType;
  raw: string;
  cells?: string[];
  checked?: boolean;
}

function classifyLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#### ')) return { type: 'h4', raw: trimmed.replace(/^####\s+/, '') };
  if (trimmed.startsWith('### '))  return { type: 'h3', raw: trimmed.replace(/^###\s+/, '') };
  if (trimmed.startsWith('## '))   return { type: 'h2', raw: trimmed.replace(/^##\s+/, '') };
  if (trimmed.startsWith('# '))    return { type: 'h1', raw: trimmed.replace(/^#\s+/, '') };
  if (/^[-]{3,}$/.test(trimmed) || /^[*]{3,}$/.test(trimmed)) return { type: 'divider', raw: '' };
  if (trimmed.startsWith('|') && trimmed.endsWith('|') && /^[|:\s-]+$/.test(trimmed)) return { type: 'table-sep', raw: trimmed };
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
    return { type: 'table-row', raw: trimmed, cells };
  }
  if (trimmed.startsWith('> ')) return { type: 'blockquote', raw: trimmed.replace(/^>\s*/, '') };
  if (/^- \[([ xX])\]\s/.test(trimmed)) {
    return { type: 'checkbox', raw: trimmed.replace(/^- \[[ xX]\]\s*/, ''), checked: trimmed[3] !== ' ' };
  }
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return { type: 'bullet', raw: trimmed.replace(/^[-*]\s+/, '') };
  return { type: 'text', raw: trimmed };
}

/** Parse inline markdown to TextRun array */
function parseInline(text: string, baseOpts: Partial<IRunOptions> = {}): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/;
  const parts = text.split(pattern);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, ...baseOpts }));
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: 'Consolas', size: 18, color: COLORS.accent, ...baseOpts }));
    } else if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, ...baseOpts }));
    } else {
      runs.push(new TextRun({ text: part, ...baseOpts }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, ...baseOpts })];
}

function stripMd(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

// ---------------------------------------------------------------------------
// Document Element Builders
// ---------------------------------------------------------------------------

function buildHeading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], color: string = COLORS.primary): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: stripMd(text), color, bold: true })],
  });
}

function buildParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: parseInline(text, { size: 20, color: COLORS.text }),
  });
}

function buildBullet(text: string, level: number = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 40 },
    children: parseInline(text, { size: 20, color: COLORS.text }),
  });
}

function buildBlockquote(text: string): Paragraph {
  return new Paragraph({
    indent: { left: 400 },
    spacing: { before: 80, after: 80 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: COLORS.accent, space: 8 },
    },
    children: parseInline(text, { size: 20, color: COLORS.textLight, italics: true }),
  });
}

function buildDivider(): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
    },
    children: [new TextRun({ text: '' })],
  });
}

function buildTable(lines: ParsedLine[]): Table {
  const rows = lines.filter(l => l.type === 'table-row' && l.cells);
  if (rows.length === 0) {
    return new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('')] })] })] });
  }

  const headerCells = rows[0].cells!;
  const dataCells = rows.slice(1);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerCells.map(cell =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: COLORS.tableHeaderBg },
        children: [new Paragraph({
          children: [new TextRun({ text: stripMd(cell), bold: true, size: 18, color: COLORS.primary })],
        })],
        width: { size: Math.floor(100 / headerCells.length), type: WidthType.PERCENTAGE },
      }),
    ),
  });

  const dataRows = dataCells.map((line, idx) =>
    new TableRow({
      children: (line.cells || []).map(cell =>
        new TableCell({
          shading: idx % 2 === 0 ? undefined : { type: ShadingType.SOLID, color: COLORS.tableStripeBg },
          children: [new Paragraph({
            children: parseInline(cell, { size: 18, color: COLORS.text }),
          })],
        }),
      ),
    }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.tableBorder },
    },
  });
}

// ---------------------------------------------------------------------------
// Section Content Converter
// ---------------------------------------------------------------------------

function convertSectionContent(content: string, sectionColor: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const parsed = classifyLine(lines[i]);
    if (!parsed) { i++; continue; }

    switch (parsed.type) {
      case 'h1':
        // Skip — section title is already the heading
        break;

      case 'h2':
        elements.push(buildHeading(parsed.raw, HeadingLevel.HEADING_2, sectionColor));
        break;

      case 'h3':
        elements.push(buildHeading(parsed.raw, HeadingLevel.HEADING_3, sectionColor));
        break;

      case 'h4':
        elements.push(new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: stripMd(parsed.raw), bold: true, size: 20, color: COLORS.text })],
        }));
        break;

      case 'blockquote':
        elements.push(buildBlockquote(parsed.raw));
        break;

      case 'bullet':
        elements.push(buildBullet(parsed.raw));
        break;

      case 'checkbox':
        elements.push(buildBullet((parsed.checked ? '☑ ' : '☐ ') + parsed.raw));
        break;

      case 'divider':
        elements.push(buildDivider());
        break;

      case 'table-row':
      case 'table-sep': {
        // Collect consecutive table lines
        const tableLines: ParsedLine[] = [];
        while (i < lines.length) {
          const tl = classifyLine(lines[i]);
          if (!tl || (tl.type !== 'table-row' && tl.type !== 'table-sep')) break;
          if (tl.type === 'table-row') tableLines.push(tl);
          i++;
        }
        if (tableLines.length > 0) {
          elements.push(buildTable(tableLines));
          elements.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
        }
        continue; // skip i++ at bottom
      }

      case 'text':
        elements.push(buildParagraph(parsed.raw));
        break;
    }

    i++;
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Cover Page
// ---------------------------------------------------------------------------

function buildCoverPage(input: ReportInput): Paragraph[] {
  const elements: Paragraph[] = [];

  // Spacer
  elements.push(new Paragraph({ spacing: { before: 2000 }, children: [] }));

  // Title
  elements.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 200 },
    children: [new TextRun({ text: input.title, bold: true, size: 56, color: COLORS.primary })],
  }));

  // Accent line
  elements.push(new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent } },
    children: [new TextRun({ text: '' })],
  }));

  // Subtitle
  if (input.subtitle) {
    elements.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: input.subtitle, size: 28, color: COLORS.accent })],
    }));
  }

  // Account
  if (input.accountAlias) {
    elements.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: `Account: ${input.accountAlias}`, size: 24, color: COLORS.textLight })],
    }));
  }

  // Date
  elements.push(new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: input.generatedAt, size: 22, color: COLORS.textLight })],
  }));

  // Health Score
  if (input.healthScore !== undefined) {
    elements.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
    const scoreColor = input.healthScore >= 80 ? COLORS.accentGreen : input.healthScore >= 50 ? COLORS.accentOrange : COLORS.accentRed;
    elements.push(new Paragraph({
      children: [
        new TextRun({ text: 'Health Score: ', size: 28, color: COLORS.textLight }),
        new TextRun({ text: `${input.healthScore}/100`, bold: true, size: 36, color: scoreColor }),
      ],
    }));
  }

  // Page break
  elements.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  return elements;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export async function generateReportDocx(input: ReportInput): Promise<Buffer> {
  const sectionElements: (Paragraph | Table)[] = [];

  // Cover page
  sectionElements.push(...buildCoverPage(input));

  // Table of Contents
  sectionElements.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32, color: COLORS.primary })],
  }));
  sectionElements.push(new TableOfContents('TOC', {
    hyperlink: true,
    headingStyleRange: '1-3',
  }));
  sectionElements.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  // Sections
  for (let si = 0; si < input.sections.length; si++) {
    const section = input.sections[si];
    const sectionKey = section.section || '';
    const color = SECTION_DOC_COLORS[sectionKey] || COLORS.accent;

    // Section heading (Heading 1)
    sectionElements.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 160 },
      ...(si > 0 ? { pageBreakBefore: true } : {}),
      children: [
        new TextRun({ text: `${si + 1}. `, color: COLORS.textLight, bold: true, size: 28 }),
        new TextRun({ text: section.title, bold: true, size: 28, color }),
      ],
    }));

    // Accent line under heading
    sectionElements.push(new Paragraph({
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color } },
      children: [new TextRun({ text: '' })],
    }));

    // Section content
    if (section.content) {
      const contentElements = convertSectionContent(section.content, color);
      sectionElements.push(...contentElements);
    }
  }

  // Build document
  const doc = new Document({
    creator: 'AWSops Dashboard',
    title: input.title,
    description: input.subtitle || 'AWS Infrastructure Diagnosis Report',
    styles: {
      default: {
        document: {
          run: { font: 'Segoe UI', size: 20, color: COLORS.text },
          paragraph: { spacing: { line: 276 } },
        },
        heading1: {
          run: { font: 'Segoe UI', size: 28, bold: true, color: COLORS.primary },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading2: {
          run: { font: 'Segoe UI', size: 24, bold: true, color: COLORS.accent },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading3: {
          run: { font: 'Segoe UI', size: 22, bold: true, color: COLORS.accent },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      },
    },
    numbering: {
      config: [{
        reference: 'default-bullet',
        levels: [{
          level: 0,
          format: NumberFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 200 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: input.title, size: 16, color: COLORS.textLight, italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'AWSops Dashboard  |  Page ', size: 16, color: COLORS.textLight }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.textLight }),
            ],
          })],
        }),
      },
      children: sectionElements,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer as Buffer;
}
