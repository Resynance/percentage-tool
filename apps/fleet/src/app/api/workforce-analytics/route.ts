import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

/**
 * GET /api/workforce-analytics
 * Get workforce analytics and metrics
 * Requires FLEET or ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is FLEET or ADMIN
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true }
    })

    if (!profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - FLEET or ADMIN access required' },
        { status: 403 }
      )
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const workerEmail = searchParams.get('workerEmail')

    // Build where clause for filtering
    const whereClause: any = {
      createdByEmail: { not: null }
    }
    if (workerEmail) {
      whereClause.createdByEmail = workerEmail
    }

    // Get worker statistics from data_records
    let workers: Array<{
      createdByEmail: string
      createdByName: string | null
      totalRecords: bigint
      taskCount: bigint
      feedbackCount: bigint
      earliestRecord: Date
      latestRecord: Date
    }>

    if (workerEmail) {
      workers = await prisma.$queryRaw`
        SELECT
          "createdByEmail",
          "createdByName",
          COUNT(*) as "totalRecords",
          COUNT(*) FILTER (WHERE type = 'TASK') as "taskCount",
          COUNT(*) FILTER (WHERE type = 'FEEDBACK') as "feedbackCount",
          MIN("createdAt") as "earliestRecord",
          MAX("createdAt") as "latestRecord"
        FROM public.data_records
        WHERE "createdByEmail" IS NOT NULL
          AND "createdByEmail" = ${workerEmail}
        GROUP BY "createdByEmail", "createdByName"
        ORDER BY "totalRecords" DESC
      `
    } else {
      workers = await prisma.$queryRaw`
        SELECT
          "createdByEmail",
          "createdByName",
          COUNT(*) as "totalRecords",
          COUNT(*) FILTER (WHERE type = 'TASK') as "taskCount",
          COUNT(*) FILTER (WHERE type = 'FEEDBACK') as "feedbackCount",
          MIN("createdAt") as "earliestRecord",
          MAX("createdAt") as "latestRecord"
        FROM public.data_records
        WHERE "createdByEmail" IS NOT NULL
        GROUP BY "createdByEmail", "createdByName"
        ORDER BY "totalRecords" DESC
      `
    }

    // Get flag counts per worker
    const flagCounts = await prisma.workerFlag.groupBy({
      by: ['workerEmail'],
      where: workerEmail ? { workerEmail } : {},
      _count: {
        id: true
      }
    })

    const activeFlagCounts = await prisma.workerFlag.groupBy({
      by: ['workerEmail'],
      where: {
        status: { in: ['ACTIVE', 'UNDER_REVIEW', 'APPEALED'] },
        ...(workerEmail ? { workerEmail } : {})
      },
      _count: {
        id: true
      }
    })

    // Create maps for easy lookup
    const flagCountMap = new Map(flagCounts.map(f => [f.workerEmail, Number(f._count.id)]))
    const activeFlagCountMap = new Map(activeFlagCounts.map(f => [f.workerEmail, Number(f._count.id)]))

    // Combine worker stats with flag counts
    const analytics = workers.map(worker => ({
      email: worker.createdByEmail,
      name: worker.createdByName,
      totalRecords: Number(worker.totalRecords),
      taskCount: Number(worker.taskCount),
      feedbackCount: Number(worker.feedbackCount),
      totalFlags: flagCountMap.get(worker.createdByEmail) || 0,
      activeFlags: activeFlagCountMap.get(worker.createdByEmail) || 0,
      earliestRecord: worker.earliestRecord,
      latestRecord: worker.latestRecord,
      daysSinceFirstRecord: Math.floor(
        (new Date().getTime() - new Date(worker.earliestRecord).getTime()) / (1000 * 60 * 60 * 24)
      ),
      daysSinceLastRecord: Math.floor(
        (new Date().getTime() - new Date(worker.latestRecord).getTime()) / (1000 * 60 * 60 * 24)
      )
    }))

    // Calculate summary stats
    const summary = {
      totalWorkers: analytics.length,
      totalRecords: analytics.reduce((sum, w) => sum + w.totalRecords, 0),
      totalTasks: analytics.reduce((sum, w) => sum + w.taskCount, 0),
      totalFeedback: analytics.reduce((sum, w) => sum + w.feedbackCount, 0),
      totalFlags: analytics.reduce((sum, w) => sum + w.totalFlags, 0),
      activeFlags: analytics.reduce((sum, w) => sum + w.activeFlags, 0),
      avgRecordsPerWorker: analytics.length > 0
        ? Math.round(analytics.reduce((sum, w) => sum + w.totalRecords, 0) / analytics.length)
        : 0
    }

    return NextResponse.json({
      summary,
      workers: analytics
    })
  } catch (error) {
    console.error('Error fetching workforce analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch workforce analytics' },
      { status: 500 }
    )
  }
}
