// Re-export server-side auth functions
export { createClient as createServerClient, createAdminClient } from './server';

// Re-export client-side auth functions
export { createClient as createBrowserClient } from './client';

// Re-export auth utilities
export { getUserRole, getUserProfile, hasRole } from './utils';

// Re-export app access control
export {
  hasAppAccess,
  getAppUrl,
  getDefaultAppForRole,
  getRedirectUrlIfNeeded,
  type AppName,
  type UserRole
} from './app-access';
