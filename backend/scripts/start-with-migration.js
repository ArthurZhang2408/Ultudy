#!/usr/bin/env node

/**
 * Startup script that runs migration then starts the server
 */

import { spawn } from 'child_process';

console.log('=== Starting Ultudy Backend ===');
console.log('Step 1: Running database migrations...\n');

// Run first migration
const migrate1 = spawn('node', ['scripts/add-archived-columns.js'], {
  stdio: 'inherit',
  env: process.env,
});

migrate1.on('close', (code) => {
  if (code !== 0) {
    console.error(`First migration failed with code ${code}`);
    process.exit(1);
  }

  console.log('\nStep 2: Running chapters migration...\n');

  // Run second migration
  const migrate2 = spawn('node', ['scripts/add-chapters-tables.js'], {
    stdio: 'inherit',
    env: process.env,
  });

  migrate2.on('close', (code2) => {
    if (code2 !== 0) {
      console.error(`Second migration failed with code ${code2}`);
      process.exit(1);
    }

    console.log('\nStep 3: Running two-phase processing migration...\n');

    // Run third migration
    const migrate3 = spawn('node', ['scripts/add-two-phase-processing.js'], {
      stdio: 'inherit',
      env: process.env,
    });

    migrate3.on('close', (code3) => {
      if (code3 !== 0) {
        console.error(`Third migration failed with code ${code3}`);
        process.exit(1);
      }

      console.log('\nStep 4: Starting server...\n');

      // Start the server
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
    }); // Close migrate3.on('close')
  }); // Close migrate2.on('close')
}); // Close migrate1.on('close')
