#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const CONNECTION_ERROR_EXIT_CODE = 2;

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const requiredKeys = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGPORT', 'PGDATABASE'];
  const missing = requiredKeys.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `Missing database connection information: ${missing.join(', ')}. Provide DATABASE_URL or PG* environment variables.`
    );
    process.exit(CONNECTION_ERROR_EXIT_CODE);
  }

  return {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE
  };
}

async function main() {
  const config = buildConfig();
  const client = new Client(config);
  let ivfflatSupported = true;

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('SET pgvector.max_ivfflat_dim = 4000');

    await client.query('CREATE TEMP TABLE IF NOT EXISTS __pgvector_probe (embedding vector(3072))');

    try {
      await client.query(
        'CREATE INDEX __pgvector_probe_idx ON __pgvector_probe USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)'
      );
      console.log('✔ pgvector ivfflat index supports 3072 dimensions.');
    } catch (error) {
      ivfflatSupported = false;
      console.warn('⚠️ pgvector ivfflat index creation failed:', error.message);
      console.warn('   Falling back to HNSW search in migrations.');
    } finally {
      await client.query('DROP INDEX IF EXISTS __pgvector_probe_idx');
      await client.query('DROP TABLE IF EXISTS __pgvector_probe');
    }
  } catch (error) {
    console.error('Failed to verify pgvector index support:', error);
    process.exit(CONNECTION_ERROR_EXIT_CODE);
  } finally {
    await client.end();
  }

  if (!ivfflatSupported) {
    console.log('HNSW will be used automatically when IVFFLAT is unavailable.');
  }
}

main();
