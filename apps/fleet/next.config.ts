import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/types', '@repo/api-utils', '@repo/ui'],
  serverExternalPackages: ['@repo/database', '@repo/auth', '@repo/core', '@prisma/client', 'pg', '@supabase/ssr'],

  // Increase body size limit for CSV imports
  // Vercel Pro supports large payloads with proper configuration
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
