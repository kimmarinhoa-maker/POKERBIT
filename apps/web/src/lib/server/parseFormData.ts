// ══════════════════════════════════════════════════════════════════════
//  parseFormData — File upload helper replacing multer
// ══════════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';

export interface ParsedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export async function parseFileUpload(
  req: NextRequest,
  fieldName: string,
  options?: {
    maxSize?: number;
    allowedExtensions?: string[];
  },
): Promise<{ file: ParsedFile | null; fields: Record<string, string> }> {
  const formData = await req.formData();
  const fields: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }

  const fileEntry = formData.get(fieldName);
  if (!fileEntry || !(fileEntry instanceof File)) {
    return { file: null, fields };
  }

  const maxSize = options?.maxSize ?? 10 * 1024 * 1024;
  if (fileEntry.size > maxSize) {
    throw new Error(`Arquivo excede o tamanho maximo de ${Math.round(maxSize / 1024 / 1024)}MB`);
  }

  if (options?.allowedExtensions?.length) {
    const ext = fileEntry.name.split('.').pop()?.toLowerCase();
    if (!ext || !options.allowedExtensions.includes(ext)) {
      throw new Error('Tipo de arquivo nao permitido');
    }
  }

  const arrayBuffer = await fileEntry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    file: {
      buffer,
      originalname: fileEntry.name,
      mimetype: fileEntry.type,
      size: fileEntry.size,
    },
    fields,
  };
}
