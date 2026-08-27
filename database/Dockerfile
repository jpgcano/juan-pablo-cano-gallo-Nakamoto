FROM pgvector/pgvector:pg16

# La imagen base ya trae PostgreSQL 16 y la extension pgvector compilada.
# No se agrega logica de aplicacion aqui: las migraciones y el seed corren
# desde fuera del contenedor (scripts/migrate.ts y scripts/seed.ts), para que
# el contenedor de base de datos sea intercambiable por un Postgres gestionado
# sin cambiar una linea de este proyecto.

ENV POSTGRES_DB=bd_juan_cano_nakamoto
