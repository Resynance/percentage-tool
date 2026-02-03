import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

interface DailyActivity {
    date: string;
    taskCount: number;
    feedbackCount: number;
    totalCount: number;
}

// GET activity data for a configurable date range (defaults to past 30 days)
export async function GET(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is MANAGER or ADMIN
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !profile.role || !['MANAGER', 'ADMIN'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        // Parse query parameters for custom date range
        const { searchParams } = new URL(req.url)
        const startParam = searchParams.get('start')
        const endParam = searchParams.get('end')

        let startDate: Date
        let endDate: Date

        if (startParam && endParam) {
            // Use custom date range
            startDate = new Date(startParam)
            endDate = new Date(endParam)

            // Validate dates
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
            }

            if (startDate > endDate) {
                return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 })
            }

            // Set to start and end of day
            startDate.setHours(0, 0, 0, 0)
            endDate.setHours(23, 59, 59, 999)
        } else {
            // Default to past 30 days
            endDate = new Date()
            endDate.setHours(23, 59, 59, 999)

            startDate = new Date()
            startDate.setDate(startDate.getDate() - 29) // 29 days ago + today = 30 days
            startDate.setHours(0, 0, 0, 0)
        }

        // Fetch all records in the date range
        const records = await prisma.dataRecord.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                type: true,
                createdAt: true
            }
        })

        // Create a map to hold daily counts
        const dailyActivityMap = new Map<string, { taskCount: number; feedbackCount: number }>()

        // Calculate the number of days in the range
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

        // Initialize all days in the range with zero counts
        for (let i = 0; i < daysDiff; i++) {
            const date = new Date(startDate)
            date.setDate(date.getDate() + i)
            const dateKey = date.toISOString().split('T')[0]
            dailyActivityMap.set(dateKey, { taskCount: 0, feedbackCount: 0 })
        }

        // Count records by day
        console.log(`[Activity API] Processing ${records.length} records`)
        const recordDateSample = records.slice(0, 3).map(r => ({
            date: r.createdAt.toISOString().split('T')[0],
            type: r.type
        }))
        console.log(`[Activity API] Sample record dates:`, recordDateSample)
        console.log(`[Activity API] Map has ${dailyActivityMap.size} date keys, first 3:`, Array.from(dailyActivityMap.keys()).slice(0, 3))

        records.forEach(record => {
            const dateKey = record.createdAt.toISOString().split('T')[0]
            const counts = dailyActivityMap.get(dateKey)

            if (counts) {
                if (record.type === 'TASK') {
                    counts.taskCount++
                } else if (record.type === 'FEEDBACK') {
                    counts.feedbackCount++
                }
            } else {
                console.log(`[Activity API] WARNING: No map entry for date ${dateKey}`)
            }
        })

        const totalCounted = Array.from(dailyActivityMap.values()).reduce((sum, day) => sum + day.taskCount + day.feedbackCount, 0)
        console.log(`[Activity API] Total records counted: ${totalCounted} (should be ${records.length})`)

        const nonZeroDays = Array.from(dailyActivityMap.entries()).filter(([_, counts]) => counts.taskCount > 0 || counts.feedbackCount > 0)
        console.log(`[Activity API] Non-zero days: ${nonZeroDays.length}/${dailyActivityMap.size}`)
        if (nonZeroDays.length > 0) {
            console.log(`[Activity API] Sample non-zero days:`, nonZeroDays.slice(0, 3).map(([date, counts]) => ({
                date,
                tasks: counts.taskCount,
                feedback: counts.feedbackCount
            })))
        }

        // Convert map to sorted array
        const dailyActivity: DailyActivity[] = Array.from(dailyActivityMap.entries())
            .map(([date, counts]) => ({
                date,
                taskCount: counts.taskCount,
                feedbackCount: counts.feedbackCount,
                totalCount: counts.taskCount + counts.feedbackCount
            }))
            .sort((a, b) => a.date.localeCompare(b.date))

        return NextResponse.json({
            dailyActivity,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        })
    } catch (error) {
        console.error('[Activity Over Time API] GET error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
    }
}
