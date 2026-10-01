-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- The farm of every demo account already IS a sample farm.
UPDATE "farms" SET "isSample" = true
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "isDemo" = true);
