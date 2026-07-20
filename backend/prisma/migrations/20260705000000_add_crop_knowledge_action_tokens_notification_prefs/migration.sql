-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationPrefs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "crop_types" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🌱',
    "category" TEXT NOT NULL DEFAULT 'Personalizados',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crop_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_schedules" (
    "id" TEXT NOT NULL,
    "cropTypeId" TEXT NOT NULL,
    "harvestWindowStartDays" INTEGER NOT NULL,
    "harvestWindowEndDays" INTEGER NOT NULL,
    "operations" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "crop_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "newEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crop_schedules_cropTypeId_key" ON "crop_schedules"("cropTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "action_tokens_tokenHash_key" ON "action_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "crop_types" ADD CONSTRAINT "crop_types_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_schedules" ADD CONSTRAINT "crop_schedules_cropTypeId_fkey" FOREIGN KEY ("cropTypeId") REFERENCES "crop_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tokens" ADD CONSTRAINT "action_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

