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

  if (profileError || !profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { profile, user };
}

// POST: Verify a meeting
export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { meetingId, verifiedHours } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: 'Missing meetingId' }, { status: 400 });
    }

    // Update the meeting verification (preserve existing notes)
    const updated = await prisma.timeReportRecord.update({
      where: { id: meetingId },
      data: {
        meetingHoursVerified: verifiedHours || 0,
      },
    });

    return NextResponse.json({
      success: true,
      meeting: updated,
    });
  } catch (error: any) {
    console.error('Error verifying meeting:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to verify meeting', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Unverify a meeting
export async function DELETE(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { meetingId } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: 'Missing meetingId' }, { status: 400 });
    }

    // Clear verification (preserve existing notes)
    const updated = await prisma.timeReportRecord.update({
      where: { id: meetingId },
      data: {
        meetingHoursVerified: 0,
      },
    });

    return NextResponse.json({
      success: true,
      meeting: updated,
    });
  } catch (error: any) {
    console.error('Error unverifying meeting:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to unverify meeting', details: error.message },
      { status: 500 }
    );
  }
}
