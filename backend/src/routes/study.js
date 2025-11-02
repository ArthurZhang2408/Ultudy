import express from 'express';
import createSearchService from '../search/service.js';
import createStudyService from '../study/service.js';
import { getUserId } from '../http/user.js';

const DEFAULT_LESSON_K = 6;
const DEFAULT_MCQ_COUNT = 5;
const MAX_CHUNK_LIMIT = 12;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'med', 'hard']);

function normalizeLimit(value, fallback, cap = MAX_CHUNK_LIMIT) {
  if (Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), cap);
  }
  return fallback;
}

function ensureSearchText(topic, query) {
  if (typeof query === 'string' && query.trim()) {
    return query.trim();
  }

  if (typeof topic === 'string' && topic.trim()) {
    return topic.trim();
  }

  return null;
}

function mapChunksWithTopic(chunks, topic) {
  if (!topic) {
    return chunks;
  }
  return chunks.map((chunk) => ({ ...chunk, topic }));
}

export default function createStudyRouter(options = {}) {
  const router = express.Router();
  const searchService = options.searchService ||
    createSearchService({
      pool: options.pool,
      embeddingsProviderFactory: options.embeddingsProviderFactory
    });
  const studyService = options.studyService ||
    createStudyService({
      llmProviderFactory: options.llmProviderFactory
    });

  router.post('/study/lesson', async (req, res) => {
    const { topic, query, k } = req.body || {};
    const searchText = ensureSearchText(topic, query);

    if (!searchText) {
      res.status(400).json({ error: 'Either topic or query must be provided.' });
      return;
    }

    const limit = normalizeLimit(k, DEFAULT_LESSON_K);
    const ownerId = getUserId(req);

    try {
      const chunks = await searchService.searchChunks(searchText, limit, ownerId);
      const lesson = await studyService.buildLesson(chunks, { topic, query: searchText });
      res.json(lesson);
    } catch (error) {
      console.error('Failed to build lesson', error);
      res.status(500).json({ error: 'Failed to build lesson' });
    }
  });

  router.post('/practice/mcq', async (req, res) => {
    const { topic, n, difficulty } = req.body || {};

    if (difficulty && !ALLOWED_DIFFICULTIES.has(difficulty)) {
      res.status(400).json({ error: 'Invalid difficulty. Use easy, med, or hard.' });
      return;
    }

    const safeTopic = typeof topic === 'string' && topic.trim() ? topic.trim() : null;
    const searchText = safeTopic || 'study practice';
    const ownerId = getUserId(req);
    const questionCount = normalizeLimit(n, DEFAULT_MCQ_COUNT, 20);
    const chunkLimit = normalizeLimit(Math.max(questionCount, DEFAULT_LESSON_K), DEFAULT_LESSON_K);

    try {
      const chunks = await searchService.searchChunks(searchText, chunkLimit, ownerId);
      const annotatedChunks = mapChunksWithTopic(chunks, safeTopic || 'practice focus');
      const result = await studyService.makeMCQs(annotatedChunks, questionCount, difficulty || 'med');
      res.json(result);
    } catch (error) {
      console.error('Failed to generate MCQs', error);
      res.status(500).json({ error: 'Failed to generate MCQs' });
    }
  });

  return router;
}
