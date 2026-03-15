'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Database, Copy, Check, Activity, History, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<'sonnet-4.6' | 'opus-4.6'>('sonnet-4.6');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 대화 이력 로드 / Load conversation history
  const loadHistory = () => {
    fetch('/awsops/api/agentcore?action=conversations&limit=30')
      .then(r => r.json())
      .then(d => setHistoryData(d.conversations || []))
      .catch(() => {});
  };

  useEffect(() => { loadHistory(); }, []);

  // Session stats from chat messages / 채팅 메시지에서 세션 통계
  const sessionStats = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.via);
    const routeCounts: Record<string, number> = {};
    let totalTime = 0;
    let successCount = 0;
    let _failCount = 0;

    assistantMsgs.forEach(m => {
      if (m.route) routeCounts[m.route] = (routeCounts[m.route] || 0) + 1;
      if (m.responseTime) totalTime += m.responseTime;
      if (m.content?.startsWith('Error')) _failCount++; else successCount++;
    });

    return {
      totalQueries: assistantMsgs.length,
      avgResponseTime: assistantMsgs.length > 0 ? (totalTime / assistantMsgs.length).toFixed(1) : '0',
      successRate: assistantMsgs.length > 0 ? Math.round((successCount / assistantMsgs.length) * 100) : 100,
      routeCounts,
      topRoute: Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
    };
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
    const startTime = Date.now();

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
                    usedTools: data.usedTools,
                    via: data.via, route: data.route,
                    responseTime: Math.round((Date.now() - startTime) / 100) / 10,
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

  // Follow-up suggestions by route / 라우트별 연관 추천 질문
  const followUpMap: Record<string, string[]> = {
    security: ['IAM 사용자 목록과 Access Key 상태를 보여줘', 'MFA가 설정되지 않은 사용자가 있는지 확인해줘', '보안그룹 중 0.0.0.0/0 인바운드가 있는지 확인해줘'],
    network: ['VPC 서브넷과 라우트 테이블을 보여줘', 'NAT Gateway 상태를 확인해줘', 'Transit Gateway 라우팅을 분석해줘'],
    container: ['EKS 노드의 CPU/메모리 사용률을 확인해줘', 'ECS 서비스 상태를 보여줘', 'Istio 서비스 메시 현황을 알려줘'],
    cost: ['서비스별 비용을 비교해줘', '전월 대비 비용 증가 원인을 분석해줘', '비용 최적화 방안을 추천해줘'],
    monitoring: ['CloudWatch 로그 그룹 목록을 보여줘', '최근 CloudTrail 이벤트를 조회해줘', 'EC2 메모리 사용량 추세를 보여줘'],
    data: ['DynamoDB 테이블 상세를 확인해줘', 'RDS 스냅샷 목록을 보여줘', 'ElastiCache 모범사례를 알려줘'],
    'aws-data': ['Lambda 함수 목록과 런타임을 알려줘', 'S3 버킷 중 공개 접근 가능한 것이 있는지 확인해줘', '전체 리소스 요약을 보여줘'],
    iac: ['Terraform VPC 모듈을 검색해줘', 'CDK로 Lambda 배포하는 방법을 알려줘', 'CloudFormation 스택 상태를 확인해줘'],
    code: ['AWS 비용 데이터를 차트로 시각화해줘', '랜덤 숫자 통계를 계산해줘', 'JSON 데이터를 파싱하는 코드를 만들어줘'],
    general: ['서울 리전에서 사용 가능한 서비스를 확인해줘', 'ECS와 EKS 차이점을 알려줘', '서버리스 아키텍처를 추천해줘'],
  };

  // Get follow-up suggestions from last assistant message / 마지막 응답의 라우트에서 추천 질문 가져오기
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const followUps = lastAssistant?.route ? (followUpMap[lastAssistant.route] || followUpMap['general'] || []) : [];

  return (
    <div className="flex flex-col h-screen">
      {/* Header — matches Dashboard style / 대시보드와 동일 스타일 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-navy-600 bg-navy-800/80 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
          <p className="text-sm text-gray-400 mt-0.5">Powered by Amazon Bedrock AgentCore</p>
        </div>
        <div className="flex items-center gap-4">
          <select value={model} onChange={(e) => setModel(e.target.value as any)}
            className="bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:ring-accent-cyan focus:border-accent-cyan">
            <option value="sonnet-4.6">Claude Sonnet 4.6</option>
            <option value="opus-4.6">Claude Opus 4.6</option>
          </select>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            ONLINE
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
            <h2 className="text-xl font-semibold text-white mb-2">AWSops AI Assistant</h2>
            <p className="text-sm text-gray-400 text-center mb-2">AWS 인프라에 대해 질문하세요.</p>
            <p className="text-sm text-gray-400 text-center mb-6">Amazon Bedrock AgentCore가 LLM과 Tools를 활용해 답변을 드립니다.</p>
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
            <div className={`max-w-5xl rounded-lg px-4 py-3 ${
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
                    {copiedIdx === i ? <><Check size={12} className="text-accent-green" /> Copied</> : <><Copy size={12} /> Copy</>}
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
                        Tools:
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
                      Queried: {msg.queriedResources.join(', ')}
                    </div>
                  )}
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

      {/* Session Stats bar / 세션 통계 바 */}
      {sessionStats.totalQueries > 0 && (
        <div className="border-t border-navy-600 px-6 py-2 bg-navy-900/50 flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <Activity size={11} />
          <span>{sessionStats.totalQueries} queries</span>
          <span>avg {sessionStats.avgResponseTime}s</span>
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
            대화 이력
            <span className="px-2 py-0.5 rounded-full bg-accent-cyan/15 text-accent-cyan text-xs font-mono">{historyData.length}건</span>
          </span>
          {showHistory ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
        </button>

        {showHistory && (
          <div className="px-6 py-3 bg-navy-900/20 max-h-60 overflow-y-auto space-y-1.5">
            {historyData.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">아직 대화 이력이 없습니다</p>
            ) : (
              historyData.map((conv: any, i: number) => (
                <div key={conv.id || i}
                  onClick={() => { setInput(conv.question); setShowHistory(false); inputRef.current?.focus(); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-navy-800/50 hover:bg-navy-700/50 cursor-pointer transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate group-hover:text-white">{conv.question}</p>
                    <p className="text-[10px] text-gray-600 truncate mt-0.5">{conv.summary?.slice(0, 80)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan text-[9px] font-mono">{conv.route}</span>
                    <span className="text-[9px] font-mono text-gray-600">{(conv.responseTimeMs / 1000).toFixed(1)}s</span>
                    <span className="text-[9px] text-gray-700">{conv.timestamp ? new Date(conv.timestamp).toLocaleDateString() : ''}</span>
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
