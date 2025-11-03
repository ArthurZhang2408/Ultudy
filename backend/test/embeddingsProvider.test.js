import { describe, it, after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmbeddingsProvider,
  resetEmbeddingsProviderCache
} from '../src/embeddings/provider.js';
import {
  __resetGeminiEmbeddingsState
} from '../src/embeddings/providers/gemini.js';

const ORIGINAL_PROVIDER = process.env.EMBEDDINGS_PROVIDER;
const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_GEMINI_DIM = process.env.GEMINI_EMBED_DIM;

describe('embeddings provider', () => {
  after(() => {
    process.env.EMBEDDINGS_PROVIDER = ORIGINAL_PROVIDER;
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
    process.env.GEMINI_EMBED_DIM = ORIGINAL_GEMINI_DIM;
    delete globalThis.__GEMINI_SDK__;
    delete globalThis.__GEMINI_EMBEDDINGS_BASE_DELAY__;
    resetEmbeddingsProviderCache();
    __resetGeminiEmbeddingsState();
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

  describe('gemini provider', () => {
    beforeEach(() => {
      resetEmbeddingsProviderCache();
      __resetGeminiEmbeddingsState();
      process.env.EMBEDDINGS_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'test-api-key';
      process.env.GEMINI_EMBED_DIM = '3072';
      globalThis.__GEMINI_EMBEDDINGS_BASE_DELAY__ = 0;
    });

    afterEach(() => {
      delete globalThis.__GEMINI_SDK__;
      delete globalThis.__GEMINI_EMBEDDINGS_BASE_DELAY__;
      resetEmbeddingsProviderCache();
      __resetGeminiEmbeddingsState();
    });

    it('embeds batches and preserves deterministic ordering', async () => {
      const callLog = [];
      globalThis.__GEMINI_SDK__ = {
        GoogleGenerativeAI: class {
          constructor(apiKey) {
            this.apiKey = apiKey;
          }

          getGenerativeModel() {
            return {
              async batchEmbedContents({ requests }) {
                callLog.push(requests.map((entry) => entry.content.parts[0].text));
                return {
                  embeddings: requests.map((_, index) => ({
                    values: Array.from({ length: 3072 }, () => index + 1)
                  }))
                };
              }
            };
          }
        }
      };

      const provider = await getEmbeddingsProvider();
      const inputs = Array.from({ length: 18 }, (_, i) => `chunk-${i + 1}`);
      const vectors = await provider.embedDocuments(inputs);

      assert.equal(vectors.length, inputs.length);
      assert.equal(callLog.length, 2);
      assert.equal(callLog[0][0], 'chunk-1');
      assert.equal(callLog[1][0], 'chunk-17');
      assert.equal(vectors[0].length, 3072);
      assert.equal(vectors[0][0], 1);
      assert.equal(vectors[16][0], 1);
      assert.equal(vectors[17][0], 2);
    });

    it('retries on transient errors before succeeding', async () => {
      let attempt = 0;
      globalThis.__GEMINI_SDK__ = {
        GoogleGenerativeAI: class {
          getGenerativeModel() {
            return {
              async batchEmbedContents({ requests }) {
                attempt += 1;
                if (attempt === 1) {
                  const error = new Error('rate limited');
                  error.status = 429;
                  throw error;
                }
                return {
                  embeddings: requests.map(() => ({
                    values: Array.from({ length: 3072 }, () => 7)
                  }))
                };
              }
            };
          }
        }
      };

      const provider = await getEmbeddingsProvider();
      const vectors = await provider.embedDocuments(['retry-me']);

      assert.equal(attempt, 2);
      assert.equal(vectors[0].length, 3072);
      assert.equal(vectors[0][0], 7);
    });
  });
});
