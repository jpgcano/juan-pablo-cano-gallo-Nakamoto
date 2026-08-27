/**
 * Cursor opaco para paginacion por keyset (nunca OFFSET, ver enunciado).
 * El cliente no necesita saber que adentro hay un timestamp y un uuid,
 * solo que el cursor que recibio en una pagina es lo que debe reenviar
 * para pedir la siguiente.
 */
export interface KeysetCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed.createdAt === 'string' &&
      !Number.isNaN(Date.parse(parsed.createdAt)) &&
      typeof parsed.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
    ) {
      return parsed as KeysetCursor;
    }
    return null;
  } catch {
    return null;
  }
}
