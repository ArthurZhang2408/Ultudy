import pool from './index.js';

export function createTenantHelpers(activePool) {
  if (!activePool) {
    throw new Error('Database pool is required to create tenant helpers');
  }

  async function withTenant(userId, fn) {
    if (typeof userId !== 'string' || !userId) {
      throw new Error('A userId is required to establish tenant context');
    }

    const client = await activePool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to rollback tenant transaction', rollbackError);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function runAs(userId, text, params = []) {
    return withTenant(userId, (client) => client.query(text, params));
  }

  return { withTenant, runAs };
}

let defaultHelpers = null;

if (pool) {
  defaultHelpers = createTenantHelpers(pool);
}

export const withTenant = defaultHelpers
  ? defaultHelpers.withTenant
  : async function unavailableTenant() {
      throw new Error('Database pool is not configured for tenant helpers');
    };

export const runAs = defaultHelpers
  ? defaultHelpers.runAs
  : async function unavailableRunAs() {
      throw new Error('Database pool is not configured for tenant helpers');
    };

export default withTenant;
