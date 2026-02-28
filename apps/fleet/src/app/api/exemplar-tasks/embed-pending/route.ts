import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';
import { getEmbedding } from '@repo/core/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireFleetAuth(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.error('[EmbedPending] Failed to fetch profile for user', user.id, profileError);
        return { error: NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 }) };
    }

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return { user, profile };
}

/**
 * POST /api/exemplar-tasks/embed-pending
 * Generate embeddings for all exemplar tasks that are missing one.
 * Body: { environment? } — if provided, only processes that environment.
 * Returns: { processed, succeeded, failed }
 */
export async function POST(request: NextRequest) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;

    try {
        const body = await request.json().catch(() => ({}));
        const { environment } = body;

        // Fetch all exemplars missing embeddings
        type PendingRow = { id: string; content: string };
        const pending: PendingRow[] = environment
            ? await prisma.$queryRaw<PendingRow[]>`
                SELECT id, content FROM exemplar_tasks
                WHERE embedding IS NULL AND environment = ${environment}
              `
            : await prisma.$queryRaw<PendingRow[]>`
                SELECT id, content FROM exemplar_tasks
                WHERE embedding IS NULL
              `;

        if (pending.length === 0) {
            return NextResponse.json({ processed: 0, succeeded: 0, failed: 0 });
        }

        let succeeded = 0;
        let failed = 0;

        for (const row of pending) {
            try {
                const embedding = await getEmbedding(row.content);
                if (!embedding || embedding.length === 0) {
                    console.error(`[EmbedPending] AI returned empty embedding for exemplar ${row.id}`);
                    failed++;
                    continue;
                }
                const vectorStr = `[${embedding.join(',')}]`;
                await prisma.$executeRaw`
                    UPDATE exemplar_tasks
                    SET embedding = ${vectorStr}::vector
                    WHERE id = ${row.id}
                `;
                succeeded++;
            } catch (err) {
                console.error(`[EmbedPending] Failed for ${row.id}:`, err);
                failed++;
            }
        }

        return NextResponse.json({ processed: pending.length, succeeded, failed });
    } catch (err) {
        console.error('[EmbedPending] Error generating pending embeddings:', err);
        return NextResponse.json({ error: 'Failed to generate embeddings' }, { status: 500 });
    }
}
