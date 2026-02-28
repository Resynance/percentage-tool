import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';
import { getEmbedding } from '@repo/core/ai';

export const dynamic = 'force-dynamic';

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

/**
 * GET /api/exemplar-tasks?environment=X
 * List all exemplar tasks for an environment (no embedding in payload), newest first.
 */
export async function GET(request: NextRequest) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;

    const environment = request.nextUrl.searchParams.get('environment') || '';

    try {
        const exemplars = await prisma.exemplarTask.findMany({
            where: environment ? { environment } : undefined,
            select: {
                id: true,
                environment: true,
                content: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Check which exemplars have embeddings via raw query
        const ids = exemplars.map(e => e.id);
        let embeddingIds: string[] = [];
        if (ids.length > 0) {
            const rows = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM exemplar_tasks
                WHERE id = ANY(${ids}::text[])
                AND embedding IS NOT NULL
            `;
            embeddingIds = rows.map(r => r.id);
        }

        const embeddingSet = new Set(embeddingIds);
        const result = exemplars.map(e => ({
            ...e,
            hasEmbedding: embeddingSet.has(e.id),
        }));

        return NextResponse.json({ exemplars: result });
    } catch (error) {
        console.error('Error fetching exemplar tasks:', error);
        return NextResponse.json({ error: 'Failed to fetch exemplar tasks' }, { status: 500 });
    }
}

/**
 * POST /api/exemplar-tasks
 * Create an exemplar task and generate its embedding.
 * Body: { environment, content }
 */
export async function POST(request: NextRequest) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;
    const { user } = authResult;

    try {
        const body = await request.json();
        const { environment, content } = body;

        if (!environment || !content?.trim()) {
            return NextResponse.json({ error: 'environment and content are required' }, { status: 400 });
        }

        const id = crypto.randomUUID();

        const exemplar = await prisma.exemplarTask.create({
            data: {
                id,
                environment,
                content: content.trim(),
                createdById: user!.id,
            },
            select: {
                id: true,
                environment: true,
                content: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Generate and store embedding
        let hasEmbedding = false;
        try {
            const embedding = await getEmbedding(content.trim());
            if (embedding && embedding.length > 0) {
                const vectorStr = `[${embedding.join(',')}]`;
                await prisma.$executeRaw`
                    UPDATE exemplar_tasks
                    SET embedding = ${vectorStr}::vector
                    WHERE id = ${id}
                `;
                hasEmbedding = true;
            }
        } catch (embeddingError) {
            console.error('[ExemplarTasks] Failed to generate embedding:', embeddingError);
        }

        return NextResponse.json({ exemplar: { ...exemplar, hasEmbedding } }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating exemplar task:', error);
        return NextResponse.json({ error: error.message || 'Failed to create exemplar task' }, { status: 500 });
    }
}
