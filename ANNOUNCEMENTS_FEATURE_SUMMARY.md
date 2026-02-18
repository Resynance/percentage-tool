# Announcements Feature Summary

**Date**: February 17, 2026
**Branch**: `feat/announcements`
**Feature**: Global Announcements System with Collapsible Header Banner

## Overview

Implemented a comprehensive announcements system that allows FLEET and ADMIN users to create and manage system-wide announcements visible to all users across all 5 applications. Announcements appear in a collapsible banner at the top of each page.

## Key Features

### ✅ For All Users
- **Collapsible announcements banner** at top of every page
- **Scrollable list** of published announcements
- **Expand/collapse** toggle with persistent state (localStorage)
- **Badge indicator** showing count when collapsed
- **Auto-hide** when no announcements exist
- **Visible across all apps** (User, QA, Core, Fleet, Admin)

### ✅ For FLEET/ADMIN Users
- **Manage announcements** from Fleet app
- **Create/Edit/Delete** announcements
- **Publish/Unpublish** toggle for draft management
- **Full CRUD interface** with modals
- **View unpublished drafts** (other users only see published)

## Architecture

### Database

**Model**: `Announcement`
```prisma
model Announcement {
  id          UUID      Primary Key
  title       String    Announcement title
  content     Text      Announcement content
  published   Boolean   Published status (default: true)
  createdById UUID      Creator ID (FK to auth.users)
  createdAt   Timestamp Creation timestamp
  updatedAt   Timestamp Update timestamp (auto-updated)

  createdBy   users     Relation to creator
}
```

**Indexes**:
- `published` - Fast filtering of published announcements
- `createdAt DESC` - Chronological ordering

**RLS Policies**:
- Everyone can view published announcements
- FLEET/ADMIN can view all announcements (including unpublished)
- FLEET/ADMIN can create/update/delete announcements

### API Endpoints

**Location**: `/apps/fleet/src/app/api/announcements/route.ts`

**GET `/api/announcements`**
- Fetch all announcements
- Users: See only published
- FLEET/ADMIN: See all (including drafts)
- Returns: `{ announcements: Announcement[] }`
- Auth: Required (authenticated users)

**POST `/api/announcements`**
- Create new announcement
- Body: `{ title, content, published? }`
- Returns: `{ announcement: Announcement }`
- Auth: FLEET or ADMIN only

**PATCH `/api/announcements`**
- Update existing announcement
- Body: `{ id, title?, content?, published? }`
- Returns: `{ announcement: Announcement }`
- Auth: FLEET or ADMIN only

**DELETE `/api/announcements`**
- Delete announcement
- Query param: `id`
- Returns: `{ success: true }`
- Auth: FLEET or ADMIN only

### Shared Component

**Location**: `/packages/ui/src/components/AnnouncementsBanner.tsx`

**Props**:
- `apiBaseUrl?: string` - Base URL for API calls (for cross-app communication)

**Features**:
- Client-side component (`'use client'`)
- Fetches announcements on mount
- Collapsible with smooth animation
- Persists collapsed state to localStorage (`announcements-banner-collapsed`)
- Shows loading and error states
- Auto-hides when no announcements
- Badge with count when collapsed
- Scrollable list with max-height (400px)
- Formatted dates and creator attribution
- Glass-morphism design matching app theme

**Usage**:
```tsx
// Fleet app (same origin)
<AnnouncementsBanner />

// Other apps (cross-app API)
<AnnouncementsBanner apiBaseUrl={process.env.NEXT_PUBLIC_FLEET_APP_URL} />
```

### Management Interface

**Location**: `/apps/fleet/src/app/announcements/`

**Page Features**:
- Table view of all announcements
- Create announcement modal
- Edit announcement modal
- Delete confirmation
- Published/Draft status badges
- Content preview (truncated)
- Action buttons (Edit, Delete)
- Empty state with CTA
- Responsive design

**Form Fields**:
- **Title** (required, text input)
- **Content** (required, textarea)
- **Published** (checkbox, default: true)

**Validation**:
- Title and content required
- Client-side and server-side validation
- User feedback via alerts

### Navigation

**Fleet Sidebar**:
- Added "Announcements" link to Fleet Management section
- Icon: Megaphone
- Position: After "Analytics", before "Ingest Data"
- Alphabetically ordered with other items

