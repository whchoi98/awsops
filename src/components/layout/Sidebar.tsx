'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountSelector from '@/components/layout/AccountSelector';
import { useAccountContext } from '@/contexts/AccountContext';
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
  Sparkles,
  LogOut,
  Layers,
  DatabaseZap,
  SearchCode,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  subItems?: NavItem[];
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleKey: '',
    items: [
      { labelKey: 'sidebar.dashboard', href: '/', icon: LayoutDashboard },
      { labelKey: 'sidebar.aiAssistant', href: '/ai', icon: BrainCircuit },
      { labelKey: 'sidebar.agentcore', href: '/agentcore', icon: Activity },
      { labelKey: 'sidebar.diagnosis', href: '/diagnosis', icon: ClipboardCheck },
      { labelKey: 'sidebar.accounts', href: '/accounts', icon: Layers },
    ],
  },
  {
    titleKey: 'sidebar.compute',
    items: [
      { labelKey: 'sidebar.ec2', href: '/ec2', icon: Server },
      { labelKey: 'sidebar.lambda', href: '/lambda', icon: Zap },
      { labelKey: 'sidebar.ecs', href: '/ecs', icon: Container },
      { labelKey: 'sidebar.ecr', href: '/ecr', icon: Package },
      { labelKey: 'sidebar.eks', href: '/k8s', icon: Box },
      { labelKey: 'sidebar.eksExplorer', href: '/k8s/explorer', icon: Terminal },
      { labelKey: 'sidebar.ecsContainerCost', href: '/container-cost', icon: DollarSign },
      { labelKey: 'sidebar.eksContainerCost', href: '/eks-container-cost', icon: DollarSign },
    ],
  },
  {
    titleKey: 'sidebar.networkCdn',
    items: [
      { labelKey: 'sidebar.vpcNetwork', href: '/vpc', icon: Network },
      { labelKey: 'sidebar.cloudfront', href: '/cloudfront-cdn', icon: Globe },
      { labelKey: 'sidebar.waf', href: '/waf', icon: Shield },
      { labelKey: 'sidebar.topology', href: '/topology', icon: GitBranch },
    ],
  },
  {
    titleKey: 'sidebar.storageDb',
    items: [
      { labelKey: 'sidebar.ebs', href: '/ebs', icon: HardDrive },
      { labelKey: 'sidebar.s3', href: '/s3', icon: Database },
      { labelKey: 'sidebar.rds', href: '/rds', icon: Database },
      { labelKey: 'sidebar.dynamodb', href: '/dynamodb', icon: Table },
      { labelKey: 'sidebar.elasticache', href: '/elasticache', icon: Database },
      { labelKey: 'sidebar.opensearch', href: '/opensearch', icon: Search },
      { labelKey: 'sidebar.msk', href: '/msk', icon: Radio },
    ],
  },
  {
    titleKey: 'sidebar.monitoring',
    items: [
      { labelKey: 'sidebar.monitoringPage', href: '/monitoring', icon: Activity },
      { labelKey: 'sidebar.bedrock', href: '/bedrock', icon: Sparkles },
      { labelKey: 'sidebar.cloudwatch', href: '/cloudwatch', icon: Bell },
      { labelKey: 'sidebar.cloudtrail', href: '/cloudtrail', icon: FileSearch },
      { labelKey: 'sidebar.cost', href: '/cost', icon: DollarSign },
      { labelKey: 'sidebar.resourceInventory', href: '/inventory', icon: BarChart3 },
      { labelKey: 'sidebar.datasources', href: '/datasources', icon: DatabaseZap, subItems: [
        { labelKey: 'sidebar.datasources', href: '/datasources', icon: DatabaseZap },
        { labelKey: 'sidebar.datasourceExplore', href: '/datasources/explore', icon: SearchCode },
      ]},
    ],
  },
  {
    titleKey: 'sidebar.security',
    items: [
      { labelKey: 'sidebar.iam', href: '/iam', icon: Users },
      { labelKey: 'sidebar.securityPage', href: '/security', icon: ShieldCheck },
      { labelKey: 'sidebar.cisCompliance', href: '/compliance', icon: ShieldCheck },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { lang, setLang, t } = useLanguage();
  const [costEnabled, setCostEnabled] = useState(true);
  const [customerLogo, setCustomerLogo] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerLogoBg, setCustomerLogoBg] = useState<string>('dark'); // 'light' for white bg, 'dark' for transparent / 밝은 로고는 light, 어두운 로고는 dark
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const { getFeatures, isMultiAccount } = useAccountContext();
  const features = getFeatures();

  useEffect(() => {
    fetch('/awsops/api/steampipe?action=config')
      .then(r => r.json())
      .then(d => {
        setCostEnabled(d.costEnabled !== false);
        if (d.customerLogo) setCustomerLogo(d.customerLogo);
        if (d.customerName) setCustomerName(d.customerName);
        if (d.customerLogoBg) setCustomerLogoBg(d.customerLogoBg);
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    const path = pathname.replace('/awsops', '') || '/';
    if (href === '/') return path === '/';
    return path.startsWith(href);
  };

  const toggleMenu = (href: string) => {
    setExpandedMenus(prev => ({ ...prev, [href]: !prev[href] }));
  };

  const isMenuExpanded = (item: NavItem) => {
    if (expandedMenus[item.href] !== undefined) return expandedMenus[item.href];
    // Auto-expand if any sub-item is active
    return item.subItems?.some(sub => isActive(sub.href)) ?? false;
  };

  const toggleLang = () => {
    setLang(lang === 'ko' ? 'en' : 'ko');
  };

  const renderNavItem = (item: NavItem) => {
    if (item.subItems) {
      const expanded = isMenuExpanded(item);
      const anySubActive = item.subItems.some(sub => isActive(sub.href));
      const Icon = item.icon;

      return (
        <div key={item.href + '-group'}>
          <button
            onClick={() => toggleMenu(item.href)}
            className={`
              w-full flex items-center gap-3 px-4 py-2.5 text-[15px] transition-colors relative
              ${
                anySubActive
                  ? 'text-accent-cyan border-l-2 border-accent-cyan bg-navy-700/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
              }
            `}
          >
            <Icon size={18} />
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expanded && (
            <div className="space-y-0.5">
              {item.subItems.map(sub => {
                const path = pathname.replace('/awsops', '') || '/';
                const subActive = sub.href === item.href
                  ? path === sub.href   // exact match for parent-path sub-item
                  : isActive(sub.href);
                const SubIcon = sub.icon;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`
                      flex items-center gap-3 pl-8 pr-4 py-2 text-[13px] transition-colors relative
                      ${
                        subActive
                          ? 'bg-navy-700 text-accent-cyan border-l-2 border-accent-cyan'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-navy-700/50 border-l-2 border-transparent'
                      }
                    `}
                  >
                    <SubIcon size={16} />
                    <span>{t(sub.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

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
        <span>{t(item.labelKey)}</span>
      </Link>
    );
  };

  return (
    <aside className="w-60 min-w-[240px] h-screen bg-navy-800 border-r border-navy-600 flex flex-col shrink-0">
      {/* Customer Logo (from config) / 고객 로고 (config에서 읽기) */}
      {customerLogo && (
        <div className={`px-5 py-3 border-b border-navy-600 flex items-center justify-center ${customerLogoBg === 'light' ? 'bg-white/95' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/awsops/logos/${customerLogo}`}
            alt={customerName || 'Customer'}
            className="object-contain max-h-[40px] max-w-[180px]"
          />
        </div>
      )}

      {/* Logo + Language Toggle + Sign Out / 로고 + 언어 전환 + 로그아웃 */}
      <div className="px-5 py-4 border-b border-navy-600 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-accent-cyan tracking-tight">AWSops</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('sidebar.tagline')}</p>
        </div>
        <div className="flex items-center gap-1">
          {/* Language toggle / 언어 전환 */}
          <button
            onClick={toggleLang}
            className="px-2 py-1 rounded-md text-accent-cyan border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 transition-colors"
            title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'}
          >
            <span className="text-[11px] font-bold font-mono">{lang === 'ko' ? 'EN' : '한'}</span>
          </button>
          {/* Sign Out / 로그아웃 */}
          <button
            onClick={async () => {
              await fetch('/awsops/api/auth', { method: 'POST' });
              window.location.href = '/awsops';
            }}
            className="p-2 rounded-lg text-gray-500 hover:text-accent-red hover:bg-navy-700 transition-colors"
            title={t('sidebar.signOut')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Account Selector (multi-account only) */}
      <AccountSelector />

      {/* Navigation / 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-2 mx-4 border-t border-navy-600/50" />}
            {group.titleKey && (
              <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {t(group.titleKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items
                .filter(item => {
                  // Cost items: show if global costEnabled AND (single-account OR account has cost)
                  if (item.href === '/cost' || item.href === '/container-cost' || item.href === '/eks-container-cost') {
                    return costEnabled && (!isMultiAccount || features.costEnabled);
                  }
                  // K8s items: show if single-account OR account has EKS
                  if (item.href.startsWith('/k8s')) {
                    return !isMultiAccount || features.eksEnabled;
                  }
                  return true;
                })
                .map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / 푸터 */}
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
          <span>{t('sidebar.costToggle')} {costEnabled ? t('sidebar.costOn') : t('sidebar.costOff')}</span>
          <span className={`w-1.5 h-1.5 rounded-full ${costEnabled ? 'bg-accent-green' : 'bg-gray-600'}`} />
        </button>
        <p className="text-xs text-gray-600 font-mono">v1.6.0</p>
      </div>
    </aside>
  );
}
