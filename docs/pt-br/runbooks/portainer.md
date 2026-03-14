# Runbook: Portainer

**Container:** `portainer` | **Porta:** `9000` (HTTP) / `9443` (HTTPS)
**Compose:** `/root/infra/docker-compose.yml`

---

## Diagnóstico

```bash
# Ver logs
docker logs portainer -f --tail=100
```

---

## Operações

```bash
# Reiniciar
docker restart portainer
```
