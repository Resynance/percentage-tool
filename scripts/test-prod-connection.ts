#!/usr/bin/env tsx
/**
 * Quick test to verify production database connection and table existence
 */

import { Client } from 'pg';

const TARGET_DATABASE_URL = process.env.TARGET_DATABASE_URL;

if (!TARGET_DATABASE_URL) {
  console.error('❌ TARGET_DATABASE_URL environment variable is required');
  process.exit(1);
}

async function testConnection() {
  console.log('🔌 Testing connection to production database...');
  console.log('');

  // Add SSL parameters to connection string if not localhost
  const addSSLParams = (url: string) => {
    if (url.includes('localhost')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}sslmode=no-verify`;
  };

  const connectionString = addSSLParams(TARGET_DATABASE_URL);

  const client = new Client({
    connectionString,
    ssl: TARGET_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully');
    console.log('');

    // Test 1: Count records in prompt_authenticity_records
    console.log('📊 Checking prompt_authenticity_records table...');
    try {
      const result = await client.query('SELECT COUNT(*) FROM prompt_authenticity_records');
      console.log(`✅ Table exists with ${result.rows[0].count} records`);
    } catch (error) {
      console.log('❌ Table not found or not accessible');
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    }
    console.log('');

    // Test 2: Check table structure
    console.log('📋 Checking table columns...');
    try {
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'prompt_authenticity_records'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      if (columnsResult.rows.length > 0) {
        console.log(`✅ Found ${columnsResult.rows.length} columns:`);
        columnsResult.rows.slice(0, 5).forEach(row => {
          console.log(`   - ${row.column_name} (${row.data_type})`);
        });
        if (columnsResult.rows.length > 5) {
          console.log(`   ... and ${columnsResult.rows.length - 5} more`);
        }
      } else {
        console.log('❌ No columns found');
      }
    } catch (error) {
      console.log('❌ Could not check columns');
      console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    }
    console.log('');

    // Test 3: List all tables to see what we can access
    console.log('📋 All accessible tables in public schema:');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    tablesResult.rows.forEach(row => {
      const isPromptAuth = row.table_name.includes('prompt_authenticity');
      const marker = isPromptAuth ? '👉' : '  ';
      console.log(`${marker} ${row.table_name}`);
    });
    console.log('');
    console.log(`Total: ${tablesResult.rows.length} tables`);

  } catch (error) {
    console.error('❌ Connection failed');
    console.error(`   Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();
