# Troubleshooting: Deploy do PgBouncer — Problemas Encadeados

**Data:** 2026-03-13
**Status:** ✅ Resolvido
**Tempo de troubleshooting:** ~2h
**Versão final:** PgBouncer 1.25.1 (`edoburu/pgbouncer:latest`)

---

## Contexto

Deploy do PgBouncer como connection pooler em modo `transaction` para servir n8n, Metabase e CloudBeaver. A instalação envolveu uma cadeia de problemas — cada um resolvido revelava o seguinte. Este documento registra todos em ordem cronológica.

---

## Problema 1 — Imagem `bitnami/pgbouncer` descontinuada

**Erro:**
```
failed to resolve reference "docker.io/bitnami/pgbouncer:latest": not found
```

**Causa:** A Bitnami removeu a imagem do PgBouncer do Docker Hub.

**Solução:** Usar `edoburu/pgbouncer:latest`.

**Diferença importante:** A imagem `edoburu` não aceita variáveis de ambiente para configuração — ela exige um `pgbouncer.ini` montado via volume. As env vars do compose são ignoradas.

---

## Problema 2 — Ausência do `pgbouncer.ini`

**Erro:**
```
ERROR load_init_file: main section missing from config file
FATAL cannot load config file
```

**Causa:** O compose foi escrito para a imagem Bitnami (env vars). A imagem `edoburu` requer arquivo `.ini` explícito.

**Solução:** Criar `/root/infra/pgbouncer/pgbouncer.ini` e montá-lo:

```yaml
volumes:
  - /root/infra/pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
  - /root/infra/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
```

---

## Problema 3 — `auth_type = scram-sha-256` incompatível com `auth_query`

**Erro:**
```
FATAL: password authentication failed for user "pgbouncer_auth"
```

**Causa:** O PgBouncer tem suporte limitado a `scram-sha-256` no fluxo de `auth_query`. O `auth_user` precisa autenticar via `md5`.

**Solução:**

```sql
SET password_encryption = 'md5';
CREATE USER pgbouncer_auth WITH PASSWORD 'sua_senha' NOSUPERUSER NOCREATEDB NOCREATEROLE;
```

```
# pg_hba.conf — regra md5 ANTES da global scram-sha-256
host all pgbouncer_auth all md5
host all all            all scram-sha-256
```

```sql
SELECT pg_reload_conf();
```

> A **ordem das regras no `pg_hba.conf` é determinante** — a primeira regra que casar é aplicada.

---

## Problema 4 — `pg_hba.conf` sobrescrevendo com `scram-sha-256`

Variação do problema 3. Mesmo após criar o usuário `pgbouncer_auth` com senha md5, a regra global `scram-sha-256` estava sendo aplicada primeiro.

**Solução:** Garantir que a regra do `pgbouncer_auth` venha **antes** da regra global no arquivo.

---

## Problema 5 — Parâmetro `auth_password` inválido

**Erro:**
```
ERROR unknown parameter: pgbouncer/auth_password
```

**Causa:** O PgBouncer não tem parâmetro `auth_password` no `.ini`. A senha do `auth_user` vai no `userlist.txt`.

**Solução:** Criar `/root/infra/pgbouncer/userlist.txt`:

```
"pgbouncer_auth" "senha_aqui"
```

E referenciar no `.ini`:

```ini
auth_file = /etc/pgbouncer/userlist.txt
```

---

## Problema 6 — Permissão negada no schema `pgbouncer`

**Erro:**
```
ERROR S: error in auth_query: ERROR: permission denied for schema pgbouncer
```

**Causa:** O usuário `pgbouncer_auth` não tinha acesso ao schema onde a função `get_auth` está definida.

**Solução:**

```sql
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(text) TO pgbouncer_auth;
```

---

## Problema 7 — Acesso ao console admin negado

**Erro:**
```
FATAL: not allowed
```

**Causa:** O banco virtual `pgbouncer` (console admin) só aceita usuários listados em `admin_users`.

**Solução:**

```ini
admin_users = postgres
stats_users = postgres
```

---

## Problema 8 — `unsupported startup parameter: statement_timeout`

**Erro:**
```
There was an error initializing DB
unsupported startup parameter: statement_timeout
Last session crashed
```

