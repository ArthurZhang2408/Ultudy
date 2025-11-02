/* eslint-disable camelcase */

module.exports = {
  up: async (pgm) => {
    pgm.addColumn('documents', {
      owner_id: {
        type: 'uuid',
        notNull: false
      }
    });

    pgm.sql(`
      UPDATE documents
      SET owner_id = '00000000-0000-0000-0000-000000000001'
      WHERE owner_id IS NULL;
    `);

    pgm.alterColumn('documents', 'owner_id', { notNull: true });
    pgm.createIndex('documents', 'owner_id');
  },

  down: async (pgm) => {
    pgm.dropIndex('documents', 'owner_id');
    pgm.dropColumn('documents', 'owner_id');
  }
};
