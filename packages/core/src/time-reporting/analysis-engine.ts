import { prisma } from '@repo/database';
import { estimateWorkTime } from './time-estimation';
import { detectAndVerifyMeetings } from './meeting-detection';
import { scoreWorkQuality, calculateAverageQuality } from './quality-scoring';

export interface AnalysisConfig {
  timeDiscrepancyThreshold: number;
  taskTimeMin: number;
  taskTimeMax: number;
  qaTimeMin: number;
  qaTimeMax: number;
  minAcceptableQuality: number;
}

export interface TimeReportAnalysis {
  reportId: string;
  workerName: string;
  workerEmail: string;
  workDate: Date;
  actualHours: number;
  estimatedHours: number;
  meetingHoursClaimed: number;
  meetingHoursVerified: number;
  averageQualityScore: number;
  discrepancyPercentage: number;
  shouldFlag: boolean;
  flagReason: string | null;
  flagSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
}

async function getActiveConfig(): Promise<AnalysisConfig> {
  const config = await prisma.timeAnalysisConfig.findFirst({
    where: { isActive: true },
  });

  if (config) {
    return {
      timeDiscrepancyThreshold: Number(config.timeDiscrepancyThreshold),
      taskTimeMin: config.taskTimeMin,
      taskTimeMax: config.taskTimeMax,
      qaTimeMin: config.qaTimeMin,
      qaTimeMax: config.qaTimeMax,
      minAcceptableQuality: Number(config.minAcceptableQuality || 6.0),
    };
  }

  return {
    timeDiscrepancyThreshold: 15.0,
    taskTimeMin: 45,
    taskTimeMax: 60,
    qaTimeMin: 5,
    qaTimeMax: 20,
    minAcceptableQuality: 6.0,
  };
}

function parseworkActivities(notes: string): string[] {
  if (!notes || notes.trim().length === 0) return [];
  
  const activities: string[] = [];
  const lines = notes.split(/[\n\|]/);
  
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned.length > 10) {
      activities.push(cleaned);
    }
  }
  
  return activities;
}

export async function analyzeTimeReport(reportId: string): Promise<TimeReportAnalysis> {
  const report = await prisma.timeReportRecord.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw new Error(`Time report ${reportId} not found`);
  }

  // Delete existing analysis records to ensure idempotency
  await prisma.timeEstimate.deleteMany({ where: { timeReportId: reportId } });
  await prisma.qualityScore.deleteMany({ where: { timeReportId: reportId } });
  await prisma.meetingClaim.deleteMany({ where: { timeReportId: reportId } });
  await prisma.timeAnalysisFlag.deleteMany({ where: { timeReportId: reportId } });

  const config = await getActiveConfig();
  const activities = parseworkActivities(report.notes || '');

  let totalEstimatedMinutes = 0;
  let totalQualityScore = 0;
  let qualityScoreCount = 0;

  for (const activity of activities) {
    try {
      const estimate = await estimateWorkTime(activity, {
        taskTimeMin: config.taskTimeMin,
        taskTimeMax: config.taskTimeMax,
        qaTimeMin: config.qaTimeMin,
        qaTimeMax: config.qaTimeMax,
      });
      
      totalEstimatedMinutes += estimate.estimatedMinutes;

      const quality = await scoreWorkQuality(activity);
      totalQualityScore += quality.qualityScore;
      qualityScoreCount++;

      await prisma.timeEstimate.create({
        data: {
          timeReportId: reportId,
          workType: estimate.workType,
          workDescription: activity,
          estimatedMinutes: estimate.estimatedMinutes,
          confidenceScore: estimate.confidenceScore,
          reasoning: estimate.reasoning,
          llmModel: estimate.llmModel,
          llmProvider: estimate.llmProvider,
          llmCost: estimate.llmCost,
        },
      });

      await prisma.qualityScore.create({
        data: {
          timeReportId: reportId,
          workType: quality.workType,
          workDescription: activity,
          qualityScore: quality.qualityScore,
          qualityReasoning: quality.qualityReasoning,
          completenessScore: quality.completenessScore,
          accuracyScore: quality.accuracyScore,
          clarityScore: quality.clarityScore,
          llmModel: quality.llmModel,
          llmProvider: quality.llmProvider,
          llmCost: quality.llmCost,
        },
      });
    } catch (error) {
      console.error(`[Analysis] Error processing activity: ${activity.substring(0, 50)}`, error);
    }
  }

  const meetingResult = await detectAndVerifyMeetings(
    report.notes || '',
    report.workerEmail,
    report.workDate,
  );

  for (const claim of meetingResult.verifiedClaims) {
    await prisma.meetingClaim.create({
      data: {
        timeReportId: reportId,
        claimedMeetingName: claim.meetingName,
        claimedDurationMinutes: claim.claimedDurationMinutes,
        extractionConfidence: claim.extractionConfidence,
        verified: claim.verified,
        matchedMeetingId: claim.matchedMeetingId,
        verificationNotes: claim.verificationNotes,
        llmModel: meetingResult.detectionResult.llmModel,
        llmProvider: meetingResult.detectionResult.llmProvider,
        llmCost: meetingResult.detectionResult.llmCost,
        verifiedAt: claim.verified ? new Date() : null,
      },
    });
  }

  const actualHours = Number(report.hoursWorked);
  const estimatedHours = totalEstimatedMinutes / 60;
  const meetingHoursClaimed = meetingResult.detectionResult.totalClaimedMinutes / 60;
  const meetingHoursVerified = meetingResult.totalVerifiedMinutes / 60;
  const averageQualityScore = qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0;

  const adjustedExpectedHours = estimatedHours + meetingHoursVerified;
  const discrepancy = actualHours - adjustedExpectedHours;
  const discrepancyPercentage = adjustedExpectedHours > 0 
    ? (Math.abs(discrepancy) / adjustedExpectedHours) * 100 
    : 0;

  const shouldFlag = discrepancyPercentage > config.timeDiscrepancyThreshold;
  let flagReason: string | null = null;
  let flagSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null = null;

  if (shouldFlag) {
    const isOvertime = discrepancy > 0;
    const qualityIssue = averageQualityScore < config.minAcceptableQuality;

    if (isOvertime && qualityIssue) {
      flagSeverity = 'CRITICAL';
      flagReason = `Overtime by ${discrepancyPercentage.toFixed(1)}% with low quality (${averageQualityScore.toFixed(1)}/10)`;
    } else if (isOvertime) {
      if (discrepancyPercentage > 50) {
        flagSeverity = 'HIGH';
        flagReason = `Significant overtime: ${discrepancyPercentage.toFixed(1)}% over expected`;
      } else {
        flagSeverity = 'MEDIUM';
        flagReason = `Overtime by ${discrepancyPercentage.toFixed(1)}%`;
      }
    } else {
      flagSeverity = 'LOW';
      flagReason = `Undertime by ${discrepancyPercentage.toFixed(1)}%`;
    }

    await prisma.timeAnalysisFlag.create({
      data: {
        timeReportId: reportId,
        workerName: report.workerName,
        workerEmail: report.workerEmail,
        workDate: report.workDate,
        flagType: 'TIME_DISCREPANCY',
        severity: flagSeverity,
        status: 'PENDING',
        expectedHours: adjustedExpectedHours,
        actualHours,
        discrepancyPercentage,
        meetingHoursClaimed,
        meetingHoursVerified,
        averageQualityScore,
        flagReason,
        analysisThreshold: config.timeDiscrepancyThreshold,
      },
    });
  }

  return {
    reportId,
    workerName: report.workerName,
    workerEmail: report.workerEmail,
    workDate: report.workDate,
    actualHours,
    estimatedHours,
    meetingHoursClaimed,
    meetingHoursVerified,
    averageQualityScore,
    discrepancyPercentage,
    shouldFlag,
    flagReason,
    flagSeverity,
  };
}

