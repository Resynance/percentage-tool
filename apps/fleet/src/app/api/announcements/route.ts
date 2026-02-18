import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

// CORS headers for cross-app communication
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_FLEET_APP_URL || '*'
    : '*', // Allow all origins in development
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders })
}

/**
 * GET /api/announcements
 * Get all published announcements
 * Available to all authenticated users
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

    // Get user profile to check role
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true }
    })

    const userRole = profile?.role || 'USER'
    const canSeeAll = ['FLEET', 'ADMIN'].includes(userRole)
    const canSeeQaAndAbove = ['QA', 'CORE', 'FLEET', 'MANAGER', 'ADMIN'].includes(userRole)

    // Build visibility filter based on user role
    const visibilityFilter = canSeeQaAndAbove
      ? {} // QA and above can see all visibility levels
      : { visibility: 'ALL_USERS' } // Regular users only see ALL_USERS

    // Fetch announcements with visibility filtering
    const announcements = await prisma.announcement.findMany({
      where: {
        ...(canSeeAll ? {} : { published: true }),
        ...visibilityFilter
      },
      include: {
        createdBy: {
          select: {
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Get profile data for names and read status
    const announcementsWithNames = await Promise.all(
      announcements.map(async (announcement) => {
        const profile = await prisma.profile.findUnique({
          where: { id: announcement.createdById },
          select: { firstName: true, lastName: true, email: true }
        })

        // Check if current user has read this announcement
        const hasRead = await prisma.announcementRead.findUnique({
          where: {
            userId_announcementId: {
              userId: user.id,
              announcementId: announcement.id
            }
          }
        })

        return {
          ...announcement,
          createdBy: {
            email: profile?.email || announcement.createdBy.email || '',
            firstName: profile?.firstName || null,
            lastName: profile?.lastName || null
          },
          isRead: !!hasRead
        }
      })
    )

    return NextResponse.json({ announcements: announcementsWithNames }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error fetching announcements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * POST /api/announcements
 * Create a new announcement
 * Requires FLEET or ADMIN role
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

    // Parse request body
    const body = await request.json()
    const { title, content, published = true, visibility = 'ALL_USERS' } = body

    // Validate required fields
    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      )
    }

    // Validate visibility
    if (!['ALL_USERS', 'QA_AND_ABOVE'].includes(visibility)) {
      return NextResponse.json(
        { error: 'Invalid visibility value' },
        { status: 400 }
      )
    }

    // Create announcement
    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        published,
        visibility,
        createdById: user.id
      },
      include: {
        createdBy: {
          select: {
            email: true
          }
        }
      }
    })

    // Get profile for name
    const creatorProfile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true }
    })

    const announcementWithName = {
      ...announcement,
      createdBy: {
        email: creatorProfile?.email || announcement.createdBy.email || '',
        firstName: creatorProfile?.firstName || null,
        lastName: creatorProfile?.lastName || null
      }
    }

    return NextResponse.json({ announcement: announcementWithName }, { status: 201, headers: corsHeaders })
  } catch (error) {
    console.error('Error creating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to create announcement' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * PATCH /api/announcements
 * Update an announcement
 * Requires FLEET or ADMIN role
 */
export async function PATCH(request: NextRequest) {
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

    // Parse request body
    const body = await request.json()
    const { id, title, content, published, visibility } = body

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: 'Announcement ID is required' },
        { status: 400 }
      )
    }

    // Validate visibility if provided
    if (visibility !== undefined && !['ALL_USERS', 'QA_AND_ABOVE'].includes(visibility)) {
      return NextResponse.json(
        { error: 'Invalid visibility value' },
        { status: 400 }
      )
    }

    // Build update data
    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (published !== undefined) updateData.published = published
    if (visibility !== undefined) updateData.visibility = visibility

    // Update announcement
    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: {
            email: true
          }
        }
      }
    })

    // Get profile for name
    const creatorProfile = await prisma.profile.findUnique({
      where: { id: announcement.createdById },
      select: { firstName: true, lastName: true, email: true }
    })

    const announcementWithName = {
      ...announcement,
      createdBy: {
        email: creatorProfile?.email || announcement.createdBy.email || '',
        firstName: creatorProfile?.firstName || null,
        lastName: creatorProfile?.lastName || null
      }
    }

    return NextResponse.json({ announcement: announcementWithName }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error updating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to update announcement' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * DELETE /api/announcements
 * Delete an announcement
 * Requires FLEET or ADMIN role
 */
export async function DELETE(request: NextRequest) {
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

    // Get announcement ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Announcement ID is required' },
        { status: 400 }
      )
    }

    // Delete announcement
    await prisma.announcement.delete({
      where: { id }
    })

    return NextResponse.json({ success: true }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error deleting announcement:', error)
    return NextResponse.json(
      { error: 'Failed to delete announcement' },
      { status: 500, headers: corsHeaders }
    )
  }
}
