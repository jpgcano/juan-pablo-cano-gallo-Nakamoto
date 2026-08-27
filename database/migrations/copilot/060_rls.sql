-- Row Level Security del modulo copilot.
-- El historial de consultas es dato personal: cada usuario ve unicamente
-- sus propias preguntas, respuestas y citas. No hay vista "de equipo" sobre
-- el historial de otro, ni siquiera para un mismo canal compartido.

ALTER TABLE rw_copilot_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_copilot_queries_select ON rw_copilot_queries
  FOR SELECT
  USING (user_id = rw_current_user_id());

CREATE POLICY rw_copilot_queries_insert ON rw_copilot_queries
  FOR INSERT
  WITH CHECK (user_id = rw_current_user_id());

ALTER TABLE rw_copilot_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY rw_copilot_citations_select ON rw_copilot_citations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rw_copilot_queries q
      WHERE q.id = query_id AND q.user_id = rw_current_user_id()
    )
  );

CREATE POLICY rw_copilot_citations_insert ON rw_copilot_citations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rw_copilot_queries q
      WHERE q.id = query_id AND q.user_id = rw_current_user_id()
    )
  );
