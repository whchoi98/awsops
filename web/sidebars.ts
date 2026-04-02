import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  guideSidebar: [
    'intro',
    {
      type: 'category',
      label: '시작하기',
      collapsed: false,
      items: [
        'getting-started/login',
        'getting-started/navigation',
        'getting-started/ai-assistant',
        'getting-started/deployment',
        'getting-started/auth',
      ],
    },
    {
      type: 'category',
      label: 'Overview',
      items: [
        'overview/dashboard',
        'overview/ai-assistant',
        'overview/agentcore',
        'overview/accounts',
      ],
    },
    {
      type: 'category',
      label: 'Compute',
      items: [
        'compute/ec2',
        'compute/lambda',
        'compute/ecs',
        'compute/ecr',
        'compute/eks-auth',
        'compute/eks',
        'compute/eks-explorer',
        'compute/eks-pods',
        'compute/eks-nodes',
        'compute/eks-deployments',
        'compute/eks-services',
        'compute/ecs-container-cost',
        'compute/eks-container-cost',
      ],
    },
    {
      type: 'category',
      label: 'Network & CDN',
      items: [
        'network/vpc',
        'network/cloudfront',
        'network/waf',
        'network/topology',
      ],
    },
    {
      type: 'category',
      label: 'Storage & DB',
      items: [
        'storage/ebs',
        'storage/s3',
        'storage/rds',
        'storage/dynamodb',
        'storage/elasticache',
        'storage/opensearch',
        'storage/msk',
      ],
    },
    {
      type: 'category',
      label: 'Monitoring',
      items: [
        'monitoring/monitoring',
        'monitoring/bedrock',
        'monitoring/cloudwatch',
        'monitoring/cloudtrail',
        'monitoring/cost',
        'monitoring/inventory',
        'monitoring/datasources',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/iam',
        'security/security',
        'security/compliance',
      ],
    },
    {
      type: 'category',
      label: 'FAQ',
      items: [
        'faq/general',
        'faq/troubleshooting',
        'faq/ai-assistant',
        'faq/architecture',
        'faq/agentcore-memory',
      ],
    },
  ],
};

export default sidebars;
