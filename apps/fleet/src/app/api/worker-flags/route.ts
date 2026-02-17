import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'
import { Prisma } from '@prisma/client'
import { getStatusPriority } from '@/lib/worker-flags'

/**
 * GET /api/worker-flags
 * List worker flags with optional filtering
 * Requires FLEET or ADMIN role
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

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const flagType = searchParams.get('flagType')
    const workerId = searchParams.get('workerId')

    // Build where clause
    const where: Prisma.WorkerFlagWhereInput = {}
    if (status) where.status = status as any
    if (flagType) where.flagType = flagType as any
    if (workerId) where.workerId = workerId

    // Fetch worker flags
    const workerFlags = await prisma.workerFlag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200, // Limit to 200 most recent flags
    })

    // Sort by status priority, then by date descending
    const sortedFlags = workerFlags.sort((a, b) => {
      const statusDiff = getStatusPriority(a.status) - getStatusPriority(b.status)
      if (statusDiff !== 0) return statusDiff

      // Within same status, sort by newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return NextResponse.json({ workerFlags: sortedFlags })
  } catch (error) {
    console.error('Error fetching worker flags:', error)
    return NextResponse.json(
      { error: 'Failed to fetch worker flags' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/worker-flags
 * Create a new worker flag
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
      select: { role: true, email: true }
    })

    if (!profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - FLEET or ADMIN access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { workerId, workerEmail, flagType, reason, detailedNotes } = body

    // Validate required fields
    if (!workerId || !workerEmail || !flagType || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: workerId, workerEmail, flagType, reason' },
        { status: 400 }
      )
    }

    // Validate flag type
    const validFlagTypes = ['QUALITY_ISSUE', 'POLICY_VIOLATION', 'ATTENDANCE', 'COMMUNICATION', 'PERFORMANCE', 'OTHER']
    if (!validFlagTypes.includes(flagType)) {
      return NextResponse.json(
        { error: `Invalid flag type. Must be one of: ${validFlagTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate input lengths
    if (typeof reason !== 'string' || reason.length > 10000) {
      return NextResponse.json(
        { error: 'Reason must be a string under 10000 characters' },
        { status: 400 }
      )
    }

    if (detailedNotes && (typeof detailedNotes !== 'string' || detailedNotes.length > 10000)) {
      return NextResponse.json(
        { error: 'Detailed notes must be a string under 10000 characters' },
        { status: 400 }
      )
    }

    // Verify worker exists in data records
    const workerRecord = await prisma.dataRecord.findFirst({
      where: {
        createdByEmail: workerEmail
      },
      select: { createdById: true, createdByEmail: true }
    })

    if (!workerRecord) {
      return NextResponse.json(
        { error: 'Worker not found in records. Only workers who have created tasks/feedback can be flagged.' },
        { status: 404 }
      )
    }

    // Check if workerId is a valid UUID (has user account) or just an email
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workerId)

    // Build data object conditionally based on whether worker has a user account
    const createData: any = {
      workerEmail,
      flagType,
      status: 'ACTIVE',
      reason,
      detailedNotes: detailedNotes || null,
      flaggedById: user.id,
      flaggedByEmail: profile.email,
    }

    // Only include workerId if it's a valid UUID
    if (isValidUuid) {
      createData.workerId = workerId
    }

    // Create the worker flag
    const workerFlag = await prisma.workerFlag.create({
      data: createData,
    })

    return NextResponse.json({
      success: true,
      workerFlag,
    })
  } catch (error) {
    console.error('Error creating worker flag:', error)
    return NextResponse.json(
      {
        error: 'Failed to create worker flag',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/worker-flags
 * Update a worker flag (status or resolution)
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
      select: { role: true, email: true }
    })

    if (!profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - FLEET or ADMIN access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, status, resolutionNotes } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    // Build update data
    const updateData: Prisma.WorkerFlagUncheckedUpdateInput = {}

    // Update status if provided
    if (status) {
      const validStatuses = ['ACTIVE', 'UNDER_REVIEW', 'RESOLVED', 'APPEALED']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.status = status

      // If resolving, add resolution metadata
      if (status === 'RESOLVED') {
        if (!resolutionNotes) {
          return NextResponse.json(
            { error: 'Resolution notes are required when resolving a flag' },
            { status: 400 }
          )
        }
        updateData.resolutionNotes = resolutionNotes
        updateData.resolvedById = user.id
        updateData.resolvedByEmail = profile.email
        updateData.resolvedAt = new Date()
      }
    }

    // Update the worker flag
    const workerFlag = await prisma.workerFlag.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      workerFlag,
    })
  } catch (error) {
    console.error('Error updating worker flag:', error)
    return NextResponse.json(
      {
        error: 'Failed to update worker flag',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
