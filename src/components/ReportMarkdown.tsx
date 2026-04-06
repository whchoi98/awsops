'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReportMarkdownProps {
  content: string;
  accentColor?: string;  // Tailwind class like 'text-accent-cyan'
}

/** Styled markdown renderer for diagnosis report sections.
 *  Uses explicit component overrides (not @tailwindcss/typography prose classes).
 */
export default function ReportMarkdown({ content, accentColor = 'text-accent-cyan' }: ReportMarkdownProps) {
  return (
    <div className="text-sm leading-relaxed break-words report-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-white mt-6 mb-3 pb-2 border-b border-navy-600">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={`text-lg font-bold ${accentColor} mt-5 mb-2 pb-1.5 border-b border-navy-600/50`}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-white mt-4 mb-2 flex items-center gap-2">
              <span className={`w-1 h-4 rounded-full bg-current ${accentColor} inline-block`} />
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-gray-200 mt-3 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-sm text-gray-300 mb-2.5 leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="text-white font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-gray-300 italic">{children}</em>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return <code className="text-xs text-gray-300">{children}</code>;
            }
            return (
              <code className="bg-navy-900 text-accent-cyan px-1.5 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-navy-900 rounded-lg p-3 my-3 overflow-x-auto text-xs font-mono border border-navy-600">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-navy-600">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-navy-700">{children}</thead>
          ),
          th: ({ children }) => (
            <th className={`px-3 py-2 text-left ${accentColor} font-semibold text-xs border-b border-navy-600`}>
              {children}
            </th>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-navy-700">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-navy-700/30 transition-colors even:bg-navy-800/50">
              {children}
            </tr>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-gray-300 text-sm">{children}</td>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 text-gray-300 mb-3 ml-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1.5 text-gray-300 mb-3">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed flex items-start gap-2">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full bg-current ${accentColor} flex-shrink-0 opacity-60`} />
              <span className="flex-1">{children}</span>
            </li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-accent-cyan hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className={`border-l-4 border-accent-cyan/50 bg-navy-700/30 rounded-r-lg px-4 py-2.5 my-3 text-sm italic text-gray-300`}>
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-navy-600 my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
