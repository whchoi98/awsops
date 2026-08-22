export interface Section {
  key: string;
  label: string;
  icon: string;
  color: string; // categorical accent — a CSS var (--sec-*) themed per light/dark in globals.css
  active: boolean; // wired to a real gateway/tool today
  presets: string[]; // frequently-used starter questions
  followUps?: string[]; // v1 followUpMap parity: post-answer deepening suggestions for this section
}

// Order = section-picker order. Colors are CSS vars themed in globals.css: the light
// values are a warm categorical palette tuned for the paper background; the dark
// theme lifts each hue so labels/borders stay legible on dark surfaces.
export const SECTIONS: Section[] = [
  { key: 'network', label: 'Network', icon: '🌐', color: 'var(--sec-network)', active: true, presets: [
    '두 리소스 간 통신이 안 되는 원인 (Reachability)',
    'SG/NACL에서 막힌 포트 찾기',
    'TGW/피어링 라우트 점검',
    '비정상 Flow Log 트래픽',
  ], followUps: [
    '이 경로의 SG/NACL 규칙을 홉별로 검증해줘', '해당 구간 Flow Log에서 REJECT 기록 찾아줘', '동일 증상이 다른 AZ/서브넷에도 있는지 확인해줘',
  ] },
  { key: 'container', label: 'Container', icon: '📦', color: 'var(--sec-container)', active: true, presets: [
    '파드가 Pending/CrashLoop인 이유',
    'ECS 태스크 반복 재시작 진단',
    '네임스페이스 리소스 상태',
    'Istio 트래픽/사이드카 문제',
  ], followUps: [
    '해당 파드의 최근 재시작 사유와 이벤트 보여줘', '이 워크로드의 리소스 요청/제한이 적절한지 평가해줘', '서비스 메시(Istio) 라우팅 설정도 점검해줘',
  ] },
  { key: 'data', label: 'Data', icon: '🗄️', color: 'var(--sec-data)', active: true, presets: [
    'RDS 느린 쿼리 진단',
    'DynamoDB 스로틀링 원인',
    'ElastiCache Evictions/메모리',
    'MSK 컨슈머 랙',
  ], followUps: [
    '이 DB의 슬로우 쿼리/대기 이벤트를 분석해줘', '백업/스냅샷 보존 정책이 적절한지 확인해줘', '연결 수와 커넥션 풀 상태를 점검해줘',
  ] },
  { key: 'security', label: 'Security', icon: '🔒', color: 'var(--sec-security)', active: true, presets: [
    '이 IAM 역할의 과다권한 점검',
    '특정 액션이 거부되는 이유 (정책 시뮬)',
    '퍼블릭 노출된 리소스 찾기',
    '최근 90일 미사용 역할/키',
  ], followUps: [
    '이 권한의 최소권한 대안 정책을 제안해줘', '최근 90일간 실제 사용된 권한만 추려줘', '외부 노출된 리소스가 더 있는지 전수 확인해줘',
  ] },
  { key: 'cost', label: 'Cost', icon: '💰', color: 'var(--sec-cost)', active: true, presets: [
    '이번 달 비용 추세와 가장 많이 오른 서비스',
    '다음 달 비용 예측',
    'RDS·EKS 절감 제안 (Top 5)',
    '계정/태그별 비용 분해',
  ], followUps: [
    '이 비용 급증의 리소스 단위 원인을 찾아줘', '적용 가능한 Savings Plans/RI 옵션을 계산해줘', '미사용 리소스 정리로 절감 가능한 금액 추정해줘',
  ] },
  { key: 'monitoring', label: 'Monitoring', icon: '📊', color: 'var(--sec-monitoring)', active: true, presets: [
    '최근 알람 요약',
    '특정 리소스 지표 이상 탐지',
    '누가 이 리소스를 변경했나 (CloudTrail)',
    '오류 급증 구간',
  ], followUps: [
    '이 알람의 최근 1주 발생 패턴을 분석해줘', '관련 로그에서 에러 시그니처를 추출해줘', '이 지표에 적절한 임계값/이상탐지 설정을 제안해줘',
  ] },
  { key: 'iac', label: 'IaC', icon: '🏗️', color: 'var(--sec-iac)', active: true, presets: [
    '드리프트 난 스택 찾기',
    '이 스택의 최근 변경 이력',
    '삭제보호/위험 리소스 점검',
    '미관리(IaC 밖) 리소스',
  ], followUps: [
    '이 스택의 드리프트를 실제 리소스와 대조해줘', '변경 전 영향 범위(의존 리소스)를 분석해줘', '이 구성을 모듈화/재사용 가능하게 리팩터링 제안해줘',
  ] },
  { key: 'ops', label: 'Ops', icon: '⚙️', color: 'var(--sec-ops)', active: true, presets: [
    '미사용 리소스 찾기 (고아 TG·빈 origin)',
    '리소스 인벤토리 현황',
    '전체 토폴로지 (CF→LB→TG)',
    '태그 누락 리소스',
  ], followUps: [
    '이 리소스들의 태그/소유자 정보를 정리해줘', '미사용으로 보이는 항목의 정리 우선순위를 매겨줘', '토폴로지에서 단일 장애점(SPOF)을 짚어줘',
  ] },
  { key: 'observability', label: 'Observability', icon: '🔭', color: 'var(--sec-observability)', active: true, presets: [
    '서비스 p99 레이턴시 (Prometheus)',
    '에러율 급증 구간 분석 (PromQL)',
    'ClickHouse로 느린 트레이스 Top N',
    '메트릭 라벨/시리즈 탐색',
  ], followUps: [
    '같은 기간 에러율과 레이턴시 상관관계를 그려줘', 'p99 급증 구간의 트레이스를 더 파고들어줘', '이 지표의 라벨별 분해(서비스/엔드포인트)를 보여줘',
  ] },
  // v1 auto-collect collectors (local collect→analyze handlers, web/lib/collectors) — keep just
  // BEFORE aws-data: dedicated scan/optimize intents, while aws-data stays the LAST generic receiver.
  { key: 'idle-scan', label: 'Idle Scan', icon: '🧹', color: 'var(--sec-idlescan)', active: true, presets: [
    '미사용 리소스 찾아줘 (유휴 리소스 스캔)',
    '미연결 EBS 볼륨과 EIP 낭비 스캔',
    '90일 이상 된 스냅샷 정리 대상 스캔',
    'gp2 → gp3 전환 절감 대상 찾기',
  ], followUps: [
    '이 목록의 예상 월 절감액을 계정별로 집계해줘', '삭제 전 확인이 필요한 리소스(태그/연관성)를 짚어줘', '정리용 AWS CLI 명령을 순서대로 만들어줘',
  ] },
  { key: 'eks-optimize', label: 'EKS Optimize', icon: '⚖️', color: 'var(--sec-eksoptimize)', active: true, presets: [
    'EKS 비용 최적화 포인트 찾아줘',
    '파드 CPU/메모리 과다 할당 분석',
    '노드 활용률 낮은 클러스터 통합 제안',
    'EKS rightsizing 권장값 계산',
  ], followUps: [
    '추천 request/limit을 kubectl 명령으로 만들어줘', '재시작/OOM 위험이 있는 워크로드를 짚어줘', '노드 그룹 인스턴스 타입 변경안을 비교해줘',
  ] },
  { key: 'db-optimize', label: 'DB Optimize', icon: '🧪', color: 'var(--sec-dboptimize)', active: true, presets: [
    'RDS 인스턴스 다운사이징 후보 찾아줘',
    'ElastiCache 노드 타입 rightsizing',
    'OpenSearch 도메인 과다 프로비저닝 점검',
    'DB 리소스 낭비 스캔 (RDS·캐시·검색)',
  ], followUps: [
    '추천 인스턴스 클래스별 예상 절감액을 표로 정리해줘', '다운사이징하면 안 되는 리소스(고사용률)를 짚어줘', 'RI/Savings Plans 적용 가능 대상을 계산해줘',
  ] },
  { key: 'msk-optimize', label: 'MSK Optimize', icon: '🧵', color: 'var(--sec-mskoptimize)', active: true, presets: [
    'MSK 브로커 rightsizing 분석해줘',
    '브로커 다운사이징 가능 여부 확인',
    'MSK 디스크/스로틀 위험 점검',
    'Provisioned vs Serverless 비교 분석',
  ], followUps: [
    '브로커별 CPU/디스크 불균형을 짚어줘', '컨슈머 랙이 큰 그룹의 원인을 분석해줘', '추천 구성 변경의 AWS CLI 명령을 만들어줘',
  ] },
  { key: 'trace-analyze', label: 'Latency', icon: '🛰️', color: 'var(--sec-traceanalyze)', active: true, presets: [
    '서비스 지연시간 병목 찾아줘 (p99)',
    'ALB 에러율 급증 서비스 분석',
    '서비스 의존성 관점 병목 분석',
    '느린 서비스 Top 5와 원인 추정',
  ], followUps: [
    'p50 대비 p99 격차가 큰 서비스를 짚어줘', 'ELB 5xx와 타깃 5xx를 구분해 원인을 좁혀줘', '트레이싱 계측(X-Ray/Tempo) 도입 우선순위를 제안해줘',
  ] },
  { key: 'nfm-analyze', label: 'Network Flow', icon: '🌐', color: 'var(--sec-nfmanalyze)', active: true, presets: [
    'NFM 재전송/타임아웃 원인 분석해줘',
    '네트워크 플로우 이상 진단',
    'AZ 간 트래픽 문제 플로우 찾아줘',
    '타임아웃 유발 페어 분석 (NFM)',
  ], followUps: [
    '최다 재전송 페어의 pod 로그 확인 포인트를 짚어줘', 'AZ 간 전송 비용 절감 배치안을 제안해줘', '문제 페어의 후속 확인 명령을 만들어줘',
  ] },
  { key: 'incident', label: 'Incident', icon: '🚨', color: 'var(--sec-incident)', active: true, presets: [
    '장애 원인 분석해줘 (알람+변경 이력)',
    '지금 발생 중인 알람과 근본 원인',
    '사고 분석: 최근 변경과 이상 징후 상관관계',
    '장애 타임라인 재구성해줘',
  ], followUps: [
    '알람 직전의 CloudTrail 변경 이벤트를 짚어줘', '영향 범위(blast radius)를 추정해줘', '재발 방지용 알람/대시보드 추가안을 제안해줘',
  ] },
  // v1 priority-10 'aws-data' port — MUST stay LAST: it is the receiver for listing/status/count
  // questions no specialized gateway claimed (LLM-generated Steampipe SQL, live-executed).
  { key: 'aws-data', label: 'AWS Data', icon: '🗃️', color: 'var(--sec-awsdata)', active: true, presets: [
    '리전별 EC2 인스턴스 몇 개야?',
    'S3 버킷 전체 목록과 암호화 상태',
    '미암호화 EBS 볼륨 찾아줘',
    '람다 함수 런타임별 분포',
  ], followUps: [
    '이 결과를 계정/리전별로 분해해줘', '태그가 누락된 항목만 추려줘', '이 목록에서 보안상 위험한 설정을 짚어줘',
  ] },
];

export const AUTO_PRESETS: string[] = [
  '이번 달 비용 추세와 가장 많이 오른 서비스',
  '두 리소스 간 통신이 안 되는 원인',
  '이 IAM 역할의 과다권한 점검',
  '최근 알람 요약',
];

export function sectionByKey(key: string): Section | undefined {
  return SECTIONS.find((s) => s.key === key);
}

export function activeSections(): Section[] {
  return SECTIONS.filter((s) => s.active);
}
