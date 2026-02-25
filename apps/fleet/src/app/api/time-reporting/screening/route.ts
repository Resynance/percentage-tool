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

interface WorkerMetrics {
  workerName: string;
  workerEmail: string;
  totalTasks: number;
  totalHours: number;
  avgHoursPerTask: number;
  daysActive: number;
  tasksPerDay: number;
  experienceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  flagStatus: 'NORMAL' | 'FAST' | 'SLOW' | 'INCONSISTENT';
  flagReason: string | null;
  firstReportDate: Date;
  lastReportDate: Date;
}

export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const experienceLevel = searchParams.get('experienceLevel');
    const flagStatus = searchParams.get('flagStatus');

    // Build date filter
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    // Fetch all time reports
    const reports = await prisma.timeReportRecord.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 ? { workDate: dateFilter } : {}),
      },
      select: {
        workerName: true,
        workerEmail: true,
        hoursWorked: true,
        workDate: true,
        notes: true,
      },
      orderBy: { workDate: 'asc' },
    });

    // Aggregate by worker
    const workerMap = new Map<string, {
      workerName: string;
      workerEmail: string;
      totalHours: number;
      taskCount: number;
      dates: Set<string>;
      firstDate: Date;
      lastDate: Date;
    }>();

    for (const report of reports) {
      const key = report.workerEmail;
      if (!workerMap.has(key)) {
        workerMap.set(key, {
          workerName: report.workerName,
          workerEmail: report.workerEmail,
          totalHours: 0,
          taskCount: 0,
          dates: new Set(),
          firstDate: report.workDate,
          lastDate: report.workDate,
        });
      }

      const worker = workerMap.get(key)!;
      worker.totalHours += Number(report.hoursWorked);

      // Count tasks from notes (parse activities)
      const notes = report.notes || '';
      const activities = notes.split(/[\n|]/).filter(line => line.trim().length > 10);
      worker.taskCount += activities.length || 1; // Minimum 1 task per report

      worker.dates.add(report.workDate.toISOString().split('T')[0]);

      if (report.workDate < worker.firstDate) {
        worker.firstDate = report.workDate;
      }
      if (report.workDate > worker.lastDate) {
        worker.lastDate = report.workDate;
      }
    }

    // Calculate metrics for each worker
    const workerMetrics: WorkerMetrics[] = [];
    for (const [email, data] of workerMap.entries()) {
      const avgHoursPerTask = data.taskCount > 0 ? data.totalHours / data.taskCount : 0;
      const daysActive = data.dates.size;
      const tasksPerDay = daysActive > 0 ? data.taskCount / daysActive : 0;

      // Determine experience level
      let experienceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      if (data.taskCount < 50) {
        experienceLevel = 'LOW';
      } else if (data.taskCount < 200) {
        experienceLevel = 'MEDIUM';
      } else {
        experienceLevel = 'HIGH';
      }

      workerMetrics.push({
        workerName: data.workerName,
        workerEmail: data.workerEmail,
        totalTasks: data.taskCount,
        totalHours: data.totalHours,
        avgHoursPerTask,
        daysActive,
        tasksPerDay,
        experienceLevel,
        flagStatus: 'NORMAL', // Will calculate below
        flagReason: null,
        firstReportDate: data.firstDate,
        lastReportDate: data.lastDate,
      });
    }

    // Calculate team averages for flagging
    const totalWorkers = workerMetrics.length;
    if (totalWorkers === 0) {
      return NextResponse.json({
        workers: [],
        summary: {
          totalWorkers: 0,
          teamAvgAHT: 0,
          flaggedWorkers: 0,
          lowExperience: 0,
          mediumExperience: 0,
          highExperience: 0,
        },
      });
    }

    const teamAvgAHT = workerMetrics.reduce((sum, w) => sum + w.avgHoursPerTask, 0) / totalWorkers;
    const teamAvgTasksPerDay = workerMetrics.reduce((sum, w) => sum + w.tasksPerDay, 0) / totalWorkers;

    // Flag workers based on AHT anomalies
    for (const worker of workerMetrics) {
      if (worker.avgHoursPerTask > teamAvgAHT * 1.5) {
        worker.flagStatus = 'SLOW';
        worker.flagReason = `AHT ${worker.avgHoursPerTask.toFixed(2)}h is ${((worker.avgHoursPerTask / teamAvgAHT - 1) * 100).toFixed(0)}% above team average`;
      } else if (worker.avgHoursPerTask < teamAvgAHT * 0.5 && worker.avgHoursPerTask > 0) {
        worker.flagStatus = 'FAST';
        worker.flagReason = `AHT ${worker.avgHoursPerTask.toFixed(2)}h is ${((1 - worker.avgHoursPerTask / teamAvgAHT) * 100).toFixed(0)}% below team average`;
      } else if (worker.tasksPerDay < teamAvgTasksPerDay * 0.3 && worker.experienceLevel === 'HIGH') {
        worker.flagStatus = 'INCONSISTENT';
        worker.flagReason = `High experience but low productivity: ${worker.tasksPerDay.toFixed(1)} tasks/day vs team avg ${teamAvgTasksPerDay.toFixed(1)}`;
      }
    }

    // Apply filters
    let filteredWorkers = workerMetrics;

    if (experienceLevel && experienceLevel !== 'all') {
      filteredWorkers = filteredWorkers.filter(w => w.experienceLevel === experienceLevel);
    }

    if (flagStatus && flagStatus !== 'all') {
      filteredWorkers = filteredWorkers.filter(w => w.flagStatus === flagStatus);
    }

    // Calculate summary stats
    const summary = {
      totalWorkers: workerMetrics.length,
      teamAvgAHT,
      teamAvgTasksPerDay,
      flaggedWorkers: workerMetrics.filter(w => w.flagStatus !== 'NORMAL').length,
      lowExperience: workerMetrics.filter(w => w.experienceLevel === 'LOW').length,
      mediumExperience: workerMetrics.filter(w => w.experienceLevel === 'MEDIUM').length,
      highExperience: workerMetrics.filter(w => w.experienceLevel === 'HIGH').length,
      slowWorkers: workerMetrics.filter(w => w.flagStatus === 'SLOW').length,
      fastWorkers: workerMetrics.filter(w => w.flagStatus === 'FAST').length,
      inconsistentWorkers: workerMetrics.filter(w => w.flagStatus === 'INCONSISTENT').length,
    };

    return NextResponse.json({
      workers: filteredWorkers,
      summary,
    });
  } catch (error: any) {
    console.error('Error in screening analysis:', error);
    return NextResponse.json(
      { error: 'Failed to perform screening analysis', details: error.message },
      { status: 500 },
    );
  }
}
