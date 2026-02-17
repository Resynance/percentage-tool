import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

/**
 * GET /api/workforce-analytics/details
 * Get detailed analytics for a specific worker
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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      )
    }

    // Get worker basic info
    const workerInfo = await prisma.dataRecord.findFirst({
      where: { createdByEmail: email },
      select: {
        createdByName: true,
        createdByEmail: true,
      }
    })

    if (!workerInfo) {
      return NextResponse.json(
        { error: 'Worker not found' },
        { status: 404 }
      )
    }

    // Get summary stats
    const summaryStats = await prisma.dataRecord.aggregate({
      where: { createdByEmail: email },
      _count: {
        id: true
      }
    })

    const taskCount = await prisma.dataRecord.count({
      where: {
        createdByEmail: email,
        type: 'TASK'
      }
    })

    const feedbackCount = await prisma.dataRecord.count({
      where: {
        createdByEmail: email,
        type: 'FEEDBACK'
      }
    })

    // Get records by environment
    const byEnvironment = await prisma.$queryRaw<Array<{
      environment: string | null
      count: bigint
      taskCount: bigint
      feedbackCount: bigint
    }>>`
      SELECT
        metadata->>'env_key' as environment,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE type = 'TASK') as "taskCount",
        COUNT(*) FILTER (WHERE type = 'FEEDBACK') as "feedbackCount"
      FROM public.data_records
      WHERE "createdByEmail" = ${email}
      GROUP BY metadata->>'env_key'
      ORDER BY count DESC
    `

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentActivity = await prisma.$queryRaw<Array<{
      date: Date
      count: bigint
    }>>`
      SELECT
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM public.data_records
      WHERE "createdByEmail" = ${email}
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
      LIMIT 30
    `

    // Get flags for this worker
    const flags = await prisma.workerFlag.findMany({
      where: { workerEmail: email },
      select: {
        id: true,
        flagType: true,
        status: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    // Format response
    const details = {
      email: workerInfo.createdByEmail,
      name: workerInfo.createdByName,
      summary: {
        totalRecords: summaryStats._count.id,
        taskCount,
        feedbackCount
      },
      byEnvironment: byEnvironment.map(env => ({
        environment: env.environment || 'Unknown',
        count: Number(env.count),
        taskCount: Number(env.taskCount),
        feedbackCount: Number(env.feedbackCount)
      })),
      recentActivity: recentActivity.map(activity => ({
        date: activity.date.toISOString(),
        count: Number(activity.count)
      })),
      flags: flags.map(flag => ({
        id: flag.id,
        flagType: flag.flagType,
        status: flag.status,
        reason: flag.reason,
        createdAt: flag.createdAt.toISOString()
      }))
    }

    return NextResponse.json(details)
  } catch (error) {
    console.error('Error fetching worker details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch worker details' },
      { status: 500 }
    )
  }
}
