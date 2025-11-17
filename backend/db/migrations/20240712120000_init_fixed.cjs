/* eslint-disable camelcase */

module.exports = {
  shorthands: undefined,
  up: (pgm) => {
    pgm.createExtension('uuid-ossp', { ifNotExists: true });

    // Try to create vector extension, but don't fail if it's not available
    try {
      pgm.createExtension('vector', { ifNotExists: true });
    } catch (e) {
      console.log('pgvector extension not available, skipping...');
    }

    pgm.createTable('documents', {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()')
      },
      title: { type: 'text', notNull: true },
      pages: { type: 'int' },
      created_at: { type: 'timestamptz', default: pgm.func('now()') }
    });

    pgm.createTable('chunks', {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()')
      },
      document_id: {
        type: 'uuid',
        notNull: true,
        references: 'documents',
        onDelete: 'cascade'
      },
      page_start: { type: 'int', notNull: true },
      page_end: { type: 'int', notNull: true },
      text: { type: 'text', notNull: true },
      token_count: { type: 'int' },
      // Skip embedding column if pgvector not available - it's not used anymore anyway
      // embedding: { type: 'vector(3072)' },
      created_at: { type: 'timestamptz', default: pgm.func('now()') }
    });

    pgm.createTable('cards', {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()')
      },
      user_id: { type: 'uuid' },
      chunk_id: {
        type: 'uuid',
        references: 'chunks',
        onDelete: 'set null'
      },
      front: { type: 'text', notNull: true },
      back: { type: 'text', notNull: true },
      ease: { type: 'float' },
      interval_days: { type: 'int' },
      due_at: { type: 'date' },
      created_at: { type: 'timestamptz', default: pgm.func('now()') }
    });

    pgm.createTable('quiz_runs', {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()')
      },
      user_id: { type: 'uuid' },
      topic: { type: 'text' },
      score: { type: 'numeric' },
      started_at: { type: 'timestamptz', default: pgm.func('now()') },
      finished_at: { type: 'timestamptz' }
    });

    pgm.createTable(
      'mastery',
      {
        user_id: { type: 'uuid', notNull: true },
        topic: { type: 'text', notNull: true },
        strength: { type: 'real', default: 0 },
        updated_at: { type: 'timestamptz', default: pgm.func('now()') }
      },
      { primaryKey: ['user_id', 'topic'] }
    );

    pgm.createIndex('chunks', 'document_id');
    pgm.createIndex('chunks', ['page_start', 'page_end']);

    // Skip vector index creation - pgvector system was removed in Jan 2025 refactor
  },

  down: (pgm) => {
    pgm.dropIndex('chunks', ['page_start', 'page_end']);
    pgm.dropIndex('chunks', 'document_id');

    pgm.dropTable('mastery');
    pgm.dropTable('quiz_runs');
    pgm.dropTable('cards');
    pgm.dropTable('chunks');
    pgm.dropTable('documents');
  }
};
