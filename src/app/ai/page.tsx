'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Send, Bot, User, Loader2, Sparkles, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  queriedResources?: string[];
  via?: string;           // Routing path display / 라우팅 경로 표시
  route?: string;         // Classified intent route / 분류된 의도 라우트
  statusMessage?: string; // SSE progress status / SSE 진행 상태 메시지
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<'sonnet-4.6' | 'opus-4.6'>('sonnet-4.6');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [statusMessage, setStatusMessage] = useState('');

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setStatusMessage('🔍 질문 분석 중...');

    try {
      const res = await fetch('/awsops/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          model,
          stream: true,
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
                } else if (eventType === 'done') {
                  setMessages([...newMessages, {
                    role: 'assistant', content: data.content,
                    model: data.model, queriedResources: data.queriedResources,
                    via: data.via, route: data.route,
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
            via: data.via, route: data.route,
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
    'EC2 인스턴스 현황을 알려줘',
    'VPC 네트워크 구성을 분석해줘',
    'RDS 데이터베이스 상태를 확인해줘',
    '보안 이슈가 있는지 확인해줘',
    '현재 비용 현황을 보여줘',
    'EKS 클러스터 상태를 알려줘',
    '전체 리소스 현황을 요약해줘',
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header — same style as EC2/VPC pages / EC2/VPC 페이지와 동일 스타일 */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between">
          <Header title="AI Assistant" subtitle="Powered by Amazon Bedrock AgentCore" />
          <select value={model} onChange={(e) => setModel(e.target.value as any)}
            className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:ring-accent-cyan focus:border-accent-cyan">
            <option value="sonnet-4.6">Claude Sonnet 4.6</option>
            <option value="opus-4.6">Claude Opus 4.6</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-4">
        {/* Welcome */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="p-4 rounded-2xl bg-accent-cyan/10 mb-4">
              <Sparkles size={40} className="text-accent-cyan" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">AWSops AI Assistant</h2>
            <p className="text-sm text-gray-400 text-center max-w-md mb-6">
              AWS 인프라에 대해 질문하세요. 실시간 Steampipe 데이터를 기반으로 답변합니다.
            </p>
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
            <div className={`max-w-3xl rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-accent-cyan/10 border border-accent-cyan/20 text-gray-200'
                : 'bg-navy-800 border border-navy-600 text-gray-300'
            }`}>
              {/* Queried resources indicator */}
              {msg.queriedResources && msg.queriedResources.length > 0 && (
                <div className="flex items-center gap-1.5 mb-2 text-[10px] text-gray-500">
                  <Database size={10} />
                  Queried: {msg.queriedResources.join(', ')}
                </div>
              )}
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
                <div className="text-[10px] text-gray-600 mt-2 text-right font-mono">
                  {msg.via && <span className="mr-2">{msg.via}</span>}
                  {msg.model && <span>Claude {msg.model}</span>}
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

        {/* Loading with SSE status / SSE 상태와 함께 로딩 표시 */}
        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center mt-1">
              <Bot size={16} className="text-accent-cyan" />
            </div>
            <div className="bg-navy-800 border border-navy-600 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="transition-all duration-300">{statusMessage || 'Processing...'}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-navy-600 bg-navy-800 p-4">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="AWS 인프라에 대해 질문하세요... (Shift+Enter for new line)"
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
    </div>
  );
}
