import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';

async function requireAdminAuth(request: NextRequest) {
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

  if (profileError || !profile || profile.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { profile, user };
}

// GET: Proxy health checks to other apps (server-side to avoid CORS)
export async function GET(request: NextRequest) {
  const authResult = await requireAdminAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const { searchParams } = new URL(request.url);
    const app = searchParams.get('app'); // 'qa', 'core', 'fleet', 'user'
    const endpoint = searchParams.get('endpoint'); // e.g., '/api/records?take=1'

    if (!app || !endpoint) {
      return NextResponse.json({ error: 'Missing app or endpoint parameter' }, { status: 400 });
    }

    // Map app names to URLs
    const appUrls: Record<string, string> = {
      qa: process.env.NEXT_PUBLIC_QA_APP_URL || 'http://localhost:3002',
      core: process.env.NEXT_PUBLIC_CORE_APP_URL || 'http://localhost:3003',
      fleet: process.env.NEXT_PUBLIC_FLEET_APP_URL || 'http://localhost:3004',
      user: process.env.NEXT_PUBLIC_USER_APP_URL || 'http://localhost:3001',
    };

    const baseUrl = appUrls[app];
    if (!baseUrl) {
      return NextResponse.json({ error: 'Invalid app name' }, { status: 400 });
    }

    // Make server-side request (no CORS issues)
    const targetUrl = `${baseUrl}${endpoint}`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json({
      statusCode: response.status,
      ok: response.ok,
      data,
    });
  } catch (error: any) {
    console.error('Health check proxy error:', error);
    return NextResponse.json(
      { error: error.message, statusCode: 500, ok: false },
      { status: 200 } // Return 200 so the UI can display the error
    );
  }
}
