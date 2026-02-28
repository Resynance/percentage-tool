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
 * PATCH /api/exemplar-tasks/[id]
 * Update an exemplar task's content.
 * Regenerates embedding if content changes.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;

    const { id } = await params;

    try {
        const body = await request.json();
        const { content } = body;

        const existing = await prisma.exemplarTask.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Exemplar task not found' }, { status: 404 });
        }

        const updateData: { content?: string } = {};
        if (content !== undefined) updateData.content = content.trim();

        const exemplar = await prisma.exemplarTask.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                environment: true,
                content: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Regenerate embedding if content changed
        let hasEmbedding = false;
        if (content !== undefined && content.trim() !== existing.content) {
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
                console.error('[ExemplarTasks] Failed to regenerate embedding:', embeddingError);
            }
        } else {
            // Check if it already has an embedding
            const rows = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM exemplar_tasks WHERE id = ${id} AND embedding IS NOT NULL
            `;
            hasEmbedding = rows.length > 0;
        }

        return NextResponse.json({ exemplar: { ...exemplar, hasEmbedding } });
    } catch (error: any) {
        console.error('Error updating exemplar task:', error);
        return NextResponse.json({ error: error.message || 'Failed to update exemplar task' }, { status: 500 });
    }
}

/**
 * DELETE /api/exemplar-tasks/[id]
 * Delete an exemplar task.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authResult = await requireFleetAuth(request);
    if (authResult.error) return authResult.error;

    const { id } = await params;

    try {
        await prisma.exemplarTask.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Exemplar task not found' }, { status: 404 });
        }
        console.error('Error deleting exemplar task:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete exemplar task' }, { status: 500 });
    }
}
