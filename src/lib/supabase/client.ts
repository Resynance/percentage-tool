
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    // Support Vercel deployment env vars with fallback to legacy names
    // Note: In browser context, only NEXT_PUBLIC_ prefixed variables are available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

    return createBrowserClient(
        supabaseUrl,
        supabaseKey
    )
}
