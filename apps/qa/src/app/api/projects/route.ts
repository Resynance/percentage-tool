import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@repo/auth/server';

export const dynamic = 'force-dynamic';

/**
 * DEPRECATED: Projects have been replaced with environment-based organization
 * This route is stubbed out for backwards compatibility
 * Use /api/environments instead
 */

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Return empty array - projects no longer exist
        return NextResponse.json({ projects: [], deprecated: true, message: 'Projects have been replaced with environments. Use /api/environments instead.' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return NextResponse.json({
        error: 'Projects are deprecated. Use environment-based organization instead.'
    }, { status: 410 }); // 410 Gone
}

export async function DELETE(req: NextRequest) {
    return NextResponse.json({
        error: 'Projects are deprecated. Use environment-based organization instead.'
    }, { status: 410 }); // 410 Gone
}

export async function PATCH(req: NextRequest) {
    return NextResponse.json({
        error: 'Projects are deprecated. Use environment-based organization instead.'
    }, { status: 410 }); // 410 Gone
}
