import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { analyzeAllTimeReports, getAnalysisSummary } from '@repo/core/time-reporting';

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

export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { startDate, endDate, workerEmail } = body;

    const options: any = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (workerEmail) options.workerEmail = workerEmail;

    const results = await analyzeAllTimeReports(options);

    return NextResponse.json({
      success: true,
      analyzed: results.length,
      flagged: results.filter(r => r.shouldFlag).length,
      results,
      message: results.length >= 100
        ? `Analyzed first 100 time reports (limit reached). Use a smaller date range for more targeted analysis.`
        : `Analyzed ${results.length} time reports`,
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to run analysis', details: error.message },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const options: any = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const summary = await getAnalysisSummary(options);

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Summary error:', error);
    return NextResponse.json(
      { error: 'Failed to get summary', details: error.message },
      { status: 500 },
    );
  }
}
