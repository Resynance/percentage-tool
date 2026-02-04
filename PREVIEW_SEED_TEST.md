# Preview Seed Test Instructions

## Quick Start

Copy and paste these commands into your terminal:

### 1. Set your credentials:

```bash
# Get your access token from: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN='paste-your-token-here'

# Get your org ID from: https://supabase.com/dashboard/org/_/general
export SUPABASE_ORG_ID='paste-your-org-id-here'
```

### 2. Run the test script:

```bash
./scripts/test-preview-seed.sh fix/permission_issues
```

### 3. When prompted, type `y` and press Enter to seed the database

## What You'll See

The script will:
- Show all your Supabase projects
- Find the preview project for `fix/permission_issues`
- Ask for confirmation before seeding
- Create test users in that preview database

## After Success

You can login to your preview deployment with:
- **Admin**: admin@test.com / test
- **Manager**: manager@test.com / test
- **User**: user@test.com / test

## Troubleshooting

**"Command not found: supabase"**
```bash
# Install Supabase CLI
npm install -g supabase
```

**"No preview project found"**
- The preview project name might be different
- Check the "Available projects" list in the output
- Try manually specifying the project name
