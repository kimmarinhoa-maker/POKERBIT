'use client';

/**
 * Highlights occurrences of `query` inside `text`.
 * Case-insensitive. Returns plain text if query is empty.
 */
export default function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
