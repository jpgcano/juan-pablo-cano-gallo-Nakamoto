-- Modulo copilot: historial de consultas al copiloto y sus citas.
-- No contiene mensajes ni embeddings: esos son propiedad de messaging y se
-- consumen exclusivamente a traves de los contratos publicados en
-- 900_contracts.sql (rw_v_copilot_corpus, rw_fn_copilot_context).

CREATE TABLE rw_copilot_queries (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES rw_users (id) ON DELETE CASCADE,
  question        text          NOT NULL,
  answer          text          NOT NULL,
  outcome         text          NOT NULL,
  prompt_version  text          NOT NULL,
  tokens_in       integer       NOT NULL,
  tokens_out      integer       NOT NULL,
  cost_usd        numeric(10,6) NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT rw_copilot_queries_outcome_ck CHECK (outcome IN ('answered', 'no_context', 'out_of_scope')),
  CONSTRAINT rw_copilot_queries_tokens_in_ck CHECK (tokens_in >= 0),
  CONSTRAINT rw_copilot_queries_tokens_out_ck CHECK (tokens_out >= 0),
  CONSTRAINT rw_copilot_queries_cost_ck CHECK (cost_usd >= 0)
);

COMMENT ON TABLE rw_copilot_queries IS
  'outcome distingue por que no se respondio: no_context (sin resultados o '
  'similitud bajo el umbral, nunca se llama al LLM) vs out_of_scope '
  '(la pregunta no es sobre las conversaciones del usuario).';
COMMENT ON COLUMN rw_copilot_queries.cost_usd IS
  'Se almacena, no se deriva de los tokens: depende de la tarifa vigente en '
  'el momento de la consulta, que es un hecho externo y cambiante.';

CREATE INDEX rw_copilot_queries_user_id_idx ON rw_copilot_queries (user_id, created_at DESC);

CREATE TABLE rw_copilot_citations (
  query_id    uuid   NOT NULL REFERENCES rw_copilot_queries (id) ON DELETE CASCADE,
  message_id  uuid   NOT NULL REFERENCES rw_messages (id) ON DELETE CASCADE,
  rank        smallint NOT NULL,
  similarity  real   NOT NULL,

  PRIMARY KEY (query_id, message_id),
  CONSTRAINT rw_copilot_citations_rank_ck CHECK (rank >= 1)
);

COMMENT ON TABLE rw_copilot_citations IS 'El mensaje fuente que respalda una respuesta. rank y similarity describen la pareja completa, no a query_id ni message_id por separado.';

-- Insert-only desde la aplicacion: una consulta al copiloto ya respondida
-- no se edita. Sin UPDATE ni DELETE.
GRANT SELECT, INSERT ON rw_copilot_queries TO rw_app;
GRANT SELECT, INSERT ON rw_copilot_citations TO rw_app;
