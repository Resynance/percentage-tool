import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createClient } from '@repo/auth/server';
import { logAudit } from '@repo/core/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rater-groups
 * List rater groups for a project
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['ADMIN', 'FLEET'].includes((profile as any)?.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const environment = searchParams.get('environment');

        if (!environment) {
            return NextResponse.json({ error: 'environment is required' }, { status: 400 });
        }

        const groups = await prisma.raterGroup.findMany({
            where: { environment },
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: {
                        members: true,
                        assignments: true
                    }
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, email: true }
                        }
                    }
                }
            }
        });

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Error fetching rater groups:', error);
        return NextResponse.json({ error: 'Failed to fetch rater groups' }, { status: 500 });
    }
}

/**
 * POST /api/rater-groups
 * Create a new rater group
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['ADMIN', 'FLEET'].includes((profile as any)?.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { environment, name, description } = body;

        if (!environment || !name?.trim()) {
            return NextResponse.json({ error: 'environment and name are required' }, { status: 400 });
        }

        // Check for duplicate name in environment
        const existing = await prisma.raterGroup.findFirst({
            where: { environment, name: name.trim() }
        });

        if (existing) {
            return NextResponse.json({ error: 'A group with this name already exists in this environment' }, { status: 409 });
        }

        const group = await prisma.raterGroup.create({
            data: {
                environment,
                name: name.trim(),
                description: description?.trim() || null
            },
            include: {
                _count: {
                    select: { members: true, assignments: true }
                }
            }
        });

        await logAudit({
            action: 'RATER_GROUP_CREATED',
            entityType: 'RATER_GROUP',
            entityId: group.id,
            environment,
            userId: user.id,
            userEmail: user.email!,
            metadata: { name: group.name }
        });

        return NextResponse.json({ group }, { status: 201 });
    } catch (error) {
        console.error('Error creating rater group:', error);
        return NextResponse.json({ error: 'Failed to create rater group' }, { status: 500 });
    }
}
