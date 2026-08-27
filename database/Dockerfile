FROM node:20-alpine AS migrator
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY migrations ./migrations
COPY scripts ./scripts
COPY seed ./seed

FROM pgvector/pgvector:pg16

# La imagen base ya trae PostgreSQL 16 y la extension pgvector compilada.
# No se agrega logica de aplicacion aqui: las migraciones y el seed corren
# desde fuera del contenedor (scripts/migrate.ts y scripts/seed.ts), para que
# el contenedor de base de datos sea intercambiable por un Postgres gestionado
# sin cambiar una linea de este proyecto.

ENV POSTGRES_DB=bd_juan_cano_nakamoto
