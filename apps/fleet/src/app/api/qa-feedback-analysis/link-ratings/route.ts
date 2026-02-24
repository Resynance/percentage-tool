import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { NextResponse } from 'next/server'
import { ERROR_IDS } from '@/constants/errorIds'

export const dynamic = 'force-dynamic'

// POST: Link existing ratings to tasks by finding feedbacks and their parent tasks
export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({
            error: 'Unauthorized',
            errorId: ERROR_IDS.AUTH_UNAUTHORIZED
        }, { status: 401 })
    }

    // Check if user is ADMIN
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile || profile.role !== 'ADMIN') {
        return NextResponse.json({
            error: 'Forbidden - Admin access required',
            errorId: ERROR_IDS.AUTH_FORBIDDEN
        }, { status: 403 })
    }

    try {
        console.log('[Link Ratings API] Starting to link ratings to tasks...')

        // Get all ratings without task links
        const ratingsWithoutTask = await prisma.qAFeedbackRating.findMany({
            where: {
                evalTaskId: null
            },
            select: {
                id: true,
                ratingId: true,
                feedbackId: true,
            }
        })

        console.log(`[Link Ratings API] Found ${ratingsWithoutTask.length} ratings without task links`)

        let linked = 0
        let notFound = 0
        const errors: string[] = []

        // Process in batches to avoid overwhelming the database
        const BATCH_SIZE = 100
        for (let i = 0; i < ratingsWithoutTask.length; i += BATCH_SIZE) {
            const batch = ratingsWithoutTask.slice(i, i + BATCH_SIZE)

            for (const rating of batch) {
                try {
                    // Find the task with matching rating_id in metadata
                    const tasks = await prisma.dataRecord.findMany({
                        where: {
                            type: 'TASK',
                        },
                        select: {
                            id: true,
                            metadata: true,
                        }
                    })

                    const matchingTask = tasks.find(t => {
                        const metadata = t.metadata as any
                        return metadata?.rating_id === rating.ratingId
                    })

                    if (!matchingTask) {
                        notFound++
                        continue
                    }

                    // Update the rating to link to the task
                    await prisma.qAFeedbackRating.update({
                        where: { id: rating.id },
                        data: { evalTaskId: matchingTask.id }
                    })

                    linked++
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    errors.push(`Rating ${rating.ratingId}: ${errorMsg}`)
                }
            }

            // Log progress
            console.log(`[Link Ratings API] Progress: ${Math.min(i + BATCH_SIZE, ratingsWithoutTask.length)}/${ratingsWithoutTask.length} processed`)
        }

        console.log('[Link Ratings API] Linking complete:', {
            total: ratingsWithoutTask.length,
            linked,
            notFound,
            errors: errors.length
        })

        return NextResponse.json({
            success: true,
            summary: {
                total: ratingsWithoutTask.length,
                linked,
                notFound,
                stillUnlinked: ratingsWithoutTask.length - linked,
                errors: errors.slice(0, 10) // Only return first 10 errors
            }
        })
    } catch (error) {
        console.error('[Link Ratings API] Unexpected error:', error)
        return NextResponse.json({
            error: 'An unexpected error occurred',
            details: error instanceof Error ? error.message : String(error),
            errorId: ERROR_IDS.SYSTEM_ERROR
        }, { status: 500 })
    }
}
