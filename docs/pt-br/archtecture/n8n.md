# Arquitetura: n8n

**Versão:** n8n latest
**Imagem Docker:** `n8nio/n8n:latest`
**Banco de dados:** PostgreSQL via PgBouncer
**Data de implantação:** 2026-03-13

---

## Visão Geral

O n8n é a plataforma de automação de workflows da stack. Conecta-se ao PostgreSQL via PgBouncer (connection pooler) e expõe uma interface web na porta `5678`, acessada externamente via Caddy com TLS.

```
Usuário (HTTPS)
      │
      ▼
   Caddy:443
      │
      ▼
   n8n:5678
      │
      │ DB_POSTGRESDB_HOST=pgbouncer
      │ DB_POSTGRESDB_PORT=6432
      ▼
  PgBouncer:6432
      │
      ▼
  PostgreSQL:5432
  └── banco: n8n
```

---

## Configuração

| Variável de Ambiente | Valor | Descrição |
|---|---|---|
| `DB_TYPE` | `postgresdb` | Tipo de banco |
| `DB_POSTGRESDB_HOST` | `pgbouncer` | Host do banco (via pool) |
| `DB_POSTGRESDB_PORT` | `6432` | Porta do PgBouncer |
| `DB_POSTGRESDB_DATABASE` | `n8n` | Nome do banco |
| `DB_POSTGRESDB_USER` | `${N8N_DB_USER}` | Usuário do banco |
| `DB_POSTGRESDB_PASSWORD` | `${N8N_DB_PASS}` | Senha do banco |
| `N8N_ENCRYPTION_KEY` | `${N8N_ENCRYPTION_KEY}` | Chave de criptografia das credenciais |
| `N8N_HOST` | `${N8N_HOST}` | Domínio público |
| `N8N_PROTOCOL` | `https` | Protocolo |
| `WEBHOOK_URL` | `${N8N_WEBHOOK_URL}` | URL base para webhooks |
| `TZ` | `America/Sao_Paulo` | Fuso horário |

---

## Persistência

O n8n armazena dados em dois lugares:

| Local | Conteúdo |
|---|---|
| Volume `n8n_n8n_data` | Arquivo `config` com `encryptionKey`, arquivos de sessão |
| Banco PostgreSQL (`n8n`) | Workflows, execuções, credenciais criptografadas, usuários |

> A `N8N_ENCRYPTION_KEY` deve sempre corresponder ao valor em `/home/node/.n8n/config` no volume. Divergência causa crash no boot. Ver [004-n8n_encryption_key](../troubleshooting/004-n8n_encryption_key.md).

---

## Migração SQLite → PostgreSQL

O n8n foi originalmente implantado com SQLite e migrado para PostgreSQL. Ver [002-migracao_n8n_sqlite_postgres](../troubleshooting/002-migracao_n8n_sqlite_postgres.md).

---

## Credenciais nos Workflows

Credenciais são criptografadas com a `N8N_ENCRYPTION_KEY` antes de salvar no banco. Cada nó referencia uma credencial por `id`.

Para atualizar a credencial Postgres de todos os nós via API:

```python
import requests

API_BASE = "https://<seu-dominio>/api/v1"
TOKEN = "<n8n-api-key>"
HEADERS = {"X-N8N-API-KEY": TOKEN, "Content-Type": "application/json"}
NEW_CRED_ID = "<novo-id>"

# Listar workflows
workflows = requests.get(f"{API_BASE}/workflows", headers=HEADERS).json()["data"]

for wf in workflows:
    changed = False
    for node in wf.get("nodes", []):
        if "postgres" in node.get("type", "").lower():
            if "postgres" in node.get("credentials", {}):
                node["credentials"]["postgres"]["id"] = NEW_CRED_ID
                changed = True
    if changed:
        requests.patch(f"{API_BASE}/workflows/{wf['id']}", headers=HEADERS, json=wf)
```

Ver guia completo: [006-n8n_update_postgres_credentials](../troubleshooting/006-n8n_update_postgres_credentials.md)

---

## Referências

- [n8n Documentation](https://docs.n8n.io/)
- [Runbook: n8n](../runbooks/n8n.md)
- [Troubleshooting: Encryption Key](../troubleshooting/004-n8n_encryption_key.md)
