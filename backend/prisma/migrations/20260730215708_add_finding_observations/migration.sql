-- CreateTable
CREATE TABLE "finding_observations" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "severity" INTEGER NOT NULL,
    "rowIds" JSONB NOT NULL DEFAULT '[]',
    "plantIds" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_observations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "finding_observations" ADD CONSTRAINT "finding_observations_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing finding becomes its own first observation, so
-- the invariant "a finding has >= 1 observation" holds for old rows too.
INSERT INTO "finding_observations" ("id", "findingId", "date", "severity", "rowIds", "plantIds", "notes", "createdAt")
SELECT gen_random_uuid()::text, f."id", f."foundDate", f."severity", f."rowIds", f."plantIds", f."notes", f."createdAt"
FROM "findings" f;
