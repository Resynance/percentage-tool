import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy endpoint to Fleet app's mark-read endpoint
 * This avoids CORS issues when marking announcements as read from other apps
 */
export async function POST(request: NextRequest) {
  const fleetUrl = process.env.NEXT_PUBLIC_FLEET_APP_URL || 'http://localhost:3004'

  try {
    const body = await request.json()

    const response = await fetch(`${fleetUrl}/api/announcements/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || ''
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Error proxying mark-read request:', error)
    return NextResponse.json(
      { error: 'Failed to mark announcements as read' },
      { status: 500 }
    )
  }
}
