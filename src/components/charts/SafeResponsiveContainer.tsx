'use client';

import { useState, useEffect, type ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';

interface Props {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  children: ReactElement;
}

// Defers ResponsiveContainer render until after mount and uses requestAnimationFrame
// to ensure the browser has completed layout before Recharts measures dimensions.
export default function SafeResponsiveContainer({ width = '100%', height = '100%', children }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) return <div style={{ width: typeof width === 'number' ? width : '100%', height: typeof height === 'number' ? height : undefined }} />;
  return (
    <ResponsiveContainer width={width} height={height} debounce={1}>
      {children}
    </ResponsiveContainer>
  );
}
