# Runbooks — Stack de Dados

**Ambiente:** Ubuntu Server / Docker
**Stack:** PostgreSQL · PgBouncer · Metabase · n8n · Airbyte · CloudBeaver · Caddy · Uptime Kuma · Portainer · Watchtower

---

## Índice de Runbooks

| Serviço | Runbook |
|---|---|
| Docker (geral) | [docker.md](docker.md) |
| PostgreSQL | [postgresql.md](postgresql.md) |
| PgBouncer | [pgbouncer.md](pgbouncer.md) |
| Metabase | [metabase.md](metabase.md) |
| n8n | [n8n.md](n8n.md) |
| Airbyte | [airbyte.md](airbyte.md) |
| Caddy | [caddy.md](caddy.md) |
| Uptime Kuma | [uptime-kuma.md](uptime-kuma.md) |
| Portainer | [portainer.md](portainer.md) |
| Watchtower | [watchtower.md](watchtower.md) |
| Incidentes comuns | [incidentes.md](incidentes.md) |

---

## Índice de Troubleshootings

| Documento | Assunto |
|---|---|
| [001-maxconnections_pgsql](../troubleshooting/001-maxconnections_pgsql.md) | Too many connections no PostgreSQL |
| [002-migracao_n8n_sqlite_postgres](../troubleshooting/002-migracao_n8n_sqlite_postgres.md) | Migração do n8n de SQLite para PostgreSQL |
| [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md) | Deploy do PgBouncer — problemas encadeados |
| [004-n8n_encryption_key](../troubleshooting/004-n8n_encryption_key.md) | n8n — Mismatching encryption keys |

---

## Arquitetura

| Documento | Assunto |
|---|---|
| [pgbouncer](../archtecture/pgbouncer.md) | Arquitetura do PgBouncer — fluxo, auth, pool, limitações |