**Causa:** O n8n (TypeORM) e o Metabase (JDBC) enviam `statement_timeout` como parâmetro de startup. O PgBouncer em modo `transaction` não repassa parâmetros de sessão por padrão.

**Solução:**

```ini
ignore_startup_parameters = extra_float_digits,statement_timeout
```

Recarregar:

```bash
# Via sinal (sem downtime)
docker kill --signal=SIGHUP pgbouncer

# Se persistir, reiniciar o container
cd /root/infra && docker compose restart pgbouncer
```

---

## Configuração final funcional

### `pgbouncer.ini`

```ini
[databases]
* = host=postgres port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
auth_user = pgbouncer_auth
auth_query = SELECT username, password FROM pgbouncer.get_auth($1)
auth_dbname = postgres
pool_mode = transaction
max_client_conn = 200
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits,statement_timeout
log_connections = 0
log_disconnections = 0
admin_users = postgres
stats_users = postgres
```

### `userlist.txt`

```
"pgbouncer_auth" "senha_do_pgbouncer_auth"
```

---

## Pré-requisitos no PostgreSQL (rodar antes do deploy)

```sql
-- 1. Schema e função de autenticação (executar no banco postgres)
CREATE SCHEMA IF NOT EXISTS pgbouncer;

CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
  RETURNS TABLE(username TEXT, password TEXT)
  SECURITY DEFINER LANGUAGE SQL AS
$$
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
$$;

-- 2. Usuário de autenticação com senha md5
SET password_encryption = 'md5';
CREATE USER pgbouncer_auth WITH PASSWORD 'sua_senha_aqui' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- 3. Permissões
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(text) TO pgbouncer_auth;

-- 4. Banco de dados das aplicações
CREATE DATABASE n8n;
```

### `pg_hba.conf`

```
host all pgbouncer_auth all md5
host all all            all scram-sha-256
```

```sql
SELECT pg_reload_conf();
```

---

## Checklist para próximo deploy

- [ ] Usar imagem `edoburu/pgbouncer:latest`
- [ ] Criar `pgbouncer.ini` com todas as seções antes de subir
- [ ] Criar `userlist.txt` com credenciais do `pgbouncer_auth`
- [ ] Montar ambos via volume `:ro` no compose
- [ ] Criar schema `pgbouncer`, função `get_auth` e usuário `pgbouncer_auth` no PostgreSQL
- [ ] Forçar senha `md5` para o `pgbouncer_auth` (`SET password_encryption = 'md5'`)
- [ ] Adicionar regra `md5` para `pgbouncer_auth` no `pg_hba.conf` **antes** da regra global
- [ ] Executar `SELECT pg_reload_conf()` após alterar `pg_hba.conf`
- [ ] Adicionar `admin_users` e `stats_users` no `.ini`
- [ ] Incluir `statement_timeout` em `ignore_startup_parameters`
- [ ] Validar com `SHOW POOLS` após o deploy

---

## Validação pós-deploy

```bash
# Pools (esperado: sv_idle > 0, cl_waiting = 0, pool_mode = transaction)
PGPASSWORD=<senha> psql -h localhost -p 5432 -U postgres pgbouncer -c "SHOW POOLS;"

# Testar cada banco via PgBouncer
PGPASSWORD=<senha> psql -h localhost -p 5432 -U postgres     -d n8n        -c "SELECT version();"
PGPASSWORD=<senha> psql -h localhost -p 5432 -U metabase_user -d metabase-db -c "SELECT current_database();"
```

---

## Aprendizados

| # | Aprendizado |
|---|---|
| 1 | A imagem `edoburu/pgbouncer` ignora env vars — exige `.ini` montado via volume |
| 2 | A ordem das regras no `pg_hba.conf` é determinante — a primeira que casa vence |
| 3 | `auth_query` requer que o `auth_user` autentique via `md5`, não `scram-sha-256` |
| 4 | O parâmetro `auth_password` não existe no pgbouncer — senha vai no `userlist.txt` |
| 5 | `ignore_startup_parameters` precisa incluir todos os parâmetros enviados pelos drivers (TypeORM envia `statement_timeout`) |
| 6 | SIGHUP recarrega o `.ini` mas pode não ser suficiente — reiniciar o container é mais seguro em mudanças críticas |
| 7 | Montar o `.ini` como `:ro` protege contra sobrescrita acidental e garante que o container use a versão versionada |
