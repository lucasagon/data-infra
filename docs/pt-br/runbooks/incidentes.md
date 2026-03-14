# Runbook: Incidentes Comuns

Referência rápida para os incidentes mais frequentes da stack.

---

## PostgreSQL — Too Many Connections

```bash
# 1. Encerrar conexões idle
docker exec -it postgres psql -U postgres -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle' AND pid <> pg_backend_pid();"

# 2. Verificar status do PgBouncer
docker logs pgbouncer --tail=50

# 3. Se necessário, reiniciar PgBouncer
cd /root/infra && docker compose restart pgbouncer
```

> Ver troubleshooting completo: [001-maxconnections_pgsql](../troubleshooting/001-maxconnections_pgsql.md)

---

## PgBouncer — `unsupported startup parameter`

```bash
# Ver qual parâmetro está sendo rejeitado
docker logs pgbouncer --tail=20 | grep "unsupported"

# Adicionar à lista de ignorados
nano /root/infra/pgbouncer/pgbouncer.ini
# ignore_startup_parameters = extra_float_digits,statement_timeout,<novo_parametro>

# Recarregar sem downtime
docker kill --signal=SIGHUP pgbouncer
```

> Ver troubleshooting completo: [003-pgbouncer_deploy](../troubleshooting/003-pgbouncer_deploy.md)

---

## n8n — Mismatching Encryption Keys

```bash
# Ler a chave existente no volume
docker run --rm -v n8n_n8n_data:/data alpine cat /data/config

# Copiar o valor de "encryptionKey" e colocar no .env
nano /root/data/.env
# N8N_ENCRYPTION_KEY=<valor do volume>

cd /root/data && docker compose up -d --force-recreate n8n
```

> Ver troubleshooting completo: [004-n8n_encryption_key](../troubleshooting/004-n8n_encryption_key.md)

---

## Container não sobe

```bash
# Ver motivo da falha
docker logs <container_name> --tail=50

# Verificar se porta está em uso
ss -tlnp | grep <porta>

# Recriar o container
docker compose up -d --force-recreate <service_name>
```

---

## Disco cheio

```bash
# Ver uso de disco
df -h

# Ver o que o Docker está ocupando
docker system df

# Limpar recursos não utilizados
docker system prune -f

# Limpar apenas imagens antigas
docker image prune -a -f
```

---

## Caddy — Certificado SSL não renova

```bash
# Ver logs de erro
docker logs caddy --tail=100 | grep -i error

# Forçar reload
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Verificar se porta 80 está acessível externamente (obrigatória para ACME)
curl http://seu-dominio.com
```
