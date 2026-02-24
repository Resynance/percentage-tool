import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ERROR_IDS } from '@/constants/errorIds'

export const dynamic = 'force-dynamic'

interface WorkerSummary {
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

interface EnvStats {
    environment: string;
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    negativePercent: number;
}

interface MonthStats {
    month: string; // YYYY-MM format
    totalRatings: number;
    positiveRatings: number;
    negativeRatings: number;
    negativePercent: number;
}

interface TaskRating {
    taskId: string;
    taskContent: string;
    taskEnvironment: string | null;
    taskCreatedAt: Date;
    ratingId: string;
    isHelpful: boolean;
    isDispute: boolean;
    ratedAt: Date;
    raterEmail: string;
}

// GET: Worker details with environment/time breakdowns and rated tasks
export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.warn('[QA Worker Details API] Unauthorized access attempt:', {
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
        console.error('[QA Worker Details API] Profile query error:', {
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

    if (!profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
        console.warn('[QA Worker Details API] Forbidden access attempt:', {
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
        const qaEmail = searchParams.get('qaEmail')
        const startParam = searchParams.get('startDate')
        const endParam = searchParams.get('endDate')
        const environment = searchParams.get('environment')

        if (!qaEmail) {
            return NextResponse.json({
                error: 'qaEmail parameter is required',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 400 })
        }

        // Build date range filter
        const dateFilter: Prisma.QAFeedbackRatingWhereInput = { qaEmail }
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

        // Get all ratings for this worker
        const ratings = await prisma.qAFeedbackRating.findMany({
            where: dateFilter,
            select: {
                id: true,
                ratingId: true,
                qaName: true,
                isHelpful: true,
                isDispute: true,
                ratedAt: true,
                raterEmail: true,
                evalTaskId: true,
            },
            orderBy: {
                ratedAt: 'desc'
            }
        })

        // Get linked tasks for environment filtering
        const taskIds = ratings
            .filter(r => r.evalTaskId)
            .map(r => r.evalTaskId!)

        const tasks = await prisma.dataRecord.findMany({
            where: {
                id: { in: taskIds }
            },
            select: {
                id: true,
                content: true,
                metadata: true,
                createdAt: true,
            }
        })

        const tasksMap = new Map(tasks.map(t => [t.id, t]))

        // Apply environment filter if provided
        let filteredRatings = ratings
        if (environment) {
            filteredRatings = ratings.filter(r => {
                if (!r.evalTaskId) return false
                const task = tasksMap.get(r.evalTaskId)
                if (!task) return false
                const metadata = task.metadata as any
                return metadata?.environment_name === environment
            })
        }

        // Calculate worker summary
        const totalRatings = filteredRatings.length
        const positiveRatings = filteredRatings.filter(r => r.isHelpful).length
        const negativeRatings = filteredRatings.filter(r => !r.isHelpful).length
        const disputes = filteredRatings.filter(r => r.isDispute).length

        const totalFeedbacks = await prisma.dataRecord.count({
            where: {
                type: 'FEEDBACK',
                createdByEmail: qaEmail,
            }
        })

        const negativePercent = totalRatings > 0
            ? (negativeRatings / totalRatings) * 100
            : 0

        const negativePerFeedbackRatio = totalFeedbacks > 0
            ? negativeRatings / totalFeedbacks
            : 0

        const worker: WorkerSummary = {
            qaEmail,
            qaName: ratings[0]?.qaName || null,
            totalRatings,
            positiveRatings,
            negativeRatings,
            negativePercent: Math.round(negativePercent * 10) / 10,
            disputes,
            totalFeedbacks,
            negativePerFeedbackRatio: Math.round(negativePerFeedbackRatio * 1000) / 1000,
        }

        // Aggregate by environment
        const envMap = new Map<string, {
            positive: number;
            negative: number;
        }>()

        for (const rating of filteredRatings) {
            if (!rating.evalTaskId) continue
            const task = tasksMap.get(rating.evalTaskId)
            if (!task) continue
            const metadata = task.metadata as any
            const env = metadata?.environment_name || 'Unknown'

            if (!envMap.has(env)) {
                envMap.set(env, { positive: 0, negative: 0 })
            }

            const envStats = envMap.get(env)!
            if (rating.isHelpful) {
                envStats.positive++
            } else {
                envStats.negative++
            }
        }

        const ratingsByEnvironment: EnvStats[] = Array.from(envMap.entries())
            .map(([environment, stats]) => ({
                environment,
                totalRatings: stats.positive + stats.negative,
                positiveRatings: stats.positive,
                negativeRatings: stats.negative,
                negativePercent: Math.round((stats.negative / (stats.positive + stats.negative)) * 1000) / 10,
            }))
            .sort((a, b) => b.totalRatings - a.totalRatings)

        // Aggregate by month
        const monthMap = new Map<string, {
            positive: number;
            negative: number;
        }>()

        for (const rating of filteredRatings) {
            const month = new Date(rating.ratedAt).toISOString().slice(0, 7) // YYYY-MM

            if (!monthMap.has(month)) {
                monthMap.set(month, { positive: 0, negative: 0 })
            }

            const monthStats = monthMap.get(month)!
            if (rating.isHelpful) {
                monthStats.positive++
            } else {
                monthStats.negative++
            }
        }

        const ratingsByMonth: MonthStats[] = Array.from(monthMap.entries())
            .map(([month, stats]) => ({
                month,
                totalRatings: stats.positive + stats.negative,
                positiveRatings: stats.positive,
                negativeRatings: stats.negative,
                negativePercent: Math.round((stats.negative / (stats.positive + stats.negative)) * 1000) / 10,
            }))
            .sort((a, b) => a.month.localeCompare(b.month))

        // Get rated tasks with details
        const ratedTasks: TaskRating[] = filteredRatings
            .filter(r => r.evalTaskId)
            .map(rating => {
                const task = tasksMap.get(rating.evalTaskId!)
                const metadata = task?.metadata as any

                return {
                    taskId: rating.evalTaskId!,
                    taskContent: task?.content ? task.content.slice(0, 200) + (task.content.length > 200 ? '...' : '') : 'N/A',
                    taskEnvironment: metadata?.scenario_title || metadata?.env_key || metadata?.environment_name || null,
                    taskCreatedAt: task?.createdAt || new Date(),
                    ratingId: rating.ratingId,
                    isHelpful: rating.isHelpful,
                    isDispute: rating.isDispute,
                    ratedAt: rating.ratedAt,
                    raterEmail: rating.raterEmail,
                }
            })

        return NextResponse.json({
            worker,
            ratingsByEnvironment,
            ratingsByMonth,
            tasks: ratedTasks,
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('[QA Worker Details API] Database error:', {
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

        console.error('[QA Worker Details API] Unexpected error:', {
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
