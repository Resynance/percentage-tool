import { type AppName } from '@repo/auth';
interface LoginPageProps {
    appName: AppName;
}
/**
 * Shared login page component for all apps
 *
 * SECURITY NOTE: This login redirect is a UX convenience, not a security boundary.
 * Server-side middleware and API routes enforce role-based access control.
 * Users with active sessions who navigate directly to app URLs will bypass this redirect.
 */
export declare function LoginPage({ appName }: LoginPageProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=LoginPage.d.ts.map