import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test creating a job
    const job = await prisma.jobQueue.create({
      data: {
        jobType: 'TEST',
        payload: { test: true },
        priority: 0,
      },
    });

    // Test querying
    const count = await prisma.jobQueue.count();

    // Clean up
    await prisma.jobQueue.delete({ where: { id: job.id } });

    return NextResponse.json({
      success: true,
      message: 'jobQueue table is accessible via Prisma',
      testJobId: job.id,
      totalJobs: count - 1, // Minus the test job we just deleted
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
    }, { status: 500 });
  }
}
