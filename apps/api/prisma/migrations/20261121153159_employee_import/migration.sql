-- CreateTable
CREATE TABLE "employee_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PREVIEWED',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "valid_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "inserted_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "uploaded_by" UUID,
    "committed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "employee_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_import_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "employee_id" UUID,

    CONSTRAINT "employee_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_import_batches_status_created_at_idx" ON "employee_import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "employee_import_rows_batch_id_idx" ON "employee_import_rows"("batch_id");

-- AddForeignKey
ALTER TABLE "employee_import_rows" ADD CONSTRAINT "employee_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "employee_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
