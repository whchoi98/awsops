import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'AWSops 사용자 가이드',
  tagline: 'AWS + Kubernetes 운영 대시보드 사용자 가이드',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  url: process.env.SITE_URL || 'https://awsops.atomai.click',
  baseUrl: process.env.BASE_URL || '/',

  organizationName: 'Atom-oh',
  projectName: 'awsops',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  onBrokenAnchors: 'warn',

  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'en'],
    localeConfigs: {
      ko: { label: '한국어', direction: 'ltr' },
      en: { label: 'English', direction: 'ltr' },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: {
          path: 'whatsnew',
          routeBasePath: 'whatsnew',
          blogTitle: "What's New",
          blogDescription: 'AWSops 개발 현황 및 릴리스 노트',
          blogSidebarTitle: '릴리스 노트',
          blogSidebarCount: 'ALL',
          showReadingTime: true,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/awsops-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'AWSops Guide',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'guideSidebar',
          position: 'left',
          label: '가이드',
        },
        {
          to: '/faq/general',
          label: 'FAQ',
          position: 'left',
        },
        {
          to: '/whatsnew',
          label: "What's New",
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://awsops.whchoi.net/awsops/',
          label: '대시보드',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '가이드',
          items: [
            { label: '시작하기', to: '/getting-started/login' },
            { label: 'AI 어시스턴트', to: '/getting-started/ai-assistant' },
            { label: "What's New", to: '/whatsnew' },
          ],
        },
        {
          title: '리소스',
          items: [
            { label: 'Dashboard', href: 'https://awsops.whchoi.net/awsops/' },
          ],
        },
        {
          title: 'AWS 서비스',
          items: [
            { label: 'Amazon Bedrock', href: 'https://aws.amazon.com/bedrock/' },
            { label: 'Steampipe', href: 'https://steampipe.io/' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AWSops. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'json', 'sql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
