'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Database, Copy, Check, Activity, History, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';


interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  queriedResources?: string[];
  usedTools?: string[];   // 사용된 MCP 도구 목록 / Used MCP tools list
  via?: string;           // Routing path display / 라우팅 경로 표시
  route?: string;         // Classified intent route / 분류된 의도 라우트
  statusMessage?: string; // SSE progress status / SSE 진행 상태 메시지
  responseTime?: number;  // Response time in seconds / 응답 시간 (초)
  inputTokens?: number;   // Bedrock input token count / 입력 토큰 수
  outputTokens?: number;  // Bedrock output token count / 출력 토큰 수
}

// Bedrock pricing (USD per 1M tokens) / Bedrock 가격 (USD / 100만 토큰)
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'sonnet-4.6': { input: 3, output: 15 },
  'opus-4.6': { input: 15, output: 75 },
};

function calcTokenCost(model: string, inputTokens: number, outputTokens: number): string {
  const pricing = TOKEN_PRICING[model] || TOKEN_PRICING['sonnet-4.6'];
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  return cost < 0.001 ? `$${cost.toFixed(5)}` : `$${cost.toFixed(4)}`;
}

export default function AIPage() {
  const { lang, t } = useLanguage();
  const { currentAccountId } = useAccountContext();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<'sonnet-4.6' | 'opus-4.6'>('sonnet-4.6');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [streamingContent, setStreamingContent] = useState(''); // Accumulates streaming chunks / 스트리밍 청크 누적
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 대화 이력 로드 / Load conversation history
  const loadHistory = () => {
    fetch('/awsops/api/agentcore?action=conversations&limit=30')
      .then(r => r.json())
      .then(d => setHistoryData(d.conversations || []))
      .catch(() => {});
  };

  // 히스토리는 토글 시에만 로드 (마운트 시 불필요) / Only load on toggle, not mount

  // Session stats from chat messages / 채팅 메시지에서 세션 통계
  const sessionStats = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.via);
    const routeCounts: Record<string, number> = {};
    let totalTime = 0;
    let successCount = 0;

    assistantMsgs.forEach(m => {
      if (m.route) routeCounts[m.route] = (routeCounts[m.route] || 0) + 1;
      if (m.responseTime) totalTime += m.responseTime;
      if (!m.content?.startsWith('Error')) successCount++;
    });

    return {
      totalQueries: assistantMsgs.length,
      avgResponseTime: assistantMsgs.length > 0 ? (totalTime / assistantMsgs.length).toFixed(1) : '0',
      successRate: assistantMsgs.length > 0 ? Math.round((successCount / assistantMsgs.length) * 100) : 100,
      routeCounts,
      topRoute: Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
    };
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStreamingContent('');
    setStatusMessage(`🔍 ${t('ai.analyzing')}`);
    const startTime = Date.now();

    try {
      const res = await fetch('/awsops/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          model,
          stream: true,
          lang,
          accountId: currentAccountId,
        }),
      });

      if (!res.ok) {
        setMessages([...newMessages, { role: 'assistant', content: `Error: Server error (${res.status}). Please try again.`, model }]);
        return;
      }

      const contentType = res.headers.get('content-type') || '';

      // SSE streaming mode / SSE 스트리밍 모드
      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer / 버퍼에서 SSE 이벤트 파싱
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === 'status') {
                  setStatusMessage(data.message || '');
                } else if (eventType === 'chunk') {
                  // Incremental streaming: accumulate content / 점진적 스트리밍: 콘텐츠 누적
                  setStreamingContent(prev => prev + (data.delta || ''));
                } else if (eventType === 'done') {
                  setStreamingContent(''); // Clear streaming buffer / 스트리밍 버퍼 초기화
                  setMessages([...newMessages, {
                    role: 'assistant', content: data.content,
                    model: data.model, queriedResources: data.queriedResources,
                    usedTools: data.usedTools,
                    via: data.via, route: data.route,
                    responseTime: Math.round((Date.now() - startTime) / 100) / 10,
                    inputTokens: data.inputTokens, outputTokens: data.outputTokens,
                  }]);
                } else if (eventType === 'error') {
                  setMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error}`, model }]);
                }
              } catch {}
              eventType = '';
            }
          }
        }
      } else if (contentType.includes('application/json')) {
        // Fallback: non-streaming JSON response / 폴백: 비스트리밍 JSON 응답
        const data = await res.json();
        if (data.error) {
          setMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error}`, model }]);
        } else {
          setMessages([...newMessages, {
            role: 'assistant', content: data.content,
            model: data.model, queriedResources: data.queriedResources,
            usedTools: data.usedTools,
            via: data.via, route: data.route,
            responseTime: Math.round((Date.now() - startTime) / 100) / 10,
          }]);
        }
      } else {
        setMessages([...newMessages, { role: 'assistant', content: 'Error: Unexpected response format.', model }]);
      }
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Connection error: ${err.message}`, model }]);
    } finally {
      setLoading(false);
      setStatusMessage('');
      setStreamingContent('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestions = [
    t('ai.suggestion1'),
    t('ai.suggestion2'),
    t('ai.suggestion3'),
    t('ai.suggestion4'),
    t('ai.suggestion5'),
    t('ai.suggestion6'),
    t('ai.suggestion7'),
  ];

  // Follow-up suggestions by route / 라우트별 연관 추천 질문
  const followUpMap: Record<string, string[]> = {
    security: [t('ai.followup.security1'), t('ai.followup.security2'), t('ai.followup.security3')],
    network: [t('ai.followup.network1'), t('ai.followup.network2'), t('ai.followup.network3')],
    container: [t('ai.followup.container1'), t('ai.followup.container2'), t('ai.followup.container3')],
    cost: [t('ai.followup.cost1'), t('ai.followup.cost2'), t('ai.followup.cost3')],
    monitoring: [t('ai.followup.monitoring1'), t('ai.followup.monitoring2'), t('ai.followup.monitoring3')],
    data: [t('ai.followup.data1'), t('ai.followup.data2'), t('ai.followup.data3')],
    'aws-data': [t('ai.followup.awsdata1'), t('ai.followup.awsdata2'), t('ai.followup.awsdata3')],
    iac: [t('ai.followup.iac1'), t('ai.followup.iac2'), t('ai.followup.iac3')],
    code: [t('ai.followup.code1'), t('ai.followup.code2'), t('ai.followup.code3')],
    datasource: [t('ai.followup.datasource1'), t('ai.followup.datasource2'), t('ai.followup.datasource3')],
    'datasource-diag': [t('ai.followup.dsdiag1'), t('ai.followup.dsdiag2'), t('ai.followup.dsdiag3')],
    general: [t('ai.followup.general1'), t('ai.followup.general2'), t('ai.followup.general3')],
  };

  // Get follow-up suggestions from last assistant message / 마지막 응답의 라우트에서 추천 질문 가져오기
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const followUps = lastAssistant?.route ? (followUpMap[lastAssistant.route] || followUpMap['general'] || []) : [];

  return (
    <div className="flex flex-col h-screen">
      {/* Header — matches Dashboard style / 대시보드와 동일 스타일 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-navy-600 bg-navy-800/80 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('ai.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t('ai.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <select value={model} onChange={(e) => setModel(e.target.value as any)}
            className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:ring-accent-cyan focus:border-accent-cyan">
            <option value="sonnet-4.6">Claude Sonnet 4.6</option>
            <option value="opus-4.6">Claude Opus 4.6</option>
          </select>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            {t('common.online')}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-6xl mx-auto space-y-4 h-full flex flex-col">
        {/* Welcome — vertically centered / 수직 가운데 */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="p-4 rounded-2xl bg-accent-cyan/10 mb-4">
              <Sparkles size={40} className="text-accent-cyan" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">{t('ai.welcomeTitle')}</h2>
            <p className="text-sm text-gray-400 text-center mb-2">{t('ai.welcomeDesc1')}</p>
            <p className="text-sm text-gray-400 text-center mb-6">{t('ai.welcomeDesc2')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl w-full">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left px-4 py-3 rounded-lg bg-navy-800 border border-navy-600 text-sm text-gray-300 hover:border-accent-cyan/50 hover:text-white transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="shrink-0 w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center mt-1">
                <Bot size={16} className="text-accent-cyan" />
              </div>
            )}
            <div className={`w-full max-w-5xl rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-accent-cyan/10 border border-accent-cyan/20 text-gray-200'
                : 'bg-navy-800 border border-navy-600 text-gray-300'
            }`}>
              {/* Render markdown */}
              <div className="text-sm leading-relaxed break-words markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({children}) => <h1 className="text-xl font-bold text-white mt-4 mb-2">{children}</h1>,
                    h2: ({children}) => <h2 className="text-lg font-bold text-white mt-3 mb-2">{children}</h2>,
                    h3: ({children}) => <h3 className="text-base font-semibold text-white mt-3 mb-1">{children}</h3>,
                    p: ({children}) => <p className="text-gray-300 mb-2">{children}</p>,
                    strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
                    em: ({children}) => <em className="text-gray-300">{children}</em>,
                    code: ({children, className}) => {
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return <code className="text-xs text-gray-300">{children}</code>;
                      }
                      return <code className="bg-navy-900 text-accent-cyan px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
                    },
                    pre: ({children}) => <pre className="bg-navy-900 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
                    table: ({children}) => <div className="overflow-x-auto my-2"><table className="w-full text-xs">{children}</table></div>,
                    thead: ({children}) => <thead className="bg-navy-900">{children}</thead>,
                    th: ({children}) => <th className="px-3 py-2 text-left text-accent-cyan font-mono uppercase text-[10px] border-b border-navy-600">{children}</th>,
                    td: ({children}) => <td className="px-3 py-1.5 border-b border-navy-600/50 text-gray-300">{children}</td>,
                    ul: ({children}) => <ul className="list-disc list-inside space-y-1 text-gray-300 mb-2">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal list-inside space-y-1 text-gray-300 mb-2">{children}</ol>,
                    li: ({children}) => <li>{children}</li>,
                    a: ({href, children}) => <a href={href} className="text-accent-cyan hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                    blockquote: ({children}) => <blockquote className="border-l-2 border-accent-cyan pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
                    hr: () => <hr className="border-navy-600 my-3" />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              {msg.role === 'assistant' && (msg.model || msg.via) && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-navy-600/50">
                  <div className="flex items-center gap-3 text-xs font-mono">
                    {msg.via && <span className="text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded">{msg.via}</span>}
                    {msg.model && <span className="text-gray-400">Claude {msg.model}</span>}
                    {msg.responseTime && <span className="text-gray-500">{msg.responseTime}s</span>}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(msg.content); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 2000); }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent-cyan transition-colors px-2 py-1 rounded hover:bg-navy-900"
                    title="Copy to clipboard"
                  >
                    {copiedIdx === i ? <><Check size={12} className="text-accent-green" /> {t('ai.copied')}</> : <><Copy size={12} /> {t('ai.copy')}</>}
                  </button>
                </div>
              )}
              {/* 하단: 사용된 도구 + Queried 리소스 / Bottom: Tools used + Queried resources */}
              {msg.role === 'assistant' && ((msg.usedTools && msg.usedTools.length > 0) || (msg.queriedResources && msg.queriedResources.length > 0)) && (
                <div className="mt-2 pt-2 border-t border-navy-600/30 space-y-1.5">
                  {msg.usedTools && msg.usedTools.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                        {t('ai.tools')}
                      </span>
                      {msg.usedTools.map((tool, ti) => (
                        <span key={ti} className="px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan text-[10px] font-mono border border-accent-cyan/20">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  {msg.queriedResources && msg.queriedResources.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <Database size={10} />
                      {t('ai.queried')} {msg.queriedResources.join(', ')}
                    </div>
                  )}
                </div>
              )}
              {/* Token usage & cost / 토큰 사용량 및 비용 */}
              {msg.role === 'assistant' && (msg.inputTokens || msg.outputTokens) && (
                <div className="mt-2 pt-2 border-t border-navy-600/30 flex items-center gap-3 text-[10px] font-mono text-gray-500">
                  <span className="text-gray-600">{t('ai.tokens')}</span>
                  <span>{t('ai.in')} <span className="text-accent-cyan">{(msg.inputTokens || 0).toLocaleString()}</span></span>
                  <span>{t('ai.out')} <span className="text-accent-green">{(msg.outputTokens || 0).toLocaleString()}</span></span>
                  <span className="text-gray-600">|</span>
                  <span>{t('ai.cost')} <span className="text-accent-orange">{calcTokenCost(msg.model || 'sonnet-4.6', msg.inputTokens || 0, msg.outputTokens || 0)}</span></span>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="shrink-0 w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center mt-1">
                <User size={16} className="text-accent-purple" />
              </div>
            )}
          </div>
        ))}

        {/* Loading: show streaming content or status spinner / 로딩: 스트리밍 콘텐츠 또는 상태 스피너 표시 */}
        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center mt-1">
              <Bot size={16} className="text-accent-cyan" />
            </div>
            <div className="w-full max-w-5xl bg-navy-800 border border-navy-600 rounded-lg px-4 py-3">
              {streamingContent ? (
                <>
                  {/* Real-time streaming markdown / 실시간 스트리밍 마크다운 */}
                  <div className="text-sm leading-relaxed break-words markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({children}) => <h1 className="text-xl font-bold text-white mt-4 mb-2">{children}</h1>,
                        h2: ({children}) => <h2 className="text-lg font-bold text-white mt-3 mb-2">{children}</h2>,
                        h3: ({children}) => <h3 className="text-base font-semibold text-white mt-3 mb-1">{children}</h3>,
                        p: ({children}) => <p className="text-gray-300 mb-2">{children}</p>,
                        strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
                        em: ({children}) => <em className="text-gray-300">{children}</em>,
                        code: ({children, className}) => {
                          const isBlock = className?.includes('language-');
                          if (isBlock) return <code className="text-xs text-gray-300">{children}</code>;
                          return <code className="bg-navy-900 text-accent-cyan px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
                        },
                        pre: ({children}) => <pre className="bg-navy-900 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
                        table: ({children}) => <div className="overflow-x-auto my-2"><table className="w-full text-xs">{children}</table></div>,
                        thead: ({children}) => <thead className="bg-navy-900">{children}</thead>,
                        th: ({children}) => <th className="px-3 py-2 text-left text-accent-cyan font-mono uppercase text-[10px] border-b border-navy-600">{children}</th>,
                        td: ({children}) => <td className="px-3 py-1.5 border-b border-navy-600/50 text-gray-300">{children}</td>,
                        ul: ({children}) => <ul className="list-disc list-inside space-y-1 text-gray-300 mb-2">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal list-inside space-y-1 text-gray-300 mb-2">{children}</ol>,
                        li: ({children}) => <li>{children}</li>,
                        a: ({href, children}) => <a href={href} className="text-accent-cyan hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                        blockquote: ({children}) => <blockquote className="border-l-2 border-accent-cyan pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
                        hr: () => <hr className="border-navy-600 my-3" />,
                      }}
                    >
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                  {/* Streaming indicator / 스트리밍 진행 표시 */}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin" />
                    <span>{statusMessage || t('ai.processing')}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="transition-all duration-300">{statusMessage || t('ai.processing')}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Follow-up suggestions / 연관 추천 질문 */}
        {!loading && followUps.length > 0 && messages.length > 0 && (
          <div className="flex flex-wrap gap-2 py-2">
            {followUps.map((q, i) => (
              <button key={i} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                className="text-xs px-3 py-1.5 rounded-full bg-navy-800 border border-navy-600 text-gray-400 hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors">
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-navy-600 bg-navy-800 p-4">
        <div className="max-w-6xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.placeholder')}
              rows={1}
              className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 resize-none focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none"
              style={{ minHeight: 42, maxHeight: 120 }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          {/* Send */}
          <button onClick={sendMessage} disabled={!input.trim() || loading}
            className={`shrink-0 p-2.5 rounded-lg transition-colors ${
              input.trim() && !loading
                ? 'bg-accent-cyan text-navy-900 hover:bg-accent-cyan/80'
                : 'bg-navy-700 text-gray-500 cursor-not-allowed'
            }`}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Session Stats bar / 세션 통계 바 */}
      {sessionStats.totalQueries > 0 && (
        <div className="border-t border-navy-600 px-6 py-2 bg-navy-900/50 flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <Activity size={11} />
          <span>{sessionStats.totalQueries} {t('ai.queries')}</span>
          <span>{t('ai.avg')} {sessionStats.avgResponseTime}s</span>
          <span className={sessionStats.successRate >= 90 ? 'text-accent-green' : 'text-accent-orange'}>{sessionStats.successRate}%</span>
          {Object.entries(sessionStats.routeCounts).slice(0, 4).map(([route, count]) => (
            <span key={route}><span className="text-accent-cyan">{route}</span>:{count}</span>
          ))}
        </div>
      )}

      {/* 대화 이력 토글 / Conversation History Toggle */}
      <div className="border-t border-navy-600">
        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
          className="w-full px-6 py-3.5 flex items-center justify-between bg-navy-800/80 hover:bg-navy-700/80 transition-colors"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-gray-300">
            <History size={16} className="text-accent-cyan" />
            {t('ai.chatHistory')}
            <span className="px-2 py-0.5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs font-mono">{t('ai.historyCount', { count: historyData.length })}</span>
          </span>
          {showHistory ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
        </button>

        {showHistory && (
          <div className="px-5 py-4 bg-navy-900/30 max-h-80 overflow-y-auto space-y-2">
            {historyData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">{t('ai.noHistory')}</p>
            ) : (
              historyData.map((conv: any, i: number) => (
                <div key={conv.id || i}
                  onClick={() => { setInput(conv.question); setShowHistory(false); inputRef.current?.focus(); }}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg bg-navy-800/60 hover:bg-navy-700/60 border border-navy-700/50 hover:border-accent-cyan/30 cursor-pointer transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate group-hover:text-white font-medium">{conv.question}</p>
                    <p className="text-xs text-gray-500 truncate mt-1">{conv.summary?.slice(0, 100)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan text-xs font-mono border border-accent-cyan/20">{conv.route}</span>
                    <span className="text-xs font-mono text-gray-400">{(conv.responseTimeMs / 1000).toFixed(1)}s</span>
                    <span className="text-xs text-gray-500">{conv.timestamp ? new Date(conv.timestamp).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
