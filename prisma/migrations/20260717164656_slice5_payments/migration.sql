-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'check', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'declined', 'voided', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('valor', 'dejavoo', 'none');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "folio_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount_requested" DECIMAL(10,2) NOT NULL,
    "amount_settled" DECIMAL(10,2),
    "cash_discount_fee" DECIMAL(10,2),
    "status" "PaymentStatus" NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'none',
    "provider_transaction_id" TEXT,
    "provider_rrn" TEXT,
    "auth_code" TEXT,
    "masked_pan" TEXT,
    "card_brand" TEXT,
    "entry_mode" TEXT,
    "token" TEXT,
    "is_preauth" BOOLEAN NOT NULL DEFAULT false,
    "preauth_captured_at" TIMESTAMP(3),
    "raw_response" JSONB,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_folio_id_fkey" FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
