import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import createGeminiLLMProvider, {
  __resetGeminiLLMState
} from '../src/providers/llm/gemini.js';
import { resetLLMProviderCache } from '../src/providers/llm/index.js';

const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_LLM_PROVIDER = process.env.LLM_PROVIDER;

const SAMPLE_HITS = [
  {
    document_id: '11111111-1111-1111-1111-111111111111',
    page_start: 1,
    page_end: 2,
    text: 'Fourier transforms convert signals between time and frequency domains with symmetry.'
  },
  {
    document_id: '22222222-2222-2222-2222-222222222222',
    page_start: 3,
    page_end: 3,
    text: 'The convolution theorem simplifies filtering operations by turning convolution into multiplication.'
  }
];

describe('gemini llm provider', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-llm-key';
    process.env.LLM_PROVIDER = 'gemini';
    resetLLMProviderCache();
    __resetGeminiLLMState();
  });

  afterEach(() => {
    delete globalThis.__GEMINI_SDK__;
    resetLLMProviderCache();
    __resetGeminiLLMState();
  });

  it('parses JSON output and returns lesson structure', async () => {
    const fakeOutput = {
      topic: 'Signal Analysis',
      summary: 'Signals can be understood via Fourier transforms and convolution.',
      analogies: ['Analogy A', 'Analogy B'],
      example: {
        setup: 'Consider a noisy audio signal.',
        workedSteps: ['Apply Fourier transform.', 'Filter frequencies.', 'Apply inverse transform.']
      },
      checkins: [
        { question: 'What does the Fourier transform do?', answer: 'Converts time to frequency domain.' },
        { question: 'How does convolution relate to filtering?', answer: 'Filtering is convolution with an impulse response.' }
      ],
      sources: [
        { document_id: SAMPLE_HITS[0].document_id, page_start: 1, page_end: 2 },
        { document_id: SAMPLE_HITS[1].document_id, page_start: 3, page_end: 3 }
      ]
    };
    const capturedPrompts = [];

    globalThis.__GEMINI_SDK__ = {
      GoogleGenerativeAI: class {
        constructor(apiKey) {
          this.apiKey = apiKey;
        }

        getGenerativeModel() {
          return {
            async generateContent({ contents }) {
              capturedPrompts.push(contents);
              return {
                response: {
                  text: () => JSON.stringify(fakeOutput)
                }
              };
            }
          };
        }
      }
    };

    const provider = await createGeminiLLMProvider();
    const lesson = await provider.generateLesson({ topic: 'Signals', query: 'Fourier basics', hits: SAMPLE_HITS });

    assert.equal(lesson.topic, fakeOutput.topic);
    assert.equal(lesson.analogies.length, 2);
    assert.equal(lesson.example.workedSteps.length, 3);
    assert.equal(lesson.sources[0].document_id, SAMPLE_HITS[0].document_id);
    assert.ok(capturedPrompts.length > 0);
    const promptText = capturedPrompts[0][1].parts[0].text;
    assert.match(promptText, /Fourier transforms convert signals/);
    assert.match(promptText, /Document 1111/i, 'prompt includes formatted bullet list');
  });

  it('throws a descriptive error when Gemini returns invalid JSON', async () => {
    globalThis.__GEMINI_SDK__ = {
      GoogleGenerativeAI: class {
        getGenerativeModel() {
          return {
            async generateContent() {
              return {
                response: {
                  text: () => 'not-json'
                }
              };
            }
          };
        }
      }
    };

    const provider = await createGeminiLLMProvider();

    await assert.rejects(
      () => provider.generateMCQs({ topic: 'Signals', n: 2, hits: SAMPLE_HITS }),
      /invalid JSON/
    );
  });
});

after(() => {
  process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
  process.env.LLM_PROVIDER = ORIGINAL_LLM_PROVIDER;
});
