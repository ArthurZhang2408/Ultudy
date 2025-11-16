/**
 * Simple script to create jobs table via admin endpoint
 * Run with: node scripts/setup-jobs-table-simple.js
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function setupJobsTable() {
  console.log('🔍 Checking if jobs table exists...\n');

  try {
    // Check if table exists
    const checkRes = await fetch(`${BACKEND_URL}/admin/check-jobs-table`);
    const checkData = await checkRes.json();

    console.log('Current status:', JSON.stringify(checkData, null, 2));

    if (checkData.exists) {
      console.log('\n✅ Jobs table already exists!');
      console.log('Columns:', checkData.columns.map(c => c.column_name).join(', '));
      return;
    }

    console.log('\n📦 Jobs table does not exist. Creating it now...\n');

    // Create table
    const createRes = await fetch(`${BACKEND_URL}/admin/create-jobs-table`, {
      method: 'POST'
    });
    const createData = await createRes.json();

    if (createData.success) {
      console.log('✅ Jobs table created successfully!');
      console.log('\nColumns created:');
      createData.columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    } else {
      console.error('❌ Failed to create jobs table:', createData.error);
      process.exit(1);
    }

    // Verify
    console.log('\n🔍 Verifying table was created...\n');
    const verifyRes = await fetch(`${BACKEND_URL}/admin/check-jobs-table`);
    const verifyData = await verifyRes.json();

    if (verifyData.exists) {
      console.log('✅ Verification successful! Jobs table exists.');
    } else {
      console.error('❌ Verification failed. Table may not have been created.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure your backend is running on', BACKEND_URL);
    process.exit(1);
  }
}

setupJobsTable();