export async function analyzeBatchTimeReports(
  reportIds: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<TimeReportAnalysis[]> {
  const results: TimeReportAnalysis[] = [];
  
  for (let i = 0; i < reportIds.length; i++) {
    try {
      const result = await analyzeTimeReport(reportIds[i]);
      results.push(result);
      
      if (onProgress) {
        onProgress(i + 1, reportIds.length);
      }
    } catch (error) {
      console.error(`[Batch Analysis] Error analyzing report ${reportIds[i]}:`, error);
    }
  }
  
  return results;
}

export async function analyzeAllTimeReports(
  options?: {
    startDate?: Date;
    endDate?: Date;
    workerEmail?: string;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<TimeReportAnalysis[]> {
  const where: any = {};
  
  if (options?.startDate) {
    where.workDate = { ...where.workDate, gte: options.startDate };
  }
  
  if (options?.endDate) {
    where.workDate = { ...where.workDate, lte: options.endDate };
  }
  
  if (options?.workerEmail) {
    where.workerEmail = options.workerEmail;
  }

  const reports = await prisma.timeReportRecord.findMany({
    where,
    orderBy: { workDate: 'asc' },
  });

  return analyzeBatchTimeReports(
    reports.map(r => r.id),
    options?.onProgress,
  );
}

export async function getAnalysisSummary(options?: {
  startDate?: Date;
  endDate?: Date;
}): Promise<{
  totalReports: number;
  totalFlags: number;
  flagsBySeverity: Record<string, number>;
  averageDiscrepancy: number;
  averageQuality: number;
}> {
  const where: any = {};
  
  if (options?.startDate) {
    where.workDate = { ...where.workDate, gte: options.startDate };
  }
  
  if (options?.endDate) {
    where.workDate = { ...where.workDate, lte: options.endDate };
  }

  const totalReports = await prisma.timeReportRecord.count({ where });
  
  const flags = await prisma.timeAnalysisFlag.findMany({
    where: {
      workDate: where.workDate,
    },
  });

  const flagsBySeverity = flags.reduce((acc, flag) => {
    acc[flag.severity] = (acc[flag.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const avgDiscrepancy = flags.length > 0
    ? flags.reduce((sum: number, f) => sum + Number(f.discrepancyPercentage || 0), 0) / flags.length
    : 0;

  const avgQuality = flags.length > 0
    ? flags.reduce((sum: number, f) => sum + Number(f.averageQualityScore || 0), 0) / flags.length
    : 0;

  return {
    totalReports,
    totalFlags: flags.length,
    flagsBySeverity,
    averageDiscrepancy: avgDiscrepancy,
    averageQuality: avgQuality,
  };
}
