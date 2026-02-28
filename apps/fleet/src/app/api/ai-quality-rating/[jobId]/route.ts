import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-quality-rating/[jobId]
 * Fetch job status and all ratings for a completed job.
 * Ratings are returned sorted by score descending.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;

    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const job = await prisma.aIQualityJob.findUnique({ where: { id: jobId } });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const ratings = await prisma.aIQualityRating.findMany({
            where: { jobId },
            orderBy: { score: 'desc' },
        });

        return NextResponse.json({ job, ratings });
    } catch (error) {
        console.error('Error fetching AI quality job:', error);
        return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
    }
}
