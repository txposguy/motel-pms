-- CreateEnum
CREATE TYPE "BusinessDateStatus" AS ENUM ('open', 'closed');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "retroactive_credit_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "business_dates" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "BusinessDateStatus" NOT NULL DEFAULT 'closed',
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_user_id" TEXT NOT NULL,
    "rooms_sold" INTEGER NOT NULL DEFAULT 0,
    "room_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_collected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payments_cash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payments_card" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "occupancy_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "adr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "revpar" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "business_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_dates_property_id_business_date_key" ON "business_dates"("property_id", "business_date");

-- AddForeignKey
ALTER TABLE "business_dates" ADD CONSTRAINT "business_dates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_dates" ADD CONSTRAINT "business_dates_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
