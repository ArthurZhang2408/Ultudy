#!/usr/bin/env node

/**
 * Startup script that runs migration then starts the server
 */

import { spawn } from 'child_process';

console.log('=== Starting Ultudy Backend ===');
console.log('Step 1: Running database migrations...\n');

// Run migrations sequentially
const migrations = [
  'scripts/add-archived-columns.js',
  'scripts/run-tier2-one-pass-migration.js'
];

let currentMigration = 0;

function runNextMigration() {
  if (currentMigration >= migrations.length) {
    console.log('\nStep 2: Starting server...\n');

    // All migrations done, start the server
    const server = spawn('node', ['src/server.js'], {
      stdio: 'inherit',
      env: process.env,
    });

    server.on('close', (serverCode) => {
      process.exit(serverCode);
    });

    // Handle shutdown signals
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully');
      server.kill('SIGTERM');
    });

    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully');
      server.kill('SIGINT');
    });
    return;
  }

  const migrationScript = migrations[currentMigration];
  console.log(`Running migration: ${migrationScript}`);

  const migrate = spawn('node', [migrationScript], {
    stdio: 'inherit',
    env: process.env,
  });

  migrate.on('close', (code) => {
    if (code !== 0) {
      console.error(`Migration ${migrationScript} failed with code ${code}`);
      process.exit(1);
    }

    currentMigration++;
    runNextMigration();
  });
}

// Start running migrations
runNextMigration();
