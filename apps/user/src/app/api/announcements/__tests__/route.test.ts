import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// Mock dependencies
vi.mock('@repo/auth/server', () => ({
  createClient: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { createClient } from '@repo/auth/server';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;

describe('GET /api/announcements (User App Proxy)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_FLEET_APP_URL: 'http://localhost:3004',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return 401 if user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: 'Not authenticated' }),
      },
    });

    const request = new NextRequest('http://localhost:3001/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should proxy request to Fleet app when authenticated', async () => {
    const mockUser = { id: 'user-123' };
    const mockAnnouncements = [
      {
        id: 'ann-1',
        title: 'Test Announcement',
        content: 'Test content',
        published: true,
        visibility: 'ALL_USERS',
        createdAt: '2026-02-17T10:00:00Z',
        updatedAt: '2026-02-17T10:00:00Z',
        createdBy: {
          email: 'fleet@example.com',
          firstName: 'Fleet',
          lastName: 'Manager',
        },
        isRead: false,
      },
    ];

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ announcements: mockAnnouncements }),
    });

    const request = new NextRequest('http://localhost:3001/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toEqual(mockAnnouncements);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3004/api/announcements', {
      headers: {
        cookie: expect.any(String),
      },
    });
  });

  it('should return empty array with error status from Fleet app', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    const request = new NextRequest('http://localhost:3001/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.announcements).toEqual([]);
  });

  it('should handle fetch errors gracefully', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost:3001/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toEqual([]);
  });

  it('should pass cookies from request to proxied request', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ announcements: [] }),
    });

    const request = new NextRequest('http://localhost:3001/api/announcements', {
      headers: {
        cookie: 'session=abc123; other=value',
      },
    });

    await GET(request);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3004/api/announcements',
      {
        headers: {
          cookie: 'session=abc123; other=value',
        },
      }
    );
  });

  it('should return empty announcements array when Fleet returns empty', async () => {
    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ announcements: [] }),
    });

    const request = new NextRequest('http://localhost:3001/api/announcements');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.announcements).toEqual([]);
  });

  it('should use correct Fleet app URL from environment', async () => {
    process.env.NEXT_PUBLIC_FLEET_APP_URL = 'https://fleet.example.com';

    const mockUser = { id: 'user-123' };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ announcements: [] }),
    });

    const request = new NextRequest('http://localhost:3001/api/announcements');
    await GET(request);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://fleet.example.com/api/announcements',
      expect.any(Object)
    );
  });
});
