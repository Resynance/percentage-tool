import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

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

export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const workerEmail = searchParams.get('workerEmail');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    }

    if (severity && severity !== 'all') {
      where.severity = severity;
    }

    if (workerEmail) {
      where.workerEmail = workerEmail;
    }

    if (startDate) {
      where.workDate = { ...where.workDate, gte: new Date(startDate) };
    }

    if (endDate) {
      where.workDate = { ...where.workDate, lte: new Date(endDate) };
    }

    const flags = await prisma.timeAnalysisFlag.findMany({
      where,
      orderBy: [{ workDate: 'desc' }, { severity: 'desc' }],
      include: {
        timeReport: {
          select: {
            notes: true,
            hoursWorked: true,
          },
        },
        reviewedBy: {
          select: {
            email: true,
            id: true,
          },
        },
      },
    });

    return NextResponse.json({
      flags,
      total: flags.length,
    });
  } catch (error: any) {
    console.error('Error fetching flags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flags', details: error.message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { flagId, status, resolutionNotes } = body;

    if (!flagId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: flagId, status' },
        { status: 400 },
      );
    }

    // Validate status value
    const VALID_STATUSES = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: PENDING, UNDER_REVIEW, RESOLVED, DISMISSED' },
        { status: 400 },
      );
    }

    // Check if flag exists before updating
    const existingFlag = await prisma.timeAnalysisFlag.findUnique({
      where: { id: flagId },
    });

    if (!existingFlag) {
      return NextResponse.json(
        { error: 'Flag not found', details: 'The specified flag does not exist or has been deleted' },
        { status: 404 },
      );
    }

    const flag = await prisma.timeAnalysisFlag.update({
      where: { id: flagId },
      data: {
        status,
        resolutionNotes: resolutionNotes || null,
        reviewedById: authResult.user.id,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      flag,
      message: 'Flag updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating flag:', error);

    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Flag not found', details: 'The specified flag does not exist or has been deleted' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to update flag', details: error.message },
      { status: 500 },
    );
  }
}
