ALTER TABLE "User"
ADD COLUMN "suspendedUntil" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT;

CREATE TABLE "ModerationViolation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "sessionType" TEXT NOT NULL DEFAULT 'CHAT',
    "originalContent" TEXT NOT NULL,
    "detectedReasons" TEXT[],
    "suspendedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationViolation_userId_createdAt_idx" ON "ModerationViolation"("userId", "createdAt");
CREATE INDEX "ModerationViolation_sessionId_createdAt_idx" ON "ModerationViolation"("sessionId", "createdAt");
CREATE INDEX "ModerationViolation_createdAt_idx" ON "ModerationViolation"("createdAt");

ALTER TABLE "ModerationViolation"
ADD CONSTRAINT "ModerationViolation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
