import { prisma } from '@repo/database';
import type { UserRole } from '@repo/types';

// Module-level cache — persists across requests in the same server process.
// Avoids a DB round-trip on every API request for the same user.
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedRole {
  role: UserRole;
  expiresAt: number;
}

const roleCache = new Map<string, CachedRole>();

/**
 * Invalidate the cached role for a specific user.
 * Call this after any admin operation that changes a user's role.
 */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId);
}

/**
 * Get user role from the database by user ID.
 * Results are cached in-process for 5 minutes to avoid a DB round-trip on every request.
 * @param userId - The user's UUID
 * @returns The user's role
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const now = Date.now();
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.role;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true }
  });
  const role = (profile?.role ?? 'USER') as UserRole;

  roleCache.set(userId, { role, expiresAt: now + ROLE_CACHE_TTL_MS });
  return role;
}

/**
 * Get full user profile from the database by user ID
 * @param userId - The user's UUID
 * @returns The user's profile or null if not found
 */
export async function getUserProfile(userId: string) {
  return prisma.profile.findUnique({
    where: { id: userId }
  });
}

/**
 * Check if a user has a specific role
 * @param userId - The user's UUID
 * @param role - The role to check for
 * @returns True if the user has the specified role, false otherwise
 */
export async function hasRole(userId: string, role: UserRole): Promise<boolean> {
  const userRole = await getUserRole(userId);
  return userRole === role;
}
