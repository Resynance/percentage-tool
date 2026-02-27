import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's role and profile
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true, email: true }
    });

    const role = profile?.role || 'USER';

    const { recordId, isCategoryCorrect, reviewedBy } = await req.json();

    if (!recordId || isCategoryCorrect === undefined) {
      return NextResponse.json(
        { error: 'recordId and isCategoryCorrect are required' },
        { status: 400 }
      );
    }

    // Verify record exists
    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
      select: {
        environment: true
      }
    });

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Verify user has appropriate role (FLEET or ADMIN)
    if (!['FLEET', 'MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Set the hasBeenReviewed flag to true and update isCategoryCorrect
    // Use authenticated user's email as reviewer
    const updatedRecord = await prisma.dataRecord.update({
      where: { id: recordId },
      data: {
        hasBeenReviewed: true,
        isCategoryCorrect: Boolean(isCategoryCorrect),
        updatedAt: new Date(),
        reviewedBy: profile?.email || user.email || reviewedBy || 'admin',
      },
      select: { id: true }, // Exclude embedding field to prevent serialization error
    });

    return NextResponse.json({
      success: true,
      record: updatedRecord,
    });
  } catch (error) {
    console.error('Error updating record:', error);
    return NextResponse.json(
      { error: 'Failed to update record' },
      { status: 500 }
    );
  }
}
