/**
 * El access token vive en memoria, nunca en localStorage (evita que un XSS
 * pueda robarlo leyendo el almacenamiento). Se pierde al recargar la
 * pagina a proposito: AuthProvider lo recupera llamando /auth/refresh, que
 * usa la cookie httpOnly - el mismo camino que usa un token expirado.
 */
type Listener = (token: string | null) => void;

let currentToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return currentToken;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
  listeners.forEach((listener) => listener(token));
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
