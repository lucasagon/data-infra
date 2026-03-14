# Arquitetura: Metabase

**Versão:** Metabase latest
**Imagem Docker:** `metabase/metabase:latest`
**Banco de dados (app):** `metabase-db` via PgBouncer
**Data de implantação:** 2026-03-13

---

## Visão Geral

O Metabase é a plataforma de BI e dashboards da stack. Armazena sua configuração interna no banco `metabase-db` via PgBouncer, e conecta-se a fontes de dados externas (ex: PostgreSQL) para gerar relatórios.

```
Usuário (HTTPS)
      │
      ▼
   Caddy:443
      │
      ▼
   Metabase:3000
      │
      │ MB_DB_HOST=pgbouncer
      │ MB_DB_PORT=6432
      ▼
  PgBouncer:6432
      │
      ▼
  PostgreSQL:5432
  └── banco: metabase-db
```

---

## Configuração

| Variável | Valor | Descrição |
|---|---|---|
| `MB_DB_TYPE` | `postgres` | Tipo do banco de metadados |
| `MB_DB_HOST` | `pgbouncer` | Host (via pool) |
| `MB_DB_PORT` | `6432` | Porta do PgBouncer |
| `MB_DB_DBNAME` | `${MB_DB_DBNAME}` | Nome do banco |
| `MB_DB_USER` | `${MB_DB_USER}` | Usuário |
| `MB_DB_PASS` | `${MB_DB_PASS}` | Senha |
| `MB_SITE_URL` | `${MB_SITE_URL}` | URL pública do Metabase |

---

## Persistência

| Local | Conteúdo |
|---|---|
| Volume `metabase_data` | Cache e arquivos temporários da aplicação |
| Banco `metabase-db` | Dashboards, perguntas, usuários, configurações |

---

## Compatibilidade com PgBouncer (transaction mode)

O driver JDBC do Metabase (Java) envia o parâmetro `statement_timeout` na conexão, que é incompatível com o modo transaction do PgBouncer. A solução é ignorar esse parâmetro:

```ini
# pgbouncer.ini
ignore_startup_parameters = extra_float_digits,statement_timeout
```

Ver [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md) — Problema 8.

---

## Fontes de Dados

Além do banco interno (`metabase-db`), o Metabase pode conectar-se a outras fontes para análise. Ao adicionar uma conexão ao PostgreSQL da stack, usar:

| Campo | Valor |
|---|---|
| Host | `pgbouncer` (via rede Docker) ou `localhost` |
| Porta | `6432` (PgBouncer) ou `5433` (direto) |
| Banco | nome do banco desejado |

---

## Referências

- [Metabase Documentation](https://www.metabase.com/docs/)
- [Runbook: Metabase](../runbooks/metabase.md)
- [Arquitetura: PgBouncer](pgbouncer.md)
