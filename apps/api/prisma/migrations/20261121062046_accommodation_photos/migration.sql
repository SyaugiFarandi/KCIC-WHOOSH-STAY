-- CreateEnum
CREATE TYPE "accommodation_photo_category" AS ENUM ('BEDROOM', 'BED', 'BATHROOM', 'WARDROBE', 'DESK', 'FACILITY');

-- CreateTable
CREATE TABLE "accommodation_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dormitory_id" UUID NOT NULL,
    "room_id" UUID,
    "category" "accommodation_photo_category" NOT NULL DEFAULT 'BEDROOM',
    "caption" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "object_key" VARCHAR(500) NOT NULL,
    "thumbnail_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL DEFAULT 'image/webp',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accommodation_photos_dormitory_id_sort_order_idx" ON "accommodation_photos"("dormitory_id", "sort_order");

-- CreateIndex
CREATE INDEX "accommodation_photos_room_id_sort_order_idx" ON "accommodation_photos"("room_id", "sort_order");

-- CreateIndex
CREATE INDEX "accommodation_photos_dormitory_id_is_cover_idx" ON "accommodation_photos"("dormitory_id", "is_cover");

-- AddForeignKey
ALTER TABLE "accommodation_photos" ADD CONSTRAINT "accommodation_photos_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_photos" ADD CONSTRAINT "accommodation_photos_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_photos" ADD CONSTRAINT "accommodation_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
