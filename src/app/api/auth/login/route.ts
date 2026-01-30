import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('[Login] Authentication failed:', error.message)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 }
    )
  }

  // Verify session was created
  if (!data.session) {
    console.error('[Login] No session created after successful auth')
    return NextResponse.redirect(
      new URL('/login?error=Session creation failed', request.url),
      { status: 303 }
    )
  }

  console.log('[Login] Auth successful, session created')

  // Get all cookies to verify they were set
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  console.log('[Login] Cookies after auth:', allCookies.map(c => c.name).join(', '))

  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
