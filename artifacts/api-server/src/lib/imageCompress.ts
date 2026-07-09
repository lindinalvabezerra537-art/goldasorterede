import { Jimp } from "jimp";

const MAX_DIMENSION = 300;
const JPEG_QUALITY = 75;

/**
 * Rede de segurança: garante que qualquer foto salva no banco esteja
 * redimensionada (máx 300px) e comprimida (JPEG q75), independente do que
 * o cliente enviou. Mantém a aparência do app igual (fotos já são exibidas
 * em círculos pequenos), só reduz o peso armazenado no Postgres.
 */
export async function compressPhotoBase64(dataUrl: string): Promise<string> {
  try {
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
    return `data:image/jpeg;base64,${outBuffer.toString("base64")}`;
  } catch {
    // Se a imagem não puder ser processada (formato inesperado), mantém o
    // valor original em vez de falhar o cadastro/edição do usuário.
    return dataUrl;
  }
}
