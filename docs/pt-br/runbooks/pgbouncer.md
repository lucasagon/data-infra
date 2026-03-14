# Runbook: PgBouncer

**Container:** `pgbouncer` | **Porta interna:** `6432` | **Porta externa:** `5432`
**Imagem:** `edoburu/pgbouncer:latest` (v1.25.1)
**Modo:** transaction pooling
**Destino:** `postgres:5432` (rede interna Docker)
**Compose:** `/root/infra/docker-compose.yml`

---

## Conexão administrativa

```bash
# Console admin do PgBouncer (banco virtual "pgbouncer")
PGPASSWORD=<senha_postgres> docker exec -it pgbouncer \
  psql -h 127.0.0.1 -p 6432 -U postgres pgbouncer
```

> O usuário deve estar em `admin_users` no `pgbouncer.ini`. Atualmente: `postgres`.

---

## Comandos de diagnóstico

```bash
# Ver pools ativos e status de conexões
SHOW POOLS;

# Ver clientes conectados ao PgBouncer
SHOW CLIENTS;

# Ver conexões reais abertas com o PostgreSQL
SHOW SERVERS;

# Ver estatísticas de throughput
SHOW STATS;

# Ver configuração ativa em memória
SHOW CONFIG;

# Ver bancos registrados
SHOW DATABASES;
```

### Referência do `SHOW POOLS`

| Campo | Significado | Alerta |
|---|---|---|
| `cl_active` | Clientes com transação ativa | — |
| `cl_waiting` | Clientes aguardando conexão | > 0 = pool saturado |
| `sv_active` | Conexões reais em uso | — |
| `sv_idle` | Conexões reais livres | 0 = pool exausto |
| `maxwait` | Tempo max de espera (segundos) | > 1s = problema |

---

## Operações

```bash
# Recarregar configuração sem derrubar conexões existentes
docker kill --signal=SIGHUP pgbouncer

# Reiniciar o container (derruba conexões ativas)
cd /root/infra && docker compose restart pgbouncer

# Ver logs em tempo real
docker logs pgbouncer -f --tail=100

# Forçar recriação do container
cd /root/infra && docker compose up -d --force-recreate pgbouncer
```

---

## Roteamento de bancos (wildcard)

| Serviço | Usuário | Database solicitado | Banco no PostgreSQL |
|---|---|---|---|
| n8n | `postgres` | `n8n` | `n8n` |
| Metabase | `metabase_user` | `metabase-db` | `metabase-db` |
| CloudBeaver / Admin | `postgres` | `postgres` | `postgres` |

---

## Localização dos arquivos de configuração

| Arquivo | Caminho no host |
|---|---|
| Configuração principal | `/root/infra/pgbouncer/pgbouncer.ini` |
| Credenciais do auth_user | `/root/infra/pgbouncer/userlist.txt` |

---

## Ajuste de pool

```bash
# 1. Editar o ini
nano /root/infra/pgbouncer/pgbouncer.ini

# 2. Recarregar sem downtime
docker kill --signal=SIGHUP pgbouncer

# 3. Confirmar novo valor (dentro do console admin)
SHOW CONFIG;
```

---

## Sinais de problema e ação

| Sintoma | Causa provável | Ação |
|---|---|---|
| `cl_waiting` alto | Pool esgotado | Aumentar `default_pool_size` no `.ini` e recarregar |
| `unsupported startup parameter` | Parâmetro não está em `ignore_startup_parameters` | Adicionar ao `.ini` e recarregar |
| Serviço não conecta | PgBouncer down | `docker compose restart pgbouncer` |
| `permission denied for schema pgbouncer` | `pgbouncer_auth` sem permissão | `GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;` |
| `not allowed` no console admin | Usuário não está em `admin_users` | Adicionar em `admin_users` no `.ini` |
| Timeout de conexão | PostgreSQL inacessível | `docker ps` e `docker logs postgres` |

> Ver troubleshooting detalhado: [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md)
