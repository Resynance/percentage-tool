# CSV Format V2 - Combined Tasks and Feedback

## Overview

The CSV format has been updated to combine both tasks (prompts) and feedback into a single file. This allows for more efficient data management and ensures task-feedback relationships are preserved.

## CSV Structure

### Required Headers

| Column | Description | Example |
|--------|-------------|---------|
| `type` | Record type: "prompt" for tasks, "feedback" for feedback | `prompt` or `feedback` |
| `task_key` | Unique identifier for the task | `task_hemiq7c2ahxd_1767300329996_c2qmtscyh` |
| `task_id` | UUID of the task | `84034134-f811-45a0-9589-8e97fa2a3c79` |
| `env_key` | Environment name | `outlook`, `booking`, `forums-homes` |
| `created_at` | Timestamp | `2026-01-01 20:45:32.132701+00` |
| `task_version` | Version number | `2`, `3`, `4`, etc. |
| `prompt` | Task content (only for type=prompt) | The full task text |
| `feedback_content` | Feedback content (only for type=feedback) | The feedback text |
| `is_positive_feedback` | Boolean indicating positive feedback | `true` or `false` |
| `prompt_quality_rating` | Quality rating for prompts | Rating value |
| `avg_score` | Average score | `0.8000`, `1.0000` |
| `author_email` | Email of the creator | `user@example.com` |
| `author_name` | Name of the creator | `John Doe` |

### Example CSV

```csv
type,task_key,task_id,env_key,created_at,task_version,prompt,feedback_content,is_positive_feedback,prompt_quality_rating,avg_score,author_email,author_name
prompt,task_abc123,550da587-79a2-4bab-b906-51fd4e50a364,booking,2026-01-02 09:41:55.660046+00,3,"Book a hotel in Dubai...",,,,1.0000,user@example.com,John Doe
feedback,task_abc123,550da587-79a2-4bab-b906-51fd4e50a364,booking,2026-01-02 10:00:00.000000+00,3,,"Task approved by QA reviewer",true,,,reviewer@example.com,Jane Smith
```

## How to Import

### Step 1: Prepare Your CSV

Ensure your CSV has both prompt and feedback rows with the `type` column correctly set:
- `type=prompt` for task records
- `type=feedback` for feedback records

### Step 2: Import Tasks

1. Navigate to the Ingest page in Fleet app
2. Select your project
3. Select **Type: TASK**
4. Upload the CSV file
5. The system will automatically filter and import only rows where `type=prompt`

### Step 3: Import Feedback

1. Navigate to the Ingest page again
2. Select the same project
3. Select **Type: FEEDBACK**
4. Upload the same CSV file
5. The system will automatically filter and import only rows where `type=feedback`

## Key Changes from V1

### Content Field Mapping

**Tasks (type=prompt):**
- Content is extracted from `prompt` column
- Falls back to legacy `content` column if needed

**Feedback (type=feedback):**
- Content is extracted from `feedback_content` column
- Falls back to legacy `feedback` column if needed

### Author Information

New CSV uses `author_email` and `author_name` instead of `created_by_email` and `created_by_name`:
- System supports both formats for backward compatibility
- New imports should use `author_email` and `author_name`

### Version Field

- Version is now stored in `task_version` column
- Stored in metadata as `task_version` (accessible via `metadata->>'task_version'`)
- Used for filtering in the QA records page (shows only version 1 for STANDARD and All categories)

### Duplicate Detection

The system now checks for duplicates using both:
- `task_id` (UUID)
- `task_key` (unique identifier)

This prevents re-importing the same tasks/feedback.

## Metadata Storage

All CSV columns are preserved in the `metadata` JSONB field:
- `task_key` → `metadata->>'task_key'`
- `task_id` → `metadata->>'task_id'`
- `env_key` → `metadata->>'env_key'` (also mapped to `environment_name`)
- `task_version` → `metadata->>'task_version'`
- `is_positive_feedback` → `metadata->>'is_positive_feedback'`
- `avg_score` → `metadata->>'avg_score'`
- And all other CSV columns...

## Filtering and Querying

### Version Filtering

The QA records page automatically filters tasks to show only version 1 when:
- Category is "All" (no category filter)
- Category is "STANDARD"

Top 10% and Bottom 10% categories show all versions.

### Type Filtering

During import, the system automatically:
1. Checks the CSV `type` column
2. Skips rows that don't match the selected ingestion type
3. Reports skipped rows as "Type Mismatch" in skip details

## Migration from V1

If you have existing CSV files in the old format:

**Old format (separate files):**
- `tasks.csv` with task columns
- `feedback.csv` with feedback columns

**New format (combined file):**
- Add a `type` column: `prompt` for tasks, `feedback` for feedback
- Rename columns:
  - `content` → `prompt` (for tasks)
  - `feedback` → `feedback_content` (for feedback)
  - `created_by_email` → `author_email`
  - `created_by_name` → `author_name`
  - `version` or `version_no` → `task_version`

**Backward Compatibility:**
The system still supports old CSV formats without the `type` column. If no `type` column exists, all rows will be imported based on the selected ingestion type (TASK or FEEDBACK).

## Skip Reasons

When importing, rows may be skipped for these reasons:

| Skip Reason | Description |
|-------------|-------------|
| Type Mismatch | CSV row type doesn't match selected ingestion type |
| Keyword Mismatch | Content doesn't contain required filter keywords |
| Duplicate ID | task_id or task_key already exists in project |

Check the ingestion job details to see skip counts by reason.

## Best Practices

1. **Always include type column**: Explicitly set `type=prompt` or `type=feedback`
2. **Preserve task relationships**: Use the same `task_key` for related tasks and feedback
3. **Include version numbers**: Set `task_version` for all records
4. **Use meaningful env_keys**: Use consistent environment names (outlook, booking, etc.)
5. **Upload twice**: Upload the same CSV once for TASK and once for FEEDBACK
6. **Check skip details**: Review skip reasons to ensure all expected records are imported

## Troubleshooting

**Problem: No records imported**
- Check that CSV has rows matching the selected type (prompt/feedback)
- Verify the `type` column values are lowercase

**Problem: Duplicates being skipped**
- Check if records already exist with same `task_id` or `task_key`
- Review existing records in the project before re-importing

**Problem: Wrong content extracted**
- For tasks: Ensure content is in `prompt` column
- For feedback: Ensure content is in `feedback_content` column
- System falls back to other columns if primary columns are empty

**Problem: Version filtering not working**
- Verify `task_version` column exists and has numeric values
- Check that records have `task_version` stored in metadata
- Version filter only applies to STANDARD and All categories, not Top/Bottom 10%
