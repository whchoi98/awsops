'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { Play, Loader2, Download, FileText, CheckCircle, AlertTriangle, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useAccountContext } from '@/contexts/AccountContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Types ---

interface ReportSection {
  section: string;
  title: string;
  content: string;
}

interface ReportProgress {
  current: number;
  total: number;
  currentSection: string;
  statusMessage?: string;
  completedSections?: string[];
}

interface ReportListItem {
  reportId: string;
  accountId?: string;
  accountAlias?: string;
  status: 'generating' | 'completed' | 'failed';
  createdAt: string;
  progress?: ReportProgress;
  downloadUrl?: string;
  elapsedSeconds?: number;
}

// --- Constants ---

const SECTION_SHORT_NAMES: Record<string, string> = {
  'executive-summary': 'Summary',
  'cost-overview': 'Cost',
  'cost-compute': 'Compute$',
  'cost-network': 'Network$',
  'cost-storage': 'Storage$',
  'idle-resources': 'Idle',
  'security-posture': 'Security',
  'network-architecture': 'Network',
  'compute-analysis': 'Compute',
  'eks-analysis': 'EKS',
  'database-analysis': 'Database',
  'msk-analysis': 'MSK',
  'storage-analysis': 'Storage',
  'recommendations': 'Roadmap',
  'appendix': 'Appendix',
};

const SECTION_ICONS: Record<string, string> = {
  'executive-summary': '\u{1F4CA}',
  'cost-overview': '\u{1F4B0}',
  'cost-compute': '\u{1F5A5}\uFE0F',
  'cost-network': '\u{1F310}',
  'cost-storage': '\u{1F4BE}',
  'idle-resources': '\u{1F5D1}\uFE0F',
  'security-posture': '\u{1F512}',
  'network-architecture': '\u{1F500}',
  'compute-analysis': '\u26A1',
  'eks-analysis': '\u2638\uFE0F',
  'database-analysis': '\u{1F5C4}\uFE0F',
  'msk-analysis': '\u{1F4E1}',
  'storage-analysis': '\u{1F4E6}',
  'recommendations': '\u{1F3AF}',
  'appendix': '\u{1F4CB}',
};

// Section sub-topic descriptions for live progress display
// 섹션별 세부 분석 항목 (실시간 진행 표시용)
const SECTION_SUBTOPICS: Record<string, { ko: string[]; en: string[] }> = {
  'cost-overview':          { ko: ['서비스별 비용 집계', '월별 추이 분석', '비용 이상 감지'], en: ['Per-service cost aggregation', 'Monthly trend analysis', 'Cost anomaly detection'] },
  'cost-compute':           { ko: ['EC2 인스턴스 비용', 'Lambda 실행 비용', 'ECS/Fargate 비용', 'Savings Plans 커버리지'], en: ['EC2 instance costs', 'Lambda execution costs', 'ECS/Fargate costs', 'Savings Plans coverage'] },
  'cost-network':           { ko: ['Inter-AZ 데이터 전송', 'NAT Gateway 비용', 'Data Transfer Out', 'VPN/TGW 비용'], en: ['Inter-AZ data transfer', 'NAT Gateway costs', 'Data Transfer Out', 'VPN/TGW costs'] },
  'cost-storage':           { ko: ['S3 스토리지 클래스', 'EBS 볼륨 비용', 'Snapshot 비용', 'Lifecycle 정책'], en: ['S3 storage classes', 'EBS volume costs', 'Snapshot costs', 'Lifecycle policies'] },
  'idle-resources':         { ko: ['미연결 EBS 스캔', '미사용 EIP 스캔', '중지된 EC2 스캔', '오래된 스냅샷', '미사용 보안그룹'], en: ['Unattached EBS scan', 'Unused EIP scan', 'Stopped EC2 scan', 'Old snapshots', 'Unused security groups'] },
  'security-posture':       { ko: ['Security Group 분석', 'S3 퍼블릭 접근', 'EBS 암호화', 'IAM 사용자 점검', 'CIS 컴플라이언스'], en: ['Security Group analysis', 'S3 public access', 'EBS encryption', 'IAM user audit', 'CIS compliance'] },
  'network-architecture':   { ko: ['VPC 구성 분석', '서브넷 설계', 'NAT Gateway 이중화', 'Route Table', 'TGW/Peering'], en: ['VPC architecture', 'Subnet design', 'NAT Gateway redundancy', 'Route tables', 'TGW/Peering'] },
  'compute-analysis':       { ko: ['EC2 활용률 분석', 'Instance Type 적정성', 'Lambda 메모리 최적화', 'Auto Scaling 설정'], en: ['EC2 utilization', 'Instance type fitness', 'Lambda memory optimization', 'Auto Scaling config'] },
  'eks-analysis':           { ko: ['EKS 클러스터 구성', '노드풀 분석', 'Pod 리소스 효율', 'Namespace 비용'], en: ['EKS cluster config', 'Node pool analysis', 'Pod resource efficiency', 'Namespace costs'] },
  'database-analysis':      { ko: ['RDS 인스턴스 분석', 'ElastiCache 노드', 'OpenSearch 도메인', 'Multi-AZ 설정', '스토리지 효율'], en: ['RDS instance analysis', 'ElastiCache nodes', 'OpenSearch domains', 'Multi-AZ setup', 'Storage efficiency'] },
  'msk-analysis':           { ko: ['MSK 브로커 구성', '처리량 분석', 'EBS 사용량', 'Consumer Lag'], en: ['MSK broker config', 'Throughput analysis', 'EBS usage', 'Consumer lag'] },
  'storage-analysis':       { ko: ['S3 버킷 구조', 'EBS 타입 분포', '암호화 현황', 'Lifecycle 적용률'], en: ['S3 bucket structure', 'EBS type distribution', 'Encryption status', 'Lifecycle adoption'] },
  'executive-summary':      { ko: ['전체 섹션 종합', '6 Pillar 점수 산출', '핵심 발견사항 도출'], en: ['Cross-section synthesis', '6 Pillar scoring', 'Key findings extraction'] },
  'recommendations':        { ko: ['Quick Wins 도출', '단기 로드맵', '중기 로드맵', 'ROI 산출'], en: ['Quick Wins extraction', 'Short-term roadmap', 'Mid-term roadmap', 'ROI calculation'] },
  'appendix':               { ko: ['리소스 인벤토리 집계'], en: ['Resource inventory aggregation'] },
};

