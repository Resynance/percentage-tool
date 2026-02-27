import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check user has FLEET or higher role
        const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { role: true }
        });

        if (!profile || !['FLEET', 'MANAGER', 'ADMIN'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const environment = searchParams.get('environment');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '25', 10);
        const userFilter = searchParams.get('user');

        // Build where clause - if environment is empty/null, return all environments
        const whereClause: any = {
            type: 'TASK'
        };

        if (environment) {
            whereClause.environment = environment;
        }

        if (userFilter) {
            whereClause.OR = [
                { createdByName: userFilter },
                { createdByEmail: userFilter }
            ];
        }

        // Get total count for pagination
        const totalCount = await prisma.dataRecord.count({
            where: whereClause
        });

        // Calculate pagination
        const skip = (page - 1) * limit;
        const totalPages = Math.ceil(totalCount / limit);

        // Fetch paginated tasks (filtered by environment if specified)
        const tasks = await prisma.dataRecord.findMany({
            where: whereClause,
            select: {
                id: true,
                content: true,
                environment: true,
                metadata: true,
                createdByName: true,
                createdByEmail: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take: limit
        });

        // Format the response
        const formattedTasks = tasks.map(task => ({
            id: task.id,
            content: task.content,
            environment: task.environment || 'N/A',
            createdBy: task.createdByName || task.createdByEmail || 'Unknown',
            createdAt: task.createdAt,
        }));

        return NextResponse.json({
            tasks: formattedTasks,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasMore: page < totalPages
            }
        });
    } catch (error: any) {
        console.error('Error fetching tasks:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
