.PHONY: up down migrate seed reset test lint diagrams

# Levanta base de datos, backend y frontend. El servicio "migrate" ya corre
# migraciones + seed automaticamente como dependencia de "backend" (ver
# docker-compose.yml): un "make up" en una maquina limpia deja todo listo,
# sin pasos manuales adicionales.
up:
	docker compose up --build -d

down:
	docker compose down

# Convenientes para volver a migrar/sembrar sobre un stack ya levantado
# (por ejemplo, tras agregar una migracion nueva) sin reconstruir todo.
migrate:
	docker compose run --rm migrate pnpm migrate

seed:
	docker compose run --rm migrate pnpm seed

# Destructivo a proposito: DROP SCHEMA public CASCADE y vuelve a migrar y
# sembrar desde cero. Nunca se usa contra una base que no sea de desarrollo.
reset:
	docker compose run --rm migrate sh -c "pnpm reset && pnpm migrate && pnpm seed"

# Contra PostgreSQL real (no mocks): requiere que "make up" ya este corriendo.
test:
	cd database && pnpm test
	cd backend && pnpm test

# Incluye la regla de fronteras entre modulos del backend (ver backend/eslint.config.js).
lint:
	cd database && pnpm lint
	cd backend && pnpm lint
	cd frontend && pnpm lint

diagrams:
	for f in docs/diagrams/*.mmd; do \
		pnpm dlx @mermaid-js/mermaid-cli -i "$$f" -o "$${f%.mmd}.png" -b transparent; \
	done
