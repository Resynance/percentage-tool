import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';

// Mock dependencies
vi.mock('@repo/auth/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@repo/database', () => ({
  prisma: {
    profile: {
      findUnique: vi.fn(),
    },
    announcement: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    announcementRead: {
      findMany: vi.fn(),
    },
  },
  Prisma: {},
}));

import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

describe('GET /api/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return only published ALL_USERS announcements for regular user', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'USER' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'General Announcement',
        content: 'This is for all users',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T10:00:00Z'),
        updatedAt: new Date('2026-02-17T10:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.findMany.mockResolvedValue(mockAnnouncements);
    mockPrisma.profile.findMany = vi.fn().mockResolvedValue([
      {
        id: 'fleet-user-id',
        email: 'fleet@example.com',
        firstName: 'Fleet',
        lastName: 'Manager',
      },
    ]);
    mockPrisma.announcementRead.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3004/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toHaveLength(1);
    expect(data.announcements[0].title).toBe('General Announcement');
    expect(data.announcements[0].isRead).toBe(false);

    // Verify filtering for regular users
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
      where: {
        published: true,
        visibility: 'ALL_USERS',
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should return QA_AND_ABOVE announcements for QA user', async () => {
    const mockUser = { id: 'qa-user-123' };
    const mockProfile = { role: 'QA' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'QA Announcement',
        content: 'This is for QA and above',
        published: true,
        visibility: 'QA_AND_ABOVE',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T10:00:00Z'),
        updatedAt: new Date('2026-02-17T10:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.findMany.mockResolvedValue(mockAnnouncements);
    mockPrisma.profile.findMany = vi.fn().mockResolvedValue([
      {
        id: 'fleet-user-id',
        email: 'fleet@example.com',
        firstName: 'Fleet',
        lastName: 'Manager',
      },
    ]);
    mockPrisma.announcementRead.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3004/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toHaveLength(1);

    // Verify QA users can see all visibility levels (published only)
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
      where: {
        published: true,
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should return all announcements including unpublished for FLEET user', async () => {
    const mockUser = { id: 'fleet-user-123' };
    const mockProfile = { role: 'FLEET' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'Published Announcement',
        content: 'Published',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T10:00:00Z'),
        updatedAt: new Date('2026-02-17T10:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
      {
        id: 'ann-2',
        title: 'Draft Announcement',
        content: 'Draft',
        published: false,
        visibility: 'ALL_USERS',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T09:00:00Z'),
        updatedAt: new Date('2026-02-17T09:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.findMany.mockResolvedValue(mockAnnouncements);
    mockPrisma.profile.findMany = vi.fn().mockResolvedValue([
      {
        id: 'fleet-user-id',
        email: 'fleet@example.com',
        firstName: 'Fleet',
        lastName: 'Manager',
      },
    ]);
    mockPrisma.announcementRead.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3004/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toHaveLength(2);

    // Verify FLEET users see all announcements (no published filter)
    expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should mark announcements as read correctly', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'USER' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'Announcement 1',
        content: 'Content 1',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T10:00:00Z'),
        updatedAt: new Date('2026-02-17T10:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
      {
        id: 'ann-2',
        title: 'Announcement 2',
        content: 'Content 2',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'fleet-user-id',
        createdAt: new Date('2026-02-17T09:00:00Z'),
        updatedAt: new Date('2026-02-17T09:00:00Z'),
        createdBy: { email: 'fleet@example.com' },
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.findMany.mockResolvedValue(mockAnnouncements);
    mockPrisma.profile.findMany = vi.fn().mockResolvedValue([
      {
        id: 'fleet-user-id',
        email: 'fleet@example.com',
        firstName: 'Fleet',
        lastName: 'Manager',
      },
    ]);
    // User has read ann-1 but not ann-2
    mockPrisma.announcementRead.findMany.mockResolvedValue([
      { announcementId: 'ann-1' },
    ]);

    const request = new NextRequest('http://localhost:3004/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toHaveLength(2);
    expect(data.announcements[0].isRead).toBe(true); // ann-1 is read
    expect(data.announcements[1].isRead).toBe(false); // ann-2 is unread
  });

  it('should use batch queries to prevent N+1 problem', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'USER' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'Ann 1',
        content: 'Content 1',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'user-1',
        createdAt: new Date('2026-02-17T10:00:00Z'),
        updatedAt: new Date('2026-02-17T10:00:00Z'),
        createdBy: { email: 'user1@example.com' },
      },
      {
        id: 'ann-2',
        title: 'Ann 2',
        content: 'Content 2',
        published: true,
        visibility: 'ALL_USERS',
        createdById: 'user-2',
        createdAt: new Date('2026-02-17T09:00:00Z'),
        updatedAt: new Date('2026-02-17T09:00:00Z'),
        createdBy: { email: 'user2@example.com' },
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.findMany.mockResolvedValue(mockAnnouncements);
    mockPrisma.profile.findMany = vi.fn().mockResolvedValue([
      { id: 'user-1', email: 'user1@example.com', firstName: 'User', lastName: 'One' },
      { id: 'user-2', email: 'user2@example.com', firstName: 'User', lastName: 'Two' },
    ]);
    mockPrisma.announcementRead.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3004/api/announcements');
    await GET(request);

    // Should only call profile.findMany once (not once per announcement)
    expect(mockPrisma.profile.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.profile.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-2'] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    // Should only call announcementRead.findMany once
    expect(mockPrisma.announcementRead.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.announcementRead.findMany).toHaveBeenCalledWith({
      where: {
        userId: mockUser.id,
        announcementId: { in: ['ann-1', 'ann-2'] },
      },
      select: { announcementId: true },
    });
  });
});

describe('POST /api/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        content: 'Test content',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 403 if user is not FLEET or ADMIN', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'USER' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        content: 'Test content',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden - FLEET or ADMIN access required');
  });

  it('should return 400 if title is missing', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        content: 'Test content',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Title and content are required');
  });

  it('should return 400 if content is missing', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test title',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Title and content are required');
  });

  it('should return 400 if visibility is invalid', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test title',
        content: 'Test content',
        visibility: 'INVALID_VALUE',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid visibility value');
  });

  it('should create announcement with valid data', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET', email: 'fleet@example.com' };
    const mockAnnouncement = {
      id: 'ann-123',
      title: 'Test Announcement',
      content: 'Test content',
      published: true,
      visibility: 'ALL_USERS',
      createdById: mockUser.id,
      createdAt: new Date('2026-02-17T10:00:00Z'),
      updatedAt: new Date('2026-02-17T10:00:00Z'),
      createdBy: { email: 'fleet@example.com' },
    };
    const mockCreatorProfile = {
      email: 'fleet@example.com',
      firstName: 'Fleet',
      lastName: 'Manager',
    };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockCreatorProfile);
    mockPrisma.announcement.create.mockResolvedValue(mockAnnouncement);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Announcement',
        content: 'Test content',
        published: true,
        visibility: 'ALL_USERS',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.announcement.title).toBe('Test Announcement');
    expect(data.announcement.createdBy.firstName).toBe('Fleet');
    expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
      data: {
        title: 'Test Announcement',
        content: 'Test content',
        published: true,
        visibility: 'ALL_USERS',
        createdById: mockUser.id,
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
    });
  });

  it('should default to published=true and visibility=ALL_USERS', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET', email: 'fleet@example.com' };
    const mockAnnouncement = {
      id: 'ann-123',
      title: 'Test',
      content: 'Test',
      published: true,
      visibility: 'ALL_USERS',
      createdById: mockUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: { email: 'fleet@example.com' },
    };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce({ email: 'fleet@example.com', firstName: 'Fleet', lastName: 'M' });
    mockPrisma.announcement.create.mockResolvedValue(mockAnnouncement);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        content: 'Test',
      }),
    });

    await POST(request);

    expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
      data: {
        title: 'Test',
        content: 'Test',
        published: true,
        visibility: 'ALL_USERS',
        createdById: mockUser.id,
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
    });
  });
});

