# Runbook: Docker — Comandos Gerais

---

```bash
# Ver status de todos os containers
docker ps

# Ver logs de um container
docker logs <container_name> -f --tail=100

# Reiniciar um container
docker restart <container_name>

# Parar e subir stack completa
docker compose down
docker compose up -d

# Recriar um container específico (aplica mudanças no compose/env)
docker compose up -d --force-recreate <service_name>

# Ver uso de recursos em tempo real
docker stats

# Ver uso de disco do Docker
docker system df

# Limpar recursos não utilizados (imagens, containers parados, volumes órfãos)
docker system prune -f

# Limpar apenas imagens antigas
docker image prune -a -f
```
