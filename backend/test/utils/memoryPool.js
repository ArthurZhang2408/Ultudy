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
        enforceRowLevelSecurity(state, ownerId, 'documents');
        documents.set(params[0], {
          id: params[0],
          title: params[1],
          pages: params[2],
          owner_id: ownerId,
          created_at: new Date()
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

      if (normalized.startsWith('DELETE FROM chunks')) {
        const id = params[0];
        for (let i = chunks.length - 1; i >= 0; i -= 1) {
          if (chunks[i].document_id === id) {
            chunks.splice(i, 1);
          }
        }
        return { rows: [] };
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
