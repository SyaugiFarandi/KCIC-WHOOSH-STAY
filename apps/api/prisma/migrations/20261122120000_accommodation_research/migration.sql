-- Accommodation research layer: candidates, source references, review history.
-- Research data never becomes operational KCIC inventory without explicit admin approval.

CREATE TABLE "accommodation_research" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "distance_km" DECIMAL(6,2),
    "property_type" VARCHAR(60),
    "classification" VARCHAR(40) NOT NULL DEFAULT 'RESEARCH_CANDIDATE',
    "verification_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "facilities" JSONB,
    "website" VARCHAR(500),
    "contact_name" VARCHAR(150),
    "contact_phone" VARCHAR(60),
    "notes" TEXT,
    "promoted_dormitory_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_research_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "research_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_id" UUID NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "title" VARCHAR(300),
    "source_type" VARCHAR(40) NOT NULL,
    "checked_at" DATE NOT NULL,
    "photo_url" VARCHAR(1000),
    "photo_rights" VARCHAR(200),
    "photo_taken_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "research_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "research_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "from_status" VARCHAR(40),
    "to_status" VARCHAR(40),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accommodation_research_location_id_name_key" ON "accommodation_research"("location_id", "name");
CREATE INDEX "accommodation_research_classification_idx" ON "accommodation_research"("classification");
CREATE INDEX "accommodation_research_verification_status_idx" ON "accommodation_research"("verification_status");
CREATE INDEX "accommodation_research_promoted_dormitory_id_idx" ON "accommodation_research"("promoted_dormitory_id");
CREATE INDEX "accommodation_research_reviewed_by_idx" ON "accommodation_research"("reviewed_by");
CREATE INDEX "research_sources_research_id_idx" ON "research_sources"("research_id");
CREATE INDEX "research_events_research_id_created_at_idx" ON "research_events"("research_id", "created_at" DESC);
CREATE INDEX "research_events_actor_user_id_idx" ON "research_events"("actor_user_id");

ALTER TABLE "accommodation_research" ADD CONSTRAINT "accommodation_research_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accommodation_research" ADD CONSTRAINT "accommodation_research_promoted_dormitory_id_fkey" FOREIGN KEY ("promoted_dormitory_id") REFERENCES "dormitories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accommodation_research" ADD CONSTRAINT "accommodation_research_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "accommodation_research"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_research_id_fkey" FOREIGN KEY ("research_id") REFERENCES "accommodation_research"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Additive RBAC: research.read for managers/admins, research.manage for system admin only.
INSERT INTO "permissions" ("id", "code", "module", "action")
VALUES
  (gen_random_uuid(), 'research.read', 'research', 'read'),
  (gen_random_uuid(), 'research.manage', 'research', 'manage')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('research.read', 'research.manage')
WHERE r."code" = 'SYSTEM_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'research.read'
WHERE r."code" IN ('DORMITORY_MANAGER', 'DORMITORY_ADMIN')
ON CONFLICT DO NOTHING;