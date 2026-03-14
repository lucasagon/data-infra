# Runbook: PostgreSQL

**Container:** `postgres` | **Porta externa:** `5433` | **Porta interna:** `5432`
**Compose:** `/root/infra/docker-compose.yml`

---

## Conexão

```bash
# Conexão direta (bypassa PgBouncer)
docker exec -it postgres psql -U postgres -d postgres
```

---

## Diagnóstico de conexões

```bash
# Ver conexões ativas agrupadas por usuário/estado
docker exec -it postgres psql -U postgres -c "
SELECT usename, application_name, state, count(*)
FROM pg_stat_activity
GROUP BY usename, application_name, state
ORDER BY count(*) DESC;"

# Ver total de conexões vs limite disponível
docker exec -it postgres psql -U postgres -c "
SELECT count(*) AS total,
       max_conn,
       max_conn - count(*) AS available
FROM pg_stat_activity,
     (SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections') s
GROUP BY max_conn;"

# Ver configuração atual
docker exec -it postgres psql -U postgres -c "SHOW max_connections;"
```

---

## Operações de emergência

```bash
# Encerrar conexões idle (⚠️ usar apenas em emergência)
docker exec -it postgres psql -U postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle' AND pid <> pg_backend_pid();"

# Recarregar pg_hba.conf sem reiniciar
docker exec -it postgres psql -U postgres -c "SELECT pg_reload_conf();"
```

---

## Backup

```bash
# Dump completo de todos os bancos
docker exec postgres pg_dumpall -U postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# Dump de um banco específico
docker exec postgres pg_dump -U postgres -d n8n > n8n_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## Reiniciar / recriar

```bash
cd /root/infra && docker compose restart postgres

# Recriar (aplica mudanças de configuração)
cd /root/infra && docker compose up -d --force-recreate postgres
```

---

## Sinais de problema

| Sintoma | Causa provável | Ação |
|---|---|---|
| `FATAL: sorry, too many clients` | `max_connections` atingido | Encerrar idle, verificar PgBouncer |
| Conexão recusada | Container down | `docker compose restart postgres` |
| Autenticação falha para `pgbouncer_auth` | `pg_hba.conf` ou senha errada | Ver [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md) |

> Ver troubleshooting detalhado: [001-maxconnections_pgsql](../troubleshooting/001-maxconnections_pgsql.md)
