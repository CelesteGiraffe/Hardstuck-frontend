import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findRankForPlaylist,
  loadRankThresholds,
  resetRankThresholdCache,
} from '../rankThresholds';

const csvContent = `RANK,1v1,2v2
SSL,1341–1660,
GC3 Div 4,1337–1349,1832–1859
GC3 Div 3,1318–1335,1788–1811
`;

function stubFetch(content = csvContent) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(content),
    } as Response)
  ));
}

afterEach(() => {
  resetRankThresholdCache();
  vi.restoreAllMocks();
});

describe('rankThresholds', () => {
  it('parses CSV rows for each playlist column', async () => {
    stubFetch();
    const table = await loadRankThresholds();

    expect(table['1v1'][0]?.rankName).toBe('SSL');
    expect(table['2v2'][0]?.rankName).toBe('GC3 Div 4');
    expect(table['1v1'][0]?.imageName).toBe('SSL');
  });

  it('finds the correct rank for an MMR within the range', async () => {
    stubFetch();
    const table = await loadRankThresholds();
    const rank = findRankForPlaylist(1350, '1v1', table);

    expect(rank).toBeTruthy();
    expect(rank?.rankName).toBe('SSL');
  });

  it('returns null when no threshold matches', async () => {
    stubFetch();
    const table = await loadRankThresholds();
    const rank = findRankForPlaylist(500, '2v2', table);

    expect(rank).toBeNull();
  });
});