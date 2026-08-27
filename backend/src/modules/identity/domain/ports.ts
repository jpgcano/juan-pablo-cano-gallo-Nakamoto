/**
 * Forma minima que necesita un cliente de base de datos, sin importar el
 * driver. Se define aqui (y no se importa PoolClient de 'pg') para que
 * domain/ y application/ sigan sin saber que existe Postgres: solo conocen
 * "algo que puede correr una consulta dentro de la transaccion vigente".
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type Locale = 'es' | 'en';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  jobTitle: string;
  locale: Locale;
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  fullName: string;
  jobTitle: string;
  locale: Locale;
  isActive: boolean;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface IdentityRepository {
  findByEmail(client: Queryable, email: string): Promise<UserRecord | null>;
  findProfileById(client: Queryable, id: string): Promise<UserProfile | null>;
  findProfilesByIds(client: Queryable, ids: string[]): Promise<UserProfile[]>;

  insertRefreshToken(
    client: Queryable,
    input: { userId: string; tokenHash: string; familyId: string; rotatedFrom: string | null; expiresAt: Date },
  ): Promise<RefreshTokenRecord>;
  findRefreshTokenByHash(client: Queryable, tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(client: Queryable, id: string): Promise<void>;
  revokeRefreshTokenFamily(client: Queryable, familyId: string): Promise<void>;

  updateProfile(
    client: Queryable,
    input: { userId: string; fullName: string | null; jobTitle: string | null; locale: Locale | null },
  ): Promise<void>;
  deactivate(client: Queryable, userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface AccessTokenPayload {
  userId: string;
}

export interface TokenService {
  signAccessToken(userId: string): string;
  verifyAccessToken(token: string): AccessTokenPayload;
  /** Valor en claro; solo se persiste su hash (ver IdentityRepository.insertRefreshToken). */
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
}
