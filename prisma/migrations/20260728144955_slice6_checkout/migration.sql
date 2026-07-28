-- CreateEnum
CREATE TYPE "HousekeepingTaskType" AS ENUM ('departure_clean', 'stayover', 'deep_clean', 'inspection');

-- CreateEnum
CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('pending', 'in_progress', 'done', 'inspected');

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "type" "HousekeepingTaskType" NOT NULL,
    "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'pending',
    "assigned_to_user_id" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
