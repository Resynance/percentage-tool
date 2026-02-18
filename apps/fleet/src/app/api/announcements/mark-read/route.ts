import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

// CORS headers for cross-app communication
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_FLEET_APP_URL || '*'
    : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders })
}

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
        { status: 401, headers: corsHeaders }
      )
    }

    // Parse request body
    const body = await request.json()
    const { announcementIds } = body

    if (!announcementIds || !Array.isArray(announcementIds) || announcementIds.length === 0) {
      return NextResponse.json(
        { error: 'announcementIds array is required' },
        { status: 400, headers: corsHeaders }
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
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error marking announcements as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark announcements as read' },
      { status: 500, headers: corsHeaders }
    )
  }
}
