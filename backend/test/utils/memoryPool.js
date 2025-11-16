import { randomUUID } from 'node:crypto';

export function parseVector(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value
    .slice(1, -1)
    .split(',')
    .map((item) => Number.parseFloat(item));
}

export function euclideanDistance(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;

  for (let i = 0; i < length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

export function createMemoryPool() {
  const documents = new Map();
  const chunks = [];
  const lessons = new Map();
  const courses = new Map();
  const concepts = new Map();
  const studySessions = new Map();
  const jobs = new Map();

  function normalize(sql) {
    return sql.replace(/\s+/g, ' ').trim();
  }

  function enforceRowLevelSecurity(state, ownerId, relation) {
    if (state?.currentUserId && ownerId !== state.currentUserId) {
      const error = new Error(`new row violates row-level security policy for relation "${relation}"`);
      error.code = '42501';
      throw error;
    }
  }

  function filterByTenant(collection, state, ownerId) {
    return collection.filter((item) => {
      if (ownerId && item.owner_id !== ownerId) {
        return false;
      }
      if (state?.currentUserId && item.owner_id !== state.currentUserId) {
        return false;
      }
      return true;
    });
  }

  function createQuery(state) {
    return async function query(sql, params = []) {
      const normalized = normalize(sql);

      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT set_config(')) {
        if (state && params[0] === 'app.user_id') {
          state.currentUserId = params[1];
        }
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO documents')) {
        const ownerId = params[3];
        const fullText = params[4] ?? null;
        const materialType = params[5] ?? null;
        const chapter = params[6] ?? null;
        const userTags = params[7] ?? [];
        const courseId = params[8] ?? null;

        enforceRowLevelSecurity(state, ownerId, 'documents');
        documents.set(params[0], {
          id: params[0],
          title: params[1],
          pages: params[2],
          owner_id: ownerId,
          created_at: new Date(),
          full_text: fullText,
          material_type: materialType,
          chapter,
          user_tags: Array.isArray(userTags) ? userTags : [],
          course_id: courseId
        });
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO courses')) {
        const id = params[0] ?? randomUUID();
        const ownerId = params[1];
        const name = params[2] ?? 'Untitled Course';
        const code = params[3] ?? null;
        const term = params[4] ?? null;
        const examDate = params[5] ?? null;

        enforceRowLevelSecurity(state, ownerId, 'courses');

        courses.set(id, {
          id,
          owner_id: ownerId,
          name,
          code,
          term,
          exam_date: examDate,
          created_at: new Date(),
          updated_at: new Date()
        });

        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO jobs')) {
        const id = params[0];
        const ownerId = params[1];
        const type = params[2];
        const status = params[3];
        const progress = params[4];
        const data = params[5];

        enforceRowLevelSecurity(state, ownerId, 'jobs');

        jobs.set(id, {
          id,
          owner_id: ownerId,
          type,
          status,
          progress,
          data: typeof data === 'string' ? JSON.parse(data) : data,
          created_at: new Date(),
          updated_at: new Date()
        });

        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO chunks')) {
        for (let i = 0; i < params.length; i += 7) {
          const ownerId = params[i + 6];
          enforceRowLevelSecurity(state, ownerId, 'chunks');
          chunks.push({
            document_id: params[i],
            page_start: params[i + 1],
            page_end: params[i + 2],
            text: params[i + 3],
            token_count: params[i + 4],
            embedding: parseVector(params[i + 5]),
            owner_id: ownerId
          });
        }
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO lessons')) {
        const ownerId = params[0];
        enforceRowLevelSecurity(state, ownerId, 'lessons');

        const id = randomUUID();
        const createdAt = new Date();
        // Updated indices after adding section_id as param[4]
        const sectionId = params[4] ?? null;
        const examplesValue = params[7];
        const analogiesValue = params[8];
        const conceptsValue = params[9];

        const examples = typeof examplesValue === 'string'
          ? JSON.parse(examplesValue)
          : (examplesValue ?? []);
        const analogies = typeof analogiesValue === 'string'
          ? JSON.parse(analogiesValue)
          : (analogiesValue ?? []);
        const concepts = typeof conceptsValue === 'string'
          ? JSON.parse(conceptsValue)
          : (conceptsValue ?? []);

        const lesson = {
          id,
          owner_id: ownerId,
          document_id: params[1],
          course_id: params[2] ?? null,
          chapter: params[3] ?? null,
          section_id: sectionId,
          summary: params[5] ?? null,
          explanation: params[6],
          examples,
          analogies,
          concepts,
          created_at: createdAt
        };

        lessons.set(id, lesson);

        return {
          rows: [
            {
              id: lesson.id,
              summary: lesson.summary,
              explanation: lesson.explanation,
              examples: lesson.examples,
              analogies: lesson.analogies,
              concepts: lesson.concepts,
              section_id: lesson.section_id,
              created_at: lesson.created_at
            }
          ]
        };
      }

      if (normalized.startsWith('DELETE FROM chunks')) {
        const id = params[0];
        for (let i = chunks.length - 1; i >= 0; i -= 1) {
          if (chunks[i].document_id === id) {
            chunks.splice(i, 1);
          }
        }
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO concepts')) {
        const ownerId = params[0];
        enforceRowLevelSecurity(state, ownerId, 'concepts');

        const id = randomUUID();

        // Handle two different INSERT formats:
        // 1. New format: (owner_id, name, chapter, course_id, document_id, section_id, concept_number, mastery_state='not_learned')
        //    - 7 params, mastery_state hardcoded in query
        // 2. Test format: (owner_id, name, chapter, course_id, document_id, mastery_state, total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
        //    - 10 params, full mastery tracking

        let concept;
        if (params.length <= 7) {
          // New format from lesson generation
          concept = {
            id,
            owner_id: ownerId,
            name: params[1],
            chapter: params[2] ?? null,
            course_id: params[3] ?? null,
            document_id: params[4] ?? null,
            section_id: params[5] ?? null,
            concept_number: params[6] ?? null,
            mastery_state: 'not_learned',
            total_attempts: 0,
            correct_attempts: 0,
            consecutive_correct: 0,
            last_reviewed_at: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          };
        } else {
          // Test format with full mastery tracking (old schema without section_id)
          concept = {
            id,
            owner_id: ownerId,
            name: params[1],
            chapter: params[2] ?? null,
            course_id: params[3] ?? null,
            document_id: params[4] ?? null,
            section_id: null, // Not provided in old format
            concept_number: null,
            mastery_state: params[5] ?? 'not_learned',
            total_attempts: params[6] ?? 0,
            correct_attempts: params[7] ?? 0,
            consecutive_correct: params[8] ?? 0,
            last_reviewed_at: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          };
        }

        concepts.set(id, concept);

        return { rows: [{ id }] };
      }

      if (normalized === 'SELECT * FROM concepts WHERE id = $1 AND owner_id = $2') {
        const concept = concepts.get(params[0]);
        if (
          concept &&
          concept.owner_id === params[1] &&
          (!state?.currentUserId || state.currentUserId === concept.owner_id)
        ) {
          return { rows: [concept] };
        }

        return { rows: [] };
      }

      if (normalized === 'SELECT * FROM concepts WHERE owner_id = $1 AND name = $2 AND chapter = $3') {
        const ownerId = params[0];
        const name = params[1];
        const chapter = params[2];

        const rows = Array.from(concepts.values()).filter((concept) => {
          if (concept.owner_id !== ownerId) {
            return false;
          }

          if (state?.currentUserId && state.currentUserId !== ownerId) {
            return false;
          }

          return concept.name === name && concept.chapter === chapter;
        });

        return { rows };
      }

      if (normalized === 'SELECT id FROM concepts WHERE owner_id = $1 AND name = $2 AND document_id = $3 AND (section_id = $4 OR (section_id IS NULL AND $4 IS NULL))') {
        const ownerId = params[0];
        const name = params[1];
        const documentId = params[2];
        const sectionId = params[3];

        const rows = Array.from(concepts.values()).filter((concept) => {
          if (concept.owner_id !== ownerId) {
            return false;
          }

          if (state?.currentUserId && state.currentUserId !== ownerId) {
            return false;
          }

          if (concept.name !== name || concept.document_id !== documentId) {
            return false;
          }

          // Match section_id = $4 OR (section_id IS NULL AND $4 IS NULL)
          if (sectionId === null) {
            return concept.section_id === null;
          }
          return concept.section_id === sectionId;
        }).map(concept => ({ id: concept.id }));

        return { rows };
      }

      if (normalized.startsWith('UPDATE concepts SET mastery_state')) {
        const conceptId = params[4];
        const concept = concepts.get(conceptId);

        if (concept) {
          concept.mastery_state = params[0];
          concept.total_attempts = params[1];
          concept.correct_attempts = params[2];
          concept.consecutive_correct = params[3];
          concept.last_reviewed_at = new Date();
          concept.updated_at = new Date();
        }

        return { rows: [] };
      }

      if (normalized === 'UPDATE concepts SET concept_number = $1, chapter = $2, course_id = $3 WHERE id = $4') {
        const conceptId = params[3];
        const concept = concepts.get(conceptId);

        if (concept) {
          concept.concept_number = params[0];
          concept.chapter = params[1];
          concept.course_id = params[2];
          concept.updated_at = new Date();
        }

        return { rows: [] };
      }

      if (normalized.startsWith("SELECT cpt.id, cpt.name, cpt.chapter")) {
        const ownerId = params[0];
        const courseIdFilter = params[1];

        const rows = Array.from(concepts.values())
          .filter((concept) => {
            if (concept.owner_id !== ownerId) {
              return false;
            }

            if (state?.currentUserId && state.currentUserId !== ownerId) {
              return false;
            }

            if (courseIdFilter) {
              return concept.course_id === courseIdFilter;
            }

            return true;
          })
          .sort((a, b) => {
            if (a.course_id && !b.course_id) {
              return -1;
            }
            if (!a.course_id && b.course_id) {
              return 1;
            }
            if (a.course_id && b.course_id) {
              const courseCompare = a.course_id.localeCompare(b.course_id);
              if (courseCompare !== 0) {
                return courseCompare;
              }
            }

            const chapterA = a.chapter || 'Uncategorized';
            const chapterB = b.chapter || 'Uncategorized';
            const chapterCompare = chapterA.localeCompare(chapterB, undefined, { numeric: true });
            if (chapterCompare !== 0) {
              return chapterCompare;
            }

            return a.name.localeCompare(b.name);
          })
          .map((concept) => ({
            id: concept.id,
            name: concept.name,
            chapter: concept.chapter,
            course_id: concept.course_id,
            mastery_state: concept.mastery_state,
            total_attempts: concept.total_attempts,
            correct_attempts: concept.correct_attempts,
            consecutive_correct: concept.consecutive_correct,
            last_reviewed_at: concept.last_reviewed_at,
            created_at: concept.created_at,
            course_name: concept.course_id && courses.get(concept.course_id)
              ? courses.get(concept.course_id).name
              : 'Unassigned Course'
          }));

        return { rows };
      }

      if (normalized.startsWith('INSERT INTO study_sessions')) {
        const ownerId = params[0];
        enforceRowLevelSecurity(state, ownerId, 'study_sessions');

        const id = randomUUID();
        const session = {
          id,
          owner_id: ownerId,
          session_type: params[1],
          chapter: params[2] ?? null,
          document_id: params[3] ?? null,
          course_id: params[4] ?? null,
          started_at: new Date(),
          completed_at: null,
          duration_minutes: null,
          total_check_ins: 0,
          correct_check_ins: 0,
          concepts_covered: [],
          problems_attempted: []
        };

        studySessions.set(id, session);

        return { rows: [{ id, started_at: session.started_at }] };
      }

      if (normalized.startsWith('UPDATE study_sessions SET total_check_ins')) {
        const sessionId = params[0];
        const ownerId = params[1];
        const increment = params[2] ?? 0;
        const session = studySessions.get(sessionId);

        if (
          session &&
          session.owner_id === ownerId &&
          (!state?.currentUserId || state.currentUserId === ownerId)
        ) {
          session.total_check_ins += 1;
          session.correct_check_ins += increment;
        }

        return { rows: [] };
      }

      if (normalized.startsWith('UPDATE study_sessions SET concepts_covered')) {
        const conceptId = params[0];
        const sessionId = params[1];
        const ownerId = params[2];
        const session = studySessions.get(sessionId);

        if (
          session &&
          session.owner_id === ownerId &&
          (!state?.currentUserId || state.currentUserId === ownerId)
        ) {
          if (!session.concepts_covered.includes(conceptId)) {
            session.concepts_covered.push(conceptId);
          }
        }

        return { rows: [] };
      }

      if (normalized.startsWith('UPDATE study_sessions SET completed_at = NOW()')) {
        const sessionId = params[0];
        const ownerId = params[1];
        const session = studySessions.get(sessionId);

        if (
          !session ||
          session.owner_id !== ownerId ||
          (state?.currentUserId && state.currentUserId !== ownerId) ||
          session.completed_at
        ) {
          return { rows: [] };
        }

        const completedAt = new Date();
        session.completed_at = completedAt;
        const durationMinutes = (completedAt - session.started_at) / 60000;
        session.duration_minutes = durationMinutes;

        return {
          rows: [{
            duration_minutes: durationMinutes,
            total_check_ins: session.total_check_ins,
            correct_check_ins: session.correct_check_ins
          }]
        };
      }

      if (normalized.startsWith('SELECT ss.id, ss.session_type')) {
        const ownerId = params[0];
        const courseIdFilter = params[1];

        const rows = Array.from(studySessions.values())
          .filter((session) => {
            if (session.owner_id !== ownerId) {
              return false;
            }

            if (state?.currentUserId && state.currentUserId !== ownerId) {
              return false;
            }

            if (courseIdFilter) {
              return session.course_id === courseIdFilter;
            }

            return true;
          })
          .sort((a, b) => b.started_at - a.started_at)
          .slice(0, 10)
          .map((session) => ({
            id: session.id,
            session_type: session.session_type,
            chapter: session.chapter,
            course_id: session.course_id,
            total_check_ins: session.total_check_ins,
            correct_check_ins: session.correct_check_ins,
            duration_minutes: session.duration_minutes,
            started_at: session.started_at,
            completed_at: session.completed_at,
            course_name: session.course_id && courses.get(session.course_id)
              ? courses.get(session.course_id).name
              : 'Unassigned Course'
          }));

        return { rows };
      }

      if (normalized.startsWith('SELECT COUNT(*) as total_sessions')) {
        const ownerId = params[0];
        const courseIdFilter = params[1];

        const sessions = Array.from(studySessions.values()).filter((session) => {
          if (session.owner_id !== ownerId) {
            return false;
          }

          if (state?.currentUserId && state.currentUserId !== ownerId) {
            return false;
          }

          if (courseIdFilter) {
            return session.course_id === courseIdFilter;
          }

          return true;
        });

        const totalCheckIns = sessions.reduce((sum, session) => sum + session.total_check_ins, 0);
        const totalCorrect = sessions.reduce((sum, session) => sum + session.correct_check_ins, 0);
        const totalMinutes = sessions.reduce((sum, session) => sum + (session.duration_minutes ?? 0), 0);

        return {
          rows: [{
            total_sessions: String(sessions.length),
            total_check_ins: String(totalCheckIns),
            total_correct: String(totalCorrect),
            total_minutes: String(totalMinutes)
          }]
        };
      }

      if (normalized.startsWith('DELETE FROM documents')) {
        documents.delete(params[0]);
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT c.document_id')) {
        const queryVector = parseVector(params[0]);
        const ownerId = params[1];
        const limit = params[2];
        const filtered = filterByTenant(chunks, state, ownerId);
        const rows = filtered
          .map((chunk) => ({
            document_id: chunk.document_id,
            page_start: chunk.page_start,
            page_end: chunk.page_end,
            text: chunk.text,
            distance: euclideanDistance(chunk.embedding, queryVector)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limit);

        return { rows };
      }

      if (normalized.startsWith('SELECT id, title, pages, created_at as uploaded_at, material_type, chapter, user_tags, course_id FROM documents WHERE owner_id = $1')) {
        const ownerId = params[0];
        const courseIdFilter = params[1];
        const rows = filterByTenant(Array.from(documents.values()), state, ownerId)
          .filter((doc) => courseIdFilter ? doc.course_id === courseIdFilter : true)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 100)
          .map((doc) => ({
            id: doc.id,
            title: doc.title,
            pages: doc.pages,
            uploaded_at: doc.created_at,
            material_type: doc.material_type || null,
            chapter: doc.chapter || null,
            user_tags: doc.user_tags || [],
            course_id: doc.course_id || null
          }));

        return { rows };
      }

      if (normalized.startsWith('SELECT id, title, pages, created_at FROM documents WHERE owner_id') ||
          normalized.startsWith('SELECT id, title, pages, created_at, material_type, chapter, user_tags FROM documents WHERE owner_id')) {
        const ownerId = params[0];
        const rows = filterByTenant(Array.from(documents.values()), state, ownerId).map((doc) => ({
          id: doc.id,
          title: doc.title,
          pages: doc.pages,
          created_at: doc.created_at,
          material_type: doc.material_type || null,
          chapter: doc.chapter || null,
          user_tags: doc.user_tags || []
        }));

        return { rows };
      }

      if (normalized.startsWith('SELECT id, title, full_text, material_type, chapter as doc_chapter, course_id') && normalized.includes('FROM documents WHERE id = $1 AND owner_id = $2')) {
        const documentId = params[0];
        const ownerId = params[1];
        const doc = documents.get(documentId);
        if (doc && doc.owner_id === ownerId && (!state?.currentUserId || state.currentUserId === ownerId)) {
          return {
            rows: [{
              id: doc.id,
              title: doc.title,
              full_text: doc.full_text,
              material_type: doc.material_type || null,
              doc_chapter: doc.chapter || null,
              course_id: doc.course_id || null,
              pages: doc.pages || 1
            }]
          };
        }
        return { rows: [] };
      }

      // Check if lesson exists with section_id IS NULL
      if (normalized === 'SELECT id FROM lessons WHERE document_id = $1 AND owner_id = $2 AND section_id IS NULL LIMIT 1') {
        const documentId = params[0];
        const ownerId = params[1];
        if (state?.currentUserId && state.currentUserId !== ownerId) {
          return { rows: [] };
        }

        for (const lesson of lessons.values()) {
          if (lesson.document_id === documentId && lesson.owner_id === ownerId && lesson.section_id === null) {
            return { rows: [{ id: lesson.id }] };
          }
        }
        return { rows: [] };
      }

      if (normalized.startsWith('SELECT id, summary, explanation, examples, analogies, concepts, created_at FROM lessons WHERE document_id = $1 AND owner_id = $2')) {
        const documentId = params[0];
        const ownerId = params[1];
        if (state?.currentUserId && state.currentUserId !== ownerId) {
          return { rows: [] };
        }

        for (const lesson of lessons.values()) {
          if (lesson.document_id === documentId && lesson.owner_id === ownerId) {
            return {
              rows: [
                {
                  id: lesson.id,
                  summary: lesson.summary,
                  explanation: lesson.explanation,
                  examples: lesson.examples,
                  analogies: lesson.analogies,
                  concepts: lesson.concepts,
                  created_at: lesson.created_at
                }
              ]
            };
          }
        }

        return { rows: [] };
      }

      if (normalized === 'SELECT 1 FROM courses WHERE id = $1 AND owner_id = $2') {
        const course = courses.get(params[0]);
        if (
          course &&
          course.owner_id === params[1] &&
          (!state?.currentUserId || state.currentUserId === params[1])
        ) {
          return { rows: [{ '?column?': 1 }] };
        }

        return { rows: [] };
      }

      if (normalized.startsWith('UPDATE documents SET')) {
        const documentId = params[0];
        const ownerId = params[1];
        const doc = documents.get(documentId);

        if (!doc || doc.owner_id !== ownerId || (state?.currentUserId && state.currentUserId !== ownerId)) {
          return { rows: [] };
        }

        const setClause = normalized.slice('UPDATE documents SET '.length, normalized.indexOf(' WHERE '));
        const assignments = setClause.split(',').map((part) => part.trim());

        for (const assignment of assignments) {
          const [field, placeholder] = assignment.split('=').map((piece) => piece.trim());
          const paramPosition = Number.parseInt(placeholder.replace('$', ''), 10) - 1;
          const value = params[paramPosition];

          switch (field) {
            case 'material_type':
              doc.material_type = value ?? null;
              break;
            case 'chapter':
              doc.chapter = value ?? null;
              break;
            case 'title':
              doc.title = value ?? doc.title;
              break;
            case 'user_tags':
              doc.user_tags = Array.isArray(value) ? value : [];
              break;
            case 'course_id':
              doc.course_id = value ?? null;
              break;
            default:
              break;
          }
        }

        return {
          rows: [{
            id: doc.id,
            title: doc.title,
            pages: doc.pages,
            created_at: doc.created_at,
            material_type: doc.material_type || null,
            chapter: doc.chapter || null,
            user_tags: doc.user_tags || [],
            course_id: doc.course_id || null
          }]
        };
      }

      if (normalized.startsWith('SELECT id, owner_id FROM documents')) {
        const rows = filterByTenant(Array.from(documents.values()), state).map((doc) => ({
          id: doc.id,
          owner_id: doc.owner_id
        }));
        return { rows };
      }

      if (normalized === 'SELECT 1 AS OK') {
        return { rows: [{ ok: 1 }] };
      }

      throw new Error(`Unsupported query: ${normalized}`);
    };
  }

  return {
    documents,
    chunks,
    query: createQuery(null),
    async connect() {
      const state = { currentUserId: null };
      return {
        query: createQuery(state),
        release() {}
      };
    }
  };
}

export default createMemoryPool;
