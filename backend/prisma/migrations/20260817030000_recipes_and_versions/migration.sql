-- Recipes phase 2: crops are identity, recipes are practice.
-- Creates recipes / recipe_versions / recipe_defaults, links plantings to
-- the version they followed, and migrates every crop_schedules row into a
-- Recipe v1 before dropping the old table:
--   built-in base rows  -> authorless system recipes
--   custom-crop base    -> recipe authored by the crop owner (+ personal default)
--   user override rows  -> "Mi calendario para <crop>" (+ personal default)

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT,
    "cropTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "harvestWindowStartDays" INTEGER NOT NULL,
    "harvestWindowEndDays" INTEGER NOT NULL,
    "operations" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "referencedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_defaults" (
    "id" TEXT NOT NULL,
    "cropTypeId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT,
    "farmId" TEXT,
    "fieldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_defaults_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "planting_events" ADD COLUMN     "recipeVersionId" TEXT;

-- CreateIndex
CREATE INDEX "recipes_authorUserId_cropTypeId_idx" ON "recipes"("authorUserId", "cropTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipeId_number_key" ON "recipe_versions"("recipeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_defaults_cropTypeId_userId_farmId_fieldId_key" ON "recipe_defaults"("cropTypeId", "userId", "farmId", "fieldId");

-- AddForeignKey
ALTER TABLE "planting_events" ADD CONSTRAINT "planting_events_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_cropTypeId_fkey" FOREIGN KEY ("cropTypeId") REFERENCES "crop_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_defaults" ADD CONSTRAINT "recipe_defaults_cropTypeId_fkey" FOREIGN KEY ("cropTypeId") REFERENCES "crop_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_defaults" ADD CONSTRAINT "recipe_defaults_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_defaults" ADD CONSTRAINT "recipe_defaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_defaults" ADD CONSTRAINT "recipe_defaults_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_defaults" ADD CONSTRAINT "recipe_defaults_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: each crop_schedules row becomes a Recipe (reusing the
-- schedule row's id) with a single v1.
INSERT INTO "recipes" ("id", "authorUserId", "cropTypeId", "name", "visibility", "createdAt", "updatedAt")
SELECT
    cs."id",
    COALESCE(cs."userId", ct."userId"),
    cs."cropTypeId",
    CASE WHEN cs."userId" IS NULL AND ct."isBuiltIn" THEN 'Calendario base'
         ELSE 'Mi calendario para ' || ct."nameEs" END,
    CASE WHEN cs."userId" IS NULL AND ct."isBuiltIn" THEN 'public' ELSE 'private' END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "crop_schedules" cs
JOIN "crop_types" ct ON ct."id" = cs."cropTypeId";

INSERT INTO "recipe_versions" ("id", "recipeId", "number", "harvestWindowStartDays", "harvestWindowEndDays", "operations", "createdAt")
SELECT
    gen_random_uuid(),
    cs."id",
    1,
    cs."harvestWindowStartDays",
    cs."harvestWindowEndDays",
    cs."operations",
    CURRENT_TIMESTAMP
FROM "crop_schedules" cs;

-- Authored recipes become their author's personal default for the crop.
INSERT INTO "recipe_defaults" ("id", "cropTypeId", "recipeId", "userId", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    cs."cropTypeId",
    cs."id",
    COALESCE(cs."userId", ct."userId"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "crop_schedules" cs
JOIN "crop_types" ct ON ct."id" = cs."cropTypeId"
WHERE COALESCE(cs."userId", ct."userId") IS NOT NULL;

-- DropForeignKey
ALTER TABLE "crop_schedules" DROP CONSTRAINT "crop_schedules_cropTypeId_fkey";

-- DropForeignKey
ALTER TABLE "crop_schedules" DROP CONSTRAINT "crop_schedules_userId_fkey";

-- DropTable
DROP TABLE "crop_schedules";
