import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'

/**
 * Proxy to Fleet app announcements API
 * This avoids CORS issues in development
 */
export async function GET(request: NextRequest) {
  // Verify authentication before proxying
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const fleetUrl = process.env.NEXT_PUBLIC_FLEET_APP_URL || 'http://localhost:3004'

    // Forward the request to Fleet app
    const response = await fetch(`${fleetUrl}/api/announcements`, {
      headers: {
        // Forward cookies
        cookie: request.headers.get('cookie') || '',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { announcements: [] },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error proxying announcements:', error)
    return NextResponse.json({ announcements: [] })
  }
}
