
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findSimilarRecords } from '../similarity';

// Mock Prisma using vi.hoisted to ensure accessibility inside vi.mock factory
const { mockPrisma } = vi.hoisted(() => {
    return {
        mockPrisma: {
            $queryRaw: vi.fn(),
        }
    };
});

vi.mock('../prisma', () => ({
    prisma: mockPrisma,
}));

describe('Similarity Search', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('findSimilarRecords', () => {
        const mockTargetId = 'target-123';
        const mockTargetRecord = {
            id: mockTargetId,
            content: 'Target content',
            environment: 'test-env',
            type: 'task',
            embedding: '[0.1,0.2,0.3]',
        };

        it('should throw error when target record does not exist', async () => {
            mockPrisma.$queryRaw.mockResolvedValueOnce([]); // target not found

            await expect(findSimilarRecords(mockTargetId)).rejects.toThrow(
                'Target record not found or has no embedding'
            );
        });

        it('should throw error when target record has empty embedding', async () => {
            mockPrisma.$queryRaw.mockResolvedValueOnce([{
                ...mockTargetRecord,
                embedding: '[]',
            }]);

            await expect(findSimilarRecords(mockTargetId)).rejects.toThrow(
                'Target record has no valid embedding'
            );
        });

        it('should return similar records from the database', async () => {
            const similarRecords = [
                { id: 'rec-1', content: 'First', environment: 'test-env', type: 'task', embedding: '[0.2,0.3,0.4]', similarity: 0.95 },
                { id: 'rec-2', content: 'Second', environment: 'test-env', type: 'task', embedding: '[0.1,0.1,0.1]', similarity: 0.80 },
            ];

            mockPrisma.$queryRaw
                .mockResolvedValueOnce([mockTargetRecord]) // target lookup
                .mockResolvedValueOnce(similarRecords);    // similarity query

            const results = await findSimilarRecords(mockTargetId, 5);

            expect(results).toHaveLength(2);
            expect(results[0].record.id).toBe('rec-1');
            expect(results[0].similarity).toBe(0.95);
            expect(results[1].record.id).toBe('rec-2');
            expect(results[1].similarity).toBe(0.80);
        });

        it('should return records with environment field (not projectId)', async () => {
            const similarRecords = [
                { id: 'rec-1', content: 'Content', environment: 'prod', type: 'task', embedding: '[0.2,0.3,0.4]', similarity: 0.90 },
            ];

            mockPrisma.$queryRaw
                .mockResolvedValueOnce([mockTargetRecord])
                .mockResolvedValueOnce(similarRecords);

            const results = await findSimilarRecords(mockTargetId, 5);

            expect(results[0].record).toHaveProperty('environment', 'prod');
            expect(results[0].record).not.toHaveProperty('projectId');
        });

        it('should handle empty result set gracefully', async () => {
            mockPrisma.$queryRaw
                .mockResolvedValueOnce([mockTargetRecord])
                .mockResolvedValueOnce([]);

            const results = await findSimilarRecords(mockTargetId, 5);

            expect(results).toHaveLength(0);
            expect(Array.isArray(results)).toBe(true);
        });

        it('should convert similarity values to numbers', async () => {
            const similarRecords = [
                { id: 'rec-1', content: 'Content', environment: 'test-env', type: 'task', embedding: '[0.2,0.3,0.4]', similarity: '0.95' }, // DB may return string
            ];

            mockPrisma.$queryRaw
                .mockResolvedValueOnce([mockTargetRecord])
                .mockResolvedValueOnce(similarRecords);

            const results = await findSimilarRecords(mockTargetId, 5);

            expect(typeof results[0].similarity).toBe('number');
            expect(results[0].similarity).toBe(0.95);
        });
    });
});