### Cross-App Integration

**All 5 Apps Updated**:
- ✅ User App (port 3001)
- ✅ QA App (port 3002)
- ✅ Core App (port 3003)
- ✅ Fleet App (port 3004)
- ✅ Admin App (port 3005)

**Layout Changes**:
- Imported `AnnouncementsBanner` from `@repo/ui/components`
- Added banner after `<Header />` component
- Configured `apiBaseUrl` for non-Fleet apps
- Only shown to authenticated users

## Implementation Details

### Database Migration

**File**: `/supabase/migrations/20260216000002_create_announcements_table.sql`

**Created**:
- `announcements` table
- Indexes for performance
- RLS policies for security
- Updated_at trigger
- Grant permissions

**Applied**: Via `npm run dev:reset`

### Prisma Schema

**File**: `/packages/database/prisma/schema.prisma`

**Changes**:
- Added `Announcement` model (lines 1072-1097)
- Added `announcements` relation to `users` model (line 704)
- Documented with JSDoc comments

**Regenerated**: Prisma Client via `npx prisma generate`

### Security

**RLS Policies**:
- ✅ SELECT: Published announcements visible to everyone
- ✅ SELECT: All announcements visible to FLEET/ADMIN
- ✅ INSERT: FLEET/ADMIN only
- ✅ UPDATE: FLEET/ADMIN only
- ✅ DELETE: FLEET/ADMIN only

**API Authorization**:
- ✅ All endpoints check authentication
- ✅ Write operations verify FLEET/ADMIN role
- ✅ Read operations filter by published status for non-privileged users

**Input Validation**:
- ✅ Required fields checked
- ✅ UUID validation for IDs
- ✅ SQL injection prevented (Prisma ORM)

### Styling

**Design System**:
- Glass-morphism banner with gradient background
- Smooth expand/collapse animation (0.3s ease)
- Responsive max-height (400px) with scroll
- Badge with gradient background and count
- Status badges (green=published, gray=draft)
- Hover effects on interactive elements
- Matches existing app theme

**Responsive**:
- Mobile breakpoint at 768px
- Table scrolls horizontally on mobile
- Modal adjusts padding for mobile
- Banner maintains functionality across screen sizes

## File Structure

```
apps/fleet/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── announcements/
│   │   │       └── route.ts                    # NEW: API endpoints
│   │   └── announcements/
│   │       ├── page.tsx                        # NEW: Management page
│   │       └── page.module.css                 # NEW: Styles
│   └── components/
│       └── navigation/
│           └── Sidebar.tsx                     # MODIFIED: Added link

apps/{user,qa,core,admin}/
└── src/
    └── app/
        └── layout.tsx                          # MODIFIED: Added banner

packages/
├── database/
│   └── prisma/
│       └── schema.prisma                       # MODIFIED: Added model
└── ui/
    └── src/
        └── components/
            ├── AnnouncementsBanner.tsx         # NEW: Shared component
            └── index.ts                        # MODIFIED: Export

supabase/migrations/
└── 20260216000002_create_announcements_table.sql # NEW: Migration
```

## Usage Guide

### For FLEET/ADMIN Users

**Creating an Announcement**:
1. Navigate to Fleet app → Announcements
2. Click "Create Announcement"
3. Enter title and content
4. Toggle "Publish immediately" (default: on)
5. Click "Create Announcement"
6. Announcement appears immediately to all users

**Editing an Announcement**:
1. Navigate to Fleet app → Announcements
2. Click Edit button on announcement
3. Modify title, content, or published status
4. Click "Save Changes"

**Deleting an Announcement**:
1. Navigate to Fleet app → Announcements
2. Click Delete button on announcement
3. Confirm deletion
4. Announcement removed from all apps immediately

**Managing Drafts**:
- Uncheck "Published" when creating/editing
- Draft announcements visible only to FLEET/ADMIN in management page
- Other users won't see unpublished announcements
- Publish later by editing and checking "Published"

### For All Users

**Viewing Announcements**:
- Banner appears at top of page (if announcements exist)
- Click banner header to expand/collapse
- Scroll through list of announcements
- Each shows: title, content, author, date
- Collapsed state persists across sessions

