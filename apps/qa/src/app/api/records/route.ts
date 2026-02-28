import { NextRequest, NextResponse } from 'next/server';
import { Prisma, RecordCategory } from '@prisma/client';
import { prisma } from '@repo/database';
import { findSimilarRecords } from '@repo/core/similarity';
import { createClient } from '@repo/auth/server';

export const dynamic = 'force-dynamic';

// Valid enum values matching Prisma schema
const VALID_TYPES = ['TASK', 'FEEDBACK'] as const;
const VALID_CATEGORIES = ['TOP_10', 'BOTTOM_10', 'STANDARD'] as const;
const VALID_SORT_FIELDS = ['createdAt', 'alignmentScore', 'environment'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;

type SortField = typeof VALID_SORT_FIELDS[number];
type SortOrder = typeof VALID_SORT_ORDERS[number];

interface DataRecordRow {
    id: string;
    environment: string;
    type: string;
    category: string;
    content: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    total_count: bigint;
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's role
        const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { role: true }
        });

        const role = profile?.role || 'USER';

        const { searchParams } = new URL(req.url);
        const environment = searchParams.get('environment');
        const type = searchParams.get('type');
        const category = searchParams.get('category');
        const sortByParam = searchParams.get('sortBy');
        const sortOrderParam = searchParams.get('sortOrder');

        // Validate and parse pagination params (default to safe values if invalid)
        const skipParsed = parseInt(searchParams.get('skip') || '0');
        const takeParsed = parseInt(searchParams.get('take') || '50');
        const skip = isNaN(skipParsed) || skipParsed < 0 ? 0 : skipParsed;
        const take = isNaN(takeParsed) || takeParsed < 1 ? 50 : Math.min(takeParsed, 100);

        // Validate enum values
        if (type && !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
            return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
        }
        if (category && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
            return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
        }

        // Validate sort params (default to safe values if invalid)
        const sortBy: SortField = sortByParam && VALID_SORT_FIELDS.includes(sortByParam as SortField)
            ? sortByParam as SortField
            : 'createdAt';
        const sortOrder: SortOrder = sortOrderParam && VALID_SORT_ORDERS.includes(sortOrderParam as SortOrder)
            ? sortOrderParam as SortOrder
            : 'desc';

        // Build WHERE clause conditions with proper parameterization
        const whereConditions: Prisma.Sql[] = [];

        if (environment) {
            whereConditions.push(Prisma.sql`environment = ${environment}`);
        }
        if (type) {
            whereConditions.push(Prisma.sql`type = ${type}::"RecordType"`);
        }
        if (category) {
            // For STANDARD category, include both STANDARD enum value AND NULL (for backward compatibility with existing records)
            if (category === 'STANDARD') {
                whereConditions.push(Prisma.sql`(category = 'STANDARD'::"RecordCategory" OR category IS NULL)`);
            } else {
                whereConditions.push(Prisma.sql`category = ${category}::"RecordCategory"`);
            }
        }

        // Filter TASK records to show only version 1 (but only for "All" and "STANDARD" categories)
        // TOP_10 and BOTTOM_10 categories show all versions
        // Checks for version fields in multiple naming conventions (version, version_no, versionNo)
        if (type === 'TASK' && (!category || category === 'STANDARD')) {
            whereConditions.push(Prisma.sql`(
                metadata->>'version' = '1'
                OR metadata->>'version_no' = '1'
                OR metadata->>'versionNo' = '1'
                OR (metadata->>'version' IS NULL AND metadata->>'version_no' IS NULL AND metadata->>'versionNo' IS NULL)
            )`);
        }

        const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
        const nullsPosition = sortOrder === 'desc' ? 'NULLS LAST' : 'NULLS FIRST';

        // Build ORDER BY clause based on validated sortBy
        let orderByClause: Prisma.Sql;

        switch (sortBy) {
            case 'alignmentScore':
                // Extract numeric score from alignmentAnalysis text using regex
                orderByClause = Prisma.sql`ORDER BY (
                    CASE WHEN "alignmentAnalysis" IS NOT NULL THEN
                        CAST(COALESCE((regexp_match("alignmentAnalysis", '(?:Alignment Score \\(0-100\\)|Score)[:\\s\\n]*(\\d+)', 'i'))[1], '0') AS INTEGER)
                    ELSE NULL END
                ) ${Prisma.raw(orderDirection)} ${Prisma.raw(nullsPosition)}`;
                break;
            case 'environment':
                // Sort by environment_name from metadata JSON
                orderByClause = Prisma.sql`ORDER BY metadata->>'environment_name' ${Prisma.raw(orderDirection)} ${Prisma.raw(nullsPosition)}`;
                break;
            case 'createdAt':
            default:
                orderByClause = Prisma.sql`ORDER BY "createdAt" ${Prisma.raw(orderDirection)}`;
                break;
        }

        // Build the complete query with proper parameterization
        const whereClause = whereConditions.length > 0
            ? Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`
            : Prisma.empty;

        // Single query: fetch rows + total count in one round-trip via window function
        const query = Prisma.sql`
            SELECT id, environment, type, category, content, metadata, "createdAt",
                   COUNT(*) OVER() as total_count
            FROM data_records
            ${whereClause}
            ${orderByClause}
            OFFSET ${skip} LIMIT ${take}
        `;

        const rows = await prisma.$queryRaw<DataRecordRow[]>(query);
        const total = Number(rows[0]?.total_count || 0);
        const records = rows.map(({ total_count, ...r }) => r);

        return NextResponse.json({ records, total });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's role
        const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { role: true }
        });

        const role = profile?.role || 'USER';

        const { action, targetId, limit } = await req.json();

        if (action === 'similarity') {
            if (!targetId) {
                return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
            }

            // Verify record exists
            const targetRecord = await prisma.dataRecord.findUnique({
                where: { id: targetId },
                select: {
                    environment: true,
                }
            });

            if (!targetRecord) {
                return NextResponse.json({ error: 'Record not found' }, { status: 404 });
            }

            // QA role and above can access similarity search
            const allowedRoles = ['QA', 'CORE', 'FLEET', 'ADMIN'];
            if (!allowedRoles.includes(role)) {
                return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
            }

            const results = await findSimilarRecords(targetId, limit || 5);
            return NextResponse.json({ results });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
