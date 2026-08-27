-- Modulo identity: usuarios y sesiones.
--
-- Nota sobre RLS: estas dos tablas NO tienen Row Level Security activa.
-- No es un descuido: identity es quien establece la identidad que todo lo
-- demas usa para fijar el actor, y el login/refresh ocurren ANTES de que
-- exista un actor que declarar (el actor se determina leyendo estas tablas).
-- Exigirles un actor previo crearia una dependencia circular. La proteccion
-- aqui viene de otro lado: password_hash nunca sale del modulo (la vista
-- publicada rw_v_identity_profiles no la expone), y token_hash guarda un
-- hash, nunca el token en claro.

CREATE TABLE rw_users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext      NOT NULL,
  password_hash  text        NOT NULL,
  full_name      text        NOT NULL,
  job_title      text        NOT NULL,
  locale         text        NOT NULL DEFAULT 'es',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rw_users_email_uq UNIQUE (email),
  CONSTRAINT rw_users_email_format_ck CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT rw_users_full_name_length_ck CHECK (length(trim(full_name)) BETWEEN 1 AND 160),
  CONSTRAINT rw_users_job_title_length_ck CHECK (length(trim(job_title)) BETWEEN 1 AND 160),
  CONSTRAINT rw_users_locale_ck CHECK (locale IN ('es', 'en'))
);

COMMENT ON TABLE rw_users IS 'Colaboradores de Riwi. job_title alimenta el contexto que el copiloto construye del actor.';
COMMENT ON COLUMN rw_users.password_hash IS 'argon2id. Nunca se expone fuera de este modulo, ni siquiera por la vista publicada.';

-- Mantiene updated_at sin depender de que cada UPDATE lo declare a mano.
CREATE FUNCTION rw_fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rw_trg_users_touch_updated_at
  BEFORE UPDATE ON rw_users
  FOR EACH ROW
  EXECUTE FUNCTION rw_fn_touch_updated_at();

CREATE TABLE rw_refresh_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES rw_users (id) ON DELETE CASCADE,
  token_hash    text        NOT NULL,
  family_id     uuid        NOT NULL,
  rotated_from  uuid        REFERENCES rw_refresh_tokens (id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rw_refresh_tokens_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT rw_refresh_tokens_expires_after_created_ck CHECK (expires_at > created_at)
);

COMMENT ON TABLE rw_refresh_tokens IS
  'Cadena de rotacion de refresh tokens. family_id agrupa una cadena completa: '
  'si llega un token ya revocado, se revoca la familia entera (deteccion de reuso).';
COMMENT ON COLUMN rw_refresh_tokens.token_hash IS 'sha256 del token. El token en claro nunca se persiste.';

CREATE INDEX rw_refresh_tokens_user_id_idx ON rw_refresh_tokens (user_id);
CREATE INDEX rw_refresh_tokens_family_id_idx ON rw_refresh_tokens (family_id);

-- Sin DELETE: ver 000_extensions_and_roles.sql. rw_app puede leer, crear
-- sesiones e insertar usuarios (lo hace el seed, no la API), y actualizar
-- (revocar tokens, editar perfil, desactivar usuario).
GRANT SELECT, INSERT, UPDATE ON rw_users TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_refresh_tokens TO rw_app;