// Full section names for detailed display
const SECTION_FULL_NAMES: Record<string, { ko: string; en: string }> = {
  'cost-overview':        { ko: '비용 개요', en: 'Cost Overview' },
  'cost-compute':         { ko: '컴퓨팅 비용 분석', en: 'Compute Cost Analysis' },
  'cost-network':         { ko: '네트워크 비용 분석', en: 'Network Cost Analysis' },
  'cost-storage':         { ko: '스토리지 비용 분석', en: 'Storage Cost Analysis' },
  'idle-resources':       { ko: '유휴 리소스 스캔', en: 'Idle Resource Scan' },
  'security-posture':     { ko: '보안 진단', en: 'Security Posture' },
  'network-architecture': { ko: '네트워크 아키텍처 분석', en: 'Network Architecture' },
  'compute-analysis':     { ko: '컴퓨팅 최적화 분석', en: 'Compute Optimization' },
  'eks-analysis':         { ko: 'EKS 클러스터 분석', en: 'EKS Cluster Analysis' },
  'database-analysis':    { ko: '데이터베이스 분석', en: 'Database Analysis' },
  'msk-analysis':         { ko: 'MSK 스트리밍 분석', en: 'MSK Streaming Analysis' },
  'storage-analysis':     { ko: '스토리지 분석', en: 'Storage Analysis' },
  'executive-summary':    { ko: '종합 요약 (AI 종합)', en: 'Executive Summary (AI Synthesis)' },
  'recommendations':      { ko: '개선 로드맵 (AI 종합)', en: 'Improvement Roadmap (AI Synthesis)' },
  'appendix':             { ko: '부록: 인벤토리', en: 'Appendix: Inventory' },
};

const POLL_INTERVAL = 5000;

