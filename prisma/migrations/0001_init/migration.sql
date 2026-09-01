CREATE TYPE "Role" AS ENUM ('WORKER','CUSTOMER','COOPERATIVE_ADMIN','FEDERATION_ADMIN','SUPER_ADMIN');
CREATE TYPE "JobStatus" AS ENUM ('DRAFT','POSTED','MATCHING','ASSIGNED','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED','DISPUTED','RESOLVED');
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED','ESCALATED');

CREATE TABLE "Federation" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE "Cooperative" (
  "id" TEXT PRIMARY KEY,
  "federationId" TEXT REFERENCES "Federation"("id"),
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "policyFeePercent" INTEGER NOT NULL DEFAULT 8,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "mobile" TEXT,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "emailVerifiedAt" TIMESTAMP,
  "profileCompletion" INTEGER NOT NULL DEFAULT 0,
  "cooperativeId" TEXT REFERENCES "Cooperative"("id"),
  "federationId" TEXT REFERENCES "Federation"("id"),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "csrfToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "ServiceCategory" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "baseHourlyRate" INTEGER NOT NULL,
  "complexityMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1
);

CREATE TABLE "Skill" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL REFERENCES "ServiceCategory"("id")
);

CREATE TABLE "WorkerProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "cooperativeId" TEXT NOT NULL REFERENCES "Cooperative"("id"),
  "workerCode" TEXT NOT NULL UNIQUE,
  "location" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
  "yearsExperience" INTEGER NOT NULL DEFAULT 0,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completedJobs" INTEGER NOT NULL DEFAULT 0,
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "languages" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "CustomerProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "location" TEXT,
  "savedAddresses" TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE "WorkerSkill" (
  "workerId" TEXT NOT NULL REFERENCES "WorkerProfile"("id") ON DELETE CASCADE,
  "skillId" TEXT NOT NULL REFERENCES "Skill"("id"),
  PRIMARY KEY ("workerId", "skillId")
);

CREATE TABLE "Certification" (
  "id" TEXT PRIMARY KEY,
  "workerId" TEXT NOT NULL REFERENCES "WorkerProfile"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "issuedBy" TEXT NOT NULL,
  "issuedAt" TIMESTAMP,
  "fileKey" TEXT
);

CREATE TABLE "Job" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "workerId" TEXT,
  "cooperativeId" TEXT NOT NULL REFERENCES "Cooperative"("id"),
  "serviceCategoryId" TEXT NOT NULL REFERENCES "ServiceCategory"("id"),
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requirements" TEXT[] NOT NULL DEFAULT '{}',
  "location" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP NOT NULL,
  "estimatedDurationHours" INTEGER NOT NULL,
  "budget" INTEGER NOT NULL,
  "fairWageEstimate" INTEGER NOT NULL,
  "finalAmount" INTEGER,
  "status" "JobStatus" NOT NULL DEFAULT 'POSTED',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "MatchScore" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id") ON DELETE CASCADE,
  "workerId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX "MatchScore_job_score_idx" ON "MatchScore"("jobId", "score");

CREATE TABLE "WageRule" (
  "id" TEXT PRIMARY KEY,
  "cooperativeId" TEXT NOT NULL REFERENCES "Cooperative"("id"),
  "serviceCategoryId" TEXT NOT NULL REFERENCES "ServiceCategory"("id"),
  "skillLevel" TEXT NOT NULL,
  "minimumHourlyRate" INTEGER NOT NULL,
  "platformFeePercent" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id"),
  "payerId" TEXT NOT NULL,
  "workerId" TEXT,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "Review" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id"),
  "customerId" TEXT NOT NULL,
  "workerId" TEXT,
  "rating" INTEGER NOT NULL,
  "body" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("jobId", "customerId")
);

CREATE TABLE "UserSetting" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "language" TEXT NOT NULL DEFAULT 'en',
  "theme" TEXT NOT NULL DEFAULT 'light',
  "notifications" JSONB NOT NULL,
  "privacy" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "WelfareScheme" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "eligibility" TEXT NOT NULL, "documents" TEXT[] NOT NULL DEFAULT '{}', "organization" TEXT);
CREATE TABLE "TrainingProgram" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "serviceCategoryId" TEXT NOT NULL REFERENCES "ServiceCategory"("id"), "skillsCovered" TEXT[] NOT NULL DEFAULT '{}', "durationHours" INTEGER NOT NULL, "provider" TEXT NOT NULL);
CREATE TABLE "Dispute" ("id" TEXT PRIMARY KEY, "jobId" TEXT NOT NULL REFERENCES "Job"("id"), "createdById" TEXT NOT NULL, "reason" TEXT NOT NULL, "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN', "comments" JSONB NOT NULL, "resolution" TEXT, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now());
CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY, "actorId" TEXT, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity", "entityId");

CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'INFO',
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX "Notification_user_read_idx" ON "Notification"("userId", "read");

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT,
  "participantIds" TEXT[] NOT NULL DEFAULT '{}',
  "unreadBy" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "senderId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX "Message_conversation_idx" ON "Message"("conversationId", "createdAt");

CREATE TABLE "WelfareApplication" (
  "id" TEXT PRIMARY KEY,
  "schemeId" TEXT NOT NULL REFERENCES "WelfareScheme"("id"),
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "TrainingEnrollment" (
  "id" TEXT PRIMARY KEY,
  "programId" TEXT NOT NULL REFERENCES "TrainingProgram"("id"),
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'ENROLLED',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "SosIncident" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "jobId" TEXT,
  "location" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "AiConversation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "AiMessage" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "AiConversation"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "facts" TEXT[] NOT NULL DEFAULT '{}',
  "sourceType" TEXT NOT NULL DEFAULT 'LOCAL',
  "providerConfigured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX "AiMessage_conversation_idx" ON "AiMessage"("conversationId", "createdAt");

CREATE TABLE "PasswordReset" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "usedAt" TIMESTAMP
);

