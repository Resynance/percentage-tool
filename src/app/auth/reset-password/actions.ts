'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function clearResetFlagAction() {
    console.log('[clearResetFlagAction] Triggered');
    
    // 1. Get the current user session (to identify who is calling)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error('[clearResetFlagAction] No authenticated user found');
        return { success: false, error: 'Unauthorized' };
    }

    try {
        console.log(`[clearResetFlagAction] Attempting to clear flag for: ${user.email} (${user.id})`);
        
        // 2. Use Admin Client to bypass RLS
        const adminSupabase = await createAdminClient();
        
        // We update many using ID or Email to be totally resilient
        // Using Prisma here as secondary verification since we just updated the schema
        const result = await prisma.profile.updateMany({
            where: {
                OR: [
                    { id: user.id },
                    { email: user.email }
                ]
            },
            data: { mustResetPassword: false }
        });

        console.log(`[clearResetFlagAction] prisma.profile.updateMany affected: ${result.count} rows`);

        if (result.count === 0) {
            // Fallback: Try raw SQL if Prisma couldn't find the record
            console.log('[clearResetFlagAction] 0 rows affected by Prisma. Trying raw SQL...');
            const rawCount = await prisma.$executeRawUnsafe(
                `UPDATE public.profiles SET "mustResetPassword" = false WHERE id = $1::uuid OR email = $2`,
                user.id,
                user.email
            );
            console.log(`[clearResetFlagAction] Raw SQL affected: ${rawCount} rows`);
            
            if (rawCount === 0) {
                return { 
                    success: false, 
                    error: 'Profile record not found to clear flag',
                    diagnostics: { id: user.id, email: user.email }
                };
            }
        }

        return { success: true, count: result.count };
    } catch (error: any) {
        console.error('[clearResetFlagAction] Fatal error:', error);
        return { success: false, error: error.message };
    }
}
