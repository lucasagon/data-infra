# Arquitetura: PostgreSQL

**Versão:** PostgreSQL 16
**Imagem Docker:** `postgres:16`
**Data de implantação:** 2026-03-13

---

## Visão Geral

PostgreSQL 16 é o banco de dados central da stack. Não é acessado diretamente pelas aplicações — todo o tráfego passa pelo PgBouncer (connection pooler). O acesso direto na porta `5433` é reservado para administração.

```
Aplicações (n8n, Metabase, CloudBeaver)
      │
      ▼
  PgBouncer:6432   ←── todo tráfego de aplicações
      │
      ▼
  PostgreSQL:5432  (interno)
  PostgreSQL:5433  (externo — admin/bypass)
```

---

## Bancos de Dados

| Banco | Usado por | Usuário principal |
|---|---|---|
| `postgres` | Admin, CloudBeaver, pgbouncer schema | `postgres` |
| `n8n` | n8n | `postgres` |
| `metabase-db` | Metabase | `metabase_user` |

---

## Configuração

| Parâmetro | Valor | Definido por |
|---|---|---|
| `max_connections` | `300` | `${POSTGRES_MAX_CONNECTIONS:-300}` |
| `POSTGRES_USER` | `${POSTGRES_USER}` | `.env` |
| `POSTGRES_PASSWORD` | `${POSTGRES_PASSWORD}` | `.env` |
| `POSTGRES_DB` | `${POSTGRES_DB}` | `.env` |

---

## Portas

| Porta | Contexto | Uso |
|---|---|---|
| `5432` (interna) | Rede Docker | Recebe conexões do PgBouncer |
| `5433` (externa) | Host | Acesso admin direto (bypass PgBouncer) |

---

## Schema pgbouncer

O schema `pgbouncer` no banco `postgres` contém a função de autenticação dinâmica usada pelo PgBouncer:

```sql
-- Função que retorna hash de senha para auth_query
CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
  RETURNS TABLE(username TEXT, password TEXT)
  SECURITY DEFINER LANGUAGE SQL AS
$$
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
$$;
```

> Este schema e função devem existir antes de subir o PgBouncer.

---

## Scripts de inicialização

Arquivos em `/opt/postgres/init/` são executados automaticamente no primeiro boot (via `docker-entrypoint-initdb.d`). Use para criar bancos, usuários e o schema pgbouncer.

---

## Autenticação (pg_hba.conf)

Para compatibilidade com o PgBouncer `auth_query`, a regra do `pgbouncer_auth` deve vir **antes** da regra global:

```
host all pgbouncer_auth all md5
host all all            all scram-sha-256
```

Ver detalhes em [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md).

---

## Backup

```bash
# Dump completo
docker exec postgres pg_dumpall -U postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# Dump de banco específico
docker exec postgres pg_dump -U postgres -d n8n > n8n_$(date +%Y%m%d).sql
```

---

## Referências

- [PostgreSQL 16 Documentation](https://www.postgresql.org/docs/16/)
- [Runbook: PostgreSQL](../runbooks/postgresql.md)
- [Arquitetura: PgBouncer](pgbouncer.md)
