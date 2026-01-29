
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const getEnv = (name: string) => process.env[name]?.trim()?.replace(/['"]/g, '')

    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL')
    const supabaseKey = getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || 
                        getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    if (typeof window !== 'undefined') {
        console.log('[Supabase Client] URL:', supabaseUrl ? `Set (len: ${supabaseUrl.length})` : 'MISSING')
        console.log('[Supabase Client] Key:', supabaseKey ? `Set (len: ${supabaseKey.length})` : 'MISSING')
    }

    if (!supabaseUrl || !supabaseKey) {
        const errorMsg = 'SUPABASE_URL or ANAL_KEY/PUBLISHABLE_KEY is missing. Check your NEXT_PUBLIC_ variables.'
        console.error('[Supabase Client]', errorMsg)
        return null;
    }

    return createBrowserClient(
        supabaseUrl,
        supabaseKey
    )
}
