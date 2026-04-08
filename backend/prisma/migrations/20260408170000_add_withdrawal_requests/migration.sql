-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'PAYMENT_DONE');

-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_LOCK';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REFUND';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_PAYOUT';

-- AlterTable
ALTER TABLE "Wallet"
ADD COLUMN "lockedWithdrawalBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "listenerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "transactionReference" TEXT,
    "approvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WithdrawalRequest_listenerId_requestedAt_idx" ON "WithdrawalRequest"("listenerId", "requestedAt");
CREATE INDEX "WithdrawalRequest_status_requestedAt_idx" ON "WithdrawalRequest"("status", "requestedAt");
CREATE INDEX "WithdrawalRequest_approvedByAdminId_status_idx" ON "WithdrawalRequest"("approvedByAdminId", "status");

-- AddForeignKey
ALTER TABLE "WithdrawalRequest"
ADD CONSTRAINT "WithdrawalRequest_listenerId_fkey"
FOREIGN KEY ("listenerId") REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "WithdrawalRequest"
ADD CONSTRAINT "WithdrawalRequest_approvedByAdminId_fkey"
FOREIGN KEY ("approvedByAdminId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
