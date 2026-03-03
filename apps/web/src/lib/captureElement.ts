// ══════════════════════════════════════════════════════════════════════
//  captureElement — Consolidated html2canvas helper
// ══════════════════════════════════════════════════════════════════════

export async function captureElement(
  element: HTMLElement | null,
): Promise<HTMLCanvasElement | null> {
  if (!element) return null;
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(element, {
    backgroundColor: '#0f0f13',
    scale: 2,
    useCORS: true,
    logging: false,
  });
}