// --- Helpers ---

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day} ${hour}:${min}`;
  } catch {
    return iso;
  }
}

// --- Component ---

export default function DiagnosisPage() {
  const { lang } = useLanguage();
  const { currentAccountId, accounts } = useAccountContext();
  const isEn = lang === 'en';

  // State
  const [currentReportId, setCurrentReportId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('awsops-diagnosis-reportId');
    return null;
  });
  const [status, setStatus] = useState<'idle' | 'generating' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState<ReportProgress>({ current: 0, total: 15, currentSection: '' });
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // --- Cleanup ---

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // --- Persist reportId to localStorage ---

  useEffect(() => {
    if (currentReportId) {
      localStorage.setItem('awsops-diagnosis-reportId', currentReportId);
    }
  }, [currentReportId]);

  // --- Restore state from localStorage on mount ---

  useEffect(() => {
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('awsops-diagnosis-reportId') : null;
    if (savedId && status === 'idle') {
      fetch(`/awsops/api/report?action=status&id=${savedId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          if (data.status === 'generating') {
            setCurrentReportId(savedId);
            setStatus('generating');
            setProgress(data.progress || { current: 0, total: 15, currentSection: '' });
          } else if (data.status === 'completed') {
            setCurrentReportId(savedId);
            setStatus('completed');
            setDownloadUrl(data.downloadUrl || null);
            setSections(data.sections || []);
            if (data.sections?.[0]) setExpandedSection(data.sections[0].section);
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fetch report list ---

  const fetchReportList = useCallback(async () => {
    try {
      const res = await fetch('/awsops/api/report?action=list');
      if (!res.ok) return;
      const data = await res.json();
      setReports(data.reports || []);

      // If any report is still generating, resume polling for the most recent one
      const generating = (data.reports || []).find((r: ReportListItem) => r.status === 'generating');
      if (generating) {
        setCurrentReportId(generating.reportId);
        setStatus('generating');
        setProgress(generating.progress || { current: 0, total: 15, currentSection: '' });
      }
    } catch {
      // Silently fail on list fetch
    }
  }, [currentReportId]);

  useEffect(() => {
    fetchReportList();
  }, [fetchReportList]);

  // --- Elapsed timer ---

  useEffect(() => {
    if (status === 'generating') {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [status, stopTimer]);

  // --- Poll for status ---

  useEffect(() => {
    if (currentReportId && status === 'generating') {
      const poll = async () => {
        try {
          const res = await fetch(`/awsops/api/report?action=status&id=${currentReportId}`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.progress) {
            setProgress(data.progress);
          }

          if (data.status === 'completed') {
            stopPolling();
            setStatus('completed');
            setDownloadUrl(data.downloadUrl || null);
            setSections(data.sections || []);
            if (data.sections?.[0]) {
              setExpandedSection(data.sections[0].section);
            }
            fetchReportList();
          } else if (data.status === 'failed') {
            stopPolling();
            setStatus('failed');
            setError(data.error || (isEn ? 'Report generation failed' : '리포트 생성 실패'));
            fetchReportList();
          }
        } catch {
          // Poll errors are transient; keep trying
        }
      };

      // Initial poll immediately
      poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL);

      return stopPolling;
    }
  }, [currentReportId, status, stopPolling, fetchReportList, isEn]);

  // --- Start diagnosis ---

  const startDiagnosis = useCallback(async () => {
    setStatus('generating');
    setError(null);
    setSections([]);
    setDownloadUrl(null);
    setExpandedSection(null);
    setProgress({ current: 0, total: 15, currentSection: '' });

    try {
      const res = await fetch('/awsops/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId && currentAccountId !== '__all__' ? currentAccountId : undefined,
          lang,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCurrentReportId(data.reportId);
      // Polling will start via useEffect when currentReportId + status change
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatus('failed');
      setError(message);
    }
  }, [currentAccountId, lang]);

  // --- Download ---

  const downloadPptx = useCallback((url?: string | null) => {
    const target = url || downloadUrl;
    if (target) {
      window.open(target, '_blank');
    }
  }, [downloadUrl]);

  // --- View a completed report from history ---

  const viewReport = useCallback(async (reportId: string) => {
    try {
      const res = await fetch(`/awsops/api/report?action=status&id=${reportId}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'completed') {
        setCurrentReportId(reportId);
        setStatus('completed');
        setSections(data.sections || []);
        setDownloadUrl(data.downloadUrl || null);
        setError(null);
        if (data.sections?.[0]) {
          setExpandedSection(data.sections[0].section);
        }
      } else if (data.status === 'generating') {
        setCurrentReportId(reportId);
        setStatus('generating');
        setProgress(data.progress || { current: 0, total: 15, currentSection: '' });
        setError(null);
        setSections([]);
        setDownloadUrl(null);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // --- Severity icon for section content ---

  const getSeverityIcon = (content: string | undefined) => {
    if (!content) return <CheckCircle size={16} className="text-gray-600" />;
    const critCount = (content.match(/critical|심각|긴급/gi) || []).length;
    const warnCount = (content.match(/warning|주의|경고/gi) || []).length;
    if (critCount > 2) return <XCircle size={16} className="text-red-400" />;
    if (warnCount > 2) return <AlertTriangle size={16} className="text-accent-orange" />;
    return <CheckCircle size={16} className="text-accent-green" />;
  };

  // --- Resolve account alias ---

  const getAccountAlias = (accountId?: string): string => {
    if (!accountId) return isEn ? 'All Accounts' : '전체 계정';
    const found = accounts.find(a => a.accountId === accountId);
    return found ? found.alias : accountId;
  };

  // --- Progress bar percentage ---

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <Header
        title={isEn ? 'Comprehensive Diagnosis' : '종합진단'}
        subtitle={isEn
          ? 'AWS infrastructure health assessment — Cost, Compute, Security, FinOps (15 sections)'
          : 'AWS 인프라 건강 진단 — 비용, 컴퓨팅, 보안, FinOps 종합 분석 (15개 섹션)'}
      />

      {/* Control Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={startDiagnosis}
          disabled={status === 'generating'}
          className="flex items-center gap-2 px-6 py-3 bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg text-accent-cyan hover:bg-accent-cyan/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'generating' ? (
            <><Loader2 size={18} className="animate-spin" />{isEn ? 'Generating...' : '생성 중...'}</>
          ) : (
            <><Play size={18} />{isEn ? 'Run Diagnosis' : '진단 시작'}</>
          )}
        </button>

        {status === 'generating' && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">
              {progress.current}/{progress.total}
              {progress.currentSection && progress.currentSection !== 'data-collection' && progress.currentSection !== 'generating-pptx' && (
                <> — {SECTION_ICONS[progress.currentSection] || ''} {(isEn ? SECTION_FULL_NAMES[progress.currentSection]?.en : SECTION_FULL_NAMES[progress.currentSection]?.ko) || progress.currentSection} {isEn ? 'analyzing...' : '분석 중...'}</>
              )}
              {progress.currentSection === 'data-collection' && (
                <> — {isEn ? 'Collecting data...' : '데이터 수집 중...'}</>
              )}
              {progress.currentSection === 'generating-pptx' && (
                <> — {isEn ? 'Creating PPTX...' : 'PPTX 생성 중...'}</>
              )}
            </span>
            <span className="text-accent-cyan font-mono">{formatElapsed(elapsedTime)}</span>
          </div>
        )}

        {status === 'completed' && downloadUrl && (
          <button
            onClick={() => downloadPptx()}
            className="flex items-center gap-2 px-4 py-3 bg-accent-purple/10 border border-accent-purple/30 rounded-lg text-accent-purple hover:bg-accent-purple/20 transition-colors"
          >
            <Download size={18} />
            {isEn ? 'Download PPTX' : 'PPTX 다운로드'}
          </button>
        )}
      </div>

      {/* Progress Bar (while generating) */}
      {status === 'generating' && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-accent-cyan" />
              <span className="text-white font-medium">
                {isEn ? 'Generating Comprehensive Diagnosis Report...' : '종합진단 리포트 생성 중...'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-accent-cyan font-mono font-bold">{progress.current}/{progress.total}</span>
              <span className="text-gray-500 flex items-center gap-1"><Clock size={14} />{formatElapsed(elapsedTime)}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-navy-700 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-accent-cyan to-accent-purple rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            />
          </div>

          {/* Active section detail panel */}
          {progress.currentSection && progress.currentSection !== 'data-collection' && progress.currentSection !== 'generating-pptx' && (
            <div className="bg-navy-900/50 border border-accent-cyan/20 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 size={14} className="animate-spin text-accent-cyan" />
                <span className="text-accent-cyan font-medium text-sm">
                  {SECTION_ICONS[progress.currentSection] || ''} {(isEn ? SECTION_FULL_NAMES[progress.currentSection]?.en : SECTION_FULL_NAMES[progress.currentSection]?.ko) || progress.currentSection}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 ml-6">
                {(isEn ? SECTION_SUBTOPICS[progress.currentSection]?.en : SECTION_SUBTOPICS[progress.currentSection]?.ko)?.map((topic, i) => (
                  <span key={i} className="text-[11px] text-gray-400 flex items-center gap-1">
                    <span className="text-accent-cyan/60">&#x2022;</span> {topic}
                  </span>
                )) || null}
              </div>
            </div>
          )}
          {progress.currentSection === 'data-collection' && (
            <div className="bg-navy-900/50 border border-accent-cyan/20 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-accent-cyan" />
                <span className="text-accent-cyan font-medium text-sm">
                  {isEn ? 'Collecting infrastructure data from Steampipe...' : 'Steampipe에서 인프라 데이터 수집 중...'}
                </span>
              </div>
              {progress.statusMessage && (
                <div className="ml-6 mt-1 text-[11px] text-gray-400">{progress.statusMessage}</div>
              )}
            </div>
          )}
          {progress.currentSection === 'generating-pptx' && (
            <div className="bg-navy-900/50 border border-accent-purple/20 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-accent-purple" />
                <span className="text-accent-purple font-medium text-sm">
                  {isEn ? 'Generating PPTX report file...' : 'PPTX 리포트 파일 생성 중...'}
                </span>
              </div>
            </div>
          )}

          {/* Section checklist — compact grid */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 text-xs">
            {Object.entries(SECTION_ICONS).map(([key, icon]) => {
              const done = progress.completedSections?.includes(key);
              const active = progress.currentSection === key && !done;
              return (
                <div
                  key={key}
                  title={(isEn ? SECTION_FULL_NAMES[key]?.en : SECTION_FULL_NAMES[key]?.ko) || key}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors ${
                    done ? 'bg-accent-green/10 text-accent-green' :
                    active ? 'bg-accent-cyan/15 text-accent-cyan ring-1 ring-accent-cyan/30' :
                    'bg-navy-700/50 text-gray-600'
                  }`}
                >
                  {done ? <CheckCircle size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : <span className="w-3 h-3 rounded-full border border-gray-700 inline-block" />}
                  <span className="truncate">{icon} {SECTION_SHORT_NAMES[key] || key}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'failed' && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          <div className="flex items-center gap-2">
            <XCircle size={18} />
            <span className="font-medium">{isEn ? 'Generation Failed' : '생성 실패'}</span>
          </div>
          <p className="mt-2 text-sm text-red-400/80">{error}</p>
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && sections.length === 0 && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent-cyan/10 flex items-center justify-center mb-4">
            <FileText size={24} className="text-accent-cyan/50" />
          </div>
          <h3 className="text-lg text-white mb-2">{isEn ? 'AWS Comprehensive Diagnosis' : 'AWS 종합진단'}</h3>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">
            {isEn
              ? 'Analyzes your entire AWS infrastructure across 15 dimensions: cost breakdown, compute rightsizing, security posture, idle resources, EKS/DB/MSK efficiency. Generates a downloadable PPTX report.'
              : '전체 AWS 인프라를 15개 영역에서 분석합니다: 비용 분석, 컴퓨팅 rightsizing, 보안 진단, 유휴 리소스, EKS/DB/MSK 효율 분석. PPTX 리포트를 다운로드할 수 있습니다.'}
          </p>
          <div className="mt-6 grid grid-cols-3 md:grid-cols-5 gap-3 max-w-3xl mx-auto text-xs text-gray-500">
            {Object.entries(SECTION_ICONS).map(([key, icon]) => (
              <div key={key} className="bg-navy-700 rounded px-2 py-1.5 flex items-center gap-1.5 justify-center">
                <span>{icon}</span>
                <span className="truncate">{key.replace(/-/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report Results (completed) */}
      {status === 'completed' && sections.length > 0 && (
        <div className="space-y-3">
          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
              <div className="text-xs text-gray-400">{isEn ? 'Sections Analyzed' : '분석 섹션'}</div>
              <div className="text-2xl font-bold text-accent-cyan mt-1">{sections.length}</div>
            </div>
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
              <div className="text-xs text-gray-400">{isEn ? 'Analysis Time' : '분석 시간'}</div>
              <div className="text-2xl font-bold text-accent-purple mt-1">{formatElapsed(elapsedTime)}</div>
            </div>
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
              <div className="text-xs text-gray-400">{isEn ? 'Report ID' : '리포트 ID'}</div>
              <div className="text-sm font-mono text-accent-green mt-2">{currentReportId?.slice(0, 8) || '—'}</div>
            </div>
            {downloadUrl ? (
              <button
                onClick={() => downloadPptx()}
                className="bg-navy-800 border border-accent-orange/30 rounded-lg p-4 hover:bg-accent-orange/10 transition-colors text-left"
              >
                <div className="text-xs text-gray-400">{isEn ? 'Download' : '다운로드'}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Download size={18} className="text-accent-orange" />
                  <span className="text-lg font-bold text-accent-orange">PPTX</span>
                </div>
              </button>
            ) : (
              <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
                <div className="text-xs text-gray-400">{isEn ? 'Download' : '다운로드'}</div>
                <div className="text-sm text-gray-500 mt-2">{isEn ? 'Not available' : '준비 중'}</div>
              </div>
            )}
          </div>

          {/* Accordion sections */}
          {sections.map((section) => (
            <div
              key={section.section}
              className="bg-navy-800 border border-navy-600 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedSection(expandedSection === section.section ? null : section.section)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-navy-700 transition-colors"
              >
                <span className="text-lg">{SECTION_ICONS[section.section] || '\u{1F4C4}'}</span>
                <span className="flex-1 text-white font-medium text-sm">{section.title}</span>
                {getSeverityIcon(section.content)}
                {expandedSection === section.section ? (
                  <ChevronDown size={16} className="text-gray-500" />
                ) : (
                  <ChevronRight size={16} className="text-gray-500" />
                )}
              </button>

              {expandedSection === section.section && (
                <div className="px-4 pb-4 border-t border-navy-600">
                  <div className="prose prose-invert prose-sm max-w-none mt-3
                    prose-headings:text-accent-cyan prose-headings:text-sm prose-headings:font-bold
                    prose-p:text-gray-300 prose-p:text-xs prose-p:leading-relaxed
                    prose-li:text-gray-300 prose-li:text-xs
                    prose-strong:text-white
                    prose-table:text-xs
                    prose-th:text-accent-cyan prose-th:border-navy-600 prose-th:px-2 prose-th:py-1
                    prose-td:text-gray-300 prose-td:border-navy-600 prose-td:px-2 prose-td:py-1
                    prose-code:text-accent-green prose-code:text-xs
                    prose-a:text-accent-cyan">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {section.content}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report History Table */}
      {reports.length > 0 && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-600">
            <h3 className="text-sm font-medium text-white">
              {isEn ? 'Report History' : '리포트 이력'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600">
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">
                    {isEn ? 'Date' : '날짜'}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">
                    {isEn ? 'Account' : '계정'}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">
                    {isEn ? 'Status' : '상태'}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-400 font-medium">
                    {isEn ? 'Actions' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.reportId}
                    className={`border-b border-navy-700 hover:bg-navy-700/50 transition-colors ${
                      currentReportId === report.reportId ? 'bg-navy-700/30' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">
                      {formatDatetime(report.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-300 text-xs">
                      {report.accountAlias || getAccountAlias(report.accountId)}
                    </td>
                    <td className="px-4 py-2.5">
                      {report.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 text-accent-green text-xs">
                          <CheckCircle size={14} />
                          {isEn ? 'Completed' : '완료'}
                        </span>
                      )}
                      {report.status === 'generating' && (
                        <span className="inline-flex items-center gap-1 text-accent-cyan text-xs">
                          <Loader2 size={14} className="animate-spin" />
                          {isEn ? 'Generating' : '생성 중'}
                          {report.progress && (
                            <span className="text-gray-500 ml-1">
                              ({report.progress.current}/{report.progress.total})
                            </span>
                          )}
                        </span>
                      )}
                      {report.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                          <XCircle size={14} />
                          {isEn ? 'Failed' : '실패'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {report.status === 'completed' && (
                          <>
                            <button
                              onClick={() => viewReport(report.reportId)}
                              className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                            >
                              {isEn ? 'View' : '보기'}
                            </button>
                            {report.downloadUrl && (
                              <button
                                onClick={() => downloadPptx(report.downloadUrl)}
                                className="inline-flex items-center gap-1 text-xs text-accent-orange hover:text-accent-orange/80 transition-colors"
                              >
                                <Download size={12} />
                                PPTX
                              </button>
                            )}
                          </>
                        )}
                        {report.status === 'generating' && (
                          <button
                            onClick={() => viewReport(report.reportId)}
                            className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                          >
                            {isEn ? 'Track' : '진행 확인'}
                          </button>
                        )}
                        {report.status === 'failed' && (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
