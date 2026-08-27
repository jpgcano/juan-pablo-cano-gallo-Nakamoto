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
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed as KeysetCursor;
    }
    return null;
  } catch {
    return null;
  }
}
