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

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const search = searchParams.get('search') || '';

    // Build where clause based on filter
    const where: any = { analysisStatus: 'COMPLETED' };

    // Add search filter for name or email
    if (search) {
      where.OR = [
        { createdByName: { contains: search, mode: 'insensitive' } },
        { createdByEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filter === 'non-native') {
      where.isLikelyNonNative = true;
    } else if (filter === 'ai-generated') {
      where.isLikelyAIGenerated = true;
    } else if (filter === 'flagged') {
      // Need to handle OR with search differently
      if (search) {
        where.AND = [
          {
            OR: [
              { createdByName: { contains: search, mode: 'insensitive' } },
              { createdByEmail: { contains: search, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { isLikelyNonNative: true },
              { isLikelyAIGenerated: true },
            ],
          },
        ];
        delete where.OR;
      } else {
        where.OR = [
          { isLikelyNonNative: true },
          { isLikelyAIGenerated: true },
        ];
      }
    }

    // Fetch all matching records
    const results = await prisma.promptAuthenticityRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        versionId: true,
        taskKey: true,
        prompt: true,
        createdByName: true,
        createdByEmail: true,
        createdAt: true,
        envKey: true,
        isLikelyNonNative: true,
        nonNativeConfidence: true,
        nonNativeIndicators: true,
        isLikelyAIGenerated: true,
        aiGeneratedConfidence: true,
        aiGeneratedIndicators: true,
        overallAssessment: true,
        analyzedAt: true,
      },
    });

    // Generate CSV
    const headers = [
      'version_id',
      'task_key',
      'prompt',
      'created_by_name',
      'created_by_email',
      'created_at',
      'env_key',
      'is_likely_non_native',
      'non_native_confidence',
      'non_native_indicators',
      'is_likely_ai_generated',
      'ai_generated_confidence',
      'ai_generated_indicators',
      'overall_assessment',
      'analyzed_at',
    ];

    const csvRows = [headers.join(',')];

    for (const record of results) {
      const row = [
        escapeCSV(record.versionId),
        escapeCSV(record.taskKey),
        escapeCSV(record.prompt),
        escapeCSV(record.createdByName),
        escapeCSV(record.createdByEmail),
        escapeCSV(record.createdAt),
        escapeCSV(record.envKey),
        escapeCSV(record.isLikelyNonNative ? 'Yes' : 'No'),
        escapeCSV(record.nonNativeConfidence),
        escapeCSV(record.nonNativeIndicators ? JSON.stringify(record.nonNativeIndicators) : ''),
        escapeCSV(record.isLikelyAIGenerated ? 'Yes' : 'No'),
        escapeCSV(record.aiGeneratedConfidence),
        escapeCSV(record.aiGeneratedIndicators ? JSON.stringify(record.aiGeneratedIndicators) : ''),
        escapeCSV(record.overallAssessment),
        escapeCSV(record.analyzedAt),
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

    // Return as downloadable file
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="prompt-authenticity-results-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export results', details: error.message },
      { status: 500 },
    );
  }
}
