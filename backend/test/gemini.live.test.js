import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { embedBatch, __resetGeminiEmbeddingsState } from '../src/embeddings/providers/gemini.js';
import { resetEmbeddingsProviderCache } from '../src/embeddings/provider.js';

const shouldRunLive = process.env.LIVE_GEMINI === '1';

describe('Gemini live embeddings (opt-in)', () => {
  it('returns vectors with the configured dimensionality', { skip: !shouldRunLive }, async () => {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY must be set when LIVE_GEMINI=1');
    }

    process.env.EMBEDDINGS_PROVIDER = 'gemini';
    process.env.GEMINI_EMBED_DIM = process.env.GEMINI_EMBED_DIM || '3072';
    resetEmbeddingsProviderCache();
    __resetGeminiEmbeddingsState();
    delete globalThis.__GEMINI_SDK__;

    const vectors = await embedBatch(['alpha', 'beta', 'gamma']);
    const expectedDim = Number.parseInt(process.env.GEMINI_EMBED_DIM || '3072', 10);

    assert.equal(vectors.length, 3);
    vectors.forEach((vector) => {
      assert.equal(vector.length, expectedDim);
    });
  });
});
