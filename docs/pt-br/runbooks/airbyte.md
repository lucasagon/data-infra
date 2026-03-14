# Runbook: Airbyte

**Container:** `airbyte-abctl-control-plane` | **Porta:** `8000`

---

## Diagnóstico

```bash
# Ver logs
docker logs airbyte-abctl-control-plane -f --tail=100

# Status via CLI
abctl status

# Logs via CLI
abctl logs
```

---

## Operações

```bash
# Reiniciar via abctl
abctl restart

# Reiniciar container diretamente
docker restart airbyte-abctl-control-plane
```
