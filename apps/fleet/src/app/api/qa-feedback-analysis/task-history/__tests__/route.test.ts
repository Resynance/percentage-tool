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
        dataRecord: {
            findUnique: vi.fn(() => ({
                id: 'task-1',
                content: 'Test task content',
                metadata: {
                    task_key: 'task-key-1',
                    task_prompt: 'Full task prompt text here',
                    scenario_title: 'Production Environment'
                },
                type: 'TASK',
                createdAt: new Date('2026-01-15'),
                createdByEmail: 'worker@example.com',
                createdByName: 'Test Worker'
            })),
            findMany: vi.fn((args) => {
                // Return related tasks or feedbacks based on the query
                if (args.where.type === 'TASK') {
                    return [
                        {
                            id: 'task-2',
                            content: 'Related task',
                            metadata: { task_prompt: 'Related task prompt', scenario_title: 'Production Environment' },
                            createdAt: new Date('2026-01-14')
                        }
                    ];
                }
                // Return feedbacks
                return [
                    {
                        id: 'feedback-1',
                        content: 'QA feedback content',
                        metadata: { feedback_key: 'fb-1', feedback_content: 'Full feedback content' },
                        createdAt: new Date('2026-01-16'),
                        createdByEmail: 'qa@example.com',
                        createdByName: 'QA Person'
                    }
                ];
            })
        },
        qAFeedbackRating: {
            findMany: vi.fn(() => [
                {
                    feedbackId: 'fb-1',
                    ratingId: 'rating-1',
                    isHelpful: false,
                    isDispute: false,
                    ratedAt: new Date('2026-01-17'),
                    raterEmail: 'rater@example.com'
                }
            ])
        }
    }
}));

describe('GET /api/qa-feedback-analysis/task-history', () => {
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

        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.errorId).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 if taskId is missing', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.errorId).toBe('INVALID_INPUT');
    });

    it('should return 404 if task not found', async () => {
        const { prisma } = await import('@repo/database');
        vi.mocked(prisma.dataRecord.findUnique).mockResolvedValue(null);

        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=nonexistent');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.errorId).toBe('INVALID_INPUT');
    });

    it('should return task details with full content from metadata', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.task).toBeDefined();
        expect(data.task.id).toBe('task-1');
        expect(data.task.content).toBe('Full task prompt text here');
        expect(data.task.environment).toBe('Production Environment');
    });

    it('should return related tasks from same worker', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.relatedTasks).toBeDefined();
        expect(Array.isArray(data.relatedTasks)).toBe(true);
        expect(data.relatedTasks.length).toBeGreaterThan(0);
    });

    it('should return feedbacks with ratings', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.allFeedbacks).toBeDefined();
        expect(Array.isArray(data.allFeedbacks)).toBe(true);
        expect(data.allFeedbacks[0].feedbackId).toBe('feedback-1');
        expect(data.allFeedbacks[0].ratingId).toBe('rating-1');
        expect(data.allFeedbacks[0].isHelpful).toBe(false);
    });

    it('should use full feedback content from metadata', async () => {
        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.allFeedbacks[0].feedbackContent).toBe('Full feedback content');
    });

    it('should sort feedbacks by creation date descending', async () => {
        const { prisma } = await import('@repo/database');
        vi.mocked(prisma.dataRecord.findMany).mockImplementation((args) => {
            if (args.where.type === 'FEEDBACK') {
                return Promise.resolve([
                    {
                        id: 'fb-1',
                        content: 'Feedback 1',
                        metadata: { feedback_key: 'fb-1' },
                        createdAt: new Date('2026-01-16'),
                        createdByEmail: 'qa@example.com',
                        createdByName: 'QA'
                    },
                    {
                        id: 'fb-2',
                        content: 'Feedback 2',
                        metadata: { feedback_key: 'fb-2' },
                        createdAt: new Date('2026-01-18'),
                        createdByEmail: 'qa@example.com',
                        createdByName: 'QA'
                    }
                ] as any);
            }
            return Promise.resolve([]);
        });

        const url = new URL('http://localhost:3004/api/qa-feedback-analysis/task-history?taskId=task-1');
        const request = new NextRequest(url);

        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.allFeedbacks[0].feedbackCreatedAt).toBeGreaterThan(data.allFeedbacks[1].feedbackCreatedAt);
    });
});
