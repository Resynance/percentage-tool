import { NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exemplar-tasks/environments
 * Returns sorted list of distinct environments that have at least one exemplar task.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.error('[ExemplarEnvironments] Failed to fetch profile:', profileError);
        return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 });
    }

    if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const rows = await prisma.$queryRaw<Array<{ environment: string }>>`
            SELECT DISTINCT environment
            FROM exemplar_tasks
            ORDER BY environment ASC
        `;

        const environments = rows.map(r => r.environment);
        return NextResponse.json({ environments });
    } catch (err: any) {
        console.error('[ExemplarEnvironments] Error fetching environments:', err);
        return NextResponse.json({ error: 'Failed to fetch environments' }, { status: 500 });
    }
}
