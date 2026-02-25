// ══════════════════════════════════════════════════════════════════════
//  JPG Export — Captura um elemento DOM como imagem JPG
// ══════════════════════════════════════════════════════════════════════

import html2canvas from 'html2canvas';

/**
 * Captura o conteudo de um elemento DOM e faz download como JPG.
 *
 * @param element - O elemento a capturar
 * @param fileName - Nome do arquivo sem extensao
 * @param options - Opcoes opcionais (backgroundColor, scale)
 */
export async function exportElementAsJpg(
  element: HTMLElement,
  fileName: string,
  options?: {
    backgroundColor?: string;
    scale?: number;
  },
): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: options?.backgroundColor || '#ffffff',
    scale: options?.scale || 2,
    useCORS: true,
    logging: false,
  });

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

  const link = document.createElement('a');
  link.download = `${fileName}.jpg`;
  link.href = dataUrl;
  link.click();
}
