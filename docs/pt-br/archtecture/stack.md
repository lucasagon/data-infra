# Arquitetura: Visão Geral da Stack

**Data de documentação:** 2026-03-14
**Ambiente:** Ubuntu Server / Docker Compose

---

## Visão Geral

A stack é composta por serviços divididos em dois arquivos Docker Compose, organizados por responsabilidade: infraestrutura (`infra/`) e aplicações (`data/`).

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
  Airbyte:8000          — ingestão de dados (ELT)
```

---

## Compose Files

| Arquivo | Serviços |
|---|---|
| `/root/infra/docker-compose.yml` | PostgreSQL, PgBouncer, Caddy, Portainer, Uptime Kuma, Watchtower |
| `/root/data/docker-compose.yml` | n8n, Metabase, CloudBeaver |

Ambos compartilham a rede Docker externa `app_network`.

---

## Serviços

| Serviço | Imagem | Porta externa | Compose |
|---|---|---|---|
| PostgreSQL | `postgres:16` | `5433` | infra |
| PgBouncer | `edoburu/pgbouncer:latest` | `5432` | infra |
| Caddy | `caddy:latest` | `80`, `443` | infra |
| Portainer | `portainer/portainer-ce:latest` | `9000`, `9443` | infra |
| Uptime Kuma | `louislam/uptime-kuma:latest` | `3001` | infra |
| Watchtower | `containrrr/watchtower` | — | infra |
| n8n | `n8nio/n8n:latest` | `5678` | data |
| Metabase | `metabase/metabase:latest` | `3000` | data |
| CloudBeaver | `dbeaver/cloudbeaver:latest` | `8978` | data |
| Airbyte | `airbyte-abctl-control-plane` | `8000` | standalone |

---

## Rede

Todos os serviços comunicam-se via rede Docker `app_network` (external, criada manualmente).

```bash
# Criar a rede (necessário apenas uma vez)
docker network create app_network
```

- Serviços se referenciam pelo **nome do container** (DNS interno Docker)
- Exemplo: n8n conecta ao PgBouncer via `pgbouncer:6432`

---

## Fluxo de Dados — Banco de Dados

```
n8n / Metabase / CloudBeaver
         │
         │  host: pgbouncer, porta: 6432
         ▼
     PgBouncer
     (transaction pooling, max 200 conn clientes → 25 conn reais/banco)
         │
         │  host: postgres, porta: 5432
         ▼
     PostgreSQL 16
     (max_connections = 300)
```

Acesso direto (admin/bypass): `localhost:5433 → postgres:5432`

---

## Volumes

| Volume | Serviço | Dados |
|---|---|---|
| `postgres_data` | PostgreSQL | dados dos bancos |
| `n8n_n8n_data` | n8n | workflows, credenciais, config |
| `metabase_data` | Metabase | configurações da aplicação |
| `cloudbeaver_data` | CloudBeaver | workspace e conexões salvas |
| `portainer_data` | Portainer | configurações e stacks |
| `uptime_kuma_data` | Uptime Kuma | monitores e histórico |
| `caddy_caddy_data` | Caddy | certificados TLS |
| `caddy_caddy_config` | Caddy | configuração gerada |

---

## Referências

- [Arquitetura: PgBouncer](pgbouncer.md)
- [Arquitetura: PostgreSQL](postgresql.md)
- [Arquitetura: Caddy](caddy.md)
- [Arquitetura: n8n](n8n.md)
