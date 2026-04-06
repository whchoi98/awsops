'use client';

import { useState, useEffect, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';

interface ReportSection {
  section: string;
  title: string;
  content: string;
}

const SECTION_ICONS: Record<string, string> = {
  'executive-summary': '\u{1F4CA}', 'cost-overview': '\u{1F4B0}', 'cost-compute': '\u{1F5A5}\uFE0F',
  'cost-network': '\u{1F310}', 'cost-storage': '\u{1F4BE}', 'idle-resources': '\u{1F5D1}\uFE0F',
  'security-posture': '\u{1F512}', 'network-architecture': '\u{1F500}', 'compute-analysis': '\u26A1',
  'eks-analysis': '\u2638\uFE0F', 'database-analysis': '\u{1F5C4}\uFE0F', 'msk-analysis': '\u{1F4E1}',
  'storage-analysis': '\u{1F4E6}', 'recommendations': '\u{1F3AF}', 'appendix': '\u{1F4CB}',
};

export default function PrintReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>}>
      <PrintReportContent />
    </Suspense>
  );
}

function PrintReportContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [title] = useState('AWSops Diagnosis Report');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState('');

  useEffect(() => {
    if (!reportId) { setError('No report ID'); setLoading(false); return; }
    fetch(`/awsops/api/report?action=status&id=${reportId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'completed' && data.sections) {
          setSections(data.sections);
          setReportDate(data.completedAt || '');
        } else {
          setError('Report not available');
        }
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading report...</div>;
  if (error) return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>;

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page-break { break-before: page; }
          .print-section { break-inside: avoid; }
          @page { margin: 1.5cm 2cm; size: A4; }
        }
        @media screen {
          .print-report { max-width: 900px; margin: 0 auto; padding: 2rem; }
        }
      `}</style>

      {/* Print button (hidden in print) */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
        >
          <Printer size={16} /> Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-lg hover:bg-gray-300 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="print-report bg-white text-gray-900 min-h-screen">
        {/* Cover */}
        <div className="mb-12 pt-16">
          <div className="w-16 h-1 bg-blue-600 mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-lg text-blue-600 mb-1">AWS Infrastructure Comprehensive Analysis</p>
          {reportDate && (
            <p className="text-sm text-gray-500">{new Date(reportDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          )}
        </div>

        {/* Table of Contents */}
        <div className="mb-8 print-page-break">
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b-2 border-blue-600 pb-2">Table of Contents</h2>
          <div className="space-y-1.5">
            {sections.map((s, i) => (
              <div key={s.section} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 font-mono w-6">{i + 1}.</span>
                <span>{SECTION_ICONS[s.section] || ''}</span>
                <a href={`#print-${s.section}`} className="text-gray-700 hover:text-blue-600">
                  {s.title}
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, i) => (
          <div key={section.section} id={`print-${section.section}`} className={i > 0 ? 'print-page-break' : ''}>
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-4 mt-8">
              <span className="text-xl">{SECTION_ICONS[section.section] || ''}</span>
              <h2 className="text-xl font-bold text-gray-900">{i + 1}. {section.title}</h2>
            </div>
            <div className="w-12 h-0.5 bg-blue-600 mb-4" />

            {/* Content — styled for print */}
            <div className="print-md text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 mt-5 mb-2 border-b border-gray-200 pb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold text-blue-700 mt-4 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-3 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1 h-3.5 bg-blue-500 rounded-full inline-block" />{children}
                  </h3>,
                  h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-700 mt-2 mb-1">{children}</h4>,
                  p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
                  strong: ({ children }) => <strong className="text-gray-900 font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="text-gray-600">{children}</em>,
                  code: ({ children, className }) => {
                    if (className?.includes('language-')) return <code className="text-xs text-gray-700">{children}</code>;
                    return <code className="bg-gray-100 text-blue-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
                  },
                  pre: ({ children }) => <pre className="bg-gray-50 border border-gray-200 rounded p-3 my-2 overflow-x-auto text-xs">{children}</pre>,
                  table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full text-xs border-collapse border border-gray-300">{children}</table></div>,
                  thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
                  th: ({ children }) => <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-gray-700 border border-gray-300">{children}</th>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  tr: ({ children }) => <tr className="even:bg-gray-50">{children}</tr>,
                  td: ({ children }) => <td className="px-2.5 py-1.5 text-xs text-gray-700 border border-gray-300">{children}</td>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-gray-700 mb-2 ml-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-gray-700 mb-2 ml-2">{children}</ol>,
                  li: ({ children }) => <li className="text-sm">{children}</li>,
                  a: ({ href, children }) => <a href={href} className="text-blue-600 underline">{children}</a>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-blue-400 bg-blue-50 px-3 py-2 my-2 text-sm italic text-gray-600 rounded-r">{children}</blockquote>,
                  hr: () => <hr className="border-gray-200 my-3" />,
                }}
              >
                {section.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-16 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          Generated by AWSops Dashboard
        </div>
      </div>
    </>
  );
}
