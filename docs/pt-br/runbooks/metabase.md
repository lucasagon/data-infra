# Runbook: Metabase

**Container:** `metabase` | **Porta:** `3000`
**Compose:** `/root/data/docker-compose.yml`
**Banco:** `metabase-db` via PgBouncer (`pgbouncer:6432`)

---

## Diagnóstico

```bash
# Ver logs em tempo real
docker logs metabase -f --tail=100

# Verificar saúde da API
curl -s http://localhost:3000/api/health
```

---

## Operações

```bash
# Reiniciar
docker restart metabase

# Recriar (aplica mudanças no compose/env)
cd /root/data && docker compose up -d --force-recreate metabase
```

---

## Sinais de problema

| Sintoma | Causa provável | Ação |
|---|---|---|
| UI não carrega | Container down ou reiniciando | `docker logs metabase --tail=50` |
| Erro de banco na inicialização | PgBouncer ou PostgreSQL indisponível | Verificar `docker ps` e logs do pgbouncer |
| `unsupported startup parameter` no pgbouncer | Driver JDBC enviando parâmetro não suportado | Ver [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md) — Problema 8 |
