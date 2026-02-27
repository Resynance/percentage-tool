import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/environments
 * Returns list of unique environments from data records
 * Access: All authenticated users
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Query distinct environments from all relevant tables
        const envSet = new Set<string>();

        try {
            const dataRecords = await prisma.dataRecord.findMany({
                select: { environment: true },
                distinct: ['environment'],
                orderBy: { environment: 'asc' }
            });
            console.log('[Environments API] Found', dataRecords.length, 'distinct environments from data_records');
            console.log('[Environments API] Raw data_records:', dataRecords);
            // Filter out null/undefined values
            dataRecords.forEach(r => {
                if (r.environment) {
                    console.log('[Environments API] Adding environment:', r.environment);
                    envSet.add(r.environment);
                }
            });
        } catch (e) {
            console.error('[Environments API] Error querying data_records:', e);
        }

        try {
            const ingestJobs = await prisma.ingestJob.findMany({
                select: { environment: true },
                distinct: ['environment']
            });
            console.log('[Environments API] Found', ingestJobs.length, 'distinct environments from ingest_jobs');
            ingestJobs.forEach(j => envSet.add(j.environment));
        } catch (e) {
            console.error('[Environments API] Error querying ingest_jobs:', e);
        }

        const environments = Array.from(envSet).sort();

        console.log('[Environments API] Returning environments:', environments);
        return NextResponse.json({ environments });
    } catch (error: any) {
        console.error('Error fetching environments:', error);
        return NextResponse.json({ error: 'Failed to fetch environments' }, { status: 500 });
    }
}
