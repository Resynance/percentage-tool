import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { analyzeBatchPrompts } from '@repo/core';

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

export async function POST(request: NextRequest) {
  const authResult = await requireFleetAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read CSV file
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Empty CSV file' }, { status: 400 });
    }

    // Parse CSV (expecting format: id,prompt_text)
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes('id') || header.includes('prompt');

    const startIndex = hasHeader ? 1 : 0;
    const prompts = lines.slice(startIndex).map((line, index) => {
      // Simple CSV parsing (handles basic cases)
      const parts = line.split(',');

      if (parts.length < 2) {
        return null;
      }

      const id = parts[0].trim() || `prompt_${index + 1}`;
      const text = parts.slice(1).join(',').trim().replace(/^["']|["']$/g, ''); // Join rest and remove quotes

      if (!text) {
        return null;
      }

      return { id, text };
    }).filter(Boolean) as Array<{ id: string; text: string }>;

    if (prompts.length === 0) {
      return NextResponse.json({ error: 'No valid prompts found in CSV' }, { status: 400 });
    }

    // Analyze prompts
    const results = await analyzeBatchPrompts(prompts);

    return NextResponse.json({
      success: true,
      analyzed: results.length,
      flaggedNonNative: results.filter(r => r.isLikelyNonNative).length,
      flaggedAI: results.filter(r => r.isLikelyAIGenerated).length,
      results,
    });
  } catch (error: any) {
    console.error('Prompt authenticity analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze prompts', details: error.message },
      { status: 500 },
    );
  }
}
