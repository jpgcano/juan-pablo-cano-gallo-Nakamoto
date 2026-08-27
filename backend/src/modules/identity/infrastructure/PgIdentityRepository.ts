import type {
  IdentityRepository,
  Queryable,
  RefreshTokenRecord,
  UserProfile,
  UserRecord,
} from '../domain/ports.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  job_title: string;
  locale: 'es' | 'en';
  is_active: boolean;
}

interface ProfileRow {
  id: string;
  full_name: string;
  job_title: string;
  locale: 'es' | 'en';
  is_active: boolean;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: string;
  revoked_at: string | null;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    jobTitle: row.job_title,
    locale: row.locale,
    isActive: row.is_active,
  };
}

function toProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    locale: row.locale,
    isActive: row.is_active,
  };
}

function toRefreshToken(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

/**
 * Unico lugar del backend que escribe SQL contra rw_users y
 * rw_refresh_tokens. Los casos de uso solo conocen IdentityRepository.
 */
export class PgIdentityRepository implements IdentityRepository {
  async findByEmail(client: Queryable, email: string): Promise<UserRecord | null> {
    const { rows } = await client.query<UserRow>(
      `SELECT id, email, password_hash, full_name, job_title, locale, is_active
       FROM rw_users WHERE email = $1`,
      [email],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findProfileById(client: Queryable, id: string): Promise<UserProfile | null> {
    const { rows } = await client.query<ProfileRow>(
      `SELECT id, full_name, job_title, locale, is_active FROM rw_v_identity_profiles WHERE id = $1`,
      [id],
    );
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async insertRefreshToken(
    client: Queryable,
    input: { userId: string; tokenHash: string; familyId: string; rotatedFrom: string | null; expiresAt: Date },
  ): Promise<RefreshTokenRecord> {
    const { rows } = await client.query<RefreshTokenRow>(
      `INSERT INTO rw_refresh_tokens (user_id, token_hash, family_id, rotated_from, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, family_id, expires_at, revoked_at`,
      [input.userId, input.tokenHash, input.familyId, input.rotatedFrom, input.expiresAt.toISOString()],
    );
    const row = rows[0];
    if (!row) throw new Error('rw_refresh_tokens: insercion sin fila devuelta');
    return toRefreshToken(row);
  }

  async findRefreshTokenByHash(client: Queryable, tokenHash: string): Promise<RefreshTokenRecord | null> {
    const { rows } = await client.query<RefreshTokenRow>(
      `SELECT id, user_id, family_id, expires_at, revoked_at FROM rw_refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ? toRefreshToken(rows[0]) : null;
  }

  async revokeRefreshToken(client: Queryable, id: string): Promise<void> {
    await client.query(`UPDATE rw_refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
  }

  async revokeRefreshTokenFamily(client: Queryable, familyId: string): Promise<void> {
    await client.query(
      `UPDATE rw_refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
  }

  async updateProfile(
    client: Queryable,
    input: { userId: string; fullName: string | null; jobTitle: string | null; locale: string | null },
  ): Promise<void> {
    await client.query('CALL rw_sp_update_user($1, $2, $3, $4)', [
      input.userId,
      input.fullName,
      input.jobTitle,
      input.locale,
    ]);
  }

  async deactivate(client: Queryable, userId: string): Promise<void> {
    await client.query('CALL rw_sp_deactivate_user($1)', [userId]);
  }
}
