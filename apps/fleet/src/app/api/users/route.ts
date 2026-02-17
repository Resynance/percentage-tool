import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@repo/auth/server'
import { prisma } from '@repo/database'

/**
 * GET /api/users
 * List all workers from data records (for dropdowns and selections)
 * Requires FLEET or ADMIN role
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is FLEET or ADMIN
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true }
    })

    if (!profile || !['FLEET', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - FLEET or ADMIN access required' },
        { status: 403 }
      )
    }

    // Fetch unique workers from data_records with their info
    const records = await prisma.dataRecord.findMany({
      where: {
        createdByEmail: { not: null }
      },
      select: {
        createdById: true,
        createdByName: true,
        createdByEmail: true,
      },
      distinct: ['createdByEmail'],
      orderBy: {
        createdByEmail: 'asc'
      }
    })

    // Get all profiles to match with data records
    const profiles = await prisma.profile.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      }
    })

    // Get all valid user IDs from auth.users
    const validUsers = await prisma.users.findMany({
      select: {
        id: true,
      }
    })

    // Create maps for lookup
    const profilesByEmail = new Map(
      profiles.map(p => [p.email.toLowerCase(), p])
    )
    const validUserIds = new Set(validUsers.map(u => u.id))

    // Match data records with profiles, or create synthetic users
    const users = records
      .filter(record => record.createdByEmail) // Ensure email exists
      .map(record => {
        const email = record.createdByEmail!
        const matchedProfile = profilesByEmail.get(email.toLowerCase())

        if (matchedProfile) {
          // Use profile data if available (has valid user ID)
          return {
            id: matchedProfile.id,
            email: matchedProfile.email,
            firstName: matchedProfile.firstName,
            lastName: matchedProfile.lastName,
            role: matchedProfile.role,
            displayName: matchedProfile.firstName && matchedProfile.lastName
              ? `${matchedProfile.firstName} ${matchedProfile.lastName}`
              : record.createdByName || email
          }
        } else if (record.createdById && validUserIds.has(record.createdById)) {
          // Use createdById if it exists in auth.users (valid user ID)
          return {
            id: record.createdById,
            email: email,
            firstName: record.createdByName?.split(' ')[0] || null,
            lastName: record.createdByName?.split(' ').slice(1).join(' ') || null,
            role: 'USER',
            displayName: record.createdByName || email
          }
        } else {
          // Use email as ID for workers without accounts (worker_id will be null in flags)
          return {
            id: email, // Use email as identifier
            email: email,
            firstName: record.createdByName?.split(' ')[0] || null,
            lastName: record.createdByName?.split(' ').slice(1).join(' ') || null,
            role: 'USER',
            displayName: record.createdByName || email
          }
        }
      })
      .sort((a, b) => {
        // Sort by last name, then first name, then email
        const lastNameA = a.lastName || ''
        const lastNameB = b.lastName || ''
        const firstNameA = a.firstName || ''
        const firstNameB = b.firstName || ''

        // Compare last names first
        if (lastNameA && lastNameB) {
          const lastNameCompare = lastNameA.localeCompare(lastNameB)
          if (lastNameCompare !== 0) return lastNameCompare
        } else if (lastNameA) {
          return -1 // A has last name, B doesn't - A comes first
        } else if (lastNameB) {
          return 1 // B has last name, A doesn't - B comes first
        }

        // If last names are equal or both missing, compare first names
        if (firstNameA && firstNameB) {
          const firstNameCompare = firstNameA.localeCompare(firstNameB)
          if (firstNameCompare !== 0) return firstNameCompare
        } else if (firstNameA) {
          return -1
        } else if (firstNameB) {
          return 1
        }

        // Finally, compare by email if everything else is equal
        return a.email.localeCompare(b.email)
      })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
