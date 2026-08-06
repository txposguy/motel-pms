-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refunds_payment_id" TEXT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunds_payment_id_fkey" FOREIGN KEY ("refunds_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
