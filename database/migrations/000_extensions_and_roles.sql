-- Extensiones y rol de aplicacion.
--
-- Este archivo corre una sola vez con el rol propietario de la base (el que
-- ejecuta las migraciones). Todo lo que se crea despues de aqui pertenece a
-- ese propietario, y el propietario de una tabla omite Row Level Security
-- por diseno de PostgreSQL. La aplicacion NUNCA se conecta como propietaria:
-- se conecta como rw_app, que si queda sujeta a las politicas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- correo case-insensitive
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector, para los embeddings del copiloto

-- Rol de aplicacion. Se crea de forma idempotente porque CREATE ROLE no
-- admite IF NOT EXISTS, y esta migracion debe poder re-ejecutarse tras un
-- "make reset" sin fallar (DROP SCHEMA no elimina roles: son de nivel cluster).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'rw_app') THEN
    CREATE ROLE rw_app
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS
      PASSWORD '__RW_APP_PASSWORD__';
  ELSE
    ALTER ROLE rw_app WITH PASSWORD '__RW_APP_PASSWORD__';
  END IF;
END
$$;

COMMENT ON ROLE rw_app IS
  'Rol con el que se conecta el backend. NOBYPASSRLS a proposito: '
  'ninguna consulta que ejecute puede saltarse las politicas de seguridad, '
  'ni siquiera si el codigo de la aplicacion tiene un error.';

GRANT CONNECT ON DATABASE bd_juan_cano_nakamoto TO rw_app;
GRANT USAGE ON SCHEMA public TO rw_app;

-- rw_app nunca recibe DELETE. Es una decision deliberada, no un olvido:
-- el enunciado prohibe el borrado fisico de mensajes, y en lugar de confiar
-- esa regla unicamente al codigo de la aplicacion, se retira la capacidad
-- de borrar a nivel de motor. Ni siquiera un bug en el backend podria
-- ejecutar un DELETE exitoso contra estas tablas.

-- Rol separado para el worker de embeddings (patron outbox, ver
-- messaging/020_tables.sql y DECISIONS.md D9). Corre fuera de la transaccion
-- de cualquier usuario, procesando en lote todo lo pendiente sin importar de
-- quien es cada mensaje: no hay un actor de negocio que fijarle, por eso no
-- tiene sentido pedirle app.current_user_id como a rw_app.
--
-- Tiene BYPASSRLS a proposito, pero el contenimiento no depende de eso: los
-- GRANT de columna en messaging/045_embedding_worker_grants.sql le dan
-- SELECT unicamente sobre (id, body) de rw_messages. Nunca recibe
-- sender_id ni channel_id, y no tiene ningun privilegio sobre rw_channels,
-- rw_channel_members, rw_users ni las tablas de copilot. Aunque BYPASSRLS
-- lo eximiera de las politicas, no puede filtrar lo que nunca puede leer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'rw_worker') THEN
    CREATE ROLE rw_worker
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      BYPASSRLS
      PASSWORD '__RW_WORKER_PASSWORD__';
  ELSE
    ALTER ROLE rw_worker WITH PASSWORD '__RW_WORKER_PASSWORD__';
  END IF;
END
$$;

COMMENT ON ROLE rw_worker IS
  'Conexion del worker de embeddings. BYPASSRLS porque no actua en nombre '
  'de un usuario, pero el contenimiento real viene de los GRANT de columna: '
  'solo ve (id, body) de los mensajes, nunca a quien pertenecen.';

GRANT CONNECT ON DATABASE bd_juan_cano_nakamoto TO rw_worker;
GRANT USAGE ON SCHEMA public TO rw_worker;
