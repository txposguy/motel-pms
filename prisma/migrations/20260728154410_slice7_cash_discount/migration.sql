-- CreateEnum
CREATE TYPE "CashDiscountMode" AS ENUM ('off', 'terminal', 'host');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "cash_discount_mode" "CashDiscountMode" NOT NULL DEFAULT 'off',
ADD COLUMN     "cash_discount_percent" DECIMAL(5,3);
