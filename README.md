# data-infra

Stack de infraestrutura de dados self-hosted com automação, BI, banco de dados e observabilidade — orquestrada via Docker Compose.

Este repositório organiza uma stack enxuta de dados para operação em servidor próprio, priorizando simplicidade de manutenção, visibilidade operacional e baixo acoplamento entre as peças. A proposta aqui não é simular uma plataforma completa de analytics, mas montar uma base funcional para automação, consultas, dashboards e troubleshooting com escolhas que façam sentido em um ambiente real.

Também é importante separar duas camadas que convivem neste projeto: o case publicado no GitHub e o runbook do ambiente já implantado. Parte da documentação foi escrita pensando em operação real, por isso alguns arquivos tratam incidentes, decisões de deploy e ajustes de servidor. O esforço desta versão é deixar essa mistura mais explícita para o projeto continuar útil publicamente sem perder o valor operacional.

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

## Decisões e Trade-offs

- A separação entre `infra/` e `data/` reduz o acoplamento entre a base operacional da stack e as aplicações que tendem a mudar com mais frequência.
- PostgreSQL com PgBouncer cobre bem a primeira versão porque simplifica operação local, centraliza persistência e evita antecipar complexidade de warehouse sem demanda real.
- O uso de tags `latest` foi mantido em parte da stack por praticidade operacional, mas isso exige mais atenção em atualização, rollback e troubleshooting.
- Alguns artefatos continuam sensíveis ao ambiente, como `userlist.txt`, `Caddyfile` e scripts de bootstrap do PostgreSQL. Eles aparecem aqui como referência e ponto de partida, não como segredo versionado.

---

## Estrutura do Repositório

```
.
├── infra/
│   ├── docker-compose.yml       # PostgreSQL, PgBouncer, Caddy, Portainer, Uptime Kuma, Watchtower
│   ├── .env.example             # variáveis de ambiente de exemplo
│   └── pgbouncer/
│       ├── pgbouncer.ini        # configuração do pool
│       └── userlist.txt         # credenciais do auth_user (não versionado)
├── data/
│   ├── docker-compose.yml       # n8n, Metabase, CloudBeaver, Autoheal
│   └── .env.example             # variáveis de ambiente de exemplo
└── docs/
    └── pt-br/
        ├── architecture/        # decisões e design de cada serviço
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

- Arquivos `.env` preenchidos a partir de `infra/.env.example` e `data/.env.example`
- Arquivos auxiliares ajustados para o host de destino:
  - `infra/caddy/Caddyfile`
  - `infra/postgres/init/`
  - `infra/pgbouncer/userlist.txt`

---

## Variáveis de Ambiente

Antes do primeiro `up`, copie os exemplos:

```bash
cp infra/.env.example infra/.env
cp data/.env.example data/.env
cp infra/pgbouncer/userlist.txt.example infra/pgbouncer/userlist.txt
```

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

Se o servidor usar caminhos diferentes para `Caddyfile`, bootstrap SQL ou `userlist.txt`, ajuste isso no host ou sobrescreva os paths no arquivo `infra/.env`.

---

## Documentação

| Tipo | Local |
|---|---|
| Arquitetura | [`docs/pt-br/architecture/`](docs/pt-br/architecture/) |
| Runbooks | [`docs/pt-br/runbooks/`](docs/pt-br/runbooks/) |
| Troubleshooting | [`docs/pt-br/troubleshooting/`](docs/pt-br/troubleshooting/) |

Destaques:
- [Visão geral da stack](docs/pt-br/architecture/stack.md)
- [PgBouncer — connection pooling](docs/pt-br/architecture/pgbouncer.md)
- [n8n — encryption key](docs/pt-br/troubleshooting/004-n8n_encryption_key.md)
- [Migração SQLite → PostgreSQL](docs/pt-br/troubleshooting/002-migracao_n8n_sqlite_postgres.md)

---

## Status

Acessar status dos serviços: `https://<seu-dominio>/status/todos`
