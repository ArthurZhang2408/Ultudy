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
   * Now supports section-scoped generation
   * @param {Object} document - Document with full_text
   * @param {Object} options - Generation options (chapter, include_check_ins, section_name, full_text_override)
   */
  async function buildFullContextLesson(document, options = {}) {
    const provider = await resolveProvider();
    const {
      chapter,
      include_check_ins = true,
      section_name,
      section_description,
      full_text_override
    } = options;

    // Use override text if provided (for section-scoped generation)
    // Otherwise use full document text
    const fullText = full_text_override || document.full_text || '';

    if (fullText.length === 0) {
      throw new Error('Document has no text content');
    }

    // Call LLM provider with document/section context
    return provider.generateFullContextLesson({
      document_id: document.id,
      title: document.title,
      full_text: fullText,
      material_type: document.material_type,
      chapter,
      include_check_ins,
      section_name,
      section_description
    });
  }

  return { buildLesson, makeMCQs, buildFullContextLesson };
}

export default createStudyService;
