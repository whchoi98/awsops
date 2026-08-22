import { describe, it, expect } from 'vitest';
import { SECTIONS, AUTO_PRESETS, sectionByKey, activeSections } from './sections';

describe('sections', () => {
  it('has 17 sections with the expected keys — aws-data LAST (v1 priority-10 receiver), collectors just before it', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'network', 'container', 'data', 'security', 'cost', 'monitoring', 'iac', 'ops', 'observability',
      'idle-scan', 'eks-optimize', 'db-optimize', 'msk-optimize', 'trace-analyze', 'nfm-analyze', 'incident', 'aws-data',
    ]);
  });
  it('marks all 17 sections active (container/iac 2026-08-02; aws-data + collectors local handlers)', () => {
    expect(activeSections().map((s) => s.key).sort()).toEqual(['aws-data', 'container', 'cost', 'data', 'db-optimize', 'eks-optimize', 'iac', 'idle-scan', 'incident', 'monitoring', 'msk-optimize', 'network', 'nfm-analyze', 'observability', 'ops', 'security', 'trace-analyze']);
  });
  it('every section has label, icon, color, and >=3 presets', () => {
    for (const s of SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
      // themed per light/dark in globals.css — NOT a raw hex (hex-suffix alpha concat would break)
      expect(s.color).toMatch(/^var\(--sec-[a-z]+\)$/); // 'aws-data' → --sec-awsdata (var names stay [a-z]+)
      expect(s.presets.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('sectionByKey returns the section or undefined', () => {
    expect(sectionByKey('cost')?.label).toBeDefined();
    expect(sectionByKey('nope')).toBeUndefined();
  });
  it('exposes an Auto preset mix', () => {
    expect(AUTO_PRESETS.length).toBeGreaterThanOrEqual(4);
  });
});