describe('PATCH /api/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'PATCH',
      body: JSON.stringify({
        id: 'ann-123',
        title: 'Updated',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 403 if user is not FLEET or ADMIN', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'QA' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'PATCH',
      body: JSON.stringify({
        id: 'ann-123',
        title: 'Updated',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden - FLEET or ADMIN access required');
  });

  it('should return 400 if id is missing', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Updated',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Announcement ID is required');
  });

  it('should return 400 if visibility is invalid', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'PATCH',
      body: JSON.stringify({
        id: 'ann-123',
        visibility: 'INVALID',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid visibility value');
  });

  it('should update announcement with valid data', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };
    const mockAnnouncement = {
      id: 'ann-123',
      title: 'Updated Title',
      content: 'Updated content',
      published: false,
      visibility: 'QA_AND_ABOVE',
      createdById: mockUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: { email: 'fleet@example.com' },
    };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce({ email: 'fleet@example.com', firstName: 'Fleet', lastName: 'M' });
    mockPrisma.announcement.update.mockResolvedValue(mockAnnouncement);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'PATCH',
      body: JSON.stringify({
        id: 'ann-123',
        title: 'Updated Title',
        content: 'Updated content',
        published: false,
        visibility: 'QA_AND_ABOVE',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcement.title).toBe('Updated Title');
    expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
      where: { id: 'ann-123' },
      data: {
        title: 'Updated Title',
        content: 'Updated content',
        published: false,
        visibility: 'QA_AND_ABOVE',
      },
      include: {
        createdBy: {
          select: {
            email: true,
          },
        },
      },
    });
  });
});

describe('DELETE /api/announcements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements?id=ann-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 403 if user is not FLEET or ADMIN', async () => {
    const mockUser = { id: 'user-123' };
    const mockProfile = { role: 'CORE' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements?id=ann-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden - FLEET or ADMIN access required');
  });

  it('should return 400 if id is missing', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'FLEET' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);

    const request = new NextRequest('http://localhost:3004/api/announcements', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Announcement ID is required');
  });

  it('should delete announcement successfully', async () => {
    const mockUser = { id: 'fleet-123' };
    const mockProfile = { role: 'ADMIN' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.announcement.delete.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3004/api/announcements?id=ann-123', {
      method: 'DELETE',
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockPrisma.announcement.delete).toHaveBeenCalledWith({
      where: { id: 'ann-123' },
    });
  });
});
