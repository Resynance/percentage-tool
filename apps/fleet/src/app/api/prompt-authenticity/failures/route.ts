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

export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const failedRecords = await prisma.promptAuthenticityRecord.findMany({
      where: {
        analysisStatus: 'FAILED',
      },
      select: {
        id: true,
        versionId: true,
        taskKey: true,
        prompt: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 100,
    });

    return NextResponse.json({ failures: failedRecords });
  } catch (error: any) {
    console.error('Get failures error:', error);
    return NextResponse.json(
      { error: 'Failed to get failure records', details: error.message },
      { status: 500 },
    );
  }
}
