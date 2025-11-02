import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import createMockLLMProvider from '../src/providers/llm/mock.js';

const SAMPLE_CHUNKS = [
  {
    document_id: '11111111-1111-1111-1111-111111111111',
    page_start: 2,
    page_end: 3,
    text: 'Fourier transforms convert signals between time and frequency domains, emphasizing symmetry and periodicity.'
  },
  {
    document_id: '22222222-2222-2222-2222-222222222222',
    page_start: 4,
    page_end: 5,
    text: 'The convolution theorem simplifies filtering by turning convolution into multiplication after transformation.'
  }
];

describe('mock LLM provider', () => {
  const provider = createMockLLMProvider();

  it('creates deterministic lesson output with expected structure', async () => {
    const first = await provider.generateLesson({ chunks: SAMPLE_CHUNKS, topic: 'Signal analysis' });
    const second = await provider.generateLesson({ chunks: SAMPLE_CHUNKS, topic: 'Signal analysis' });

    assert.deepEqual(first, second);
    assert.equal(first.topic, 'Signal analysis');
    assert.ok(first.summary.length > 0);

    const summaryWords = first.summary.split(/\s+/).filter(Boolean).length;
    assert.ok(summaryWords <= 180);

    assert.equal(first.analogies.length, 2);
    assert.ok(first.analogies.every((entry) => typeof entry === 'string' && entry.length > 0));

    assert.ok(first.example?.setup);
    assert.ok(Array.isArray(first.example?.workedSteps));
    assert.ok(first.example.workedSteps.length >= 3);

    assert.equal(first.checkins.length, 2);
    first.checkins.forEach((checkin) => {
      assert.ok(checkin.question.length > 0);
      assert.ok(checkin.answer.length > 0);
    });

    assert.ok(Array.isArray(first.sources));
    assert.ok(first.sources.some((source) => source.document_id === SAMPLE_CHUNKS[0].document_id));
  });

  it('creates deterministic MCQ output matching requested count and shape', async () => {
    const first = await provider.generateMCQs({ chunks: SAMPLE_CHUNKS, n: 4, difficulty: 'med', topic: 'Signal analysis' });
    const second = await provider.generateMCQs({ chunks: SAMPLE_CHUNKS, n: 4, difficulty: 'med', topic: 'Signal analysis' });

    assert.deepEqual(first, second);
    assert.equal(first.items.length, 4);

    first.items.forEach((item) => {
      assert.ok(item.question.length > 0);
      assert.equal(item.choices.length, 4);
      assert.ok(item.choices.every((choice) => typeof choice === 'string' && choice.length > 0));
      assert.ok(Number.isInteger(item.correctIndex));
      assert.ok(item.correctIndex >= 0 && item.correctIndex < item.choices.length);
      assert.ok(typeof item.rationale === 'string' && item.rationale.length > 0);
      assert.ok(item.source);
      assert.ok(Object.prototype.hasOwnProperty.call(item.source, 'document_id'));
    });
  });
});
