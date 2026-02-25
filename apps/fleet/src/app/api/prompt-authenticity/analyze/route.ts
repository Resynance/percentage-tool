import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';
import { analyzePromptAuthenticity } from '@repo/core';

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

// POST: Start a new analysis job
export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { batchSize = 200, startDate, endDate, limit } = body;

    // Build where clause with optional date range
    const where: any = {
      analysisStatus: 'PENDING',
      versionNo: 1  // Only analyze first version of each prompt
    };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Count pending prompts in date range
    let totalPending = await prisma.promptAuthenticityRecord.count({
      where,
    });

    // Apply limit if specified (for testing)
    if (limit && limit > 0) {
      totalPending = Math.min(totalPending, limit);
    }

    if (totalPending === 0) {
      return NextResponse.json({ error: 'No pending prompts to analyze' }, { status: 400 });
    }

    // Create job
    const job = await prisma.promptAuthenticityJob.create({
      data: {
        status: 'RUNNING',
        totalPrompts: totalPending,
        filterStartDate: startDate ? new Date(startDate) : null,
        filterEndDate: endDate ? new Date(endDate) : null,
        startedAt: new Date(),
      },
    });

    // Start processing in background (don't await)
    processAnalysisJob(job.id, batchSize).catch(error => {
      console.error('Background job error:', error);
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      totalPrompts: totalPending,
      message: `Started analysis job for ${totalPending} prompts`,
    });
  } catch (error: any) {
    console.error('Start job error:', error);
    return NextResponse.json(
      { error: 'Failed to start analysis job', details: error.message },
      { status: 500 },
    );
  }
}

