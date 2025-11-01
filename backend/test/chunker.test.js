import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkPages, deterministicChunkId } from '../src/ingestion/chunker.js';

const SAMPLE_PAGES = [
  {
    page: 1,
    text: `Fourier analysis allows us to decompose complex signals into simple sinusoids.\n\n` +
      `This property is essential for understanding signal processing pipelines.`
  },
  {
    page: 2,
    text: `The Laplace transform extends this idea to complex frequency domains.`
  }
];

describe('chunkPages', () => {
  it('produces deterministic chunks for identical input', () => {
    const first = chunkPages(SAMPLE_PAGES, { chunkSizeTokens: 50, overlapTokens: 5 });
    const second = chunkPages(SAMPLE_PAGES, { chunkSizeTokens: 50, overlapTokens: 5 });

    assert.deepEqual(first, second);

    const ids = first.map(deterministicChunkId);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, ids.length);
  });
});
