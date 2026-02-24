import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

// Auth check (Fleet/Admin only)
async function requireFleetAuth(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { profile, user };
}

/**
 * GET /api/time-reporting/meetings/[id]
 * Get a single meeting by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;

    const meeting = await prisma.billableMeeting.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({ meeting });
  } catch (error: any) {
    console.error('Error fetching meeting:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meeting', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/time-reporting/meetings/[id]
 * Update a meeting
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, meetingDate, startTime, endTime, attendees, meetingType } = body;

    // Build update data
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (meetingDate !== undefined) updateData.meetingDate = new Date(meetingDate);
    if (meetingType !== undefined) updateData.meetingType = meetingType;
    if (attendees !== undefined) {
      if (!Array.isArray(attendees)) {
        return NextResponse.json({ error: 'Attendees must be an array' }, { status: 400 });
      }
      updateData.attendees = attendees;
    }

    // If start or end time is updated, recalculate duration
    if (startTime !== undefined || endTime !== undefined) {
      // Get existing meeting to fill in missing values
      const existing = await prisma.billableMeeting.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }

      const start = startTime ? new Date(startTime) : existing.startTime;
      const end = endTime ? new Date(endTime) : existing.endTime;

      if (end <= start) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
      }

      updateData.startTime = start;
      updateData.endTime = end;
      updateData.durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    }

    // Update meeting
    const meeting = await prisma.billableMeeting.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      meeting,
      message: 'Meeting updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating meeting:', error);
    return NextResponse.json(
      { error: 'Failed to update meeting', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/time-reporting/meetings/[id]
 * Delete a meeting
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { id } = await params;

    await prisma.billableMeeting.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Meeting deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting meeting:', error);
    return NextResponse.json(
      { error: 'Failed to delete meeting', details: error.message },
      { status: 500 },
    );
  }
}
