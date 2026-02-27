#!/usr/bin/env node
/**
 * Create a subset of prompt authenticity records
 * Run from project root: node scripts/create-prompt-authenticity-subset.js
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const inputFile = '/Users/max/Downloads/prompt_authenticity_records_rows.csv';
const outputFile = '/Users/max/Downloads/prompt_authenticity_records_subset_500.csv';
const numRecords = 500;

console.log('Reading input file...');
const fileContent = fs.readFileSync(inputFile, 'utf-8');

console.log('Parsing CSV...');
const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
});

console.log(`✓ Read ${records.length} rows`);

// Take first 500 records
const subset = records.slice(0, numRecords);
console.log(`✓ Selected ${subset.length} records`);

// Get column names from first record
const columns = Object.keys(subset[0]);

// Simple CSV output
const escapeCsvValue = (val) => {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const csvLines = [columns.join(',')];
subset.forEach(row => {
    csvLines.push(columns.map(col => escapeCsvValue(row[col])).join(','));
});

fs.writeFileSync(outputFile, csvLines.join('\n'));

console.log(`\n✅ Success! Written to: ${outputFile}`);
console.log(`  Records: ${subset.length}`);
