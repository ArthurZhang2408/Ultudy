import createMockLLMProvider from './mock.js';
import createOpenAILLMProvider from './openai.js';

let cachedProvider = null;

export async function getLLMProvider() {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerName = (process.env.LLM_PROVIDER || 'mock').toLowerCase();

  if (providerName === 'openai') {
    cachedProvider = await createOpenAILLMProvider();
    return cachedProvider;
  }

  if (providerName === 'mock') {
    cachedProvider = createMockLLMProvider();
    return cachedProvider;
  }

  throw new Error(`Unsupported LLM provider: ${providerName}`);
}

export async function generateLesson(options) {
  const provider = await getLLMProvider();
  return provider.generateLesson(options);
}

export async function generateMCQs(options) {
  const provider = await getLLMProvider();
  return provider.generateMCQs(options);
}

export default getLLMProvider;
