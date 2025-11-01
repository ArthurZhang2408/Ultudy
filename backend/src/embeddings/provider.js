import crypto from 'node:crypto';

const DEFAULT_DIMENSIONS = 3072;

function mulberry32(seed) {
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createMockEmbedding(text, dimensions = DEFAULT_DIMENSIONS) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const seed = hash.readUInt32BE(0);
  const rand = mulberry32(seed);
  const vector = new Float32Array(dimensions);

  for (let i = 0; i < dimensions; i += 1) {
    vector[i] = rand() * 2 - 1;
  }

  return vector;
}

function createMockProvider() {
  return {
    name: 'mock',
    async embedDocuments(texts) {
      return texts.map((text) => createMockEmbedding(text));
    },
    async embedQuery(text) {
      return createMockEmbedding(text);
    }
  };
}

async function createOpenAIProvider() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when using the openai embeddings provider');
  }

  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (error) {
    throw new Error('The openai package is not installed. Run `npm install openai` to enable this provider.');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return {
    name: 'openai',
    async embedDocuments(texts) {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-large',
        input: texts
      });
      return response.data.map((item) => Float32Array.from(item.embedding));
    },
    async embedQuery(text) {
      const [embedding] = await this.embedDocuments([text]);
      return embedding;
    }
  };
}

export async function getEmbeddingsProvider() {
  const provider = (process.env.EMBEDDINGS_PROVIDER || 'mock').toLowerCase();

  if (provider === 'openai') {
    return createOpenAIProvider();
  }

  return createMockProvider();
}

export default getEmbeddingsProvider;
