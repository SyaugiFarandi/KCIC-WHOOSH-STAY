import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RESEARCH_CLASSIFICATIONS,
  RESEARCH_PROPERTY_TYPES,
  RESEARCH_SOURCE_TYPES,
} from '@whoosh/shared';
import { prisma } from '../lib/prisma.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (/whoosh_stay_(test|e2e)/.test(databaseUrl)) {
  throw new Error('Impor riset tidak boleh dijalankan terhadap database test/e2e.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Impor riset sintetis/publik tidak boleh dijalankan di mode production.');
}

interface RawSource {
  url: string;
  title: string | null;
  sourceType: string;
  checkedAt: string;
  photoUrl: string | null;
  photoRights: string | null;
  photoTakenAt: string | null;
  notes: string | null;
}

interface RawProperty {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  propertyType: string | null;
  classification: string;
  facilities: string[];
  website: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  sources: RawSource[];
}

interface RawFile {
  locationCode: string;
  locationName: string;
  researchedAt: string;
  stationContext: string;
  properties: RawProperty[];
  missingInfo: string[];
  kcicDataRequests: string[];
}

function assertEnum(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value)) {
    throw new Error(`${label} tidak dikenal: ${value}`);
  }
}

function validateFile(file: RawFile, fileName: string): void {
  if (!file.locationCode || !Array.isArray(file.properties)) {
    throw new Error(`${fileName}: struktur file tidak valid.`);
  }
  for (const property of file.properties) {
    if (!property.name || property.name.length > 200) {
      throw new Error(`${fileName}: nama properti kosong atau >200 karakter.`);
    }
    assertEnum(property.classification, RESEARCH_CLASSIFICATIONS, `${fileName}: classification`);
    if (property.propertyType) {
      assertEnum(property.propertyType, RESEARCH_PROPERTY_TYPES, `${fileName}: propertyType`);
    }
    if (!Array.isArray(property.facilities) || property.facilities.some((f) => typeof f !== 'string')) {
      throw new Error(`${fileName}: facilities harus array string.`);
    }
    for (const source of property.sources ?? []) {
      if (!source.url || source.url.length > 1000) {
        throw new Error(`${fileName}: url sumber kosong atau >1000 karakter.`);
      }
      assertEnum(source.sourceType, RESEARCH_SOURCE_TYPES, `${fileName}: sourceType`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) {
        throw new Error(`${fileName}: checkedAt harus YYYY-MM-DD.`);
      }
    }
  }
}

async function main(): Promise<void> {
  const root = resolve(process.cwd(), '../..');
  const rawDir = resolve(root, 'research', 'raw');
  const fileNames = readdirSync(rawDir).filter((name) => name.endsWith('.json')).sort();
  if (fileNames.length === 0) throw new Error(`Tidak ada file JSON di ${rawDir}.`);

  const files: Array<{ fileName: string; data: RawFile }> = fileNames.map((fileName) => {
    const data = JSON.parse(readFileSync(resolve(rawDir, fileName), 'utf8')) as RawFile;
    validateFile(data, fileName);
    return { fileName, data };
  });

  const locationCodes = [...new Set(files.map((file) => file.data.locationCode))];
  const locations = await prisma.location.findMany({ where: { code: { in: locationCodes } } });
  const locationByCode = new Map(locations.map((location) => [location.code, location]));
  for (const code of locationCodes) {
    if (!locationByCode.has(code)) {
      throw new Error(`Lokasi ${code} tidak ada di master locations; impor dibatalkan.`);
    }
  }

  let inserted = 0;
  let updated = 0;
  let sourceCount = 0;
  const byLocation: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      for (const { fileName, data } of files) {
        const location = locationByCode.get(data.locationCode)!;
        for (const property of data.properties) {
          const existing = await tx.accommodationResearch.findUnique({
            where: { locationId_name: { locationId: location.id, name: property.name } },
          });
          const payload = {
            address: property.address,
            latitude: property.latitude,
            longitude: property.longitude,
            distanceKm: property.distanceKm,
            propertyType: property.propertyType,
            classification: property.classification,
            facilities: property.facilities,
            website: property.website,
            contactName: property.contactName,
            contactPhone: property.contactPhone,
            notes: property.notes,
          };
          let researchId: string;
          if (existing) {
            // Keputusan administrator (status tinjauan, promosi) tidak pernah ditimpa impor ulang.
            await tx.accommodationResearch.update({ where: { id: existing.id }, data: payload });
            researchId = existing.id;
            updated += 1;
          } else {
            const created = await tx.accommodationResearch.create({
              data: { ...payload, locationId: location.id, name: property.name },
            });
            researchId = created.id;
            inserted += 1;
          }

          await tx.researchSource.deleteMany({ where: { researchId } });
          if (property.sources.length > 0) {
            await tx.researchSource.createMany({
              data: property.sources.map((source) => ({
                researchId,
                url: source.url,
                title: source.title,
                sourceType: source.sourceType,
                checkedAt: new Date(`${source.checkedAt}T00:00:00.000Z`),
                photoUrl: source.photoUrl,
                photoRights: source.photoRights,
                photoTakenAt: source.photoTakenAt
                  ? new Date(`${source.photoTakenAt}T00:00:00.000Z`)
                  : null,
                notes: source.notes,
              })),
            });
            sourceCount += property.sources.length;
          }

          await tx.researchEvent.create({
            data: {
              researchId,
              actorUserId: null,
              action: existing ? 'REIMPORTED' : 'IMPORTED',
              note: `Impor hasil riset publik dari ${fileName} (researchedAt ${data.researchedAt}).`,
            },
          });
          byLocation[data.locationCode] = (byLocation[data.locationCode] ?? 0) + 1;
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: 'RESEARCH_IMPORT',
          entityType: 'ACCOMMODATION_RESEARCH',
          afterData: { files: fileNames, inserted, updated, sources: sourceCount, byLocation },
          reason: 'Idempotent import of public accommodation research (research/raw).',
        },
      });
    },
    { timeout: 60_000 },
  );

  console.log(`[research-import] ${inserted} kandidat baru, ${updated} diperbarui, ${sourceCount} sumber.`);
  console.log(`[research-import] distribusi: ${JSON.stringify(byLocation)}`);
  console.log('[research-import] Semua kandidat berstatus PENDING; tidak ada yang otomatis menjadi');
  console.log('[research-import] data operasional KCIC. Promosi hanya melalui tinjauan administrator.');
}

main()
  .catch((error) => {
    console.error('[research-import] gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });