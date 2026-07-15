-- CreateEnum
CREATE TYPE "TaxAppliesTo" AS ENUM ('room_charge', 'incidental');

-- AlterTable
ALTER TABLE "folio_lines" ADD COLUMN     "tax_rule_id" TEXT;

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_percent" DECIMAL(5,3) NOT NULL,
    "applies_to" "TaxAppliesTo" NOT NULL,
    "exempt_after_consecutive_nights" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_tax_rule_id_fkey" FOREIGN KEY ("tax_rule_id") REFERENCES "tax_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
