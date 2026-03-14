# Arquitetura: CloudBeaver

**Versão:** CloudBeaver latest
**Imagem Docker:** `dbeaver/cloudbeaver:latest`
**Data de implantação:** 2026-03-13

---

## Visão Geral

O CloudBeaver é o cliente SQL web da stack. Permite executar queries, gerenciar bancos e inspecionar dados diretamente pelo browser, sem instalar nenhum cliente local. É acessado internamente na porta `8978`.

```
Usuário (browser)
      │
      ▼
   Caddy:443  (ou direto: localhost:8978)
      │
      ▼
  CloudBeaver:8978
      │
      ├── via PgBouncer:6432  → PostgreSQL (uso geral)
      └── via localhost:5433  → PostgreSQL (acesso direto admin)
```

---

## Configuração

| Variável | Valor | Descrição |
|---|---|---|
| `CB_SERVER_BIND_ADDRESS` | `0.0.0.0` | Aceita conexões de qualquer interface |
| `CB_SERVER_PORT` | `8978` | Porta interna |
| `CB_AUTH_ADMIN_NAME` | `${CB_ADMIN_USER}` | Usuário administrador |
| `CB_AUTH_ADMIN_PASSWORD` | `${CB_ADMIN_PASSWORD}` | Senha do administrador |

As credenciais são definidas via `.env` em `/root/data/.env`.

---

## Persistência

| Volume | Conteúdo |
|---|---|
| `cloudbeaver_data` | Workspace: conexões salvas, configurações de usuário, scripts |

---

## Conexões recomendadas

Ao configurar conexões no CloudBeaver, use:

| Conexão | Host | Porta | Uso |
|---|---|---|---|
| Via PgBouncer | `pgbouncer` | `6432` | Uso geral (pooled) |
| Direto ao PostgreSQL | `postgres` | `5432` (interno) | Admin, DDL, manutenção |
| Via host (externo) | `localhost` | `5433` | Acesso de fora do Docker |

---

## Aplicar nova senha do admin

Após alterar `CB_ADMIN_PASSWORD` no `.env`:

```bash
cd /root/data && docker compose up -d --force-recreate cloudbeaver
```

---

## Referências

- [CloudBeaver Documentation](https://dbeaver.com/docs/cloudbeaver/)
- [DBeaver Docker Hub](https://hub.docker.com/r/dbeaver/cloudbeaver)
