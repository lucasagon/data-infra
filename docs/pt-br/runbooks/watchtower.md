# Runbook: Watchtower

**Container:** `watchtower`
**Compose:** `/root/infra/docker-compose.yml`
**Função:** Atualiza automaticamente as imagens Docker dos containers em execução.

---

## Diagnóstico

```bash
# Ver logs e histórico de atualizações realizadas
docker logs watchtower -f --tail=100
```

---

## Operações

```bash
# Forçar verificação imediata de updates (sem aguardar o intervalo configurado)
docker exec watchtower /watchtower --run-once
```

---

> Em produção, configure notificações no Watchtower (Slack, email, etc.) para ser avisado antes de atualizações automáticas. Updates inesperados podem causar incompatibilidades.
