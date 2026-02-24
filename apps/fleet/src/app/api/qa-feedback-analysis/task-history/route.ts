import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ERROR_IDS } from '@/constants/errorIds'

export const dynamic = 'force-dynamic'

interface TaskDetails {
    id: string;
    content: string;
    environment: string | null;
    createdAt: Date;
    createdByEmail: string | null;
    createdByName: string | null;
    metadata: any;
}

interface RelatedTask {
    id: string;
    content: string;
    environment: string | null;
    createdAt: Date;
}

interface FeedbackWithRating {
    feedbackId: string;
    feedbackContent: string;
    feedbackCreatedAt: Date;
    qaEmail: string | null;
    qaName: string | null;
    ratingId: string | null;
    isHelpful: boolean | null;
    isDispute: boolean | null;
    ratedAt: Date | null;
    raterEmail: string | null;
}

// GET: Task history with related tasks and all feedbacks
export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.warn('[Task History API] Unauthorized access attempt:', {
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
        console.error('[Task History API] Profile query error:', {
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
        console.warn('[Task History API] Forbidden access attempt:', {
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
        const taskId = searchParams.get('taskId')

        if (!taskId) {
            return NextResponse.json({
                error: 'taskId parameter is required',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 400 })
        }

        // Get task details
        const task = await prisma.dataRecord.findUnique({
            where: { id: taskId },
            select: {
                id: true,
                content: true,
                metadata: true,
                createdAt: true,
                createdByEmail: true,
                createdByName: true,
                type: true,
            }
        })

        if (!task) {
            return NextResponse.json({
                error: 'Task not found',
                errorId: ERROR_IDS.INVALID_INPUT
            }, { status: 404 })
        }

        const metadata = task.metadata as any
        const taskDetails: TaskDetails = {
            id: task.id,
            content: metadata?.task_prompt || task.content, // Use full task_prompt from metadata if available
            environment: metadata?.scenario_title || metadata?.env_key || metadata?.environment_name || null,
            createdAt: task.createdAt,
            createdByEmail: task.createdByEmail,
            createdByName: task.createdByName,
            metadata: task.metadata,
        }

        // Get related tasks from the same worker within 7 days
        const relatedTasks: RelatedTask[] = []

        if (task.createdByEmail) {
            const sevenDaysAgo = new Date(task.createdAt)
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

            const sevenDaysAhead = new Date(task.createdAt)
            sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7)

            const related = await prisma.dataRecord.findMany({
                where: {
                    type: 'TASK',
                    createdByEmail: task.createdByEmail,
                    id: { not: taskId }, // Exclude current task
                    createdAt: {
                        gte: sevenDaysAgo,
                        lte: sevenDaysAhead,
                    }
                },
                select: {
                    id: true,
                    content: true,
                    metadata: true,
                    createdAt: true,
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 10, // Limit to 10 related tasks
            })

            relatedTasks.push(...related.map(r => {
                const relMetadata = r.metadata as any
                const fullContent = relMetadata?.task_prompt || r.content
                return {
                    id: r.id,
                    content: fullContent.slice(0, 150) + (fullContent.length > 150 ? '...' : ''),
                    environment: relMetadata?.scenario_title || relMetadata?.env_key || relMetadata?.environment_name || null,
                    createdAt: r.createdAt,
                }
            }))
        }

        // Get all feedbacks for this task (using task_key from metadata)
        const taskKey = metadata?.task_key
        const allFeedbacks: FeedbackWithRating[] = []

        if (taskKey) {
            // Use Prisma JSON filtering to query at database level (avoid full table scan)
            const matchingFeedbacks = await prisma.dataRecord.findMany({
                where: {
                    type: 'FEEDBACK',
                    metadata: {
                        path: ['task_key'],
                        equals: taskKey
                    }
                },
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    createdByEmail: true,
                    createdByName: true,
                    metadata: true,
                }
            })

            // Batch rating lookups (avoid N+1)
            const feedbackKeys = matchingFeedbacks.map(f => {
                const fMetadata = f.metadata as any
                return fMetadata?.feedback_key || f.id
            })

            const ratings = await prisma.qAFeedbackRating.findMany({
                where: {
                    feedbackId: { in: feedbackKeys }
                },
                select: {
                    feedbackId: true,
                    ratingId: true,
                    isHelpful: true,
                    isDispute: true,
                    ratedAt: true,
                    raterEmail: true,
                }
            })

            const ratingMap = new Map(ratings.map(r => [r.feedbackId, r]))

            // Build feedback list with ratings
            for (const feedback of matchingFeedbacks) {
                const fMetadata = feedback.metadata as any
                const feedbackKey = fMetadata?.feedback_key || feedback.id
                const rating = ratingMap.get(feedbackKey)

                allFeedbacks.push({
                    feedbackId: feedback.id,
                    feedbackContent: fMetadata?.feedback_content || feedback.content, // Use full feedback_content from metadata if available
                    feedbackCreatedAt: feedback.createdAt,
                    qaEmail: feedback.createdByEmail,
                    qaName: feedback.createdByName,
                    ratingId: rating?.ratingId || null,
                    isHelpful: rating?.isHelpful ?? null,
                    isDispute: rating?.isDispute ?? null,
                    ratedAt: rating?.ratedAt || null,
                    raterEmail: rating?.raterEmail || null,
                })
            }
        }

        // Sort feedbacks by creation date (most recent first)
        allFeedbacks.sort((a, b) => b.feedbackCreatedAt.getTime() - a.feedbackCreatedAt.getTime())

        return NextResponse.json({
            task: taskDetails,
            relatedTasks,
            allFeedbacks,
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('[Task History API] Database error:', {
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

        console.error('[Task History API] Unexpected error:', {
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
