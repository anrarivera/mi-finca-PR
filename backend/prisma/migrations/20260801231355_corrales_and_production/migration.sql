-- AlterTable
ALTER TABLE "fields" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'crops';

-- AlterTable
ALTER TABLE "harvest_yields" ADD COLUMN     "livestockUnitId" TEXT,
ADD COLUMN     "productId" TEXT,
ALTER COLUMN "cropTypeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "livestock_units" ADD COLUMN     "fieldId" TEXT;

-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "countDelta" INTEGER,
ADD COLUMN     "countReason" TEXT;

-- AddForeignKey
ALTER TABLE "harvest_yields" ADD CONSTRAINT "harvest_yields_livestockUnitId_fkey" FOREIGN KEY ("livestockUnitId") REFERENCES "livestock_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livestock_units" ADD CONSTRAINT "livestock_units_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;
