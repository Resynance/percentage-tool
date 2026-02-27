// Re-export Prisma types and enums
export type {
  Profile,
  DataRecord,
  IngestJob,
  AnalyticsJob,
  BonusWindow,
  SystemSetting,
  AuditLog,
  BugReport,
  RaterGroup,
  AssignmentBatch,
  AssignmentRecord,
  CandidateStatus,
  LikertScore,
  LLMEvaluationJob,
  LLMModelConfig,
  CrossEncoderCache,
  RaterGroupMember,
  Guideline
} from '@prisma/client';

// Re-export enums
export {
  UserRole,
  RecordType,
  RecordCategory,
  JobStatus,
  AssignmentStatus,
  RecordAssignmentStatus
} from '@prisma/client';

export interface ProfileWithRole {
  id: string;
  email: string;
  role: import('@prisma/client').UserRole;
  mustResetPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}
