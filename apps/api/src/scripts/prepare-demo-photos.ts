import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const SOURCE_DIR = resolve(process.cwd(), 'prisma/demo-photos/source');
const OUTPUT_DIR = resolve(process.cwd(), 'prisma/demo-photos/web');

async function main(): Promise<void> {
  if (!existsSync(SOURCE_DIR)) {
    console.log('[photos] no source folder found, skipping');
    return;
  }
  const dormitories = readdirSync(SOURCE_DIR, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  for (const dormitory of dormitories) {
    const dormitoryDir = join(SOURCE_DIR, dormitory.name);
    const outputDir = join(OUTPUT_DIR, dormitory.name);
    mkdirSync(outputDir, { recursive: true });
    const scenes = readdirSync(dormitoryDir).filter((file) => file.endsWith('.png'));
    for (const scene of scenes) {
      const name = scene.replace(/\.png$/, '');
      const source = join(dormitoryDir, scene);
      await sharp(source)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(join(outputDir, `${name}.webp`));
      await sharp(source)
        .rotate()
        .resize({ width: 640, height: 480, fit: 'cover' })
        .webp({ quality: 74 })
        .toFile(join(outputDir, `${name}-thumb.webp`));
      console.log(`[photos] ${dormitory.name}/${name}`);
    }
  }
}

main().catch((error) => {
  console.error('[photos] failed', error);
  process.exitCode = 1;
});
