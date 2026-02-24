import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET: Diagnostic info about QA feedback data
export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Count total ratings
        const totalRatings = await prisma.qAFeedbackRating.count()

        // Count ratings with eval_task_id
        const ratingsWithTask = await prisma.qAFeedbackRating.count({
            where: {
                evalTaskId: { not: null }
            }
        })

        // Count ratings without eval_task_id
        const ratingsWithoutTask = await prisma.qAFeedbackRating.count({
            where: {
                evalTaskId: null
            }
        })

        // Get sample ratings
        const sampleRatings = await prisma.qAFeedbackRating.findMany({
            take: 5,
            select: {
                ratingId: true,
                feedbackId: true,
                evalTaskId: true,
                qaEmail: true,
                qaName: true,
                isHelpful: true,
            }
        })

        // Count TASK records in data_records
        const totalTasks = await prisma.dataRecord.count({
            where: { type: 'TASK' }
        })

        // Count FEEDBACK records
        const totalFeedbacks = await prisma.dataRecord.count({
            where: { type: 'FEEDBACK' }
        })

        // Get sample tasks with metadata
        const sampleTasks = await prisma.dataRecord.findMany({
            where: { type: 'TASK' },
            take: 3,
            select: {
                id: true,
                type: true,
                createdByEmail: true,
                createdByName: true,
                createdAt: true,
                metadata: true,
            }
        })

        // Get sample feedbacks with metadata
        const sampleFeedbacks = await prisma.dataRecord.findMany({
            where: { type: 'FEEDBACK' },
            take: 3,
            select: {
                id: true,
                type: true,
                createdByEmail: true,
                createdByName: true,
                createdAt: true,
                metadata: true,
            }
        })

        return NextResponse.json({
            ratings: {
                total: totalRatings,
                withTaskLink: ratingsWithTask,
                withoutTaskLink: ratingsWithoutTask,
                samples: sampleRatings,
            },
            dataRecords: {
                totalTasks,
                totalFeedbacks,
                sampleTasks,
                sampleFeedbacks,
            },
            diagnosis: {
                issue: ratingsWithoutTask === totalRatings
                    ? 'All ratings are missing task links (eval_task_id is null)'
                    : ratingsWithTask === 0
                    ? 'No ratings are linked to tasks'
                    : 'Some ratings are linked, some are not',
                recommendation: ratingsWithoutTask > 0
                    ? 'The CSV import needs task IDs that match records in data_records table, or tasks need to be imported first'
                    : 'Data looks good'
            }
        })
    } catch (error) {
        console.error('[Diagnostics API] Error:', error)
        return NextResponse.json({
            error: 'Failed to fetch diagnostics',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
