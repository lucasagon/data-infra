# Arquitetura: PgBouncer como Connection Pooler

**Versão:** PgBouncer 1.25.1
**Imagem Docker:** `edoburu/pgbouncer:latest`
**Modo:** Transaction Pooling
**Data de implantação:** 2026-03-13

---

## Visão Geral

O PgBouncer atua como proxy entre as aplicações e o PostgreSQL, gerenciando um pool de conexões reutilizáveis. As aplicações abrem conexões com o PgBouncer — que mantém poucas conexões reais abertas com o banco — reduzindo drasticamente a pressão sobre o `max_connections` do PostgreSQL.

```
Aplicações                 PgBouncer              PostgreSQL 16
─────────────────          ─────────────────      ─────────────────
n8n           ──┐          ┌─────────────┐         ┌─────────────┐
  (postgres/n8n)├──────────► pool n8n    ├─────────► banco: n8n   │
                │          │             │         │             │
Metabase    ───┤          │   mode:     │         │ banco:      │
(metabase_user/ ├──────────► transaction ├─────────► metabase-db  │
  metabase-db) │          │             │         │             │
               │          │  wildcard   │         │ banco:      │
CloudBeaver ──┘          │  routing *  ├─────────► postgres     │
                          └─────────────┘         └─────────────┘
                          porta: 6432              porta: 5432
                          (externa: 5432)          (externa: 5433)
```

---

## Componentes

### Arquivos de configuração

| Arquivo | Caminho no host | Caminho no container | Função |
|---|---|---|---|
| `pgbouncer.ini` | `/root/infra/pgbouncer/pgbouncer.ini` | `/etc/pgbouncer/pgbouncer.ini` | Configuração principal |
| `userlist.txt` | `/root/infra/pgbouncer/userlist.txt` | `/etc/pgbouncer/userlist.txt` | Credenciais do auth_user |

### Portas

| Contexto | Porta |
|---|---|
| Aplicações → PgBouncer (rede interna Docker) | `pgbouncer:6432` |
| Acesso externo ao PgBouncer (host) | `localhost:5432` |
| Acesso direto ao PostgreSQL (bypass, admin) | `localhost:5433` |

---

## Roteamento de Banco de Dados

O PgBouncer usa **roteamento wildcard** (`* = host=postgres port=5432`). O nome do banco solicitado pelo cliente é encaminhado como-está ao PostgreSQL:

| Serviço | Usuário | Database solicitado | Banco no PostgreSQL |
|---|---|---|---|
| n8n | `postgres` | `n8n` | `n8n` |
| Metabase | `metabase_user` | `metabase-db` | `metabase-db` |
| CloudBeaver / Admin | `postgres` | `postgres` | `postgres` |

Vantagem: não é necessário declarar cada banco no `pgbouncer.ini`.

---

## Fluxo de Autenticação (auth_query)

A autenticação é dinâmica — o PgBouncer não armazena senhas de todos os usuários em `userlist.txt`. Apenas o `pgbouncer_auth` (usuário de serviço) está no arquivo.

```
1. Cliente (ex: n8n) conecta no PgBouncer com user "postgres", senha "xxx"
2. PgBouncer conecta no PostgreSQL como "pgbouncer_auth"
3. PgBouncer executa: SELECT username, password FROM pgbouncer.get_auth('postgres')
4. PostgreSQL retorna o hash da senha armazenado em pg_shadow
5. PgBouncer compara o hash com a senha enviada pelo cliente
6. Autenticação aprovada → conexão estabelecida
```

### Função SQL de autenticação

```sql
-- Banco: postgres | Schema: pgbouncer
CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename TEXT)
  RETURNS TABLE(username TEXT, password TEXT)
  SECURITY DEFINER LANGUAGE SQL AS
$$
  SELECT usename::TEXT, passwd::TEXT
  FROM pg_catalog.pg_shadow
  WHERE usename = p_usename;
$$;
```

### Por que `auth_type = md5` para o pgbouncer_auth?

O PostgreSQL 16 usa `scram-sha-256` por padrão. Porém, o fluxo de `auth_query` requer que o `auth_user` autentique via `md5`. A solução é:

1. Armazenar a senha do `pgbouncer_auth` em formato `md5`
2. Adicionar regra específica no `pg_hba.conf` **antes** da regra global

```
host all pgbouncer_auth all md5          ← deve vir ANTES
host all all            all scram-sha-256
```

---

## Modo Transaction — Explicação e Implicações

### Como funciona

No modo `transaction`, uma conexão real com o banco é alocada **apenas durante a transação** e devolvida ao pool quando termina. Múltiplos clientes compartilham um número menor de conexões reais.

Com `default_pool_size = 25`, o PgBouncer mantém no máximo 25 conexões reais por banco/usuário, mas pode servir `max_client_conn = 200` clientes simultâneos.

### Parâmetros ignorados (incompatíveis com transaction mode)

```ini
ignore_startup_parameters = extra_float_digits,statement_timeout
```

| Parâmetro ignorado | Enviado por |
|---|---|
| `extra_float_digits` | Drivers PostgreSQL padrão (psycopg2, libpq) |
| `statement_timeout` | TypeORM (n8n), drivers Java/JDBC (Metabase) |

### Limitações do modo transaction

| Funcionalidade | Compatível? | Observação |
|---|---|---|
| Prepared statements | ✅ | PgBouncer ≥ 1.21 suporta |
| `SET` de variáveis de sessão | ❌ | Não persiste entre transações |
| `LISTEN/NOTIFY` | ❌ | Requer conexão persistente |
| Advisory locks | ❌ | Requer sessão dedicada |
| `SAVEPOINT` | ✅ | Dentro de uma transação |

---

## Configuração Atual

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

---

## Sizing do Pool

| Parâmetro | Valor atual | Quando ajustar |
|---|---|---|
| `max_client_conn` | 200 | Se mais de 200 clientes simultâneos |
| `default_pool_size` | 25 | Se `cl_waiting` > 0 frequentemente |
| `min_pool_size` | 5 | Conexões pré-abertas para baixa latência |
| `reserve_pool_size` | 5 | Conexões extras em pico |

```
Conexões no PostgreSQL ≈ (num_bancos × default_pool_size) + overhead
Atual: (3 bancos × 25) + reserva ≈ 80 conexões máximas
PostgreSQL configurado com max_connections = 300 → margem confortável
```

---

## Dependências no PostgreSQL

Objetos que devem existir antes de subir o PgBouncer:

```sql
CREATE SCHEMA pgbouncer;
CREATE FUNCTION pgbouncer.get_auth(TEXT) ... SECURITY DEFINER;
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(TEXT) TO pgbouncer_auth;
CREATE DATABASE n8n;
```

---

## Referências

- [PgBouncer Documentation](https://www.pgbouncer.org/config.html)
- [edoburu/pgbouncer — Docker Hub](https://hub.docker.com/r/edoburu/pgbouncer)
- [PostgreSQL pg_hba.conf](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)
