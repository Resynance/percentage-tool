import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// Mock dependencies
vi.mock('@repo/auth/server', () => ({
    createClient: vi.fn(() => ({
        auth: {
            getUser: vi.fn(() => ({
                data: { user: { id: 'test-user-id' } },
                error: null
            }))
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => ({
                        data: { role: 'FLEET' },
                        error: null
                    }))
                }))
            }))
        }))
    }))
}));

vi.mock('@repo/database', () => ({
    prisma: {
        qAFeedbackRating: {
            findMany: vi.fn(() => [
                {
                    qaEmail: 'qa1@example.com',
                    qaName: 'QA Worker 1',
                    isHelpful: false,
                    isDispute: false,
                    evalTaskId: 'task-1'
                },
                {
                    qaEmail: 'qa1@example.com',
                    qaName: 'QA Worker 1',
                    isHelpful: true,
                    isDispute: false,
                    evalTaskId: 'task-2'
                },
                {
                    qaEmail: 'qa2@example.com',
                    qaName: 'QA Worker 2',
                    isHelpful: false,
                    isDispute: true,
                    evalTaskId: 'task-3'
                }
            ])
        },
        dataRecord: {
            findMany: vi.fn(() => []),
            groupBy: vi.fn(() => [
                { createdByEmail: 'qa1@example.com', _count: { _all: 10 } },
                { createdByEmail: 'qa2@example.com', _count: { _all: 5 } }
            ])
        }
    }
}));

describe('GET /api/qa-feedback-analysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 401 for unauthenticated users', async () => {
        const { createClient } = await import('@repo/auth/server');
        vi.mocked(createClient).mockReturnValue({
            auth: {
                getUser: vi.fn(() => ({
                    data: { user: null },
                    error: new Error('Unauthorized')
                }))
            }
        } as any);

        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.errorId).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 403 for users without FLEET or ADMIN role', async () => {
        const { createClient } = await import('@repo/auth/server');
        vi.mocked(createClient).mockReturnValue({
            auth: {
                getUser: vi.fn(() => ({
                    data: { user: { id: 'test-user-id' } },
                    error: null
                }))
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: vi.fn(() => ({
                            data: { role: 'USER' },
                            error: null
                        }))
                    }))
                }))
            }))
        } as any);

        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.errorId).toBe('AUTH_FORBIDDEN');
    });

    it('should return worker stats for valid request', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.workers).toBeDefined();
        expect(Array.isArray(data.workers)).toBe(true);
        expect(data.workers.length).toBeGreaterThan(0);
    });

    it('should calculate negative percentage correctly', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        const worker1 = data.workers.find((w: any) => w.qaEmail === 'qa1@example.com');
        expect(worker1).toBeDefined();
        expect(worker1.totalRatings).toBe(2);
        expect(worker1.negativeRatings).toBe(1);
        expect(worker1.negativePercent).toBe(50.0);
    });

    it('should filter by date range', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis?startDate=2026-01-01&endDate=2026-12-31');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.dateRange).toEqual({
            start: '2026-01-01',
            end: '2026-12-31'
        });
    });

    it('should return 400 for invalid date format', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis?startDate=invalid&endDate=2026-12-31');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.errorId).toBe('INVALID_DATE_FORMAT');
    });

    it('should include dispute counts', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        const worker2 = data.workers.find((w: any) => w.qaEmail === 'qa2@example.com');
        expect(worker2).toBeDefined();
        expect(worker2.disputes).toBe(1);
    });

    it('should sort workers by negative percentage descending', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        for (let i = 0; i < data.workers.length - 1; i++) {
            expect(data.workers[i].negativePercent).toBeGreaterThanOrEqual(data.workers[i + 1].negativePercent);
        }
    });
});
