import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddingsProvider } from '../src/embeddings/provider.js';

const ORIGINAL_PROVIDER = process.env.EMBEDDINGS_PROVIDER;
const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

describe('embeddings provider', () => {
  after(() => {
    process.env.EMBEDDINGS_PROVIDER = ORIGINAL_PROVIDER;
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  });

  it('generates deterministic mock embeddings with expected dimensions', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';
    const provider = await getEmbeddingsProvider();
    const embedding = await provider.embedQuery('mock text');

    assert.equal(embedding.length, 3072);
    const vectorAgain = await provider.embedQuery('mock text');
    assert.deepEqual(Array.from(vectorAgain), Array.from(embedding));
  });

  it('requires an OpenAI API key when using the openai provider', async () => {
    process.env.EMBEDDINGS_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;

    await assert.rejects(() => getEmbeddingsProvider(), /OPENAI_API_KEY/);
  });
});
