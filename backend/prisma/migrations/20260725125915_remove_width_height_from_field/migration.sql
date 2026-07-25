/*
  Warnings:

  - You are about to drop the column `heightFt` on the `fields` table. All the data in the column will be lost.
  - You are about to drop the column `widthFt` on the `fields` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "fields" DROP COLUMN "heightFt",
DROP COLUMN "widthFt";
