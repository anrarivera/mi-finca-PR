-- AlterTable
ALTER TABLE "harvest_yields" ADD COLUMN     "operationId" TEXT;

-- AddForeignKey
ALTER TABLE "harvest_yields" ADD CONSTRAINT "harvest_yields_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
