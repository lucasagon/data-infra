# Runbook: Uptime Kuma

**Container:** `uptime-kuma` | **Porta:** `3001`
**Compose:** `/root/infra/docker-compose.yml`

---

## Diagnóstico

```bash
# Ver logs
docker logs uptime-kuma -f --tail=100
```

---

## Operações

```bash
# Reiniciar
docker restart uptime-kuma
```