// Helper function to chunk array into smaller arrays
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Background job processor with parallel processing
async function processAnalysisJob(jobId: string, batchSize: number) {
  // Concurrency limit: Process up to 60 prompts in parallel
  // Custom OpenRouter rate limits allow for high concurrency
  const CONCURRENT_ANALYSES = 60;

  try {
    while (true) {
      // Check if job was paused or cancelled
      const job = await prisma.promptAuthenticityJob.findUnique({
        where: { id: jobId },
      });

      if (!job || job.status === 'PAUSED' || job.status === 'CANCELLED') {
        if (job?.status === 'PAUSED') {
          await prisma.promptAuthenticityJob.update({
            where: { id: jobId },
            data: { pausedAt: new Date() },
          });
        }
        break;
      }

      // Build where clause with date range from job
      const where: any = {
        analysisStatus: 'PENDING',
        versionNo: 1  // Only analyze first version of each prompt
      };
      if (job.filterStartDate || job.filterEndDate) {
        where.createdAt = {};
        if (job.filterStartDate) {
          where.createdAt.gte = job.filterStartDate;
        }
        if (job.filterEndDate) {
          where.createdAt.lte = job.filterEndDate;
        }
      }

      // Check if we've reached the limit
      if (job.analyzedPrompts >= job.totalPrompts) {
        // Job complete - reached the limit
        await prisma.promptAuthenticityJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        break;
      }

      // Calculate how many more records we can process
      const remaining = job.totalPrompts - job.analyzedPrompts;
      const actualBatchSize = Math.min(batchSize, remaining);

      // Get next batch of pending prompts
      const prompts = await prisma.promptAuthenticityRecord.findMany({
        where,
        take: actualBatchSize,
        select: { id: true, versionId: true, prompt: true },
      });

      if (prompts.length === 0) {
        // Job complete
        await prisma.promptAuthenticityJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
        break;
      }

      // Split batch into concurrent chunks
      const chunks = chunkArray(prompts, CONCURRENT_ANALYSES);
      console.log(`[Job ${jobId}] Processing ${prompts.length} prompts in ${chunks.length} parallel chunks of up to ${CONCURRENT_ANALYSES}`);

      // Process each chunk in parallel
      for (const chunk of chunks) {
        // Process all prompts in chunk concurrently
        const results = await Promise.allSettled(
          chunk.map(async (prompt) => {
            try {
              // Mark as analyzing
              await prisma.promptAuthenticityRecord.update({
                where: { id: prompt.id },
                data: { analysisStatus: 'ANALYZING' },
              });

              // Run analysis
              const result = await analyzePromptAuthenticity(prompt.versionId, prompt.prompt);

              // Save results
              await prisma.promptAuthenticityRecord.update({
                where: { id: prompt.id },
                data: {
                  analysisStatus: 'COMPLETED',
                  isLikelyNonNative: result.isLikelyNonNative,
                  nonNativeConfidence: result.nonNativeConfidence,
                  nonNativeIndicators: result.nonNativeIndicators as any,
                  isLikelyAIGenerated: result.isLikelyAIGenerated,
                  aiGeneratedConfidence: result.aiGeneratedConfidence,
                  aiGeneratedIndicators: result.aiGeneratedIndicators as any,
                  overallAssessment: result.overallAssessment,
                  recommendations: result.recommendations as any,
                  llmModel: result.llmModel,
                  llmProvider: result.llmProvider,
                  llmCost: result.llmCost,
                  analyzedAt: new Date(),
                },
              });

              return {
                success: true,
                promptId: prompt.id,
                versionId: prompt.versionId,
                result,
              };
            } catch (error) {
              console.error(`[Job ${jobId}] Error analyzing prompt ${prompt.versionId}:`, error);

              // Mark as failed
              await prisma.promptAuthenticityRecord.update({
                where: { id: prompt.id },
                data: {
                  analysisStatus: 'FAILED',
                  errorMessage: error instanceof Error ? error.message : 'Unknown error',
                },
              });

              return {
                success: false,
                promptId: prompt.id,
                versionId: prompt.versionId,
                error,
              };
            }
          })
        );

        // Count successes and failures in this chunk
        let successCount = 0;
        let failedCount = 0;
        let flaggedNonNativeCount = 0;
        let flaggedAIGeneratedCount = 0;
        let totalCostSum = 0;

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
            if (result.value.result.isLikelyNonNative) flaggedNonNativeCount++;
            if (result.value.result.isLikelyAIGenerated) flaggedAIGeneratedCount++;
            totalCostSum += result.value.result.llmCost || 0;
          } else {
            failedCount++;
          }
        });

        // Update job stats once per chunk (batch update)
        const updatedJob = await prisma.promptAuthenticityJob.update({
          where: { id: jobId },
          data: {
            analyzedPrompts: { increment: successCount },
            failedPrompts: { increment: failedCount },
            flaggedNonNative: { increment: flaggedNonNativeCount },
            flaggedAIGenerated: { increment: flaggedAIGeneratedCount },
            totalCost: { increment: totalCostSum },
          },
        });

        console.log(`[Job ${jobId}] Chunk complete: ${successCount} analyzed, ${failedCount} failed. Total: ${updatedJob.analyzedPrompts}/${updatedJob.totalPrompts}`);
      }
    }
  } catch (error) {
    console.error(`[Job ${jobId}] Fatal error:`, error);
    await prisma.promptAuthenticityJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// PATCH: Pause/resume/cancel job
export async function PATCH(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { jobId, action } = body;

    if (!jobId || !action) {
      return NextResponse.json({ error: 'Missing jobId or action' }, { status: 400 });
    }

    const job = await prisma.promptAuthenticityJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (action === 'pause') {
      await prisma.promptAuthenticityJob.update({
        where: { id: jobId },
        data: { status: 'PAUSED', pausedAt: new Date() },
      });
      return NextResponse.json({ success: true, message: 'Job paused' });
    }

    if (action === 'resume') {
      await prisma.promptAuthenticityJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING', pausedAt: null },
      });
      // Restart processing
      processAnalysisJob(jobId, 200).catch(error => {
        console.error('Resume job error:', error);
      });
      return NextResponse.json({ success: true, message: 'Job resumed' });
    }

    if (action === 'cancel') {
      await prisma.promptAuthenticityJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return NextResponse.json({ success: true, message: 'Job cancelled' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Job control error:', error);
    return NextResponse.json(
      { error: 'Failed to control job', details: error.message },
      { status: 500 },
    );
  }
}

// GET: Get job status
export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (jobId) {
      // Get specific job
      const job = await prisma.promptAuthenticityJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json(job);
    }

    // Get all jobs
    const jobs = await prisma.promptAuthenticityJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('Get job error:', error);
    return NextResponse.json(
      { error: 'Failed to get job status', details: error.message },
      { status: 500 },
    );
  }
}
