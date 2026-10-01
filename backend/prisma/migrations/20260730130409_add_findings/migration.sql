-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "pestId" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "foundDate" DATE NOT NULL,
    "notes" TEXT,
    "rowIds" JSONB NOT NULL DEFAULT '[]',
    "plantIds" JSONB NOT NULL DEFAULT '[]',
    "treatmentRecommendedOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_treatmentRecommendedOperationId_fkey" FOREIGN KEY ("treatmentRecommendedOperationId") REFERENCES "recommended_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
