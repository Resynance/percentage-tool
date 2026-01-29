import { createClient, createAdminClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        console.log(`[Reset Password API] Attempting to clear reset flag. ID: ${user.id}, Email: ${user.email}`)
        
        // Use updateMany to be resilient to ID mismatches if email matches
        const updateResult = await prisma.profile.updateMany({
            where: {
                OR: [
                    { id: user.id },
                    { email: user.email }
                ]
            },
            data: { mustResetPassword: false }
        })

        console.log(`[Reset Password API] Update result:`, updateResult)

        return NextResponse.json({ 
            success: true, 
            updated: updateResult.count
        })
    } catch (error: any) {
        console.error('[Reset Password API] Update error:', error)
        
        // If Prisma fails, it might be because the record doesn't exist or schema mismatch
        return NextResponse.json({ 
            error: error.message,
            code: error.code,
            meta: error.meta
        }, { status: 500 })
    }
}
