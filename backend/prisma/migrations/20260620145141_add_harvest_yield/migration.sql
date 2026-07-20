-- CreateTable
CREATE TABLE "harvest_yields" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "fieldId" TEXT,
    "cropTypeId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "harvestDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "harvest_yields_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "harvest_yields" ADD CONSTRAINT "harvest_yields_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_yields" ADD CONSTRAINT "harvest_yields_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;
