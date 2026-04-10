// AWSops AI Diagnosis Report — Server-side PDF generation via Puppeteer
// Puppeteer를 사용한 서버사이드 PDF 생성 (사이드바 없는 순수 보고서)
import puppeteer from 'puppeteer-core';
import { marked } from 'marked';
import * as fs from 'fs';
import * as path from 'path';
import type { ReportInput } from './report-pptx';

function findChromePath(): string {
  const home = process.env.HOME || '/home/ec2-user';
  // Priority: Playwright ARM64 Chromium > Puppeteer cache
  const candidates = [
    // Playwright ARM64 Chromium (installed via npx playwright install chromium)
    path.join(home, '.cache', 'ms-playwright', 'chromium-1217', 'chrome-linux', 'chrome'),
  ];
  // Also search for any Playwright Chromium version
  const pwDir = path.join(home, '.cache', 'ms-playwright');
  if (fs.existsSync(pwDir)) {
    for (const entry of fs.readdirSync(pwDir)) {
      if (entry.startsWith('chromium-')) {
        candidates.push(path.join(pwDir, entry, 'chrome-linux', 'chrome'));
      }
    }
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const CHROME_PATH = findChromePath();

const SECTION_ICONS: Record<string, string> = {
  'executive-summary': '\u{1F4CA}', 'cost-overview': '\u{1F4B0}', 'cost-compute': '\u{1F5A5}\uFE0F',
  'cost-network': '\u{1F310}', 'cost-storage': '\u{1F4BE}', 'idle-resources': '\u{1F5D1}\uFE0F',
  'security-posture': '\u{1F512}', 'network-architecture': '\u{1F500}', 'compute-analysis': '\u26A1',
  'eks-analysis': '\u2638\uFE0F', 'database-analysis': '\u{1F5C4}\uFE0F', 'msk-analysis': '\u{1F4E1}',
  'storage-analysis': '\u{1F4E6}', 'recommendations': '\u{1F3AF}', 'appendix': '\u{1F4CB}',
};

function renderSectionHtml(section: { section?: string; title: string; content: string }, index: number): string {
  const icon = section.section ? (SECTION_ICONS[section.section] || '') : '';
  const htmlContent = marked.parse(section.content, { gfm: true, breaks: false }) as string;
  const pageBreak = index > 0 ? 'page-break-before: always;' : '';

  return `
    <div style="${pageBreak}">
      <div style="display:flex; align-items:center; gap:10px; margin-top:32px; margin-bottom:12px;">
        <span style="font-size:20px;">${icon}</span>
        <h2 style="font-size:18px; font-weight:700; color:#111827; margin:0;">${index + 1}. ${section.title}</h2>
      </div>
      <div style="width:48px; height:2px; background:#2563eb; margin-bottom:16px;"></div>
      <div class="md-content">${htmlContent}</div>
    </div>`;
}

function buildFullHtml(input: ReportInput): string {
  const dateStr = new Date(input.generatedAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const tocItems = input.sections.map((s, i) =>
    `<div style="display:flex; align-items:center; gap:10px; padding:3px 0;">
      <span style="color:#9ca3af; font-family:monospace; width:24px;">${i + 1}.</span>
      <span>${s.section ? (SECTION_ICONS[s.section] || '') : ''}</span>
      <span style="color:#374151;">${s.title}</span>
    </div>`
  ).join('\n');

  const sectionsHtml = input.sections.map((s, i) => renderSectionHtml(s, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 1.5cm 2cm; size: A4; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
    color: #1f2937; background: white; margin: 0; padding: 40px;
    line-height: 1.6; font-size: 13px;
  }

  /* Markdown content styles */
  .md-content h1 { font-size: 16px; font-weight: 700; color: #111827; margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .md-content h2 { font-size: 14px; font-weight: 700; color: #1d4ed8; margin: 16px 0 8px; }
  .md-content h3 { font-size: 13px; font-weight: 600; color: #1f2937; margin: 12px 0 6px; }
  .md-content h4 { font-size: 13px; font-weight: 600; color: #374151; margin: 8px 0 4px; }
  .md-content p { margin: 0 0 8px; color: #374151; line-height: 1.7; }
  .md-content strong { color: #111827; font-weight: 600; }
  .md-content em { color: #4b5563; }
  .md-content code { background: #f3f4f6; color: #1d4ed8; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-family: 'Fira Code', monospace; }
  .md-content pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin: 8px 0; overflow-x: auto; font-size: 11px; }
  .md-content pre code { background: none; color: #374151; padding: 0; }

  .md-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  .md-content thead { background: #f3f4f6; }
  .md-content th { padding: 8px 10px; text-align: left; font-weight: 600; color: #374151; border: 1px solid #d1d5db; font-size: 11px; }
  .md-content td { padding: 6px 10px; color: #374151; border: 1px solid #d1d5db; font-size: 11px; }
  .md-content tr:nth-child(even) { background: #f9fafb; }

  .md-content ul { list-style: disc; padding-left: 20px; margin: 4px 0 8px; }
  .md-content ol { list-style: decimal; padding-left: 20px; margin: 4px 0 8px; }
  .md-content li { margin: 2px 0; color: #374151; }
  .md-content blockquote { border-left: 4px solid #60a5fa; background: #eff6ff; padding: 8px 12px; margin: 8px 0; border-radius: 0 4px 4px 0; color: #4b5563; font-style: italic; }
  .md-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
  .md-content a { color: #2563eb; text-decoration: underline; }
</style>
</head>
<body>

<!-- Cover -->
<div style="padding-top:48px; margin-bottom:48px;">
  <div style="width:64px; height:4px; background:#2563eb; margin-bottom:24px;"></div>
  <h1 style="font-size:28px; font-weight:700; color:#111827; margin:0 0 8px;">${input.title}</h1>
  <p style="font-size:16px; color:#2563eb; margin:0 0 4px;">AWS Infrastructure Comprehensive Analysis</p>
  ${input.accountAlias ? `<p style="font-size:13px; color:#6b7280; margin:0 0 4px;">Account: ${input.accountAlias}</p>` : ''}
  <p style="font-size:13px; color:#9ca3af;">${dateStr}</p>
</div>

<!-- Table of Contents -->
<div style="page-break-before:always; margin-bottom:32px;">
  <h2 style="font-size:18px; font-weight:700; color:#111827; border-bottom:2px solid #2563eb; padding-bottom:8px; margin-bottom:16px;">Table of Contents</h2>
  ${tocItems}
</div>

<!-- Sections -->
${sectionsHtml}

<!-- Footer -->
<div style="margin-top:64px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:11px; color:#9ca3af;">
  Generated by AWSops Dashboard
</div>

</body>
</html>`;
}

export async function generateReportPdf(input: ReportInput): Promise<Buffer> {
  const html = buildFullHtml(input);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', bottom: '1.5cm', left: '2cm', right: '2cm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:9px; color:#9ca3af; padding:0 2cm;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });

    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}
