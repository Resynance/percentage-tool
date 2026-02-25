import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

async function requireFleetAuth(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { profile, user };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const chars = text.split('');
  let current = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote - add literal quote and skip next
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row (handle both \n and \r\n)
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip the \n in \r\n
      }
      currentRow.push(current);
      if (currentRow.length > 0 && currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      current = '';
    } else {
      // Regular character (including newlines inside quotes)
      current += char;
    }
  }

  // Don't forget last field/row
  if (current || currentRow.length > 0) {
    currentRow.push(current);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read CSV file
    const text = await file.text();

    // Parse entire CSV (handles multi-line fields correctly)
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Empty CSV file' }, { status: 400 });
    }

    // Parse header
    const header = rows[0].map(h => h.trim().toLowerCase());

    // Debug: Show parsed header
    console.log('[Import Debug] Parsed header:');
    header.forEach((col, idx) => {
      console.log(`  [${idx}]: "${col}"`);
    });

    const versionIdIdx = header.findIndex(h => h === 'version_id');
    const taskKeyIdx = header.findIndex(h => h === 'task_key');
    const promptIdx = header.findIndex(h => h === 'prompt');
    const versionNoIdx = header.findIndex(h => h === 'version_no');
    const isActiveIdx = header.findIndex(h => h === 'is_active');
    const createdByNameIdx = header.findIndex(h => h === 'author_name');
    const createdByEmailIdx = header.findIndex(h => h === 'author_email');
    const createdAtIdx = header.findIndex(h => h === 'task_created_at');
    const envKeyIdx = header.findIndex(h => h === 'env_key');
    const taskLifecycleStatusIdx = header.findIndex(h => h === 'task_lifecycle_status');
    const taskModalityIdx = header.findIndex(h => h === 'task_modality');
    const scenarioTitleIdx = header.findIndex(h => h === 'scenario_title');
    const taskComplexityTierIdx = header.findIndex(h => h === 'task_complexity_tier');

    if (versionIdIdx === -1 || promptIdx === -1) {
      return NextResponse.json({
        error: 'CSV must contain "version_id" and "prompt" columns'
      }, { status: 400 });
    }

    // Process in batches (skip header row)
    const batchSize = 500;
    let imported = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (let i = 1; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const records = [];

      for (const fields of batch) {
        try {
          const versionId = fields[versionIdIdx]?.trim();
          const prompt = fields[promptIdx]?.trim();
          const versionNo = versionNoIdx >= 0 ? parseInt(fields[versionNoIdx]) || null : null;

          if (!versionId || !prompt) {
            skipped++;
            continue;
          }

          // Only import version 1 records
          if (versionNo !== 1) {
            skipped++;
            continue;
          }

          // Debug: log first record's fields
          if (records.length === 0) {
            console.log('[Import Debug] First record field extraction:');
            console.log('  Total fields in row:', fields.length);
            console.log('  versionId [' + versionIdIdx + ']:', fields[versionIdIdx]);
            console.log('  taskKey [' + taskKeyIdx + ']:', fields[taskKeyIdx]);
            console.log('  versionNo [' + versionNoIdx + ']:', fields[versionNoIdx]);
            console.log('  createdAt [' + createdAtIdx + ']:', fields[createdAtIdx]);
            console.log('  createdByName [' + createdByNameIdx + ']:', fields[createdByNameIdx]);
            console.log('  createdByEmail [' + createdByEmailIdx + ']:', fields[createdByEmailIdx]);
            console.log('  envKey [' + envKeyIdx + ']:', fields[envKeyIdx]);
          }

          records.push({
            versionId,
            taskKey: fields[taskKeyIdx]?.trim() || '',
            prompt,
            versionNo,
            isActive: isActiveIdx >= 0 ? fields[isActiveIdx]?.toLowerCase() === 'true' : null,
            createdByName: createdByNameIdx >= 0 ? fields[createdByNameIdx]?.trim() || null : null,
            createdByEmail: createdByEmailIdx >= 0 ? fields[createdByEmailIdx]?.trim() || null : null,
            createdAt: createdAtIdx >= 0 && fields[createdAtIdx]?.trim() ? new Date(fields[createdAtIdx].trim()) : null,
            envKey: envKeyIdx >= 0 ? fields[envKeyIdx]?.trim() || null : null,
            taskLifecycleStatus: taskLifecycleStatusIdx >= 0 ? fields[taskLifecycleStatusIdx]?.trim() || null : null,
            taskModality: taskModalityIdx >= 0 ? fields[taskModalityIdx]?.trim() || null : null,
            scenarioTitle: scenarioTitleIdx >= 0 ? fields[scenarioTitleIdx]?.trim() || null : null,
            taskComplexityTier: taskComplexityTierIdx >= 0 ? fields[taskComplexityTierIdx]?.trim() || null : null,
            analysisStatus: 'PENDING',
          });
        } catch (error) {
          errors.push(`Line ${i}: ${error instanceof Error ? error.message : 'Parse error'}`);
          skipped++;
        }
      }

      if (records.length > 0) {
        try {
          await prisma.promptAuthenticityRecord.createMany({
            data: records,
            skipDuplicates: true,
          });
          imported += records.length;
        } catch (error) {
          console.error('Batch insert error:', error);
          errors.push(`Batch ${i}-${i + batchSize}: ${error instanceof Error ? error.message : 'Insert error'}`);
        }
      }

      // Progress update every 10 batches
      if (i % (batchSize * 10) === 0) {
        console.log(`Imported ${imported} records so far...`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 100), // Limit error list
      message: `Imported ${imported} prompts, skipped ${skipped}${errors.length > 0 ? `, ${errors.length} errors` : ''}`,
      debug: {
        headerColumns: header.length,
        headerSample: header.slice(0, 10),
        indices: {
          versionId: versionIdIdx,
          taskKey: taskKeyIdx,
          createdAt: createdAtIdx,
          createdByName: createdByNameIdx,
          createdByEmail: createdByEmailIdx,
          envKey: envKeyIdx,
        }
      }
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV', details: error.message },
      { status: 500 },
    );
  }
}
