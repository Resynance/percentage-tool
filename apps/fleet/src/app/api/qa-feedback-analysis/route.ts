import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ERROR_IDS } from '@/constants/errorIds'

export const dynamic = 'force-dynamic'

interface WorkerStats {
    qaEmail: string;
    qaName: string | null;
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    negativePercent: number;
    disputes: number;
    totalFeedbacks: number;
    negativePerFeedbackRatio: number;
}

// GET: Main analytics endpoint for QA worker feedback analysis
export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.warn('[QA Feedback Analysis API] Unauthorized access attempt:', {
            errorId: ERROR_IDS.AUTH_UNAUTHORIZED,
            timestamp: new Date().toISOString()
        })
        return NextResponse.json({
            error: 'Unauthorized',
            errorId: ERROR_IDS.AUTH_UNAUTHORIZED
        }, { status: 401 })
    }

    // Check if user is FLEET or ADMIN
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError) {
        console.error('[QA Feedback Analysis API] Profile query error:', {
            errorId: ERROR_IDS.DB_QUERY_FAILED,
            userId: user.id,
            error: profileError.message,
            code: profileError.code
        })
        return NextResponse.json({
            error: 'Failed to verify permissions',
            errorId: ERROR_IDS.DB_QUERY_FAILED
        }, { status: 500 })
    }

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        console.warn('[QA Feedback Analysis API] Forbidden access attempt:', {
            errorId: ERROR_IDS.AUTH_FORBIDDEN,
            userId: user.id,
            userRole: profile?.role || 'NONE'
        })
        return NextResponse.json({
            error: 'Forbidden',
            errorId: ERROR_IDS.AUTH_FORBIDDEN
        }, { status: 403 })
    }

    try {
        // Parse query parameters
        const { searchParams } = new URL(req.url)
        const startParam = searchParams.get('startDate')
        const endParam = searchParams.get('endDate')
        const environment = searchParams.get('environment')
        const minNegativePercent = searchParams.get('minNegativePercent')

        // Build date range filter
        const dateFilter: Prisma.QAFeedbackRatingWhereInput = {}
        if (startParam && endParam) {
            const startDate = new Date(startParam)
            const endDate = new Date(endParam)

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return NextResponse.json({
                    error: 'Invalid date format',
                    errorId: ERROR_IDS.INVALID_DATE_FORMAT
                }, { status: 400 })
            }

            startDate.setHours(0, 0, 0, 0)
            endDate.setHours(23, 59, 59, 999)

            dateFilter.ratedAt = {
                gte: startDate,
                lte: endDate
            }
        }

        // Get all ratings grouped by QA worker
        const ratings = await prisma.qAFeedbackRating.findMany({
            where: dateFilter,
            select: {
                qaEmail: true,
                qaName: true,
                isHelpful: true,
                isDispute: true,
                evalTaskId: true,
            }
        })

        // If environment filter is provided, we need to join with data_records
        let filteredRatings = ratings
        if (environment) {
            const ratingIds = ratings
                .filter(r => r.evalTaskId)
                .map(r => r.evalTaskId!)

            // Get tasks matching the environment
            const tasks = await prisma.dataRecord.findMany({
                where: {
                    id: { in: ratingIds },
                },
                select: {
                    id: true,
                    metadata: true,
                }
            })

            const taskIdsInEnvironment = new Set(
                tasks
                    .filter(task => {
                        const metadata = task.metadata as any
                        const taskEnv = metadata?.scenario_title || metadata?.env_key || metadata?.environment_name
                        return taskEnv === environment
                    })
                    .map(task => task.id)
            )

            // Filter ratings to only those linked to tasks in the target environment
            filteredRatings = ratings.filter(r =>
                r.evalTaskId && taskIdsInEnvironment.has(r.evalTaskId)
            )
        }

        // Group by QA worker
        const workerMap = new Map<string, {
            qaName: string | null;
            totalRatings: number;
            positiveRatings: number;
            negativeRatings: number;
            disputes: number;
        }>()

        for (const rating of filteredRatings) {
            if (!workerMap.has(rating.qaEmail)) {
                workerMap.set(rating.qaEmail, {
                    qaName: rating.qaName,
                    totalRatings: 0,
                    positiveRatings: 0,
                    negativeRatings: 0,
                    disputes: 0,
                })
            }

            const worker = workerMap.get(rating.qaEmail)!
            worker.totalRatings++
            if (rating.isHelpful) {
                worker.positiveRatings++
            } else {
                worker.negativeRatings++
            }
            if (rating.isDispute) {
                worker.disputes++
            }
        }

        // Calculate stats for each worker and get their total feedback count
        const workers: WorkerStats[] = []

        // Batch query for feedback counts (avoid N+1)
        const qaEmails = Array.from(workerMap.keys())
        const feedbackCounts = await prisma.dataRecord.groupBy({
            by: ['createdByEmail'],
            where: {
                type: 'FEEDBACK',
                createdByEmail: { in: qaEmails }
            },
            _count: { _all: true }
        })
        const feedbackCountMap = new Map(
            feedbackCounts.map(fc => [fc.createdByEmail, fc._count._all])
        )

        for (const [qaEmail, stats] of workerMap.entries()) {
            // Look up feedback count from pre-built map
            const totalFeedbacks = feedbackCountMap.get(qaEmail) || 0

            const negativePercent = stats.totalRatings > 0
                ? (stats.negativeRatings / stats.totalRatings) * 100
                : 0

            const negativePerFeedbackRatio = totalFeedbacks > 0
                ? stats.negativeRatings / totalFeedbacks
                : 0

            // Apply minimum negative percent filter
            if (minNegativePercent && negativePercent < parseFloat(minNegativePercent)) {
                continue
            }

            workers.push({
                qaEmail,
                qaName: stats.qaName,
                totalRatings: stats.totalRatings,
                positiveRatings: stats.positiveRatings,
                negativeRatings: stats.negativeRatings,
                negativePercent: Math.round(negativePercent * 10) / 10, // Round to 1 decimal
                disputes: stats.disputes,
                totalFeedbacks,
                negativePerFeedbackRatio: Math.round(negativePerFeedbackRatio * 1000) / 1000, // Round to 3 decimals
            })
        }

        // Sort by negative percentage (descending)
        workers.sort((a, b) => b.negativePercent - a.negativePercent)

        return NextResponse.json({
            workers,
            dateRange: {
                start: startParam || null,
                end: endParam || null,
            },
            filters: {
                environment: environment || null,
                minNegativePercent: minNegativePercent ? parseFloat(minNegativePercent) : null,
            }
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('[QA Feedback Analysis API] Database error:', {
                errorId: ERROR_IDS.DB_QUERY_FAILED,
                code: error.code,
                meta: error.meta,
                message: error.message,
                userId: user?.id
            })
            return NextResponse.json({
                error: 'Database query failed',
                errorId: ERROR_IDS.DB_QUERY_FAILED
            }, { status: 500 })
        }

        console.error('[QA Feedback Analysis API] Unexpected error:', {
            errorId: ERROR_IDS.SYSTEM_ERROR,
            userId: user?.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        })
        return NextResponse.json({
            error: 'An unexpected error occurred',
            errorId: ERROR_IDS.SYSTEM_ERROR
        }, { status: 500 })
    }
}
