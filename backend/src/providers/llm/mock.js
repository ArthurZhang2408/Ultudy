import crypto from 'node:crypto';

function mulberry32(seed) {
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value) {
  const normalized = value && String(value).trim().length ? String(value).trim() : 'default';
  const hash = crypto.createHash('sha256').update(normalized).digest();
  return hash.readUInt32BE(0);
}

function truncateWords(text, maxWords) {
  if (!text) {
    return '';
  }

  const words = text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length <= maxWords) {
    return words.join(' ');
  }

  return words.slice(0, maxWords).join(' ');
}

function selectUnique(rand, pool, count) {
  const taken = new Set();
  const selections = [];

  while (selections.length < count && taken.size < pool.length) {
    const index = Math.floor(rand() * pool.length);
    if (!taken.has(index)) {
      taken.add(index);
      selections.push(pool[index]);
    }
  }

  while (selections.length < count) {
    selections.push(pool[(selections.length + taken.size) % pool.length]);
  }

  return selections;
}

function buildSources(chunks) {
  const byDocument = new Map();

  chunks.forEach((chunk) => {
    if (!chunk || !chunk.document_id) {
      return;
    }

    const pageStart = Number.isFinite(chunk.page_start) ? chunk.page_start : 0;
    const pageEnd = Number.isFinite(chunk.page_end) ? chunk.page_end : pageStart;

    if (!byDocument.has(chunk.document_id)) {
      byDocument.set(chunk.document_id, {
        document_id: chunk.document_id,
        page_start: pageStart,
        page_end: pageEnd
      });
      return;
    }

    const existing = byDocument.get(chunk.document_id);
    existing.page_start = Math.min(existing.page_start, pageStart);
    existing.page_end = Math.max(existing.page_end, pageEnd);
  });

  return Array.from(byDocument.values());
}

function summarizeText(topic, chunks, rand) {
  const context = chunks.map((chunk) => chunk?.text || '').join(' ').trim();
  const intro = `Topic focus: ${topic}.`;
  const detailSource = context || 'The uploaded material is brief but highlights the essential ideas.';
  const detail = truncateWords(detailSource, 120);
  const emphasisOptions = [
    'Highlight the relationships between definitions and applications to anchor the concept.',
    'Connect procedural steps with the intuition behind them to reinforce retention.',
    'Notice how examples progress from simple to complex to guide your study rhythm.'
  ];
  const emphasis = emphasisOptions[Math.floor(rand() * emphasisOptions.length)];
  const stitched = `${intro} ${detail} ${emphasis}`;
  return truncateWords(stitched, 180);
}

function buildAnalogies(topic, rand) {
  const analogyAnchors = [
    'assembling a layered recipe where each ingredient adds nuance',
    'tuning an instrument until harmony emerges',
    'navigating a city with landmarks marking key turns',
    'crafting a blueprint before constructing a structure',
    'learning a choreography one phrase at a time'
  ];

  const frames = selectUnique(rand, analogyAnchors, 2);
  return frames.map((frame) => `Studying ${topic} is like ${frame}.`);
}

function buildExample(topic, chunks, rand) {
  const referenceChunk = chunks[0]?.text || 'a representative idea from your materials';
  const snippet = truncateWords(referenceChunk, 40);
  const setup = `Consider ${topic} in action: ${snippet}.`;
  const verbs = ['Identify', 'Apply', 'Reflect', 'Check'];
  const descriptors = ['core element', 'supporting idea', 'practical detail', 'result'];
  const steps = [];

  for (let i = 0; i < 3; i += 1) {
    const verb = verbs[(i + Math.floor(rand() * verbs.length)) % verbs.length];
    const descriptor = descriptors[(i + Math.floor(rand() * descriptors.length)) % descriptors.length];
    steps.push(`${verb} the ${descriptor} that ties back to the main concept.`);
  }

  steps.push('Summarize how the outcome connects to the motivating question.');

  return {
    setup,
    workedSteps: steps
  };
}

function buildCheckins(topic, rand) {
  const prompts = [
    'Which component reinforces the main takeaway?',
    'How does this idea relate to something you already know?',
    'What step would you revisit to clarify the process?',
    'Which example best illustrates the abstract principle?'
  ];
  const answers = [
    'It highlights the pivotal relationship described in your notes.',
    'It bridges new content with prior knowledge to deepen understanding.',
    'It pinpoints where additional practice will strengthen recall.',
    'It shows the mechanics before generalizing to harder cases.'
  ];

  const checkinPrompts = selectUnique(rand, prompts, 2);
  const checkins = checkinPrompts.map((question, index) => ({
    question: `${question} (${topic})`,
    answer: answers[index % answers.length]
  }));

  return checkins;
}

