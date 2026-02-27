#!/usr/bin/env node
/**
 * Transform QA Feedback CSV subset to match import format
 * Run from project root: node scripts/transform-qa-feedback-csv-subset.js
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

const inputFile = '/Users/max/Downloads/qa_feedback_with_tasks_subset_500.csv';
const outputFile = '/Users/max/Downloads/qa_feedback_ratings_import_subset_500.csv';

console.log('Reading subset file...');
const fileContent = fs.readFileSync(inputFile, 'utf-8');

console.log('Parsing CSV...');
const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
});

console.log(`✓ Read ${records.length} rows`);

// Filter and transform
const transformed = records
    .filter(row => row.feedback_id && row.feedback_id.trim())
    .map((row, index) => {
        const ratingId = `rating_${Date.now()}_${index}`;
        return {
            rating_id: ratingId,
            feedback_id: row.feedback_id.trim(),
            feedback_content: row.feedback_content || '',
            eval_task_id: row.task_id || '',
            is_helpful: row.is_positive_feedback === 'True' || row.is_positive_feedback === 'true' ? 'true' : 'false',
            is_dispute: 'false',
            dispute_status: '',
            dispute_reason: '',
            rater_name: row.task_creator_name || '',
            rater_email: row.task_creator_email || 'system@example.com',
            qa_name: row.feedback_author_name || '',
            qa_email: row.feedback_author_email || '',
            rated_at: row.feedback_created_at || new Date().toISOString(),
            resolved_at: '',
            resolved_by_name: '',
            resolution_reason: '',
            // Task fields for creating task records
            task_id: row.task_id || '',
            task_key: row.task_key || '',
            task_prompt: row.task_prompt || '',
            task_creator_name: row.task_creator_name || '',
            task_creator_email: row.task_creator_email || '',
            task_created_at: row.task_created_at || new Date().toISOString(),
            env_key: row.env_key || '',
            env_version: row.env_version || '',
            env_data_key: row.env_data_key || '',
            scenario_title: row.scenario_title || '',
            task_modality: row.task_modality || '',
        };
    });

console.log(`✓ Transformed ${transformed.length} records with valid feedback_id`);

// Build CSV output
const columns = [
    'rating_id', 'feedback_id', 'feedback_content', 'eval_task_id', 'is_helpful', 'is_dispute',
    'dispute_status', 'dispute_reason', 'rater_name', 'rater_email',
    'qa_name', 'qa_email', 'rated_at', 'resolved_at', 'resolved_by_name', 'resolution_reason',
    'task_id', 'task_key', 'task_prompt', 'task_creator_name', 'task_creator_email',
    'task_created_at', 'env_key', 'env_version', 'env_data_key', 'scenario_title', 'task_modality'
];

const escapeCsvValue = (val) => {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const csvLines = [columns.join(',')];
transformed.forEach(row => {
    csvLines.push(columns.map(col => escapeCsvValue(row[col])).join(','));
});

fs.writeFileSync(outputFile, csvLines.join('\n'));

console.log(`\n✅ Success! Written to: ${outputFile}`);
console.log(`\n📊 Summary:`);
console.log(`  Input rows: ${records.length}`);
console.log(`  Output rows: ${transformed.length}`);
