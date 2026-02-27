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
                distinct: ['environment']
            });
            dataRecords.forEach(r => {
                if (r.environment) envSet.add(r.environment);
            });
        } catch (e) { /* Table might not exist */ }

        try {
            const ingestJobs = await prisma.ingestJob.findMany({
                select: { environment: true },
                distinct: ['environment']
            });
            ingestJobs.forEach(j => envSet.add(j.environment));
        } catch (e) { /* Table might not exist */ }

        const environments = Array.from(envSet).sort();

        return NextResponse.json({ environments });
    } catch (error: any) {
        console.error('Error fetching environments:', error);
        return NextResponse.json({ error: 'Failed to fetch environments' }, { status: 500 });
    }
}
