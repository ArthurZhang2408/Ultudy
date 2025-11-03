import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_MODEL = 'gemini-embedding-001';
const DEFAULT_DIMENSION = 3072;
const MAX_BATCH_SIZE = 16;
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

let modelPromise = null;
let sdkImportPromise = null;

function getExpectedDimension() {
  const raw = process.env.GEMINI_EMBED_DIM ?? DEFAULT_DIMENSION;
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('GEMINI_EMBED_DIM must be a positive integer');
  }

  return parsed;
}

async function loadGoogleGenerativeAI() {
  if (globalThis.__GEMINI_SDK__?.GoogleGenerativeAI) {
    return globalThis.__GEMINI_SDK__.GoogleGenerativeAI;
  }

  if (!sdkImportPromise) {
    sdkImportPromise = import('@google/generative-ai');
  }

  const module = await sdkImportPromise;
  if (!module || (!module.GoogleGenerativeAI && !module.default)) {
    throw new Error('Failed to load @google/generative-ai');
  }

  return module.GoogleGenerativeAI ?? module.default;
}

async function getEmbeddingModel() {
  if (modelPromise) {
    return modelPromise;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required when using the gemini embeddings provider');
  }

  const modelName = process.env.GEMINI_EMBED_MODEL || DEFAULT_MODEL;

  modelPromise = (async () => {
    const GoogleGenerativeAI = await loadGoogleGenerativeAI();
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: modelName });
  })();

  return modelPromise;
}

function sanitizeTexts(texts) {
  if (!Array.isArray(texts)) {
    throw new TypeError('embedBatch expects an array of texts');
  }

  return texts.map((text) => (typeof text === 'string' ? text : String(text ?? '')));
}

function chunkArray(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function shouldRetry(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) {
    return true;
  }

  if (status >= 500 && status < 600) {
    return true;
  }

  const message = error?.message || '';
  return /(temporarily unavailable|try again|timeout|unavailable)/i.test(message);
}

async function executeWithRetry(fn) {
  let attempt = 0;
  const baseDelayOverride =
    typeof globalThis.__GEMINI_EMBEDDINGS_BASE_DELAY__ === 'number'
      ? Math.max(0, globalThis.__GEMINI_EMBEDDINGS_BASE_DELAY__)
      : BASE_DELAY_MS;
  let delayMs = baseDelayOverride;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= MAX_ATTEMPTS || !shouldRetry(error)) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 100);
      await delay(delayMs + jitter);
      delayMs *= 2;
    }
  }
}

function mapEmbeddingsResponse(response, expectedDim, batchSize) {
  const embeddings = response?.embeddings;

  if (!Array.isArray(embeddings) || embeddings.length !== batchSize) {
    throw new Error('Gemini embeddings response did not include the expected number of vectors');
  }

  return embeddings.map((entry) => {
    const values = entry?.values;
    if (!Array.isArray(values)) {
      throw new Error('Gemini embeddings response missing values array');
    }

    if (values.length !== expectedDim) {
      throw new Error(
        `Gemini embeddings dimension mismatch: expected ${expectedDim}, received ${values.length}`
      );
    }

    return Float32Array.from(values);
  });
}

export async function embedBatch(texts) {
  const cleaned = sanitizeTexts(texts);

  if (cleaned.length === 0) {
    return [];
  }

  const model = await getEmbeddingModel();
  const expectedDim = getExpectedDimension();
  const batches = chunkArray(cleaned, MAX_BATCH_SIZE);
  const results = [];

  const hasBatchAPI = typeof model.batchEmbedContents === 'function';
  const hasSingleAPI = typeof model.embedContent === 'function';

  for (const batch of batches) {
    if (hasBatchAPI) {
      const request = {
        requests: batch.map((text) => ({
          content: {
            parts: [{ text }]
          }
        }))
      };

      if (expectedDim !== DEFAULT_DIMENSION) {
        request.outputDimensionality = expectedDim;
      }

      const response = await executeWithRetry(() => model.batchEmbedContents(request));
      const vectors = mapEmbeddingsResponse(response, expectedDim, batch.length);
      results.push(...vectors);
      continue;
    }

    if (!hasSingleAPI) {
      throw new Error('Gemini embeddings model does not expose embedContent or batchEmbedContents');
    }

    for (const text of batch) {
      const request = {
        content: {
          parts: [{ text }]
        }
      };

      if (expectedDim !== DEFAULT_DIMENSION) {
        request.outputDimensionality = expectedDim;
      }

      const response = await executeWithRetry(() => model.embedContent(request));
      const vectors = mapEmbeddingsResponse({ embeddings: [response.embedding] }, expectedDim, 1);
      results.push(vectors[0]);
    }
  }

  return results;
}

export default async function createGeminiEmbeddingsProvider() {
  return {
    name: 'gemini',
    async embedDocuments(texts) {
      return embedBatch(texts);
    },
    async embedQuery(text) {
      const [vector] = await embedBatch([text]);
      if (!vector) {
        throw new Error('Gemini embeddings provider returned an empty response for the query text');
      }
      return vector;
    }
  };
}

export function __resetGeminiEmbeddingsState() {
  modelPromise = null;
  sdkImportPromise = null;
}

export function getGeminiEmbeddingDimension() {
  return getExpectedDimension();
}
