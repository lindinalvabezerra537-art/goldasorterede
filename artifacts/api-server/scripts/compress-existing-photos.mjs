// Recomprime as fotos já salvas no banco (coluna users.foto_base64), sem
// mudar como o app exibe as imagens — só reduz o peso armazenado no Postgres
// (Neon), redimensionando para no máx. 300px e recodificando em JPEG q75.
//
// Uso: copie este arquivo para lib/db/ e rode `node compress-existing-photos.mjs`
// de dentro dessa pasta (ela tem `pg` disponível nos node_modules).

import pg from "pg";
import { Jimp } from "jimp";

const connectionString = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("EXTERNAL_DATABASE_URL / DATABASE_URL não configurado.");
  process.exit(1);
}

const MAX_DIMENSION = 300;
const JPEG_QUALITY = 75;

async function compress(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  const base64 = match ? match[2] : dataUrl;
  const buffer = Buffer.from(base64, "base64");
  const image = await Jimp.read(buffer);
  const { width, height } = image.bitmap;
  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
  if (scale < 1) {
    image.resize({ w: Math.round(width * scale), h: Math.round(height * scale) });
  }
  const outBuffer = await image.getBuffer("image/jpeg", { quality: JPEG_QUALITY });
  return { dataUrl: `data:image/jpeg;base64,${outBuffer.toString("base64")}`, originalBytes: buffer.length, newBytes: outBuffer.length };
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, foto_base64 FROM users WHERE foto_base64 IS NOT NULL AND foto_base64 <> ''`
  );

  console.log(`Encontradas ${rows.length} fotos para verificar.`);

  let processed = 0;
  let skipped = 0;
  let totalBefore = 0;
  let totalAfter = 0;

  for (const row of rows) {
    try {
      const { dataUrl, originalBytes, newBytes } = await compress(row.foto_base64);
      totalBefore += originalBytes;
      // Só grava se realmente ficou menor (evita regravar fotos já pequenas/comprimidas).
      if (newBytes < originalBytes) {
        await client.query(`UPDATE users SET foto_base64 = $1 WHERE id = $2`, [dataUrl, row.id]);
        totalAfter += newBytes;
        processed++;
      } else {
        totalAfter += originalBytes;
        skipped++;
      }
    } catch (err) {
      console.error(`Falha ao processar usuário ${row.id}:`, err.message);
      skipped++;
    }
  }

  console.log(`Concluído. Recomprimidas: ${processed}, ignoradas (já pequenas ou erro): ${skipped}.`);
  console.log(`Tamanho total antes: ${(totalBefore / 1024 / 1024).toFixed(2)} MB, depois: ${(totalAfter / 1024 / 1024).toFixed(2)} MB.`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
