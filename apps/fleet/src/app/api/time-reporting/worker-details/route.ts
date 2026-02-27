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
    const { searchParams } = new URL(request.url);
    const workerEmail = searchParams.get('workerEmail');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!workerEmail) {
      return NextResponse.json({ error: 'workerEmail is required' }, { status: 400 });
    }

    const where: any = { workerEmail };

    if (startDate) {
      where.workDate = { ...where.workDate, gte: new Date(startDate) };
    }

    if (endDate) {
      where.workDate = { ...where.workDate, lte: new Date(endDate) };
    }

    // Get all time reports for this worker
    const timeReports = await prisma.timeReportRecord.findMany({
      where,
      orderBy: { workDate: 'desc' },
      include: {
        timeEstimates: true,
        meetingClaims: true,
        qualityScores: true,
        flags: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Calculate summary statistics
    const totalReports = timeReports.length;
    const totalHoursWorked = timeReports.reduce(
      (sum, r) => sum + Number(r.hoursWorked),
      0,
    );
    const totalEstimatedHours = timeReports.reduce(
      (sum, r) =>
        sum +
        r.timeEstimates.reduce(
          (eSum, e) => eSum + e.estimatedMinutes / 60,
          0,
        ),
      0,
    );
    const totalMeetingHoursClaimed = timeReports.reduce(
      (sum, r) =>
        sum +
        r.meetingClaims.reduce(
          (mSum, m) => mSum + (m.claimedDurationMinutes || 0) / 60,
          0,
        ),
      0,
    );
    const totalMeetingHoursVerified = timeReports.reduce(
      (sum, r) =>
        sum +
        r.meetingClaims
          .filter((m) => m.verified)
          .reduce((mSum, m) => mSum + (m.claimedDurationMinutes || 0) / 60, 0),
      0,
    );

    const allQualityScores = timeReports.flatMap((r) => r.qualityScores);
    const averageQualityScore =
      allQualityScores.length > 0
        ? allQualityScores.reduce(
            (sum, q) => sum + Number(q.qualityScore),
            0,
          ) / allQualityScores.length
        : 0;

    const allFlags = timeReports.flatMap((r) => r.flags);
    const flagsBySeverity = allFlags.reduce((acc, flag) => {
      acc[flag.severity] = (acc[flag.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const flagsByStatus = allFlags.reduce((acc, flag) => {
      acc[flag.status] = (acc[flag.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get worker info from first report
    const workerName = timeReports[0]?.workerName || 'Unknown';

    return NextResponse.json({
      workerEmail,
      workerName,
      summary: {
        totalReports,
        totalHoursWorked,
        totalEstimatedHours,
        totalMeetingHoursClaimed,
        totalMeetingHoursVerified,
        averageQualityScore,
        totalFlags: allFlags.length,
        flagsBySeverity,
        flagsByStatus,
      },
      timeReports: timeReports.map((report) => ({
        id: report.id,
        workDate: report.workDate,
        hoursWorked: report.hoursWorked,
        notes: report.notes,
        status: report.status,
        role: report.role,
        totalTasksCreated: report.totalTasksCreated,
        totalTasksQaed: report.totalTasksQaed,
        estimatedHours:
          report.timeEstimates.reduce(
            (sum, e) => sum + e.estimatedMinutes / 60,
            0,
          ),
        meetingHoursClaimed:
          report.meetingClaims.reduce(
            (sum, m) => sum + (m.claimedDurationMinutes || 0) / 60,
            0,
          ),
        meetingHoursVerified:
          report.meetingClaims
            .filter((m) => m.verified)
            .reduce((sum, m) => sum + (m.claimedDurationMinutes || 0) / 60, 0),
        averageQualityScore:
          report.qualityScores.length > 0
            ? report.qualityScores.reduce(
                (sum, q) => sum + Number(q.qualityScore),
                0,
              ) / report.qualityScores.length
            : 0,
        timeEstimates: report.timeEstimates,
        meetingClaims: report.meetingClaims,
        qualityScores: report.qualityScores,
        flags: report.flags,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching worker details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker details', details: error.message },
      { status: 500 },
    );
  }
}
