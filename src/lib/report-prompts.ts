// Report section definitions — prompts and metadata for AI diagnosis report
// 리포트 섹션 정의 — AI 종합 진단 리포트용 프롬프트 및 메타데이터

export interface ReportSectionDef {
  section: string;
  title: string;
  titleKo: string;
  systemPrompt: string;
}

export const REPORT_SECTIONS: ReportSectionDef[] = [
  {
    section: 'executive-summary',
    title: 'Executive Summary',
    titleKo: '경영진 요약',
    systemPrompt: 'You are a senior AWS cloud architect writing an executive summary. Summarize key findings, risks, and top 3 recommendations in a concise format. Use bullet points and bold for emphasis.',
  },
  {
    section: 'cost-overview',
    title: 'Cost Overview',
    titleKo: '비용 개요',
    systemPrompt: 'You are an AWS FinOps specialist. Analyze the cost data and provide: total spend, top services by cost, month-over-month trends, and cost anomalies. Include specific dollar amounts.',
  },
  {
    section: 'cost-compute',
    title: 'Compute Cost Analysis',
    titleKo: '컴퓨팅 비용 분석',
    systemPrompt: 'Analyze EC2, Lambda, and ECS/Fargate costs. Identify rightsizing opportunities, unused instances, and Savings Plans/Reserved Instance recommendations.',
  },
  {
    section: 'cost-network',
    title: 'Network Cost Analysis',
    titleKo: '네트워크 비용 분석',
    systemPrompt: 'Analyze network-related costs including data transfer, NAT Gateway, VPN, and CloudFront. Identify optimization opportunities.',
  },
  {
    section: 'cost-storage',
    title: 'Storage Cost Analysis',
    titleKo: '스토리지 비용 분석',
    systemPrompt: 'Analyze S3, EBS, and other storage costs. Identify lifecycle policy opportunities, unused snapshots, and storage class optimization.',
  },
  {
    section: 'idle-resources',
    title: 'Idle Resource Detection',
    titleKo: '유휴 리소스 감지',
    systemPrompt: 'Identify idle and underutilized resources: stopped EC2 instances, unattached EBS volumes, unused Elastic IPs, idle load balancers. Estimate monthly savings for each.',
  },
  {
    section: 'security-posture',
    title: 'Security Posture',
    titleKo: '보안 현황',
    systemPrompt: 'Assess the security posture: public S3 buckets, open security groups, unencrypted resources, IAM findings. Prioritize by severity (Critical/High/Medium/Low).',
  },
  {
    section: 'network-architecture',
    title: 'Network Architecture',
    titleKo: '네트워크 아키텍처',
    systemPrompt: 'Analyze VPC architecture: subnet layout, routing, NAT/IGW configuration, security groups, Transit Gateway. Identify single points of failure and recommend improvements.',
  },
  {
    section: 'compute-analysis',
    title: 'Compute Analysis',
    titleKo: '컴퓨팅 분석',
    systemPrompt: 'Analyze compute resources: EC2 instance types/sizes, Lambda configuration, ECS services. Recommend Graviton migration, rightsizing, and architecture improvements.',
  },
  {
    section: 'eks-analysis',
    title: 'EKS/Kubernetes Analysis',
    titleKo: 'EKS/Kubernetes 분석',
    systemPrompt: 'Analyze EKS clusters: node count/types, pod resource requests vs limits, deployment health, HPA configuration. Recommend node group optimization and resource tuning.',
  },
  {
    section: 'database-analysis',
    title: 'Database Analysis',
    titleKo: '데이터베이스 분석',
    systemPrompt: 'Analyze RDS, DynamoDB, and ElastiCache: instance sizes, storage, backup configuration, multi-AZ, read replicas. Recommend optimization and cost savings.',
  },
  {
    section: 'msk-analysis',
    title: 'MSK/Kafka Analysis',
    titleKo: 'MSK/Kafka 분석',
    systemPrompt: 'Analyze MSK Kafka clusters: broker configuration, storage, encryption, monitoring. Recommend partition sizing and broker optimization.',
  },
  {
    section: 'storage-analysis',
    title: 'Storage Analysis',
    titleKo: '스토리지 분석',
    systemPrompt: 'Analyze S3, EBS, and OpenSearch storage: bucket policies, volume types, encryption, lifecycle rules. Recommend storage class optimization and cost reduction.',
  },
  {
    section: 'recommendations',
    title: 'Recommendations',
    titleKo: '권장 사항',
    systemPrompt: 'Based on all previous analyses, provide a prioritized action plan with: immediate actions (0-30 days), short-term (1-3 months), and long-term (3-6 months). Include estimated cost impact for each.',
  },
  {
    section: 'appendix',
    title: 'Appendix: Resource Inventory',
    titleKo: '부록: 리소스 인벤토리',
    systemPrompt: '',
  },
];
