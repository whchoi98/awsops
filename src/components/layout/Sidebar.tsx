'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Server,
  Database,
  Zap,
  Network,
  Users,
  Bell,
  Container,
  Table,
  DollarSign,
  ShieldCheck,
  Box,
  Terminal,
  FileSearch,
  GitBranch,
  Activity,
  BrainCircuit,
  Globe,
  Shield,
  Package,
  BarChart3,
  HardDrive,
  Radio,
  Search,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: '',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'AI Assistant', href: '/ai', icon: BrainCircuit },
      { label: 'AgentCore', href: '/agentcore', icon: Activity },
    ],
  },
  {
    title: 'Compute',
    items: [
      { label: 'EC2', href: '/ec2', icon: Server },
      { label: 'Lambda', href: '/lambda', icon: Zap },
      { label: 'ECS', href: '/ecs', icon: Container },
      { label: 'ECR', href: '/ecr', icon: Package },
      { label: 'EKS', href: '/k8s', icon: Box },
      { label: 'EKS Explorer', href: '/k8s/explorer', icon: Terminal },
      { label: 'ECS Container Cost', href: '/container-cost', icon: DollarSign },
    ],
  },
  {
    title: 'Network & CDN',
    items: [
      { label: 'VPC / Network', href: '/vpc', icon: Network },
      { label: 'CloudFront', href: '/cloudfront-cdn', icon: Globe },
      { label: 'WAF', href: '/waf', icon: Shield },
      { label: 'Topology', href: '/topology', icon: GitBranch },
    ],
  },
  {
    title: 'Storage & DB',
    items: [
      { label: 'EBS', href: '/ebs', icon: HardDrive },
      { label: 'S3', href: '/s3', icon: Database },
      { label: 'RDS', href: '/rds', icon: Database },
      { label: 'DynamoDB', href: '/dynamodb', icon: Table },
      { label: 'ElastiCache', href: '/elasticache', icon: Database },
      { label: 'OpenSearch', href: '/opensearch', icon: Search },
      { label: 'MSK', href: '/msk', icon: Radio },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { label: 'Monitoring', href: '/monitoring', icon: Activity },
      { label: 'CloudWatch', href: '/cloudwatch', icon: Bell },
      { label: 'CloudTrail', href: '/cloudtrail', icon: FileSearch },
      { label: 'Cost', href: '/cost', icon: DollarSign },
      { label: 'Resource Inventory', href: '/inventory', icon: BarChart3 },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'IAM', href: '/iam', icon: Users },
      { label: 'Security', href: '/security', icon: ShieldCheck },
      { label: 'CIS Compliance', href: '/compliance', icon: ShieldCheck },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [costEnabled, setCostEnabled] = useState(true);

  useEffect(() => {
    fetch('/awsops/api/steampipe?action=config')
      .then(r => r.json())
      .then(d => setCostEnabled(d.costEnabled !== false))
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    const path = pathname.replace('/awsops', '') || '/';
    if (href === '/') return path === '/';
    return path.startsWith(href);
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`
          flex items-center gap-3 px-4 py-2.5 text-[15px] transition-colors relative
          ${
            active
              ? 'bg-navy-700 text-accent-cyan border-l-2 border-accent-cyan'
              : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
          }
        `}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-navy-800 border-r border-navy-600 flex flex-col shrink-0">
      {/* Logo + Sign Out */}
      <div className="px-5 py-4 border-b border-navy-600 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-accent-cyan tracking-tight">AWSops</h1>
          <p className="text-xs text-gray-500 mt-0.5">Cloud Operations Dashboard</p>
        </div>
        <button
          onClick={async () => {
            await fetch('/awsops/api/auth', { method: 'POST' });
            window.location.href = '/awsops';
          }}
          className="p-2 rounded-lg text-gray-500 hover:text-accent-red hover:bg-navy-700 transition-colors"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-2 mx-4 border-t border-navy-600/50" />}
            {group.title && (
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items
                .filter(item => costEnabled || item.href !== '/cost')
                .map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-navy-600 space-y-2">
        <button
          onClick={() => {
            const next = !costEnabled;
            fetch('/awsops/api/steampipe?action=config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ costEnabled: next }),
            })
              .then(r => r.json())
              .then(d => setCostEnabled(d.costEnabled !== false))
              .catch(() => {});
          }}
          className="flex items-center gap-2 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          <DollarSign size={12} />
          <span>Cost: {costEnabled ? 'ON' : 'OFF'}</span>
          <span className={`w-1.5 h-1.5 rounded-full ${costEnabled ? 'bg-accent-green' : 'bg-gray-600'}`} />
        </button>
        <p className="text-xs text-gray-600 font-mono">v1.5.2</p>
      </div>
    </aside>
  );
}
