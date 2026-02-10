/**
 * App Access Control and Role-Based Redirects
 *
 * Determines which app a user should be on based on their role,
 * and provides redirect URLs for cross-app navigation.
 */
export type AppName = 'user' | 'qa' | 'core' | 'fleet' | 'admin';
export type UserRole = 'PENDING' | 'USER' | 'QA' | 'CORE' | 'FLEET' | 'MANAGER' | 'ADMIN';
/**
 * Check if a user's role has access to a specific app
 */
export declare function hasAppAccess(userRole: UserRole, appName: AppName): boolean;
/**
 * Get the URL for a specific app (production or local)
 */
export declare function getAppUrl(appName: AppName): string;
/**
 * Get the highest-privilege app that a user has access to
 */
export declare function getDefaultAppForRole(userRole: UserRole): AppName;
/**
 * Get redirect URL if user doesn't have access to current app
 * Returns null if user has access to current app
 */
export declare function getRedirectUrlIfNeeded(userRole: UserRole, currentApp: AppName): string | null;
//# sourceMappingURL=app-access.d.ts.map