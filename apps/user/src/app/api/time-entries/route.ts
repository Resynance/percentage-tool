import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

// GET /api/time-entries - List time entries for current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const category = searchParams.get('category');

    // Build where clause
    const where: any = {
      userId: user.id,
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    if (category) {
      where.category = category;
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time entries' },
      { status: 500 }
    );
  }
}

// POST /api/time-entries - Create a new time entry
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { date, hours, minutes, category, count, notes } = body;

    // Validation
    if (!date || hours === undefined || minutes === undefined || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: date, hours, minutes, category' },
        { status: 400 }
      );
    }

    if (hours < 0 || hours > 23) {
      return NextResponse.json(
        { error: 'Hours must be between 0 and 23' },
        { status: 400 }
      );
    }

    if (minutes < 0 || minutes > 59) {
      return NextResponse.json(
        { error: 'Minutes must be between 0 and 59' },
        { status: 400 }
      );
    }

    if (hours === 0 && minutes === 0) {
      return NextResponse.json(
        { error: 'Time cannot be 0h 0m. Please enter at least 1 minute.' },
        { status: 400 }
      );
    }

    if (count !== undefined && count !== null && count < 0) {
      return NextResponse.json(
        { error: 'Count must be a positive number' },
        { status: 400 }
      );
    }

    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        date: new Date(date),
        hours: parseInt(hours),
        minutes: parseInt(minutes),
        category,
        count: count !== undefined && count !== null ? parseInt(count) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating time entry:', error);
    return NextResponse.json(
      { error: 'Failed to create time entry' },
      { status: 500 }
    );
  }
}
