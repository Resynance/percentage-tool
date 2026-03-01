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

        // Parse date range (shared by both paths below)
        let startDate: Date | undefined
        let endDate: Date | undefined
        if (startParam && endParam) {
            startDate = new Date(startParam)
            endDate = new Date(endParam)

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return NextResponse.json({
                    error: 'Invalid date format',
                    errorId: ERROR_IDS.INVALID_DATE_FORMAT
                }, { status: 400 })
            }

            startDate.setHours(0, 0, 0, 0)
            endDate.setHours(23, 59, 59, 999)
        }

        // Get ratings — when an environment filter is present, use a single JOIN query to
        // avoid loading all ratings and then doing a second round-trip to filter by task metadata.
        type RatingRow = { qaEmail: string; qaName: string | null; isHelpful: boolean; isDispute: boolean; evalTaskId: string | null }
        let filteredRatings: RatingRow[]

        if (environment) {
            const dateClause = startDate && endDate
                ? Prisma.sql`AND qr.rated_at >= ${startDate} AND qr.rated_at <= ${endDate}`
                : Prisma.empty

            const rows = await prisma.$queryRaw<Array<{
                qa_email: string; qa_name: string | null; is_helpful: boolean; is_dispute: boolean; eval_task_id: string | null;
            }>>`
                SELECT qr.qa_email, qr.qa_name, qr.is_helpful, qr.is_dispute, qr.eval_task_id
                FROM qa_feedback_ratings qr
                JOIN data_records dr ON dr.id = qr.eval_task_id
                WHERE (
                    dr.metadata->>'scenario_title' = ${environment}
                    OR dr.metadata->>'env_key' = ${environment}
                    OR dr.metadata->>'environment_name' = ${environment}
                )
                ${dateClause}
            `

            filteredRatings = rows.map(r => ({
                qaEmail: r.qa_email,
                qaName: r.qa_name,
                isHelpful: r.is_helpful,
                isDispute: r.is_dispute,
                evalTaskId: r.eval_task_id,
            }))
        } else {
            const dateFilter: Prisma.QAFeedbackRatingWhereInput = {}
            if (startDate && endDate) {
                dateFilter.ratedAt = { gte: startDate, lte: endDate }
            }

            filteredRatings = await prisma.qAFeedbackRating.findMany({
                where: dateFilter,
                select: { qaEmail: true, qaName: true, isHelpful: true, isDispute: true, evalTaskId: true }
            })
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
