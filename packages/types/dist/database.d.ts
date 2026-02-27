export type { Profile, DataRecord, IngestJob, AnalyticsJob, BonusWindow, SystemSetting, AuditLog, BugReport, RaterGroup, AssignmentBatch, AssignmentRecord, CandidateStatus, LikertScore, LLMEvaluationJob, LLMModelConfig, CrossEncoderCache, RaterGroupMember, Guideline } from '@prisma/client';
export { UserRole, RecordType, RecordCategory, JobStatus, AssignmentStatus, RecordAssignmentStatus } from '@prisma/client';
export interface ProfileWithRole {
    id: string;
    email: string;
    role: import('@prisma/client').UserRole;
    mustResetPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=database.d.ts.map