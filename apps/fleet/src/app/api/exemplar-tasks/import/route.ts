import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';
import { getEmbedding } from '@repo/core/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large imports + embedding generation

async function requireFleetAuth(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return { user, profile };
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
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(current);
            current = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(current);
            if (currentRow.length > 0 && currentRow.some(f => f.trim())) {
                rows.push(currentRow);
            }
            currentRow = [];
            current = '';
        } else {
            current += char;
        }
    }

    if (current || currentRow.length > 0) {
        currentRow.push(current);
        if (currentRow.some(f => f.trim())) rows.push(currentRow);
    }

    return rows;
}

/**
 * POST /api/exemplar-tasks/import
 * Import exemplar tasks from a CSV file.
 *
 * Expected CSV columns: ENV, Prompt, (other columns ignored)
 * Optional body field: filterEnvironment — if set, only rows matching that env are imported.
 *
 * Returns: { imported, skipped, errors }
 */
export async function POST(request: NextRequest) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;
    const { user } = authResult;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const filterEnvironment = formData.get('filterEnvironment') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const text = await file.text();
        const allRows = parseCSV(text);

        if (allRows.length < 2) {
            return NextResponse.json({ error: 'CSV appears to be empty or has no data rows' }, { status: 400 });
        }

        // Map header columns
        const header = allRows[0].map(h => h.trim().toLowerCase());
        const envIdx = header.indexOf('env');
        const promptIdx = header.indexOf('prompt');
        const changesIdx = header.indexOf('changes');

        if (envIdx === -1 || promptIdx === -1) {
            return NextResponse.json({
                error: `CSV must have "ENV" and "Prompt" columns. Found: ${allRows[0].join(', ')}`
            }, { status: 400 });
        }

        // Parse data rows
        type ParsedRow = { environment: string; content: string };
        const dataRows: ParsedRow[] = [];
        let skipped = 0;

        for (let i = 1; i < allRows.length; i++) {
            const row = allRows[i];
            const environment = row[envIdx]?.trim();
            const content = row[promptIdx]?.trim();
            const changes = changesIdx !== -1 ? row[changesIdx]?.trim() ?? '' : '';

            if (!environment || !content) {
                skipped++;
                continue;
            }

            // Skip rows marked as deleted in the Changes column
            if (changes.toLowerCase().includes('deleted')) {
                skipped++;
                continue;
            }

            if (filterEnvironment && environment !== filterEnvironment) {
                skipped++;
                continue;
            }

            dataRows.push({ environment, content });
        }

        if (dataRows.length === 0) {
            return NextResponse.json({
                error: filterEnvironment
                    ? `No rows found for environment "${filterEnvironment}"`
                    : 'No valid rows to import'
            }, { status: 400 });
        }

        // Bulk insert all rows (without embeddings first)
        const insertedIds: string[] = [];
        const insertData = dataRows.map(row => ({
            id: crypto.randomUUID(),
            environment: row.environment,
            content: row.content,
            createdById: user!.id,
        }));

        await prisma.exemplarTask.createMany({ data: insertData });
        insertedIds.push(...insertData.map(r => r.id));

        // Generate embeddings one at a time (matches the single-create flow which is known to work)
        let embeddingErrors = 0;

        for (const row of insertData) {
            try {
                const embedding = await getEmbedding(row.content);
                if (!embedding || embedding.length === 0) {
                    embeddingErrors++;
                    continue;
                }
                const vectorStr = `[${embedding.join(',')}]`;
                await prisma.$executeRaw`
                    UPDATE exemplar_tasks
                    SET embedding = ${vectorStr}::vector
                    WHERE id = ${row.id}
                `;
            } catch (embErr) {
                console.error(`[ExemplarImport] Embedding failed for ${row.id}:`, embErr);
                embeddingErrors++;
            }
        }

        return NextResponse.json({
            imported: insertedIds.length,
            skipped,
            embeddingErrors,
        });
    } catch (error: any) {
        console.error('Error importing exemplar tasks:', error);
        return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
    }
}
