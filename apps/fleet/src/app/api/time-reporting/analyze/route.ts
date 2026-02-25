import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { analyzeAllTimeReports, getAnalysisSummary } from '@repo/core/time-reporting';
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

export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { startDate, endDate, workerEmail, workerEmails } = body;

    const options: any = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    // Support both single workerEmail and multiple workerEmails array
    if (workerEmails && Array.isArray(workerEmails) && workerEmails.length > 0) {
      options.workerEmails = workerEmails;
    } else if (workerEmail) {
      options.workerEmail = workerEmail;
    }

    // Check if we should force re-analysis (default: preserve existing analysis)
    const forceReanalyze = body.forceReanalyze === true;
    options.forceReanalyze = forceReanalyze;

    // Run analysis (will use cached results if they exist and forceReanalyze is false)
    const results = await analyzeAllTimeReports(options);

    // Check if any reports were newly analyzed vs using cached results
    const reportIds = results.map(r => r.reportId);
    const existingAnalysis = await prisma.timeEstimate.findMany({
      where: { timeReportId: { in: reportIds } },
      select: { timeReportId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    // If most recent analysis is older than 5 seconds, assume we used cache
    const usedCache = existingAnalysis.length > 0 &&
      !forceReanalyze &&
      (Date.now() - existingAnalysis[0].createdAt.getTime()) > 5000;

    return NextResponse.json({
      success: true,
      analyzed: results.length,
      flagged: results.filter(r => r.shouldFlag).length,
      results,
      message: usedCache
        ? `Using existing analysis for ${results.length} time reports (already analyzed)`
        : results.length >= 100
        ? `Analyzed first 100 time reports (limit reached). Use a smaller date range for more targeted analysis.`
        : `Analyzed ${results.length} time reports`,
      usedCache,
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
