import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

// Auth check (Fleet/Admin only)
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

  if (profileError || !profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { profile, user };
}

interface CSVRow {
  Name: string;
  Email: string;
  Status?: string;
  Role?: string;
  'Group Name'?: string;
  'Total Worked Hours (Time Tracking)'?: string;
  'Total Expert Hours'?: string;
  'Tasks Created'?: string;
  "Tasks QA'd"?: string;
  'Total Tasks Created And QAed'?: string;
  [key: string]: string | undefined; // For date columns like '2026-02-01 Hours', '2026-02-01 Notes'
}

interface TimeLogEntry {
  workerName: string;
  workerEmail: string;
  workDate: Date;
  hoursWorked: number;
  notes: string | null;
  status: string | null;
  role: string | null;
  groupName: string | null;
  totalTasksCreated: number;
  totalTasksQaed: number;
  importBatchId: string;
}

/**
 * Parse CSV and extract daily time log entries
 */
function parseTimeLoggingCSV(csvContent: string, importBatchId: string): TimeLogEntry[] {
  const records: CSVRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const entries: TimeLogEntry[] = [];

  for (const record of records) {
    const workerName = record.Name;
    const workerEmail = record.Email;
    const status = record.Status || null;
    const role = record.Role || null;
    const groupName = record['Group Name'] || null;
    const totalTasksCreated = parseInt(record['Tasks Created'] || '0', 10);
    const totalTasksQaed = parseInt(record["Tasks QA'd"] || '0', 10);

    // Extract all date columns
    const dateColumns = Object.keys(record).filter((key) => key.match(/^\d{4}-\d{2}-\d{2} Hours$/));

    for (const dateColumn of dateColumns) {
      const dateStr = dateColumn.replace(' Hours', ''); // e.g., "2026-02-01"
      const hoursStr = record[dateColumn];
      const notesColumn = `${dateStr} Notes`;
      const notes = record[notesColumn] || null;

      // Skip if no hours worked
      if (!hoursStr || hoursStr.trim() === '') {
        continue;
      }

      const hoursWorked = parseFloat(hoursStr);
      if (isNaN(hoursWorked) || hoursWorked <= 0) {
        continue;
      }

      entries.push({
        workerName,
        workerEmail,
        workDate: new Date(dateStr),
        hoursWorked,
        notes,
        status,
        role,
        groupName,
        totalTasksCreated,
        totalTasksQaed,
        importBatchId,
      });
    }
  }

  return entries;
}

/**
 * POST /api/time-reporting/import
 * Import time logging CSV data
 */
export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read CSV content
    const csvContent = await file.text();

    // Generate unique import batch ID
    const importBatchId = `import_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Parse CSV
    const entries = parseTimeLoggingCSV(csvContent, importBatchId);

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'No valid time log entries found in CSV' },
        { status: 400 },
      );
    }

    // Query existing records once to determine create vs update
    const existingRecords = await prisma.timeReportRecord.findMany({
      where: {
        OR: entries.map((entry) => ({
          workerEmail: entry.workerEmail,
          workDate: entry.workDate,
        })),
      },
      select: { workerEmail: true, workDate: true },
    });

    const existingSet = new Set(
      existingRecords.map((r) => `${r.workerEmail}|${r.workDate.toISOString()}`),
    );

    // Batch insert using Prisma (upsert to handle duplicates)
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const batchSize = 100;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      // Use upsert for each entry to handle duplicates
      for (const entry of batch) {
        try {
          await prisma.timeReportRecord.upsert({
            where: {
              workerEmail_workDate: {
                workerEmail: entry.workerEmail,
                workDate: entry.workDate,
              },
            },
            update: {
              hoursWorked: entry.hoursWorked,
              notes: entry.notes,
              status: entry.status,
              role: entry.role,
              groupName: entry.groupName,
              totalTasksCreated: entry.totalTasksCreated,
              totalTasksQaed: entry.totalTasksQaed,
              updatedAt: new Date(),
            },
            create: entry,
          });

          // Check against pre-fetched set
          const key = `${entry.workerEmail}|${entry.workDate.toISOString()}`;
          if (existingSet.has(key)) {
            updated++;
          } else {
            imported++;
          }
        } catch (error) {
          console.error('Error upserting entry:', error);
          skipped++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      importBatchId,
      imported,
      updated,
      skipped,
      total: entries.length,
      message: `Successfully imported ${imported} new records, updated ${updated} existing records, and skipped ${skipped} records`,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/time-reporting/import
 * Get list of import batches
 */
export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    // Get unique import batch IDs with counts
    const batches = await prisma.timeReportRecord.groupBy({
      by: ['importBatchId'],
      _count: { id: true },
      _min: { createdAt: true },
    });

    const formattedBatches = batches
      .filter((b) => b.importBatchId !== null)
      .map((batch) => ({
        batchId: batch.importBatchId,
        recordCount: batch._count.id,
        importedAt: batch._min.createdAt,
      }))
      .sort((a, b) => (b.importedAt! > a.importedAt! ? 1 : -1));

    return NextResponse.json({
      batches: formattedBatches,
      total: formattedBatches.length,
    });
  } catch (error: any) {
    console.error('Error fetching import batches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import batches', details: error.message },
      { status: 500 },
    );
  }
}
