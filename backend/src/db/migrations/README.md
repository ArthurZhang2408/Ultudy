# Database Migrations

This directory contains SQL migration files for performance optimizations and schema changes.

## Running Migrations

### Option 1: Using psql (Recommended)
```bash
# From the project root directory
psql $DATABASE_URL -f backend/src/db/migrations/001_add_performance_indexes.sql
```

### Option 2: Using the Node.js migration script
```bash
cd backend
node src/db/migrations/run.js
```

### Option 3: Manually in your database client
Copy the contents of the SQL file and run it in your PostgreSQL client (pgAdmin, DBeaver, etc.)

## Migrations

- **001_add_performance_indexes.sql**: Adds indexes for high-traffic query patterns
  - Safe to run multiple times (uses IF NOT EXISTS)
  - Improves query performance by 10-100x for large datasets
  - No downtime required

## After Running Migrations

Run `ANALYZE` to update query planner statistics:
```sql
ANALYZE;
```

This helps PostgreSQL choose optimal query plans with the new indexes.
