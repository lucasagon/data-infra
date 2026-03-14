# Runbook: n8n

**Container:** `n8n` | **Porta:** `5678`
**Compose:** `/root/data/docker-compose.yml`
**Banco:** `n8n` via PgBouncer (`pgbouncer:6432`)

---

## Diagnóstico

```bash
# Ver logs em tempo real
docker logs n8n -f --tail=100

# Ver variáveis de ambiente configuradas
docker inspect n8n | grep -A 30 '"Env"'

# Verificar chave de criptografia no volume
docker run --rm -v n8n_n8n_data:/data alpine cat /data/config
```

---

## Operações

```bash
# Reiniciar
docker restart n8n

# Recriar (aplica mudanças no compose/env)
cd /root/data && docker compose up -d --force-recreate n8n
```

---

## Backup

```bash
# Backup do volume completo
docker run --rm -v n8n_n8n_data:/data alpine \
  tar czf - /data > ~/n8n_backup_$(date +%Y%m%d).tar.gz
```

---

## Sinais de problema

| Sintoma | Causa provável | Ação |
|---|---|---|
| `Mismatching encryption keys` | `N8N_ENCRYPTION_KEY` diverge do volume | Ver [004-n8n_encryption_key](../troubleshooting/004-n8n_encryption_key.md) |
| `unsupported startup parameter: statement_timeout` | PgBouncer sem `statement_timeout` em `ignore_startup_parameters` | Ver [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md) — Problema 8 |
| `Last session crashed` | Crash no boot anterior; ver log completo | `docker logs n8n 2>&1 \| head -50` |
| Container reiniciando em loop | Erro no boot | `docker logs n8n --tail=30` |
