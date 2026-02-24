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
 * GET /api/time-reporting/meetings
 * Get all meetings with optional filters
 */
export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const meetingType = searchParams.get('meetingType');

    // Build where clause
    const where: any = {};

    if (startDate) {
      where.meetingDate = { ...where.meetingDate, gte: new Date(startDate) };
    }

    if (endDate) {
      where.meetingDate = { ...where.meetingDate, lte: new Date(endDate) };
    }

    if (meetingType && meetingType !== 'all') {
      where.meetingType = meetingType;
    }

    // Fetch meetings
    const meetings = await prisma.billableMeeting.findMany({
      where,
      orderBy: { startTime: 'desc' },
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
      meetings,
      total: meetings.length,
    });
  } catch (error: any) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meetings', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/time-reporting/meetings
 * Create a new meeting
 */
export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { title, description, meetingDate, startTime, endTime, attendees, meetingType } = body;

    // Validation
    if (!title || !meetingDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'Missing required fields: title, meetingDate, startTime, endTime' },
        { status: 400 },
      );
    }

    // Attendees is optional, but if provided must be an array
    if (attendees !== undefined && !Array.isArray(attendees)) {
      return NextResponse.json({ error: 'Attendees must be an array' }, { status: 400 });
    }

    // Parse dates
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    // Calculate duration in minutes
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

    // Create meeting
    const meeting = await prisma.billableMeeting.create({
      data: {
        title,
        description: description || null,
        meetingDate: new Date(meetingDate),
        startTime: start,
        endTime: end,
        durationMinutes,
        attendees: attendees || [],
        meetingType: meetingType || null,
        createdById: authResult.user.id,
      },
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
      message: `Meeting "${title}" created successfully`,
    });
  } catch (error: any) {
    console.error('Error creating meeting:', error);
    return NextResponse.json(
      { error: 'Failed to create meeting', details: error.message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/time-reporting/meetings
 * Delete a meeting
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
    }

    // Delete meeting
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
