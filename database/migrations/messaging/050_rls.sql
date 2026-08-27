-- Row Level Security del modulo messaging.
--
-- Regla general de lectura: un canal es visible si es publico o si el
-- actor es miembro. Todo lo que cuelga de un canal (miembros, mensajes,
-- revisiones, lecturas, embeddings) hereda esa misma regla via
-- rw_is_channel_member(). No hay excepciones por ruta ni por endpoint:
-- la politica se evalua siempre, la ejecute quien la ejecute.

ALTER TABLE rw_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_channels_select ON rw_channels
  FOR SELECT
  USING (type = 'public' OR rw_is_channel_member(id, rw_current_user_id()));

CREATE POLICY rw_channels_insert ON rw_channels
  FOR INSERT
  WITH CHECK (created_by = rw_current_user_id());

CREATE POLICY rw_channels_update ON rw_channels
  FOR UPDATE
  USING (rw_is_channel_member(id, rw_current_user_id()))
  WITH CHECK (rw_is_channel_member(id, rw_current_user_id()));

ALTER TABLE rw_channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_channel_members_select ON rw_channel_members
  FOR SELECT
  USING (rw_is_channel_member(channel_id, rw_current_user_id()));

-- Un usuario puede unirse a si mismo, o un miembro existente puede sumar
-- a alguien mas (invitar). No distingue el rol owner/member del invitador:
-- es una simplificacion deliberada del alcance de esta prueba, documentada
-- en DECISIONS.md.
CREATE POLICY rw_channel_members_insert ON rw_channel_members
  FOR INSERT
  WITH CHECK (
    user_id = rw_current_user_id()
    OR rw_is_channel_member(channel_id, rw_current_user_id())
  );

CREATE POLICY rw_channel_members_update ON rw_channel_members
  FOR UPDATE
  USING (rw_is_channel_member(channel_id, rw_current_user_id()))
  WITH CHECK (rw_is_channel_member(channel_id, rw_current_user_id()));

ALTER TABLE rw_messages ENABLE ROW LEVEL SECURITY;

-- Los mensajes con deleted_at IS NOT NULL siguen siendo visibles para los
-- miembros: RLS decide quien puede ver la fila, no si esta borrada. La
-- capa de aplicacion decide como renderizar un mensaje borrado.
CREATE POLICY rw_messages_select ON rw_messages
  FOR SELECT
  USING (rw_is_channel_member(channel_id, rw_current_user_id()));

-- Defensa en profundidad con rw_fn_send_message (070_functions.sql): la
-- funcion ya valida membresia antes de insertar, y este WITH CHECK es el
-- respaldo si esa validacion tuviera un error. Los dos deben coincidir.
CREATE POLICY rw_messages_insert ON rw_messages
  FOR INSERT
  WITH CHECK (
    sender_id = rw_current_user_id()
    AND rw_is_channel_member(channel_id, rw_current_user_id())
  );

-- Solo el autor edita o borra (logicamente) su propio mensaje.
CREATE POLICY rw_messages_update ON rw_messages
  FOR UPDATE
  USING (sender_id = rw_current_user_id())
  WITH CHECK (
    sender_id = rw_current_user_id()
    AND rw_is_channel_member(channel_id, rw_current_user_id())
  );

ALTER TABLE rw_message_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_message_revisions_select ON rw_message_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );

CREATE POLICY rw_message_revisions_insert ON rw_message_revisions
  FOR INSERT
  WITH CHECK (edited_by = rw_current_user_id());

ALTER TABLE rw_message_reads ENABLE ROW LEVEL SECURITY;

-- Los acuses de lectura son visibles para cualquier miembro del canal, no
-- solo para quien leyo: es lo que permite mostrar "visto por" al remitente.
CREATE POLICY rw_message_reads_select ON rw_message_reads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );

CREATE POLICY rw_message_reads_insert ON rw_message_reads
  FOR INSERT
  WITH CHECK (
    user_id = rw_current_user_id()
    AND EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );

-- Permite marcar el mismo mensaje como leido mas de una vez (upsert de
-- read_at) sin abrir la puerta a que alguien marque la lectura de otro.
CREATE POLICY rw_message_reads_update ON rw_message_reads
  FOR UPDATE
  USING (user_id = rw_current_user_id())
  WITH CHECK (user_id = rw_current_user_id());

ALTER TABLE rw_message_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_message_embeddings_select ON rw_message_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );

-- La fila nace por trigger cuando rw_app inserta el mensaje (mismo actor,
-- misma transaccion): por eso el WITH CHECK exige la misma membresia que
-- ya se exigio para insertar el mensaje.
CREATE POLICY rw_message_embeddings_insert ON rw_message_embeddings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );

-- rw_app tambien puede marcar is_stale = true al editar (mismo trigger).
-- El UPDATE que escribe el vector calculado lo hace rw_worker, que tiene
-- BYPASSRLS y por lo tanto no necesita ni evalua esta politica.
CREATE POLICY rw_message_embeddings_update ON rw_message_embeddings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rw_messages m
      WHERE m.id = message_id
        AND rw_is_channel_member(m.channel_id, rw_current_user_id())
    )
  );
