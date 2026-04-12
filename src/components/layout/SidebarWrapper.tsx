'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';

// Conditionally mount/unmount Sidebar to avoid React hooks ordering issues
// Login page: Sidebar is never instantiated (no hooks run)
// Other pages: Sidebar is fully mounted with all hooks
// 로그인 페이지에서 사이드바를 아예 마운트하지 않음 (훅 순서 문제 방지)
export default function SidebarWrapper() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return <Sidebar />;
}
