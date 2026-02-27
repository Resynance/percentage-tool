import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const environment = req.nextUrl.searchParams.get('environment');

        // Fetch recent jobs (optionally filter by environment)
        const where = environment ? { environment } : {};

        const jobs = await prisma.ingestJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 20 // Show more jobs since we're showing all environments
        });

        return NextResponse.json(jobs);
    } catch (error: any) {
        console.error('Fetch Jobs Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
