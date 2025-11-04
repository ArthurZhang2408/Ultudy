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

  /**
   * MVP v1.0: Generate lesson from full document context
   * @param {Object} document - Document with full_text
   * @param {Object} options - Generation options (chapter, include_check_ins)
   */
  async function buildFullContextLesson(document, options = {}) {
    const provider = await resolveProvider();
    const { chapter, include_check_ins = true } = options;

    // Prepare the full text (potentially filtered by chapter if needed in future)
    const fullText = document.full_text || '';

    if (fullText.length === 0) {
      throw new Error('Document has no text content');
    }

    // Call LLM provider with full document context
    return provider.generateFullContextLesson({
      document_id: document.id,
      title: document.title,
      full_text: fullText,
      material_type: document.material_type,
      chapter,
      include_check_ins
    });
  }

  return { buildLesson, makeMCQs, buildFullContextLesson };
}

export default createStudyService;
