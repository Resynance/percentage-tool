import { defineConfig } from '@prisma/config';
import fs from 'fs';
import path from 'path';

// Manual .env loader to avoid "module not found" errors with dotenv in some environments
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    // Handle both Unix (\n) and Windows (\r\n) line endings
    envFile.split(/\r?\n/).forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for CLI operations (migrations/db push) - bypasses pgbouncer
    // Runtime queries use DATABASE_URL configured in Prisma Client
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