function cleanTopic(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function keywordFromChunk(chunk, rand) {
  if (!chunk || !chunk.text) {
    return 'concept';
  }

  const words = chunk.text
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3);

  if (!words.length) {
    return 'concept';
  }

  const index = Math.floor(rand() * words.length);
  return words[index].toLowerCase();
}

function buildChoices(topic, keyword, rand) {
  const templates = [
    `It emphasizes how ${keyword} anchors the discussion of ${topic}.`,
    `It contrasts ${keyword} with complementary elements in ${topic}.`,
    `It highlights a misconception about ${keyword} within ${topic}.`,
    `It extends ${keyword} toward a practical application of ${topic}.`,
    `It frames ${keyword} as motivation for exploring ${topic}.`,
    `It questions where ${keyword} fits into the wider narrative of ${topic}.`
  ];

  const selected = selectUnique(rand, templates, 4);
  return selected;
}

function chunkSnippet(chunk) {
  if (!chunk || !chunk.text) {
    return 'the referenced material.';
  }
  return `${truncateWords(chunk.text, 35)}.`;
}

function createMockLLMProvider() {
  return {
    name: 'mock-llm',
    async generateLesson({ chunks = [], topic, query } = {}) {
      const baseTopic = cleanTopic(topic || query, 'your study material');
      const seedInput = topic || query || chunks[0]?.document_id || 'lesson-default';
      const rand = mulberry32(hashSeed(seedInput));
      const limitedChunks = Array.isArray(chunks) ? chunks.slice(0, 12) : [];
      const summary = summarizeText(baseTopic, limitedChunks, rand);
      const analogies = buildAnalogies(baseTopic, rand);
      const example = buildExample(baseTopic, limitedChunks, rand);
      const checkins = buildCheckins(baseTopic, rand);
      const sources = buildSources(limitedChunks);

      return {
        topic: baseTopic,
        summary,
        analogies,
        example,
        checkins,
        sources
      };
    },
    async generateFullContextLesson({ document_id, title, full_text, include_check_ins = true } = {}) {
      const baseTopic = cleanTopic(title, 'Document Content');
      const seedInput = document_id || title || 'full-context-default';
      const rand = mulberry32(hashSeed(seedInput));

      // Extract key concepts from full text (mock version)
      const textSample = full_text ? truncateWords(full_text, 200) : 'Sample content';
      const concepts = [
        {
          name: `Core Concept from ${baseTopic}`,
          explanation: `This is a foundational idea extracted from the material. ${textSample}`,
          analogies: buildAnalogies(baseTopic, rand),
          examples: [
            {
              setup: `Consider this scenario from ${baseTopic}`,
              steps: ['Step 1: Understand the context', 'Step 2: Apply the principle', 'Step 3: Verify the result']
            }
          ]
        },
        {
          name: `Secondary Concept from ${baseTopic}`,
          explanation: `This builds upon the foundation with more advanced understanding.`,
          analogies: [`Understanding this is like building on solid ground.`],
          examples: [
            {
              setup: `A practical application scenario`,
              steps: ['Identify the components', 'Connect the relationships', 'Draw conclusions']
            }
          ]
        }
      ];

      const explanation = `This lesson guides you through ${baseTopic} by layering foundational understanding before applying it. ${textSample}`;

      const checkins = include_check_ins
        ? [
            {
              concept: concepts[0].name,
              question: `What is the main idea behind ${concepts[0].name}?`,
              hint: 'Think about the foundational principle discussed',
              expected_answer: 'The core principle that underpins this concept'
            },
            {
              concept: concepts[1].name,
              question: `How does ${concepts[1].name} relate to the first concept?`,
              hint: 'Consider how one builds upon the other',
              expected_answer: 'It extends the foundation with practical applications'
            }
          ]
        : [];

      console.log(`[MockLLM] include_check_ins: ${include_check_ins}, created ${checkins.length} checkins`);
      if (checkins.length > 0) {
        console.log(`[MockLLM] First checkin references concept: "${checkins[0].concept}"`);
      }

      const conceptsWithCheckIns = concepts.map((concept) => {
        const related = checkins
          .filter((checkin) => checkin.concept === concept.name)
          .map((checkin) => ({
            question: checkin.question,
            hint: checkin.hint,
            expected_answer: checkin.expected_answer
          }));

        console.log(`[MockLLM] Concept "${concept.name}" matched ${related.length} check_ins from ${checkins.length} total checkins`);
        if (checkins.length > 0 && related.length === 0) {
          console.log(`[MockLLM] First checkin.concept: "${checkins[0].concept}"`);
          console.log(`[MockLLM] Current concept.name: "${concept.name}"`);
        }

        return {
          ...concept,
          check_ins: related
        };
      });

      return {
        topic: baseTopic,
        summary: `This lesson covers key concepts from ${baseTopic}. ${textSample}`,
        explanation,
        concepts: conceptsWithCheckIns,
        checkins,
        document_id
      };
    },
    async generateMCQs({ chunks = [], n = 5, difficulty = 'med', topic } = {}) {
      const limitedChunks = Array.isArray(chunks) ? chunks.slice(0, 12) : [];
      const questionCount = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 20) : 5;
      const baseTopic = cleanTopic(topic || limitedChunks[0]?.topic, 'the subject');
      const seedInput = `${baseTopic}-${difficulty}-${limitedChunks[0]?.document_id || 'mcq-default'}`;
      const rand = mulberry32(hashSeed(seedInput));
      const items = [];

      if (!limitedChunks.length) {
        for (let i = 0; i < questionCount; i += 1) {
          items.push({
            question: `What is a central idea in ${baseTopic}?`,
            choices: [
              `It reinforces prior understanding of ${baseTopic}.`,
              `It introduces a tangent unrelated to ${baseTopic}.`,
              `It ignores examples that feature ${baseTopic}.`,
              `It relies solely on rote memorization of ${baseTopic}.`
            ],
            correctIndex: 0,
            rationale: 'With no retrieved context, emphasize the main point you control from your notes.',
            source: {
              document_id: null,
              page_start: 0,
              page_end: 0
            }
          });
        }
        return { items };
      }

      for (let i = 0; i < questionCount; i += 1) {
        const chunk = limitedChunks[i % limitedChunks.length];
        const localRand = mulberry32(hashSeed(`${seedInput}-${i}`));
        const keyword = keywordFromChunk(chunk, localRand);
        const choices = buildChoices(baseTopic, keyword, localRand);
        const correctIndex = Math.floor(localRand() * choices.length);
        const correctChoice = `It stresses ${keyword} as the anchor for understanding ${baseTopic}.`;
        choices[correctIndex] = correctChoice;

        items.push({
          question: `In ${baseTopic}, what role does ${keyword} play?`,
          choices,
          correctIndex,
          rationale: `The referenced material notes that ${keyword} is central: ${chunkSnippet(chunk)}`,
          source: {
            document_id: chunk.document_id || null,
            page_start: Number.isFinite(chunk.page_start) ? chunk.page_start : 0,
            page_end: Number.isFinite(chunk.page_end) ? chunk.page_end : Number.isFinite(chunk.page_start)
              ? chunk.page_start
              : 0
          }
        });
      }

      return { items };
    },
    async generateText(prompt) {
      // Mock implementation for text generation (e.g., for check-in evaluation)
      // Returns a simple evaluation response
      const isCorrectQuery = prompt.toLowerCase().includes('correct') || prompt.toLowerCase().includes('right');
      const score = isCorrectQuery ? 85 : 65;
      const correct = score >= 70;

      return JSON.stringify({
        correct,
        score,
        feedback: correct
          ? "Good understanding! Your answer captures the key concepts."
          : "Not quite right. Review the core principles and try again.",
        keyPoints: ["Key concept 1", "Key concept 2"],
        misconceptions: correct ? [] : ["Common misconception addressed"]
      });
    },
    async generateRawCompletion({ systemInstruction, userPrompt, temperature = 0.4 } = {}) {
      // Mock implementation for raw completion (e.g., for section extraction)
      // Generates deterministic mock sections based on the prompt
      const seedInput = userPrompt || 'section-extraction-default';
      const rand = mulberry32(hashSeed(seedInput));

      // Extract title from prompt if present
      const titleMatch = userPrompt?.match(/\*\*Title:\*\*\s*(.+)/);
      const docTitle = titleMatch ? titleMatch[1].trim() : 'Document';

      // Generate 6-10 mock sections
      const sectionCount = 6 + Math.floor(rand() * 5); // 6-10 sections
      const sections = [];

      const sectionTemplates = [
        'Introduction',
        'Fundamentals',
        'Core Concepts',
        'Advanced Topics',
        'Practical Applications',
        'Problem Solving Techniques',
        'Case Studies',
        'Best Practices',
        'Common Pitfalls',
        'Summary and Conclusions'
      ];

      for (let i = 0; i < sectionCount; i += 1) {
        const template = sectionTemplates[i % sectionTemplates.length];
        sections.push({
          name: `${template} - ${docTitle}`,
          description: `This section covers ${template.toLowerCase()} related to the main topic.`,
          page_range: i === 0 ? '1-10' : `${i * 10 + 1}-${(i + 1) * 10}`
        });
      }

      return JSON.stringify({ sections });
    }
  };
}

export default createMockLLMProvider;
