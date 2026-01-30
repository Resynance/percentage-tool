import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get('projectId');
        const userId = searchParams.get('userId');

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        const whereClause: any = {
            projectId,
            type: 'TASK',
            createdById: { not: null },
        };

        if (userId && userId !== 'All') {
            whereClause.createdById = userId;
        }

        const prompts = await prisma.dataRecord.findMany({
            where: whereClause,
            select: {
                id: true,
                content: true,
                category: true,
                createdByEmail: true,
                createdByName: true,
                createdById: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const uniqueUsers = await prisma.dataRecord.findMany({
            where: {
                projectId,
                type: 'TASK',
                createdById: { not: null }
            },
            select: {
                createdByEmail: true,
                createdByName: true,
                createdById: true,
            },
            distinct: ['createdById'],
        });

        return NextResponse.json({
            prompts,
            users: uniqueUsers.map(u => ({
                id: u.createdById!,
                name: u.createdByName || u.createdByEmail || 'Unknown',
            })),
        });
    } catch (error: any) {
        console.error('Error fetching prompts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch prompts', details: error.message },
            { status: 500 }
        );
    }
}
