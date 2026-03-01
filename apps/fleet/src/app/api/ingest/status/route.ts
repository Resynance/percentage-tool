import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { processQueuedJobs } from '@repo/core/ingestion';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    try {
        const jobId = req.nextUrl.searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        const job = await prisma.ingestJob.findUnique({
            where: { id: jobId },
        });

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // SERVERLESS FIX: Trigger processing on status check
        // This ensures jobs actually get processed even if the initial trigger was killed
        // IMPORTANT: Must await in serverless - there is no "background" after response is sent
        if (job.status === 'PENDING' || job.status === 'QUEUED_FOR_VEC') {
            await processQueuedJobs(job.environment).catch(err =>
                console.error('Queue Processor Error:', err)
            );

            // Refetch job to get updated status
            const updatedJob = await prisma.ingestJob.findUnique({
                where: { id: jobId },
            });
            return NextResponse.json(updatedJob || job);
        }

        // ZOMBIE DETECTION: If the job has been VECTORIZING for more than 3 minutes without
        // a heartbeat update, the serverless function that was running it has timed out.
        // Reset the job so the next status poll can re-trigger vectorization and pick up
        // where the embedding loop left off (only records with NULL embedding are processed).
        //
        // Must be > maxDuration (60s) to avoid false positives on slow batches.
        // Currently 3× maxDuration as a safety margin.
        const ZOMBIE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
        if (job.status === 'VECTORIZING') {
            const staleSinceMs = Date.now() - new Date(job.updatedAt).getTime();
            if (staleSinceMs > ZOMBIE_THRESHOLD_MS) {
                // Atomic CAS: only reset if the job is still VECTORIZING.
                // Prevents two concurrent polls from both resetting and both starting vectorization.
                const rowsUpdated = await prisma.$executeRaw`
                    UPDATE public.ingest_jobs
                    SET status = 'QUEUED_FOR_VEC', "updatedAt" = NOW()
                    WHERE id = ${jobId} AND status = 'VECTORIZING'
                `;

                if (rowsUpdated === 0) {
                    // Another request already handled recovery — just return current state
                    const currentJob = await prisma.ingestJob.findUnique({ where: { id: jobId } });
                    return NextResponse.json(currentJob || job);
                }

                console.warn(`[Status] Job ${jobId} zombie-reset after ${Math.round(staleSinceMs / 1000)}s without a heartbeat`);
                await processQueuedJobs(job.environment).catch(err =>
                    console.error('Queue Processor Error (zombie recovery):', err)
                );

                const recoveredJob = await prisma.ingestJob.findUnique({ where: { id: jobId } });
                if (!recoveredJob) {
                    return NextResponse.json({ error: 'Job was deleted during recovery' }, { status: 404 });
                }
                return NextResponse.json(recoveredJob);
            }
        }

        return NextResponse.json(job);
    } catch (error: any) {
        console.error('Job Status Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
