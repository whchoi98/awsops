import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

interface ScreenshotProps {
  src: string;
  alt: string;
  fullWidth?: boolean;
}

export default function Screenshot({ src, alt, fullWidth }: ScreenshotProps): React.ReactElement {
  // Strip .png extension to build variant paths
  const base = src.replace(/\.png$/, '');
  const src1x = `${base}.png`;
  const src1_5x = `${base}@1.5x.png`;
  const src2x = `${base}@2x.png`;

  return (
    <img
      src={useBaseUrl(src1x)}
      srcSet={`${useBaseUrl(src1x)} 1x, ${useBaseUrl(src1_5x)} 1.5x, ${useBaseUrl(src2x)} 2x`}
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
