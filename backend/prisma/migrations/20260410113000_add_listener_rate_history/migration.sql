-- CreateTable
CREATE TABLE "ListenerRateHistory" (
    "id" TEXT NOT NULL,
    "listenerId" TEXT NOT NULL,
    "changedByAdminId" TEXT,
    "oldCallRatePerMinute" DECIMAL(10,2) NOT NULL,
    "newCallRatePerMinute" DECIMAL(10,2) NOT NULL,
    "oldChatRatePerMinute" DECIMAL(10,2) NOT NULL,
    "newChatRatePerMinute" DECIMAL(10,2) NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListenerRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListenerRateHistory_listenerId_createdAt_idx" ON "ListenerRateHistory"("listenerId", "createdAt");

-- CreateIndex
CREATE INDEX "ListenerRateHistory_changedByAdminId_createdAt_idx" ON "ListenerRateHistory"("changedByAdminId", "createdAt");

-- AddForeignKey
ALTER TABLE "ListenerRateHistory" ADD CONSTRAINT "ListenerRateHistory_listenerId_fkey" FOREIGN KEY ("listenerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListenerRateHistory" ADD CONSTRAINT "ListenerRateHistory_changedByAdminId_fkey" FOREIGN KEY ("changedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
