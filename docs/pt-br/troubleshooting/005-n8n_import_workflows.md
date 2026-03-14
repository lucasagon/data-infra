# Troubleshooting: Importação de Workflows no n8n

**Data:** 2026-03-13
**Ambiente:** n8n + PostgreSQL 16 + PgBouncer (Docker)
**Status:** ✅ Resolvido

---

## Contexto

Após a migração do n8n de SQLite para PostgreSQL (via PgBouncer), a importação de workflows via CLI falhou com erros de autenticação e conexão ao banco.

---

## Problema 1 — `password authentication failed for user "pgbouncer_auth"`

**Erro:**
```
FATAL: password authentication failed for user "pgbouncer_auth"
```

**Causa:** O PgBouncer tem suporte limitado a `scram-sha-256` no fluxo de `auth_query`. O `auth_user` (usuário que o PgBouncer usa para executar a `auth_query` no PostgreSQL) precisa ter senha em formato `md5`.

**Solução:**
```sql
SET password_encryption = 'md5';
ALTER USER pgbouncer_auth WITH PASSWORD 'senha';
```

---

## Problema 2 — `pg_hba.conf` rejeitando `pgbouncer_auth`

**Erro:**
```
FATAL: password authentication failed for user "pgbouncer_auth"
```
(mesmo erro, causa diferente)

**Causa:** A regra global `scram-sha-256` no `pg_hba.conf` estava sendo aplicada antes da regra `md5` específica para `pgbouncer_auth`.

**Solução:** Garantir que a regra do `pgbouncer_auth` venha **antes** da regra global:

```
# pg_hba.conf
host all pgbouncer_auth all md5
host all all            all scram-sha-256
```

Após editar:
```bash
docker exec -it postgres psql -U postgres -c "SELECT pg_reload_conf();"
```

---

## Problema 3 — `scram-sha-256` sobrescrevendo senha md5 após recriação do container

**Causa:** A variável `POSTGRES_PASSWORD` no `docker-compose.yml` usava `scram-sha-256` por padrão. Ao recriar o container, o PostgreSQL redefinia a senha do `postgres` (e outros usuários inicializados via script) sobrescrevendo a senha `md5` do `pgbouncer_auth`.

**Solução:** Não recriar o container do PostgreSQL sem revisar os scripts de inicialização em `docker-entrypoint-initdb.d`. Esses scripts só rodam no **primeiro boot** (banco vazio).

---

## Problema 4 — Parâmetro `auth_password` inválido no `pgbouncer.ini`

**Erro:**
```
ERROR unknown parameter: pgbouncer/auth_password
```

**Causa:** O PgBouncer não possui parâmetro `auth_password` no `.ini`. A senha do `auth_user` precisa estar no `userlist.txt`.

**Solução:**
```
# /etc/pgbouncer/userlist.txt
"pgbouncer_auth" "senha"
```

---

## Problema 5 — `unsupported startup parameter: statement_timeout`

**Erro nos logs do PgBouncer:**
```
unsupported startup parameter: statement_timeout
```

**Causa:** O n8n (via TypeORM) envia `statement_timeout` ao conectar. O PgBouncer em modo `transaction` não suporta parâmetros de sessão.

**Solução:**
```ini
# pgbouncer.ini
ignore_startup_parameters = extra_float_digits,statement_timeout
```

---

## Configuração final validada

```ini
[pgbouncer]
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
auth_user = pgbouncer_auth
auth_query = SELECT username, password FROM pgbouncer.get_auth($1)
auth_dbname = postgres
pool_mode = transaction
ignore_startup_parameters = extra_float_digits,statement_timeout
```

```
# userlist.txt
"pgbouncer_auth" "senha_do_pgbouncer_auth"
```

```sql
-- pg_hba.conf (ordem importa)
host all pgbouncer_auth all md5
host all all            all scram-sha-256
```

```sql
-- Schema no PostgreSQL
CREATE SCHEMA pgbouncer;
CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
  RETURNS TABLE(username TEXT, password TEXT)
  SECURITY DEFINER LANGUAGE SQL AS
$$
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
$$;

-- 2. Criar usuário de autenticação com senha md5
SET password_encryption = 'md5';
CREATE USER pgbouncer_auth WITH PASSWORD 'sua_senha_aqui';
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(TEXT) TO pgbouncer_auth;
```

---

## Checklist de validação

- [ ] `pgbouncer_auth` existe no PostgreSQL com senha `md5`
- [ ] Regra `md5` para `pgbouncer_auth` no `pg_hba.conf` vem antes da regra global
- [ ] `userlist.txt` contém `"pgbouncer_auth" "senha"`
- [ ] `ignore_startup_parameters` inclui `statement_timeout`
- [ ] n8n conecta ao banco e workflows importam sem erro

---

## Referências

- [003-pgbouncer_deploy](003-pgbouncer_deploy.md)
- [Arquitetura: PgBouncer](../archtecture/pgbouncer.md)
