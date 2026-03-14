# Runbook: Caddy

**Container:** `caddy` | **Portas:** `80` (HTTP), `443` (HTTPS)
**Compose:** `/root/infra/docker-compose.yml`
**Config:** `/opt/caddy/Caddyfile`

---

## Diagnóstico

```bash
# Ver logs em tempo real
docker logs caddy -f --tail=100

# Ver apenas erros
docker logs caddy --tail=100 | grep -i error

# Validar Caddyfile antes de aplicar
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Ver certificados SSL gerenciados
docker exec caddy caddy list-certificates
```

---

## Operações

```bash
# Recarregar Caddyfile sem downtime
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Reiniciar container
docker restart caddy
```

---

## Sinais de problema

| Sintoma | Causa provável | Ação |
|---|---|---|
| Certificado SSL não renova | Porta 80 bloqueada externamente | Verificar firewall e `curl http://dominio.com` |
| Erro 502 Bad Gateway | Container de destino down | Verificar o serviço alvo (`docker ps`) |
| Caddyfile inválido | Erro de sintaxe | `caddy validate` antes de `reload` |

> O Caddy renova certificados automaticamente via Let's Encrypt. A porta **80 deve estar acessível publicamente** para o desafio ACME funcionar.
