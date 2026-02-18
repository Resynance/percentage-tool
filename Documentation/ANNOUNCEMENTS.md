# Announcements Feature

System-wide announcements with role-based visibility and read tracking for multi-app turborepo architecture.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Visibility Levels](#visibility-levels)
- [UI Components](#ui-components)
- [Usage Guide](#usage-guide)
- [Testing](#testing)
- [Related Documentation](#related-documentation)

---

## Overview

The Announcements feature provides a centralized system for FLEET and ADMIN users to broadcast important messages across all five applications (User, QA, Core, Fleet, Admin). Announcements support role-based visibility filtering and per-user read tracking.

**Key Benefits**:
- **Cross-app visibility**: Single announcement appears in all apps via proxy pattern
- **Role-based filtering**: Target specific user groups (all users vs QA+)
- **Read tracking**: Track which users have seen each announcement
- **Persistent notifications**: Unread announcements persist across sessions
- **Management dashboard**: FLEET/ADMIN can create, edit, publish, and delete announcements

---

## Features

### For FLEET/ADMIN Users

- **Create Announcements**: Title, content, visibility level, published status
- **Edit Announcements**: Update any field including visibility and status
- **Delete Announcements**: Remove announcements permanently
- **Manage Visibility**: Choose between ALL_USERS and QA_AND_ABOVE
- **Draft Mode**: Create unpublished drafts for review before publishing
- **Full CRUD Dashboard**: Table view with inline editing and status updates

### For All Users

- **Notification Banner**: Persistent banner at top of each app showing unread announcements
- **Mark as Read**: Click announcements to mark as read and dismiss from banner
- **Badge Counter**: Shows count of unread announcements
- **Expandable View**: Click banner to expand and view full announcement list
- **Auto-filtering**: Only see announcements you have permission to view

---

## Architecture

### Multi-App Proxy Pattern

The announcements system uses a **server-side proxy pattern** to maintain a single source of truth while supporting independent app deployments:

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  User   │  │   QA    │  │  Core   │  │  Admin  │  │  Fleet  │
│   App   │  │   App   │  │   App   │  │   App   │  │   App   │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │            │
     │ Proxy      │ Proxy      │ Proxy      │ Proxy      │ Direct
     └────────────┴────────────┴────────────┴────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Fleet API        │
                    │  /api/announcements│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Supabase Database│
                    │  announcements     │
                    │  announcement_reads│
                    └───────────────────┘
```

**Why Proxy Pattern?**
- Each app can be deployed independently to different domains
- Single source of truth in Fleet app database
- No CORS configuration needed
- Authentication at both proxy and origin
- Consistent behavior across all apps

### File Structure

```
apps/
├── fleet/src/app/
│   ├── api/announcements/
│   │   ├── route.ts                 # Main CRUD API (GET, POST, PATCH, DELETE)
│   │   └── mark-read/route.ts       # Mark announcements as read
│   └── announcements/
│       ├── page.tsx                 # FLEET/ADMIN management dashboard
│       └── page.module.css          # Dashboard styles
│
├── user/src/app/api/announcements/
│   ├── route.ts                     # Proxy to Fleet API
│   └── mark-read/route.ts           # Proxy to Fleet mark-read API
│
├── qa/src/app/api/announcements/
│   ├── route.ts                     # Proxy to Fleet API
│   └── mark-read/route.ts           # Proxy to Fleet mark-read API
│
├── core/src/app/api/announcements/
│   ├── route.ts                     # Proxy to Fleet API
│   └── mark-read/route.ts           # Proxy to Fleet mark-read API
│
└── admin/src/app/api/announcements/
    ├── route.ts                     # Proxy to Fleet API
    └── mark-read/route.ts           # Proxy to Fleet mark-read API

packages/ui/src/components/
└── AnnouncementsBanner/
    ├── AnnouncementsBanner.tsx      # Shared notification banner
    └── AnnouncementsBanner.module.css
```

---

## Database Schema

### Tables

#### `announcements`

```sql
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true,
  visibility public.announcement_visibility NOT NULL DEFAULT 'ALL_USERS',
  created_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**:
- `idx_announcements_published` on `published`
- `idx_announcements_visibility` on `visibility`
- `idx_announcements_created_at` on `created_at DESC`

#### `announcement_reads`

```sql
CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);
```

**Indexes**:
- `idx_announcement_reads_user` on `user_id`
- `idx_announcement_reads_announcement` on `announcement_id`

### Enums

```sql
CREATE TYPE public.announcement_visibility AS ENUM ('ALL_USERS', 'QA_AND_ABOVE');
```

### Row Level Security (RLS)

**Announcements Table**:

```sql
-- Users can view published announcements based on visibility
CREATE POLICY "Users can view announcements based on visibility"
  ON public.announcements
  FOR SELECT
  USING (
    published = true
    AND (
      visibility = 'ALL_USERS'
      OR (
        visibility = 'QA_AND_ABOVE'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('QA', 'CORE', 'FLEET', 'MANAGER', 'ADMIN')
        )
      )
    )
  );

-- FLEET and ADMIN can view all announcements (including unpublished)
CREATE POLICY "FLEET and ADMIN can view all announcements"
  ON public.announcements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('FLEET', 'ADMIN')
    )
  );

-- FLEET and ADMIN can create/update/delete announcements
-- (INSERT, UPDATE, DELETE policies omitted for brevity - see migration files)
```

**Announcement Reads Table**:

```sql
-- Users can only insert their own reads
CREATE POLICY "Users can insert their own reads"
  ON public.announcement_reads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only view their own reads
CREATE POLICY "Users can view their own reads"
  ON public.announcement_reads
  FOR SELECT
  USING (auth.uid() = user_id);
```

---

## API Endpoints

### Fleet App (Origin)

#### `GET /api/announcements`

Fetch announcements for the current user with read status.

**Authorization**: Any authenticated user

**Query Parameters**: None

**Response**:
```json
{
  "announcements": [
    {
      "id": "uuid",
      "title": "System Maintenance",
      "content": "We will be performing maintenance...",
      "published": true,
      "visibility": "ALL_USERS",
      "createdAt": "2026-02-17T10:00:00Z",
      "updatedAt": "2026-02-17T10:00:00Z",
      "createdBy": {
        "email": "fleet@example.com",
        "firstName": "Fleet",
        "lastName": "Manager"
      },
      "isRead": false
    }
  ]
}
```

**Visibility Filtering**:
- Regular users see only published announcements with `visibility = 'ALL_USERS'`
- QA+ users see published announcements with `visibility = 'ALL_USERS'` or `'QA_AND_ABOVE'`
- FLEET/ADMIN see all announcements including unpublished drafts

**Performance**: Uses batch queries to prevent N+1 problem:
1. Fetch announcements with basic filtering
2. Batch fetch all creator profiles (single query)
3. Batch fetch all read statuses for current user (single query)
4. Map data together in memory

#### `POST /api/announcements`

Create a new announcement.

**Authorization**: FLEET or ADMIN role required

**Request Body**:
```json
{
  "title": "Announcement Title",
  "content": "Full announcement content...",
  "published": true,
  "visibility": "ALL_USERS"  // or "QA_AND_ABOVE"
}
```

**Validation**:
- `title` (required): Non-empty string
- `content` (required): Non-empty string
- `published` (optional): Boolean, defaults to `true`
- `visibility` (optional): Enum, defaults to `'ALL_USERS'`

**Response**: `201 Created`
```json
{
  "announcement": {
    "id": "uuid",
    "title": "Announcement Title",
    "content": "Full announcement content...",
    "published": true,
    "visibility": "ALL_USERS",
    "createdAt": "2026-02-17T10:00:00Z",
    "updatedAt": "2026-02-17T10:00:00Z",
    "createdById": "uuid",
    "createdBy": {
      "email": "fleet@example.com",
      "firstName": "Fleet",
      "lastName": "Manager"
    }
  }
}
```

#### `PATCH /api/announcements`

Update an existing announcement.

**Authorization**: FLEET or ADMIN role required

**Request Body**:
```json
{
  "id": "uuid",
  "title": "Updated Title",
  "content": "Updated content...",
  "published": false,
  "visibility": "QA_AND_ABOVE"
}
```

**Validation**:
- `id` (required): UUID of announcement to update
- All other fields optional
- `visibility` must be valid enum value if provided

**Response**: `200 OK` (same structure as POST)

#### `DELETE /api/announcements?id={uuid}`

Delete an announcement permanently.

**Authorization**: FLEET or ADMIN role required

**Query Parameters**:
- `id`: UUID of announcement to delete

**Response**: `200 OK`
```json
{
  "success": true
}
```

#### `POST /api/announcements/mark-read`

Mark one or more announcements as read for the current user.

**Authorization**: Any authenticated user

**Request Body**:
```json
{
  "announcementIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "markedCount": 3
}
```

**Note**: Uses `skipDuplicates: true` to handle already-read announcements gracefully.

### Proxy Apps (User, QA, Core, Admin)

All four proxy apps implement identical endpoints that forward requests to the Fleet app:

#### `GET /api/announcements`

Authenticates user, then proxies to `NEXT_PUBLIC_FLEET_APP_URL/api/announcements`.

#### `POST /api/announcements/mark-read`

Authenticates user, then proxies to `NEXT_PUBLIC_FLEET_APP_URL/api/announcements/mark-read`.

**Proxy Pattern Benefits**:
- Authentication check before proxying (defense in depth)
- Consistent error handling across apps
- No CORS configuration needed
- Preserves user session context

---

## Visibility Levels

### `ALL_USERS`

- **Who sees it**: All authenticated users across all apps
- **Use case**: General announcements, maintenance notices, new features
- **Example**: "New time tracking feature now available"

### `QA_AND_ABOVE`

- **Who sees it**: Users with roles QA, CORE, FLEET, MANAGER, or ADMIN
- **Use case**: Internal team communications, process changes, quality updates
- **Example**: "Updated quality guidelines for Project X"
- **RLS Enforcement**: Database-level policy prevents unauthorized access

**Role Hierarchy**:
```
PENDING → USER → QA → CORE → FLEET → MANAGER → ADMIN
                  └─────────────────────────────┘
                        QA_AND_ABOVE
```

---

## UI Components

### AnnouncementsBanner (Shared Component)

**Location**: `packages/ui/src/components/AnnouncementsBanner/`

**Usage**:
```tsx
import { AnnouncementsBanner } from '@repo/ui/components/AnnouncementsBanner'

export default function Layout({ children }) {
  return (
    <>
      <AnnouncementsBanner />
      <main>{children}</main>
    </>
  )
}
```

**Features**:
- Fetches announcements from local API proxy
- Displays unread count badge
- Expandable/collapsible view
- Click to mark as read
- Auto-dismisses when all announcements read
- Responsive design (collapses on mobile)

**Props**: None (uses current user session)

### Announcements Management Page

**Location**: `apps/fleet/src/app/announcements/page.tsx`

**Access**: FLEET or ADMIN role required (redirects otherwise)

**Features**:
- Table view of all announcements (including unpublished)
- Create new announcement modal
- Edit existing announcement modal
- Inline status badges (Published/Draft)
- Visibility badges (All Users/QA & Above)
- Delete confirmation
- Form validation
- Success/error alerts

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Announcements                    [+ Create Announcement]│
├─────────────────────────────────────────────────────────┤
│  Title       │ Content    │ Status │ Visibility │ Actions│
│  Maintenance │ We will... │ Pub    │ All        │ ✏️ 🗑️  │
│  QA Update   │ New guide..│ Draft  │ QA+        │ ✏️ 🗑️  │
└─────────────────────────────────────────────────────────┘
```

---

## Usage Guide

### For FLEET/ADMIN: Creating an Announcement

1. Navigate to Fleet app → `/announcements`
2. Click **"Create Announcement"** button
3. Fill in the form:
   - **Title**: Brief, descriptive heading (required)
   - **Content**: Full announcement text (required)
   - **Visibility**: Choose `All Users` or `QA & Above`
   - **Publish immediately**: Check to publish now, uncheck to save as draft
4. Click **"Create Announcement"**
5. Announcement appears in all apps immediately (if published)

### For FLEET/ADMIN: Editing an Announcement

1. Navigate to `/announcements` in Fleet app
2. Click **Edit** (✏️) button on the announcement row
3. Update any fields in the modal
4. Click **"Save Changes"**
5. Changes propagate to all apps immediately

### For FLEET/ADMIN: Changing Visibility

You can change visibility at any time:
- `ALL_USERS` → `QA_AND_ABOVE`: Announcement disappears for regular users immediately
- `QA_AND_ABOVE` → `ALL_USERS`: Announcement becomes visible to all users immediately

**Note**: Read status persists when changing visibility. If a user already marked it as read, it stays read.

### For All Users: Viewing Announcements

1. Log in to any app (User, QA, Core, Fleet, Admin)
2. Unread announcements appear in banner at top of page
3. Click the banner to expand and view all unread announcements
4. Click individual announcements to mark as read
5. Banner disappears when all announcements are read

### For All Users: Dismissing Announcements

- **Mark as read**: Click the announcement text
- **Mark all as read**: Click each announcement or wait for auto-dismissal
- **Banner persists**: Unread announcements persist across sessions until marked read

---

## Testing

### Unit Tests

**Location**: `apps/fleet/src/app/api/announcements/__tests__/`

**Coverage**:
- Authentication (401 for unauthenticated)
- Authorization (403 for non-FLEET/ADMIN on create/update/delete)
- Validation (400 for missing/invalid fields)
- Visibility filtering (users see appropriate announcements)
- Batch query optimization (N+1 prevention)
- Mark as read (duplicate handling)

**Run tests**:
```bash
pnpm turbo run test --filter=@repo/fleet-app
```

### E2E Tests

**Location**: `e2e/announcements.spec.ts`

**Coverage**:
- FLEET user creates announcement
- Announcement appears in banner for regular user
- Mark as read functionality
- Visibility filtering (QA_AND_ABOVE not visible to USER)
- Edit and delete workflows
- Cross-app visibility (announcement created in Fleet appears in User app)

**Run E2E tests**:
```bash
npm run dev:supabase  # Start Supabase first
npm run test:e2e
```

### Manual Testing Checklist

- [ ] Create announcement as FLEET user
- [ ] Verify announcement appears in all 5 apps
- [ ] Mark as read in one app, verify persists in others
- [ ] Create QA_AND_ABOVE announcement
- [ ] Verify regular USER does not see it
- [ ] Verify QA user does see it
- [ ] Edit announcement, verify changes propagate
- [ ] Delete announcement, verify disappears from all apps
- [ ] Test with multiple users simultaneously
- [ ] Test draft mode (unpublished announcements)

---

## Related Documentation

- [User Management](./USER_MANAGEMENT.md) - User roles and permissions
- [App Navigation Guide](../APP_NAVIGATION_GUIDE.md) - Cross-app navigation patterns
- [Testing Guide](./TESTING.md) - Testing strategy and setup
- [API Reference](./Reference/API_REFERENCE.md) - Complete API documentation
- [Turborepo Architecture](../README.md) - Multi-app architecture overview
- [User Role Reference](./USER_ROLE_REFERENCE.md) - Role hierarchy and permissions

---

## Troubleshooting

### Announcement not appearing in banner

**Check**:
1. Is the announcement published? (Draft announcements don't appear for regular users)
2. Does the user have permission? (QA_AND_ABOVE announcements require QA+ role)
3. Has the user already marked it as read?
4. Check browser console for API errors

### "Unauthorized" when creating announcement

**Solution**: Verify your user has FLEET or ADMIN role. Contact an admin to update your role.

### Announcement appears in some apps but not others

**Check**:
1. Verify all apps are using the same Supabase database
2. Check `NEXT_PUBLIC_FLEET_APP_URL` environment variable in proxy apps
3. Verify proxy routes are deployed correctly
4. Check browser network tab for failed proxy requests

### Performance issues with many announcements

**Optimization**:
- Current implementation uses batch queries (3 queries total regardless of announcement count)
- If needed, implement pagination in future enhancement
- Limit announcements fetched (currently no limit)

---

*Last Updated: 2026-02-17*
