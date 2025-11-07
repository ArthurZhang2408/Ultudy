export default async function createOpenAILLMProvider() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when using the openai LLM provider');
  }

  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (error) {
    throw new Error(
      'The openai package is required for the openai LLM provider. Install it with `npm install openai`.'
    );
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async function callModel(systemPrompt, userPrompt) {
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const candidate = response.output?.[0]?.content?.[0]?.text || response.output_text;

    if (!candidate) {
      throw new Error('OpenAI LLM provider did not return textual output');
    }

    try {
      return JSON.parse(candidate);
    } catch (error) {
      throw new Error('OpenAI LLM provider returned invalid JSON');
    }
  }

  return {
    name: 'openai-llm',
    async generateLesson({ chunks = [], topic, query } = {}) {
      return callModel(
        'You craft study lessons with summaries, analogies, a worked example, formative check-ins, and cite provided sources. Always reply with valid JSON.',
        `Create a lesson JSON with keys topic, summary, analogies (array of two strings), example (with setup and workedSteps array), checkins (two question/answer objects), and sources (document_id, page_start, page_end). Input: ${JSON.stringify({
          topic,
          query,
          chunks
        })}`
      );
    },
    async generateMCQs({ chunks = [], n = 5, difficulty = 'med', topic } = {}) {
      return callModel(
        'You craft grounded MCQ practice. Always output JSON with an items array of question objects with fields question, choices (length 4), correctIndex, rationale, and source (document_id, page_start, page_end).',
        `Create ${n} ${difficulty} questions for ${topic || 'the provided material'} using these chunks: ${JSON.stringify({
          topic,
          n,
          difficulty,
          chunks
        })}`
      );
    },
    async generateText(prompt) {
      // Generate text without JSON parsing for evaluation purposes
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful AI assistant.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      });

      const content = response.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI LLM provider did not return textual output');
      }

      return content;
    },
    async generateRawCompletion({ systemInstruction, userPrompt, temperature = 0.4 } = {}) {
      // Raw completion with custom system instruction (e.g., for section extraction)
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction || 'You are a helpful AI assistant.' },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature
      });

      const content = response.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI LLM provider did not return textual output');
      }

      return content;
    }
  };
}
