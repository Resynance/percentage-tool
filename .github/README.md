# GitHub Actions

## Disabled Workflows

### Database Migration Workflow (REMOVED)

The `migrate.yml` workflow was removed because:

1. **This project uses Supabase for schema management**, not Prisma migrations
2. Prisma is only used for type-safe database access (read-only schema documentation)
3. Automated Prisma migrations conflicted with the Supabase migration strategy
4. Running `prisma migrate deploy` in production caused data loss on 2026-01-30

**Schema Management Strategy**:
- **Local Dev**: Supabase migrations in `supabase/migrations/`
- **Production**: Manual SQL via Supabase Dashboard or CLI
- **Prisma**: Type-safe queries only (never migrations)

See `/CLAUDE.md` for complete migration instructions.
