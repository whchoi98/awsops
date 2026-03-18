import React, { useRef, useEffect } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

interface ScreenshotProps {
  src: string;
  alt: string;
  fullWidth?: boolean;
}

export default function Screenshot({ src, alt, fullWidth }: ScreenshotProps): React.ReactElement {
  const base = src.replace(/\.png$/, '');
  const src1x = `${base}.png`;
  const src1_5x = `${base}@1.5x.png`;
  const src2x = `${base}@2x.png`;

  const resolvedSrc = useBaseUrl(src1x);
  const resolved1_5x = useBaseUrl(src1_5x);
  const resolved2x = useBaseUrl(src2x);

  const imgRef = useRef<HTMLImageElement>(null);

  // Add srcSet only after hydration so onError is guaranteed to be attached
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    img.onerror = () => {
      img.onerror = null;
      img.removeAttribute('srcset');
      img.src = resolvedSrc;
    };
    img.srcset = `${resolvedSrc} 1x, ${resolved1_5x} 1.5x, ${resolved2x} 2x`;
  }, [resolvedSrc, resolved1_5x, resolved2x]);

  return (
    <img
      ref={imgRef}
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      style={{
        width: fullWidth ? '100%' : undefined,
        maxWidth: '100%',
        borderRadius: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    />
  );
}
