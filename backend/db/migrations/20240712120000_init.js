/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('uuid-ossp', { ifNotExists: true });
  pgm.createExtension('vector', { ifNotExists: true });

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
    embedding: { type: 'vector(3072)' },
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

  pgm.createTable('mastery', {
    user_id: { type: 'uuid', notNull: true },
    topic: { type: 'text', notNull: true },
    strength: { type: 'real', default: 0 },
    updated_at: { type: 'timestamptz', default: pgm.func('now()') },
    primaryKey: ['user_id', 'topic']
  });

  pgm.createIndex('chunks', 'document_id');
  pgm.createIndex('chunks', ['page_start', 'page_end']);
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS chunks_embedding_ivfflat ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);'
  );
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS chunks_embedding_ivfflat;');
  pgm.dropIndex('chunks', ['page_start', 'page_end']);
  pgm.dropIndex('chunks', 'document_id');

  pgm.dropTable('mastery');
  pgm.dropTable('quiz_runs');
  pgm.dropTable('cards');
  pgm.dropTable('chunks');
  pgm.dropTable('documents');
};
