#!/usr/bin/env tsx
/**
 * Verify which Supabase project we're connecting to
 */

import { Client } from 'pg';

const TARGET_DATABASE_URL = process.env.TARGET_DATABASE_URL;

if (!TARGET_DATABASE_URL) {
  console.error('❌ TARGET_DATABASE_URL required');
  process.exit(1);
}

async function verify() {
  const addSSLParams = (url: string) => {
    if (url.includes('localhost')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}sslmode=no-verify`;
  };

  const client = new Client({
    connectionString: addSSLParams(TARGET_DATABASE_URL),
    ssl: TARGET_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    console.log('🔍 Connection Information:');
    console.log('');

    // Get database name
    const dbResult = await client.query('SELECT current_database()');
    console.log(`📊 Database: ${dbResult.rows[0].current_database}`);

    // Get user
    const userResult = await client.query('SELECT current_user');
    console.log(`👤 User: ${userResult.rows[0].current_user}`);

    // Parse project ref from connection string
    const match = TARGET_DATABASE_URL.match(/postgres\.([a-z]+)\[/);
    if (match) {
      console.log(`🎯 Project Ref (from connection string): ${match[1]}`);
    }

    console.log('');
    console.log('📋 Checking for prompt_authenticity tables...');

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%prompt%'
      ORDER BY table_name
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ Found prompt-related tables:');
      tableCheck.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('❌ No prompt-related tables found');
      console.log('');
      console.log('This means you are connecting to the WRONG project.');
      console.log('');
      console.log('To fix:');
      console.log('1. Open Supabase Dashboard showing the tables');
      console.log('2. Note the project name/URL (should be urgravakgxllrpsumgtz)');
      console.log('3. In THAT SAME window, go to Settings → Database');
      console.log('4. Copy the Connection Pooling string');
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await client.end();
  }
}

verify();
