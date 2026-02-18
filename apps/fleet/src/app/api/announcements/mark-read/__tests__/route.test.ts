import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock dependencies
vi.mock('@repo/auth/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@repo/database', () => ({
  prisma: {
    announcementRead: {
      createMany: vi.fn(),
    },
  },
}));

import { createClient } from '@repo/auth/server';
import { prisma } from '@repo/database';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as any;

describe('POST /api/announcements/mark-read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds: ['ann-1', 'ann-2'],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 if announcementIds is missing', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('announcementIds array is required');
  });

  it('should return 400 if announcementIds is not an array', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds: 'not-an-array',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('announcementIds array is required');
  });

  it('should return 400 if announcementIds is empty array', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds: [],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('announcementIds array is required');
  });

  it('should mark announcements as read successfully', async () => {
    const mockUser = { id: 'user-123' };
    const announcementIds = ['ann-1', 'ann-2', 'ann-3'];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.announcementRead.createMany.mockResolvedValue({ count: 3 });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.markedCount).toBe(3);
    expect(mockPrisma.announcementRead.createMany).toHaveBeenCalledWith({
      data: [
        { userId: mockUser.id, announcementId: 'ann-1' },
        { userId: mockUser.id, announcementId: 'ann-2' },
        { userId: mockUser.id, announcementId: 'ann-3' },
      ],
      skipDuplicates: true,
    });
  });

  it('should handle already-read announcements with skipDuplicates', async () => {
    const mockUser = { id: 'user-123' };
    const announcementIds = ['ann-1', 'ann-2'];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    // Only 1 was actually inserted (the other was a duplicate)
    mockPrisma.announcementRead.createMany.mockResolvedValue({ count: 1 });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.markedCount).toBe(1);
    expect(mockPrisma.announcementRead.createMany).toHaveBeenCalledWith({
      data: [
        { userId: mockUser.id, announcementId: 'ann-1' },
        { userId: mockUser.id, announcementId: 'ann-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('should mark single announcement as read', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockPrisma.announcementRead.createMany.mockResolvedValue({ count: 1 });

    const request = new NextRequest('http://localhost:3004/api/announcements/mark-read', {
      method: 'POST',
      body: JSON.stringify({
        announcementIds: ['ann-1'],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.markedCount).toBe(1);
  });
});
