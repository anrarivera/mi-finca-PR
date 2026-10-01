-- DropIndex
DROP INDEX "crop_schedules_cropTypeId_key";

-- AlterTable
ALTER TABLE "crop_schedules" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "crop_schedules_cropTypeId_userId_key" ON "crop_schedules"("cropTypeId", "userId");

-- AddForeignKey
ALTER TABLE "crop_schedules" ADD CONSTRAINT "crop_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

