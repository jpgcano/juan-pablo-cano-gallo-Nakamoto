-- Modulo messaging: canales, membresias, mensajes y sus derivadas.
-- RLS se activa mas adelante, en messaging/050_rls.sql, una vez existen
-- los helpers de actor. Aqui solo se define estructura e integridad.

CREATE TABLE rw_channels (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL,
  name         text        NOT NULL,
  type         text        NOT NULL,
  created_by   uuid        NOT NULL REFERENCES rw_users (id) ON DELETE RESTRICT,
  is_archived  boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rw_channels_slug_uq UNIQUE (slug),
  CONSTRAINT rw_channels_name_length_ck CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT rw_channels_type_ck CHECK (type IN ('public', 'private', 'direct'))
);

COMMENT ON TABLE rw_channels IS 'created_by es RESTRICT: un canal con conversaciones vivas no puede quedar huerfano de autor.';

CREATE TABLE rw_channel_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid        NOT NULL REFERENCES rw_channels (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES rw_users (id) ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'member',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  left_at    timestamptz,

  CONSTRAINT rw_channel_members_channel_user_uq UNIQUE (channel_id, user_id),
  CONSTRAINT rw_channel_members_role_ck CHECK (role IN ('owner', 'member'))
);

COMMENT ON TABLE rw_channel_members IS
  'La membresia sostiene todo el modelo de seguridad: RLS sobre canales y '
  'mensajes se resuelve consultando esta tabla. left_at es baja logica.';

CREATE INDEX rw_channel_members_user_id_idx ON rw_channel_members (user_id);

CREATE TABLE rw_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid        NOT NULL REFERENCES rw_channels (id) ON DELETE CASCADE,
  sender_id      uuid        NOT NULL REFERENCES rw_users (id) ON DELETE RESTRICT,
  reply_to_id    uuid        REFERENCES rw_messages (id) ON DELETE SET NULL,
  body           text        NOT NULL,
  client_msg_id  uuid,
  search_vector  tsvector,
  created_at     timestamptz NOT NULL DEFAULT now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,

  CONSTRAINT rw_messages_body_length_ck CHECK (length(body) BETWEEN 1 AND 4000),
  CONSTRAINT rw_messages_reply_not_self_ck CHECK (reply_to_id IS NULL OR reply_to_id <> id)
);

COMMENT ON TABLE rw_messages IS
  'Borrado exclusivamente logico via deleted_at. rw_app no tiene privilegio '
  'DELETE sobre esta tabla (ver 000_extensions_and_roles.sql): el borrado '
  'fisico esta prohibido tanto por el codigo de la aplicacion como por el motor.';
COMMENT ON COLUMN rw_messages.client_msg_id IS
  'Generado por el cliente antes de enviar. Junto con el indice unico parcial '
  'mas abajo, hace idempotente el reintento de un mensaje en estado failed.';
COMMENT ON COLUMN rw_messages.search_vector IS
  'Mantenido por trigger (messaging/080_triggers.sql). No se escribe a mano.';

-- Un mensaje solo puede responder a otro mensaje del mismo canal. No es
-- expresable como CHECK (los CHECK no pueden consultar otras filas), por
-- eso es un trigger.
CREATE FUNCTION rw_fn_validate_reply_same_channel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_channel_id uuid;
BEGIN
  IF NEW.reply_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT channel_id INTO parent_channel_id
  FROM rw_messages
  WHERE id = NEW.reply_to_id;

  IF parent_channel_id IS NULL THEN
    RAISE EXCEPTION 'rw_messages: el mensaje al que se responde no existe';
  END IF;

  IF parent_channel_id <> NEW.channel_id THEN
    RAISE EXCEPTION 'rw_messages: no se puede responder a un mensaje de otro canal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rw_trg_messages_validate_reply
  BEFORE INSERT OR UPDATE OF reply_to_id, channel_id ON rw_messages
  FOR EACH ROW
  EXECUTE FUNCTION rw_fn_validate_reply_same_channel();

-- Requisito explicito del enunciado: al menos un indice unico parcial.
-- Parcial porque el corpus semilla no trae client_msg_id, y la unicidad
-- solo debe exigirse a los envios que si lo declaran.
CREATE UNIQUE INDEX rw_messages_client_msg_uq
  ON rw_messages (channel_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

-- Respalda la Consulta 1 (historial por keyset) y evita el sort completo
-- que produciria OFFSET, que ademas esta prohibido por el enunciado.
CREATE INDEX rw_messages_channel_keyset_idx
  ON rw_messages (channel_id, created_at DESC, id DESC);

CREATE INDEX rw_messages_sender_id_idx ON rw_messages (sender_id);
CREATE INDEX rw_messages_reply_to_id_idx ON rw_messages (reply_to_id);

CREATE TABLE rw_message_revisions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid        NOT NULL REFERENCES rw_messages (id) ON DELETE CASCADE,
  edited_by      uuid        NOT NULL REFERENCES rw_users (id) ON DELETE RESTRICT,
  previous_body  text        NOT NULL,
  reason         text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rw_message_revisions_reason_ck CHECK (reason IN ('edit', 'delete'))
);

COMMENT ON TABLE rw_message_revisions IS
  'Snapshot del cuerpo anterior. Se escribe dentro de la misma transaccion '
  'que la edicion o el borrado (rw_fn_edit_message / rw_fn_soft_delete_message), '
  'por eso el estado original nunca se pierde, ni ante fallo a medias.';

CREATE INDEX rw_message_revisions_message_id_idx ON rw_message_revisions (message_id);

CREATE TABLE rw_message_reads (
  message_id  uuid        NOT NULL REFERENCES rw_messages (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES rw_users (id) ON DELETE CASCADE,
  read_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (message_id, user_id)
);

COMMENT ON TABLE rw_message_reads IS 'Clave natural compuesta: el hecho que registra es exactamente "este usuario leyo este mensaje".';

CREATE TABLE rw_message_embeddings (
  message_id  uuid        PRIMARY KEY REFERENCES rw_messages (id) ON DELETE CASCADE,
  embedding   vector(1536),
  model       text,
  is_stale    boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rw_message_embeddings_model_required_ck
    CHECK (is_stale OR (embedding IS NOT NULL AND model IS NOT NULL))
);

COMMENT ON TABLE rw_message_embeddings IS
  'Patron outbox (ver messaging/080_triggers.sql): is_stale = true al crear '
  'o editar un mensaje, y un proceso fuera de la transaccion del usuario '
  'calcula el vector. El envio de un mensaje nunca espera a OpenAI.';

CREATE INDEX rw_message_embeddings_pending_idx
  ON rw_message_embeddings (message_id)
  WHERE is_stale;

CREATE INDEX rw_message_embeddings_ann_idx
  ON rw_message_embeddings USING hnsw (embedding vector_cosine_ops);

-- Sin DELETE en ninguna tabla del modulo: ver 000_extensions_and_roles.sql.
GRANT SELECT, INSERT, UPDATE ON rw_channels TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_channel_members TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_messages TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_message_revisions TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_message_reads TO rw_app;
GRANT SELECT, INSERT, UPDATE ON rw_message_embeddings TO rw_app;
