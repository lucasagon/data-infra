# data-infra

Stack de infraestrutura de dados self-hosted com automação, BI, banco de dados e observabilidade — orquestrada via Docker Compose.

---

## Arquitetura

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Caddy (80/443) — Reverse Proxy + TLS automático        │
└────┬──────────────┬──────────────┬──────────────────────┘
     │              │              │
     ▼              ▼              ▼
  n8n:5678    Metabase:3000   CloudBeaver:8978
  (automação) (BI/dashboards) (SQL client)
     │              │
     └──────┬───────┘
            ▼
     PgBouncer:6432
     (connection pool)
            │
            ▼
     PostgreSQL:5432
     (porta externa: 5433)
     ├── banco: n8n
     ├── banco: metabase-db
     └── banco: postgres

Serviços de suporte:
  Portainer:9000/9443   — gestão de containers
  Uptime Kuma:3001      — monitoramento
  Watchtower            — atualização automática de imagens
  Autoheal              — reinício automático de containers unhealthy
  Airbyte:8000          — ingestão de dados (ELT)
```

---

## Serviços

| Serviço | Imagem | Porta | Compose |
|---|---|---|---|
| PostgreSQL | `postgres:16` | `5433` | `infra/` |
| PgBouncer | `edoburu/pgbouncer:latest` | `5432` | `infra/` |
| Caddy | `caddy:latest` | `80`, `443` | `infra/` |
| Portainer | `portainer/portainer-ce:latest` | `9000`, `9443` | `infra/` |
| Uptime Kuma | `louislam/uptime-kuma:latest` | `3001` | `infra/` |
| Watchtower | `containrrr/watchtower` | — | `infra/` |
| Autoheal | `willfarrell/autoheal` | — | `data/` |
| n8n | `n8nio/n8n:latest` | `5678` | `data/` |
| Metabase | `metabase/metabase:latest` | `3000` | `data/` |
| CloudBeaver | `dbeaver/cloudbeaver:latest` | `8978` | `data/` |
| Airbyte | `airbyte-abctl-control-plane` | `8000` | standalone |

---

## Estrutura do Repositório

```
.
├── infra/
│   ├── docker-compose.yml       # PostgreSQL, PgBouncer, Caddy, Portainer, Uptime Kuma, Watchtower
│   ├── .env                     # variáveis de ambiente (não versionado)
│   └── pgbouncer/
│       ├── pgbouncer.ini        # configuração do pool
│       └── userlist.txt         # credenciais do auth_user (não versionado)
├── data/
│   ├── docker-compose.yml       # n8n, Metabase, CloudBeaver, Autoheal
│   └── .env                     # variáveis de ambiente (não versionado)
└── docs/
    └── pt-br/
        ├── archtecture/         # decisões e design de cada serviço
        ├── runbooks/            # operações e diagnóstico
        └── troubleshooting/     # incidentes resolvidos
```

---

## Pré-requisitos

- Docker + Docker Compose
- Rede Docker externa criada:

```bash
docker network create app_network
```

- Arquivos `.env` preenchidos em `infra/` e `data/` (ver seção abaixo)

---

## Variáveis de Ambiente

### `infra/.env`

```env
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
POSTGRES_MAX_CONNECTIONS=300
```

### `data/.env`

```env
# Metabase
MB_DB_DBNAME=
MB_DB_USER=
MB_DB_PASS=
MB_SITE_URL=

# n8n
N8N_HOST=
N8N_WEBHOOK_URL=
N8N_ENCRYPTION_KEY=
N8N_DB_USER=
N8N_DB_PASS=

# CloudBeaver
CB_ADMIN_USER=
CB_ADMIN_PASSWORD=
```

---

## Subir a stack

```bash
# Infraestrutura (banco, proxy, monitoramento)
cd infra && docker compose up -d

# Aplicações (n8n, Metabase, CloudBeaver)
cd data && docker compose up -d
```

---

## Documentação

| Tipo | Local |
|---|---|
| Arquitetura | [`docs/pt-br/archtecture/`](docs/pt-br/archtecture/) |
| Runbooks | [`docs/pt-br/runbooks/`](docs/pt-br/runbooks/) |
| Troubleshooting | [`docs/pt-br/troubleshooting/`](docs/pt-br/troubleshooting/) |

Destaques:
- [Visão geral da stack](docs/pt-br/archtecture/stack.md)
- [PgBouncer — connection pooling](docs/pt-br/archtecture/pgbouncer.md)
- [n8n — encryption key](docs/pt-br/troubleshooting/004-n8n_encryption_key.md)
- [Migração SQLite → PostgreSQL](docs/pt-br/troubleshooting/002-migracao_n8n_sqlite_postgres.md)

---

## Status

Acessar status dos serviços: `https://<seu-dominio>/status/todos`
