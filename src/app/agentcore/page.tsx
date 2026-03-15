'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import { Activity, Cpu, Wifi, Box, Shield, DollarSign, Database, Network, Terminal, Zap, BarChart3, Clock, Wrench, MessageSquare, Search } from 'lucide-react';

const GATEWAY_ICONS: Record<string, any> = {
  network: Network, container: Box, iac: Terminal, data: Database,
  security: Shield, monitoring: Activity, cost: DollarSign, ops: Zap,
};

const GATEWAY_TOOLS: Record<string, number> = {
  network: 17, container: 24, iac: 12, data: 24,
  security: 14, monitoring: 16, cost: 9, ops: 9,
};

export default function AgentCorePage() {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchStatus = () => {
    setLoading(true);
    Promise.all([
      fetch('/awsops/api/agentcore').then(r => r.json()),
      fetch('/awsops/api/agentcore?action=stats').then(r => r.json()),
      fetch('/awsops/api/agentcore?action=conversations&limit=20').then(r => r.json()),
    ]).then(([statusData, statsData, convData]) => {
      if (!statusData.error) setStatus(statusData);
      setStats(statsData);
      setConversations(convData.conversations || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const searchMemory = async () => {
    if (!memorySearch.trim()) {
      const res = await fetch('/awsops/api/agentcore?action=conversations&limit=20');
      const data = await res.json();
      setConversations(data.conversations || []);
      return;
    }
    const res = await fetch(`/awsops/api/agentcore?action=search&q=${encodeURIComponent(memorySearch)}`);
    const data = await res.json();
    setConversations(data.conversations || []);
  };

  useEffect(() => { fetchStatus(); }, []);

  const totalTools = Object.values(GATEWAY_TOOLS).reduce((a, b) => a + b, 0);
  const readyGateways = status?.gateways?.filter((g: any) => g.status === 'READY').length || 0;
  const totalGateways = status?.gateways?.length || 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="AgentCore Dashboard" subtitle="Amazon Bedrock AgentCore Runtime & Gateways" onRefresh={fetchStatus} />

      {loading && (
        <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Stats / 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Runtime" value={status?.runtime?.status || '--'} icon={Cpu}
          color={status?.runtime?.status === 'READY' ? 'green' : 'orange'}
          change={`v${status?.runtime?.version || '?'} · ${status?.runtime?.id?.slice(-10) || ''}`} />
        <StatsCard label="Gateways" value={`${readyGateways}/${totalGateways}`} icon={Wifi}
          color={readyGateways === totalGateways && totalGateways > 0 ? 'green' : 'orange'}
          change={`${totalGateways} gateways · ${totalTools} tools`} />
        <StatsCard label="MCP Tools" value={totalTools} icon={Activity} color="cyan"
          change="8 gateways · 19 Lambda" />
        <StatsCard label="Code Interpreter" value="Active" icon={Terminal} color="purple"
          change={status?.codeInterpreter?.id?.slice(-10) || ''} />
      </div>

      {/* AI 사용 통계 / AI Usage Stats */}
      {stats && stats.totalCalls > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatsCard label="총 호출" value={stats.totalCalls} icon={BarChart3} color="cyan"
              change={`${stats.successCalls} 성공 · ${stats.failedCalls} 실패`} />
            <StatsCard label="평균 응답 시간" value={`${(stats.avgResponseTimeMs / 1000).toFixed(1)}s`} icon={Clock} color="purple"
              change={stats.totalCalls > 0 ? `${stats.totalCalls}건 평균` : ''} />
            <StatsCard label="사용된 도구" value={stats.uniqueToolsUsed?.length || 0} icon={Wrench} color="green"
              change={`총 ${stats.totalToolsUsed || 0}회 호출`} />
            <StatsCard label="성공률" value={`${stats.totalCalls > 0 ? ((stats.successCalls / stats.totalCalls) * 100).toFixed(0) : 0}%`} icon={Activity}
              color={stats.successCalls / stats.totalCalls >= 0.8 ? 'green' : 'orange'}
              change={`${stats.successCalls}/${stats.totalCalls}`} />
            <StatsCard label="멀티 라우트" value={Object.keys(stats.callsByGateway || {}).filter(k => k.startsWith('multi:')).length > 0 ? Object.entries(stats.callsByGateway || {}).filter(([k]) => k.startsWith('multi:')).reduce((s, [, v]) => s + (v as number), 0) : 0} icon={Wifi} color="orange"
              change="병렬 Gateway 호출" />
            <StatsCard label="Steampipe SQL" value={stats.callsByGateway?.steampipe || 0} icon={Database} color="cyan"
              change="aws-data 라우트" />
          </div>

          {/* 라우트별 호출 분포 / Calls by route */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <BarChart3 size={16} className="text-accent-cyan" /> 라우트별 호출 수
              </h3>
              <div className="space-y-2">
                {Object.entries(stats.callsByRoute || {}).sort(([, a], [, b]) => (b as number) - (a as number)).map(([route, count]) => {
                  const pct = stats.totalCalls > 0 ? ((count as number) / stats.totalCalls) * 100 : 0;
                  return (
                    <div key={route} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-20 truncate">{route}</span>
                      <div className="flex-1 h-2 bg-navy-600 rounded-full overflow-hidden">
                        <div className="h-full bg-accent-cyan rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-white w-8 text-right">{count as number}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 최근 호출 / Recent calls */}
            <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock size={16} className="text-accent-cyan" /> 최근 호출 (최대 10건)
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(stats.recentCalls || []).slice(0, 10).map((call: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-navy-900 rounded p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${call.success ? 'bg-accent-green' : 'bg-accent-red'}`} />
                      <span className="text-gray-300">{call.route}</span>
                      {call.usedTools?.length > 0 && (
                        <span className="text-gray-500">({call.usedTools.length} tools)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-400">{(call.responseTimeMs / 1000).toFixed(1)}s</span>
                      <span className="text-gray-600 text-[10px]">{new Date(call.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
                {(!stats.recentCalls || stats.recentCalls.length === 0) && (
                  <p className="text-gray-500 text-center py-3">아직 호출 기록이 없습니다</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Runtime Detail / 런타임 상세 */}
      {status?.runtime && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Cpu size={16} className="text-accent-cyan" /> Runtime
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
            <div><span className="text-gray-500">ID:</span> <span className="text-white">{status.runtime.id}</span></div>
            <div><span className="text-gray-500">Status:</span> <span className={status.runtime.status === 'READY' ? 'text-accent-green' : 'text-accent-orange'}>{status.runtime.status}</span></div>
            <div><span className="text-gray-500">Version:</span> <span className="text-white">{status.runtime.version}</span></div>
            <div><span className="text-gray-500">Region:</span> <span className="text-white">{status.region}</span></div>
            <div><span className="text-gray-500">Created:</span> <span className="text-gray-300">{status.runtime.createdAt ? new Date(status.runtime.createdAt).toLocaleString() : '--'}</span></div>
            <div><span className="text-gray-500">Updated:</span> <span className="text-gray-300">{status.runtime.lastUpdatedAt ? new Date(status.runtime.lastUpdatedAt).toLocaleString() : '--'}</span></div>
          </div>
        </div>
      )}

      {/* Gateways Grid / 게이트웨이 그리드 */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Wifi size={16} className="text-accent-cyan" /> Gateways ({totalGateways})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(status?.gateways || []).map((gw: any) => {
            const shortName = (gw.name || '').replace('awsops-', '').replace('-gateway', '');
            const Icon = GATEWAY_ICONS[shortName] || Activity;
            const tools = GATEWAY_TOOLS[shortName] || 0;
            return (
              <div key={gw.id} className="bg-navy-800 rounded-lg border border-navy-600 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-accent-cyan/10">
                      <Icon size={16} className="text-accent-cyan" />
                    </div>
                    <span className="text-white font-semibold text-sm capitalize">{shortName}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${gw.status === 'READY' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red'}`}>
                    {gw.status}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Tools</span><span className="text-accent-cyan font-mono font-bold">{tools}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Targets</span><span className="text-white font-mono">{gw.targets}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">ID</span><span className="text-gray-400 font-mono text-[9px]">{gw.id}</span></div>
                </div>
                {gw.description && <p className="text-[10px] text-gray-600 mt-2 truncate">{gw.description}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 대화 이력 / Conversation History (Memory) */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageSquare size={16} className="text-accent-cyan" /> 대화 이력 ({conversations.length}건)
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="검색..." value={memorySearch}
                onChange={e => setMemorySearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchMemory()}
                className="pl-8 pr-3 py-1.5 bg-navy-900 border border-navy-600 rounded-lg text-xs text-gray-300 placeholder-gray-600 w-48 focus:outline-none focus:border-accent-cyan/50" />
            </div>
            <button onClick={searchMemory}
              className="px-3 py-1.5 text-xs bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 rounded-lg hover:bg-accent-cyan/20 transition-colors">
              검색
            </button>
          </div>
        </div>

        {conversations.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">아직 대화 이력이 없습니다. AI Assistant에서 질문해보세요.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {conversations.map((conv: any, i: number) => (
              <div key={conv.id || i} className="bg-navy-900 rounded-lg p-3 border border-navy-700 hover:border-navy-500 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{conv.question}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{conv.summary}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-gray-500">
                      {conv.timestamp ? new Date(conv.timestamp).toLocaleString() : ''}
                    </span>
                    <span className="text-[10px] font-mono text-accent-cyan">
                      {(conv.responseTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-1.5 py-0.5 rounded bg-accent-cyan/10 text-accent-cyan text-[10px] font-mono border border-accent-cyan/20">
                    {conv.route}
                  </span>
                  <span className="text-[10px] text-gray-500">{conv.via}</span>
                  {conv.usedTools?.length > 0 && (
                    <span className="text-[10px] text-gray-600">{conv.usedTools.length} tools</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gateway Tools / 게이트웨이 도구 목록 */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Activity size={16} className="text-accent-cyan" /> MCP Tools by Gateway (125 total)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { gw: 'Network', tools: ['list_vpcs', 'get_vpc_network_details', 'describe_network', 'find_ip_address', 'get_eni_details', 'get_vpc_flow_logs', 'list_transit_gateways', 'get_tgw_details', 'get_tgw_routes', 'get_all_tgw_routes', 'list_tgw_peerings', 'list_vpn_connections', 'list_network_firewalls', 'get_firewall_rules', 'analyze_reachability', 'query_flow_logs', 'get_path_trace_methodology'], color: 'cyan' },
            { gw: 'Container', tools: ['list_eks_clusters', 'get_eks_vpc_config', 'get_eks_insights', 'get_cloudwatch_logs', 'get_cloudwatch_metrics', 'get_eks_metrics_guidance', 'get_policies_for_role', 'search_eks_troubleshoot_guide', 'generate_app_manifest', 'ecs_resource_management', 'ecs_troubleshooting_tool', 'wait_for_service_ready', 'istio_overview', 'list_virtual_services', 'list_destination_rules', 'list_istio_gateways', 'list_service_entries', 'list_authorization_policies', 'list_peer_authentications', 'check_sidecar_injection', 'list_envoy_filters', 'list_istio_crds', 'istio_troubleshooting', 'query_istio_resource'], color: 'pink' },
            { gw: 'Security', tools: ['list_users', 'get_user', 'list_roles', 'get_role_details', 'list_groups', 'get_group', 'list_policies', 'list_user_policies', 'list_role_policies', 'get_user_policy', 'get_role_policy', 'list_access_keys', 'simulate_principal_policy', 'get_account_security_summary'], color: 'red' },
            { gw: 'Cost', tools: ['get_today_date', 'get_cost_and_usage', 'get_cost_and_usage_comparisons', 'get_cost_comparison_drivers', 'get_cost_forecast', 'get_dimension_values', 'get_tag_values', 'get_pricing', 'list_budgets'], color: 'orange' },
            { gw: 'Monitoring', tools: ['get_metric_data', 'get_metric_metadata', 'analyze_metric', 'get_recommended_metric_alarms', 'get_active_alarms', 'get_alarm_history', 'describe_log_groups', 'analyze_log_group', 'execute_log_insights_query', 'get_logs_insight_query_results', 'cancel_logs_insight_query', 'lookup_events', 'list_event_data_stores', 'lake_query', 'get_query_status', 'get_query_results'], color: 'green' },
            { gw: 'Data', tools: ['list_tables', 'describe_table', 'query_table', 'get_item', 'dynamodb_data_modeling', 'compute_performances_and_costs', 'list_db_instances', 'list_db_clusters', 'describe_db_instance', 'describe_db_cluster', 'execute_sql', 'list_snapshots', 'list_cache_clusters', 'describe_cache_cluster', 'list_replication_groups', 'describe_replication_group', 'list_serverless_caches', 'elasticache_best_practices', 'list_clusters', 'get_cluster_info', 'get_configuration_info', 'get_bootstrap_brokers', 'list_nodes', 'msk_best_practices'], color: 'purple' },
            { gw: 'IaC', tools: ['validate_cloudformation_template', 'check_cloudformation_template_compliance', 'troubleshoot_cloudformation_deployment', 'search_cdk_documentation', 'search_cloudformation_documentation', 'cdk_best_practices', 'read_iac_documentation_page', 'SearchAwsProviderDocs', 'SearchAwsccProviderDocs', 'SearchSpecificAwsIaModules', 'SearchUserProvidedModule', 'terraform_best_practices'], color: 'cyan' },
            { gw: 'Ops', tools: ['search_documentation', 'read_documentation', 'recommend', 'list_regions', 'get_regional_availability', 'prompt_understanding', 'call_aws', 'suggest_aws_commands', 'run_steampipe_query'], color: 'green' },
          ].map(({ gw, tools, color }) => (
            <div key={gw} className="bg-navy-900 rounded-lg border border-navy-600 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-semibold text-accent-${color}`}>{gw}</span>
                <span className="text-[10px] text-gray-500 font-mono">{tools.length} tools</span>
              </div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {tools.map((t) => (
                  <div key={t} className="text-[9px] font-mono text-gray-400 truncate">{t}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture / 아키텍처 */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Architecture</h3>
        <div className="text-xs font-mono text-gray-400 space-y-1">
          <p>route.ts → <span className="text-accent-cyan">classifyIntent()</span> → 1-3 routes</p>
          <p>  → Single: <span className="text-white">AgentCore Runtime</span> → Gateway → Lambda → AWS API</p>
          <p>  → Multi:  <span className="text-accent-purple">Parallel Gateway calls</span> → <span className="text-accent-green">Synthesize</span> → Response</p>
          <p>  → Code:   <span className="text-accent-orange">Bedrock</span> → Python extract → <span className="text-white">Code Interpreter</span></p>
          <p>  → SQL:    <span className="text-accent-orange">Bedrock</span> → SQL generate → <span className="text-accent-cyan">Steampipe pg Pool</span></p>
        </div>
      </div>
    </div>
  );
}
