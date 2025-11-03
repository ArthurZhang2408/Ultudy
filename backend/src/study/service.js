import { getLLMProvider } from '../providers/llm/index.js';

export function createStudyService(options = {}) {
  const llmProviderFactory = options.llmProviderFactory ?? getLLMProvider;
  const injectedProvider = options.provider;

  async function resolveProvider() {
    if (injectedProvider) {
      return injectedProvider;
    }
    return llmProviderFactory();
  }

  async function buildLesson(chunks, context = {}) {
    const provider = await resolveProvider();
    const limitedChunks = Array.isArray(chunks) ? chunks.slice(0, 12) : [];
    return provider.generateLesson({
      chunks: limitedChunks,
      hits: limitedChunks,
      topic: context.topic,
      query: context.query
    });
  }

  async function makeMCQs(chunks, n = 5, difficulty = 'med') {
    const provider = await resolveProvider();
    const limitedChunks = Array.isArray(chunks) ? chunks.slice(0, 12) : [];
    const safeCount = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 20) : 5;
    return provider.generateMCQs({
      chunks: limitedChunks,
      hits: limitedChunks,
      n: safeCount,
      difficulty
    });
  }

  return { buildLesson, makeMCQs };
}

export default createStudyService;
