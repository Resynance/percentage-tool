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

// POST: Verify a meeting
export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { meetingId, verifiedHours, notes } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: 'Missing meetingId' }, { status: 400 });
    }

    // Update the meeting verification
    const updated = await prisma.timeReportRecord.update({
      where: { id: meetingId },
      data: {
        meetingHoursVerified: verifiedHours || 0,
        notes: notes || null,
      },
    });

    return NextResponse.json({
      success: true,
      meeting: updated,
    });
  } catch (error: any) {
    console.error('Error verifying meeting:', error);
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

    // Clear verification
    const updated = await prisma.timeReportRecord.update({
      where: { id: meetingId },
      data: {
        meetingHoursVerified: 0,
        notes: null,
      },
    });

    return NextResponse.json({
      success: true,
      meeting: updated,
    });
  } catch (error: any) {
    console.error('Error unverifying meeting:', error);
    return NextResponse.json(
      { error: 'Failed to unverify meeting', details: error.message },
      { status: 500 }
    );
  }
}
