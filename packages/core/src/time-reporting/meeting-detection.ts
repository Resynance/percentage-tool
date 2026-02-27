import { generateCompletionWithUsage } from '../ai';
import { prisma } from '@repo/database';

export interface MeetingClaim {
  meetingName: string;
  claimedDurationMinutes: number | null;
  extractionConfidence: number;
  rawText: string;
}

export interface VerifiedMeetingClaim extends MeetingClaim {
  verified: boolean;
  matchedMeetingId: string | null;
  matchedMeetingTitle: string | null;
  actualDurationMinutes: number | null;
  verificationNotes: string;
  matchScore: number;
}

export interface MeetingDetectionResult {
  claims: MeetingClaim[];
  totalClaimedMinutes: number;
  llmModel: string | null;
  llmProvider: string | null;
  llmCost: number | null;
}

export async function detectMeetingClaims(
  workerNotes: string,
): Promise<MeetingDetectionResult> {
  if (!workerNotes || workerNotes.trim().length === 0) {
    return { claims: [], totalClaimedMinutes: 0, llmModel: null, llmProvider: null, llmCost: null };
  }

  const systemPrompt = 'You are a meeting detection expert. Find any mentions of meetings in worker notes. Return JSON: {"meetings": [{"meetingName": "...", "claimedDurationMinutes": 30, "extractionConfidence": 0.8, "rawText": "..."}]}';
  const userPrompt = `Extract meeting mentions from: ${workerNotes}`;

  try {
    const result = await generateCompletionWithUsage(userPrompt, systemPrompt);
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.content);
    
    const claims: MeetingClaim[] = (parsed.meetings || []).map((m: any) => ({
      meetingName: m.meetingName || 'Unknown Meeting',
      claimedDurationMinutes: m.claimedDurationMinutes ? parseInt(m.claimedDurationMinutes) : null,
      extractionConfidence: Math.max(0, Math.min(1, parseFloat(m.extractionConfidence) || 0.7)),
      rawText: m.rawText || '',
    }));

    return {
      claims,
      totalClaimedMinutes: claims.reduce((sum, c) => sum + (c.claimedDurationMinutes || 0), 0),
      llmModel: result.usage ? 'auto' : null,
      llmProvider: result.provider || null,
      llmCost: result.usage?.cost || null,
    };
  } catch (error: any) {
    console.error('[MeetingDetection] LLM extraction failed, using fallback:', error);
    return fallbackMeetingDetection(workerNotes);
  }
}

function fallbackMeetingDetection(notes: string): MeetingDetectionResult {
  const claims: MeetingClaim[] = [];
  const patterns = [/onboarding\s+meeting/gi, /review\s+meeting/gi, /attended\s+meeting/gi];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(notes)) !== null) {
      claims.push({
        meetingName: match[0],
        claimedDurationMinutes: null,
        extractionConfidence: 0.5,
        rawText: notes.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
      });
    }
  }

  return { claims, totalClaimedMinutes: 0, llmModel: null, llmProvider: null, llmCost: null };
}

export async function verifyMeetingClaim(
  claim: MeetingClaim,
  workerEmail: string,
  workDate: Date,
): Promise<VerifiedMeetingClaim> {
  try {
    const meetings = await prisma.billableMeeting.findMany({ where: { meetingDate: workDate } });

    if (meetings.length === 0) {
      return {
        ...claim,
        verified: false,
        matchedMeetingId: null,
        matchedMeetingTitle: null,
        actualDurationMinutes: null,
        verificationNotes: `No meetings on ${workDate.toISOString().split('T')[0]}`,
        matchScore: 0,
      };
    }

    let bestMatch: any = null;
    let bestScore = 0;

    for (const meeting of meetings) {
      let score = calculateSimilarity(claim.meetingName.toLowerCase(), meeting.title.toLowerCase()) * 0.7;
      const attendees = meeting.attendees as string[];
      if (attendees.some(e => e.toLowerCase() === workerEmail.toLowerCase())) score += 0.3;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = meeting;
      }
    }

    if (bestScore >= 0.5 && bestMatch) {
      return {
        ...claim,
        verified: true,
        matchedMeetingId: bestMatch.id,
        matchedMeetingTitle: bestMatch.title,
        actualDurationMinutes: bestMatch.durationMinutes,
        verificationNotes: `Matched to "${bestMatch.title}"`,
        matchScore: bestScore,
      };
    }

    return {
      ...claim,
      verified: false,
      matchedMeetingId: null,
      matchedMeetingTitle: null,
      actualDurationMinutes: null,
      verificationNotes: 'No match found',
      matchScore: bestScore,
    };
  } catch (error: any) {
    return {
      ...claim,
      verified: false,
      matchedMeetingId: null,
      matchedMeetingTitle: null,
      actualDurationMinutes: null,
      verificationNotes: `Error: ${error.message}`,
      matchScore: 0,
    };
  }
}

function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      matrix[i][j] = s2[i-1] === s1[j-1] ? matrix[i-1][j-1] : Math.min(matrix[i-1][j-1], matrix[i][j-1], matrix[i-1][j]) + 1;
    }
  }

  return 1 - matrix[s2.length][s1.length] / Math.max(s1.length, s2.length);
}

export async function detectAndVerifyMeetings(
  workerNotes: string,
  workerEmail: string,
  workDate: Date,
): Promise<{
  detectionResult: MeetingDetectionResult;
  verifiedClaims: VerifiedMeetingClaim[];
  totalVerifiedMinutes: number;
  totalUnverifiedMinutes: number;
}> {
  const detectionResult = await detectMeetingClaims(workerNotes);
  const verifiedClaims: VerifiedMeetingClaim[] = [];

  for (const claim of detectionResult.claims) {
    verifiedClaims.push(await verifyMeetingClaim(claim, workerEmail, workDate));
  }

  const totalVerifiedMinutes = verifiedClaims.filter(c => c.verified).reduce((sum, c) => sum + (c.actualDurationMinutes || c.claimedDurationMinutes || 0), 0);
  const totalUnverifiedMinutes = verifiedClaims.filter(c => !c.verified).reduce((sum, c) => sum + (c.claimedDurationMinutes || 0), 0);

  return { detectionResult, verifiedClaims, totalVerifiedMinutes, totalUnverifiedMinutes };
}
