/**
 * Export data as a CSV file download.
 * @param filename - name of the file (without extension)
 * @param headers - column headers
 * @param rows - 2D array of cell values
 * @param options.separator - column separator (default: ',')
 */
export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  options?: { separator?: string },
) {
  const sep = options?.separator ?? ',';

  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(sep) || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    headers.map(escape).join(sep),
    ...rows.map((row) => row.map(escape).join(sep)),
  ];

  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
