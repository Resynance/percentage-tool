import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

/**
 * POST /api/announcements/mark-read
 * Mark one or more announcements as read for the current user
 * Body: { announcementIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { announcementIds } = body

    if (!announcementIds || !Array.isArray(announcementIds) || announcementIds.length === 0) {
      return NextResponse.json(
        { error: 'announcementIds array is required' },
        { status: 400 }
      )
    }

    // Mark announcements as read (using createMany with skipDuplicates to handle already-read announcements)
    const reads = await prisma.announcementRead.createMany({
      data: announcementIds.map(announcementId => ({
        userId: user.id,
        announcementId
      })),
      skipDuplicates: true
    })

    return NextResponse.json(
      { success: true, markedCount: reads.count },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error marking announcements as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark announcements as read' },
      { status: 500 }
    )
  }
}
