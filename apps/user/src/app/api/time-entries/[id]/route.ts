import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

// PATCH /api/time-entries/[id] - Update a time entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { date, hours, minutes, category, count, notes } = body;

    // Check if entry exists and belongs to user
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }

    if (existingEntry.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Build update data
    const updateData: any = {};

    if (date !== undefined) {
      updateData.date = new Date(date);
    }

    if (hours !== undefined) {
      if (hours < 0 || hours > 23) {
        return NextResponse.json(
          { error: 'Hours must be between 0 and 23' },
          { status: 400 }
        );
      }
      updateData.hours = parseInt(hours);
    }

    if (minutes !== undefined) {
      if (minutes < 0 || minutes > 59) {
        return NextResponse.json(
          { error: 'Minutes must be between 0 and 59' },
          { status: 400 }
        );
      }
      updateData.minutes = parseInt(minutes);
    }

    if (category !== undefined) {
      updateData.category = category;
    }

    if (count !== undefined) {
      if (count !== null && count < 0) {
        return NextResponse.json(
          { error: 'Count must be a positive number' },
          { status: 400 }
        );
      }
      updateData.count = count !== null ? parseInt(count) : null;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    // Validate that final time is not 0h 0m
    const finalHours = hours !== undefined ? parseInt(hours) : existingEntry.hours;
    const finalMinutes = minutes !== undefined ? parseInt(minutes) : existingEntry.minutes;
    if (finalHours === 0 && finalMinutes === 0) {
      return NextResponse.json(
        { error: 'Time cannot be 0h 0m. Please enter at least 1 minute.' },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error updating time entry:', error);
    return NextResponse.json(
      { error: 'Failed to update time entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/time-entries/[id] - Delete a time entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if entry exists and belongs to user
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 });
    }

    if (existingEntry.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.timeEntry.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete time entry' },
      { status: 500 }
    );
  }
}
