import { NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    provider: await getActiveProvider(),
    timestamp: new Date().toISOString(),
  });
}
