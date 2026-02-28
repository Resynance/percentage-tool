import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';
import { cosineSimilarity } from '@repo/core/ai';

export const dynamic = 'force-dynamic';

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
        console.error('[ExemplarCompare] Failed to fetch profile for user', user.id, profileError);
        return { error: NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 }) };
    }

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }

    return { user, profile };
}

function parseVector(embedding: any): number[] | null {
    if (!embedding) return null;

    if (Array.isArray(embedding)) {
        return embedding;
    }

    if (typeof embedding === 'string') {
        try {
            const cleaned = embedding.replace(/[\[\]]/g, '');
            const values = cleaned.split(',').map((v: string) => parseFloat(v.trim()));
            // Reject vectors with any NaN entries — a truncated vector produces meaningless similarity scores
            if (values.some((v: number) => isNaN(v))) {
                console.error(`[ExemplarCompare] Vector contained NaN entries, rejecting`);
                return null;
            }
            return values;
        } catch (e) {
            console.error('[ExemplarCompare] Failed to parse vector string:', e);
            return null;
        }
    }

    return null;
}

/**
 * POST /api/exemplar-tasks/compare
 * Run cosine similarity scan between exemplars and real tasks in an environment.
 * Body: { environment, threshold? }  (threshold default 70, as percentage 0–100)
 */
export async function POST(request: NextRequest) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;

    try {
        const body = await request.json();
        const { environment, threshold } = body;

        if (!environment) {
            return NextResponse.json({ error: 'environment is required' }, { status: 400 });
        }

        const similarityThreshold = typeof threshold === 'number' && threshold >= 0 && threshold <= 100
            ? threshold
            : 70;

        // Fetch exemplars with embeddings
        const exemplars = await prisma.$queryRaw<Array<{
            id: string;
            content: string;
            embedding: string;
        }>>`
            SELECT id, content, embedding::text
            FROM exemplar_tasks
            WHERE environment = ${environment}
            AND embedding IS NOT NULL
        `;

        if (exemplars.length === 0) {
            return NextResponse.json({
                error: 'No exemplars with embeddings found for this environment. Add exemplars and wait for embeddings to generate.',
            }, { status: 400 });
        }

        // Fetch real task records (limit 2000)
        const tasks = await prisma.$queryRaw<Array<{
            id: string;
            content: string;
            embedding: string;
        }>>`
            SELECT id, content, embedding::text
            FROM data_records
            WHERE environment = ${environment}
            AND type = 'TASK'
            AND embedding IS NOT NULL
            LIMIT 2000
        `;

        const totalTasks = tasks.length;
        const totalExemplars = exemplars.length;

        // Parse exemplar embeddings
        const parsedExemplars = exemplars.map(e => ({
            ...e,
            vector: parseVector(e.embedding),
        })).filter(e => e.vector !== null);

        const missingEmbeddings = exemplars.length - parsedExemplars.length;

        // For each task, find the best-matching exemplar
        const matches: Array<{
            taskId: string;
            taskContent: string;
            exemplarId: string;
            exemplarContent: string;
            similarity: number;
        }> = [];

        let tasksSkippedNoParse = 0;

        for (const task of tasks) {
            const taskVector = parseVector(task.embedding);
            if (!taskVector) {
                tasksSkippedNoParse++;
                continue;
            }

            let bestSimilarity = -1;
            let bestExemplar: typeof parsedExemplars[0] | null = null;

            for (const exemplar of parsedExemplars) {
                const similarity = cosineSimilarity(taskVector, exemplar.vector!);
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestExemplar = exemplar;
                }
            }

            if (bestExemplar === null) continue;

            const similarityPercent = bestSimilarity * 100;
            if (isNaN(similarityPercent) || !isFinite(similarityPercent)) continue;

            if (similarityPercent >= similarityThreshold) {
                matches.push({
                    taskId: task.id,
                    taskContent: task.content,
                    exemplarId: bestExemplar.id,
                    exemplarContent: bestExemplar.content,
                    similarity: similarityPercent,
                });
            }
        }

        // Sort by similarity descending
        matches.sort((a, b) => b.similarity - a.similarity);

        return NextResponse.json({
            matches,
            totalTasks,
            totalExemplars,
            missingEmbeddings,
            tasksSkippedNoParse,
        });
    } catch (err) {
        console.error('[ExemplarCompare] Error running exemplar comparison:', err);
        return NextResponse.json({ error: 'Failed to run comparison' }, { status: 500 });
    }
}
