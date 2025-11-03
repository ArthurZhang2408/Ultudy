import createMockLLMProvider from './mock.js';
import createOpenAILLMProvider from './openai.js';

let cachedProvider = null;
let cachedProviderName = null;

async function createGeminiLLMProvider() {
  const { default: createGeminiProvider } = await import('./gemini.js');
  return createGeminiProvider();
}

function ensureGeminiConfiguration() {
  if (!process.env.GEMINI_API_KEY && !process.env.CI) {
    throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini');
  }
}

export async function getLLMProvider() {
  const providerName = (process.env.LLM_PROVIDER || 'mock').toLowerCase();

  if (cachedProvider && cachedProviderName === providerName) {
    return cachedProvider;
  }

  if (providerName === 'openai') {
    cachedProvider = await createOpenAILLMProvider();
    cachedProviderName = providerName;
    return cachedProvider;
  }

  if (providerName === 'gemini') {
    ensureGeminiConfiguration();
    cachedProvider = await createGeminiLLMProvider();
    cachedProviderName = providerName;
    return cachedProvider;
  }

  if (providerName === 'mock') {
    cachedProvider = createMockLLMProvider();
    cachedProviderName = providerName;
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

export function validateLLMProviderConfig() {
  const providerName = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  if (providerName === 'gemini') {
    ensureGeminiConfiguration();
  }
}

export function resetLLMProviderCache() {
  cachedProvider = null;
  cachedProviderName = null;
}

export default getLLMProvider;