**Dismissing Banner**:
- Click to collapse (persists in localStorage)
- Banner auto-hides if no announcements exist
- Badge shows count when collapsed

## Testing Checklist

- [ ] Database migration applies cleanly
- [ ] Prisma client generates without errors
- [ ] Announcements API endpoints respond correctly
- [ ] GET returns published announcements for regular users
- [ ] GET returns all announcements for FLEET/ADMIN
- [ ] POST creates announcement successfully
- [ ] PATCH updates announcement successfully
- [ ] DELETE removes announcement successfully
- [ ] RLS policies prevent unauthorized access
- [ ] AnnouncementsBanner renders in all 5 apps
- [ ] Banner fetches announcements from Fleet API
- [ ] Banner expands/collapses smoothly
- [ ] Collapsed state persists in localStorage
- [ ] Badge shows correct count
- [ ] Announcements page loads in Fleet app
- [ ] Create modal works correctly
- [ ] Edit modal works correctly
- [ ] Delete confirmation works correctly
- [ ] Published/Draft status toggle works
- [ ] Navigation link appears in Fleet sidebar
- [ ] Cross-app API calls work (User/QA/Core/Admin → Fleet)
- [ ] Responsive design works on mobile
- [ ] No console errors or warnings

## Environment Variables

**Required in all apps**:
```env
NEXT_PUBLIC_FLEET_APP_URL="http://localhost:3004"  # For cross-app API calls
```

**For production**:
- Set to production Fleet app URL (e.g., `https://fleet-app.vercel.app`)
- Update in all app deployments (User, QA, Core, Admin)
- Fleet app uses same-origin (no URL needed)

## Deployment Notes

### Local Development

1. Ensure Supabase is running: `npm run dev:supabase`
2. Apply migration: Already applied via `npm run dev:reset`
3. Start all apps: `pnpm turbo run dev`
4. Test announcements creation in Fleet app
5. Verify banner appears in all apps

### Production Deployment

1. Run migration in production Supabase:
   ```bash
   supabase db push
   ```

2. Verify environment variables set in all Vercel projects:
   - `NEXT_PUBLIC_FLEET_APP_URL` set to production Fleet app URL

3. Deploy all 5 apps (banner needs to be in all layouts)

4. Test cross-app communication (announcements from Fleet API)

5. Verify RLS policies are active and working

## Future Enhancements

Potential improvements for future PRs:

- [ ] Announcement expiration dates (auto-hide after date)
- [ ] Priority levels (Info, Warning, Critical) with colors
- [ ] Markdown support for rich formatting
- [ ] Announcement categories/tags
- [ ] Target audience selection (show only to specific roles)
- [ ] Read/unread tracking per user
- [ ] Email notifications for critical announcements
- [ ] Announcement scheduling (publish at future date)
- [ ] Announcement templates for common messages
- [ ] Analytics (view counts, engagement metrics)
- [ ] Comment/reply functionality
- [ ] Attachment support (files, images)
- [ ] Announcement archiving
- [ ] Bulk operations (publish/unpublish multiple)
- [ ] Announcement search and filtering in management page

## Related Files

**Database**:
- `packages/database/prisma/schema.prisma` - Announcement model
- `supabase/migrations/20260216000002_create_announcements_table.sql` - Migration

**API**:
- `apps/fleet/src/app/api/announcements/route.ts` - CRUD endpoints

**UI Components**:
- `packages/ui/src/components/AnnouncementsBanner.tsx` - Shared banner
- `packages/ui/src/components/index.ts` - Component exports

**Fleet App**:
- `apps/fleet/src/app/announcements/page.tsx` - Management page
- `apps/fleet/src/app/announcements/page.module.css` - Styles
- `apps/fleet/src/components/navigation/Sidebar.tsx` - Navigation link

**Layouts** (all apps):
- `apps/fleet/src/app/layout.tsx`
- `apps/user/src/app/layout.tsx`
- `apps/qa/src/app/layout.tsx`
- `apps/core/src/app/layout.tsx`
- `apps/admin/src/app/layout.tsx`

---

**Document Version**: 1.0
**Last Updated**: February 17, 2026
**Status**: Complete and Ready for Testing
**Branch**: `feat/announcements`
