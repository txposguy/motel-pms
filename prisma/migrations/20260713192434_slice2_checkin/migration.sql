-- CreateEnum
CREATE TYPE "RatePlanUnit" AS ENUM ('hourly', 'nightly', 'weekly');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('drivers_license', 'state_id', 'passport', 'other');

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('in_house', 'checked_out', 'walked');

-- CreateEnum
CREATE TYPE "FolioStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "FolioLineType" AS ENUM ('room_charge', 'tax', 'incidental', 'adjustment', 'void');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "registration_card_footer_text" TEXT;

-- CreateTable
CREATE TABLE "rate_plans" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_type_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" "RatePlanUnit" NOT NULL,
    "duration_units" INTEGER NOT NULL,
    "base_amount" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "address_line1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "dob" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "id_type" "IdType",
    "id_number_encrypted" TEXT,
    "id_number_hash" TEXT,
    "id_state" TEXT,
    "id_expiration" TIMESTAMP(3),
    "vehicle_make" TEXT,
    "vehicle_model" TEXT,
    "vehicle_color" TEXT,
    "vehicle_plate" TEXT,
    "vehicle_state" TEXT,
    "dnr_flag" BOOLEAN NOT NULL DEFAULT false,
    "dnr_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stays" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "rate_plan_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_check_out_at" TIMESTAMP(3) NOT NULL,
    "checked_out_at" TIMESTAMP(3),
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "additional_guests" JSONB,
    "status" "StayStatus" NOT NULL DEFAULT 'in_house',
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "tax_exempt_reason" TEXT,
    "tax_exempt_cert_number" TEXT,
    "consecutive_nights_counter" INTEGER NOT NULL DEFAULT 1,
    "checked_in_by_user_id" TEXT NOT NULL,
    "checked_out_by_user_id" TEXT,

    CONSTRAINT "stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folios" (
    "id" TEXT NOT NULL,
    "stay_id" TEXT NOT NULL,
    "status" "FolioStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "folios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folio_lines" (
    "id" TEXT NOT NULL,
    "folio_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "type" "FolioLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "voids_line_id" TEXT,
    "business_date" DATE NOT NULL,

    CONSTRAINT "folio_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_property_id_id_number_hash_idx" ON "guests"("property_id", "id_number_hash");

-- CreateIndex
CREATE UNIQUE INDEX "folios_stay_id_key" ON "folios"("stay_id");

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_rate_plan_id_fkey" FOREIGN KEY ("rate_plan_id") REFERENCES "rate_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_in_by_user_id_fkey" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stays" ADD CONSTRAINT "stays_checked_out_by_user_id_fkey" FOREIGN KEY ("checked_out_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folios" ADD CONSTRAINT "folios_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
