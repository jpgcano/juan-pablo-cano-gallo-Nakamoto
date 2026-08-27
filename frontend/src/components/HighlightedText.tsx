const START = '{{HL}}';
const STOP = '{{/HL}}';

/**
 * Renderiza el resultado de ts_headline como texto, nunca como HTML: el
 * backend usa marcadores de texto plano ({{HL}}/{{/HL}}) en vez de
 * <mark>/</mark> justamente para que esto sea seguro (ver
 * PgMessagingRepository.search). El cuerpo del mensaje es contenido de
 * otro usuario - insertarlo con dangerouslySetInnerHTML seria una XSS
 * almacenada si alguien escribiera HTML en un mensaje.
 */
export function HighlightedText({ text }: { text: string }) {
  const parts: Array<{ value: string; highlighted: boolean }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(START, cursor);
    if (start === -1) {
      parts.push({ value: text.slice(cursor), highlighted: false });
      break;
    }
    if (start > cursor) parts.push({ value: text.slice(cursor, start), highlighted: false });

    const stop = text.indexOf(STOP, start + START.length);
    if (stop === -1) {
      parts.push({ value: text.slice(start), highlighted: false });
      break;
    }
    parts.push({ value: text.slice(start + START.length, stop), highlighted: true });
    cursor = stop + STOP.length;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.highlighted ? (
          <mark key={index} className="rounded bg-amber-200 px-0.5">
            {part.value}
          </mark>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}
