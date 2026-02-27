import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';
import { logAudit } from '@repo/core/audit';
import { startBulkEvaluation, startBulkEvaluationAllModels, getEnvironmentEvaluationJobs } from '@repo/core/evaluation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/evaluation/bulk-llm
 * List evaluation jobs for a project
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const role = (profile as any)?.role;
    if (!['ADMIN', 'MANAGER', 'FLEET'].includes(role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const environment = searchParams.get('environment');
        const limit = parseInt(searchParams.get('limit') || '20');

        if (!environment) {
            return NextResponse.json({ error: 'environment is required' }, { status: 400 });
        }

        const jobs = await getEnvironmentEvaluationJobs(environment, limit);
        return NextResponse.json({ jobs });
    } catch (error) {
        console.error('Error fetching evaluation jobs:', error);
        return NextResponse.json({ error: 'Failed to fetch evaluation jobs' }, { status: 500 });
    }
}

/**
 * POST /api/evaluation/bulk-llm
 * Start a bulk evaluation job
 * Body: { environment, modelConfigId?, allModels?: boolean }
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const postRole = (profile as any)?.role;
    if (!['ADMIN', 'MANAGER', 'FLEET'].includes(postRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { environment, modelConfigId, allModels } = body;

        if (!environment) {
            return NextResponse.json({ error: 'environment is required' }, { status: 400 });
        }

        let jobIds: string[];

        if (allModels) {
            // Start evaluation for all active models
            jobIds = await startBulkEvaluationAllModels(environment);

            if (jobIds.length === 0) {
                return NextResponse.json({
                    error: 'No active models available or all records already evaluated'
                }, { status: 400 });
            }

            await logAudit({
                action: 'BULK_EVALUATION_STARTED',
                entityType: 'LLM_EVALUATION_JOB',
                userId: user.id,
                userEmail: user.email!,
                metadata: { environment, jobIds, allModels: true }
            });

            return NextResponse.json({
                success: true,
                message: `Started ${jobIds.length} evaluation job(s)`,
                jobIds
            }, { status: 201 });
        } else {
            // Start evaluation for specific model
            if (!modelConfigId) {
                return NextResponse.json({ error: 'modelConfigId is required' }, { status: 400 });
            }

            const jobId = await startBulkEvaluation(environment, modelConfigId);

            await logAudit({
                action: 'BULK_EVALUATION_STARTED',
                entityType: 'LLM_EVALUATION_JOB',
                entityId: jobId,
                userId: user.id,
                userEmail: user.email!,
                metadata: { environment, modelConfigId }
            });

            return NextResponse.json({
                success: true,
                jobId
            }, { status: 201 });
        }
    } catch (error: any) {
        console.error('Error starting bulk evaluation:', error);
        return NextResponse.json({
            error: error.message || 'Failed to start evaluation'
        }, { status: 500 });
    }
}
