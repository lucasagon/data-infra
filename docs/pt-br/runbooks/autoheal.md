# Runbook: Autoheal

**Container:** `autoheal`
**Compose:** `/root/data/docker-compose.yml`
**Função:** Monitora containers com healthcheck configurado e reinicia automaticamente os que entram em estado `unhealthy`.

---

## Configuração atual

| Variável | Valor | Descrição |
|---|---|---|
| `AUTOHEAL_CONTAINER_LABEL` | `all` | Monitora **todos** os containers com healthcheck, independente de label |

---

## Diagnóstico

```bash
# Acompanhar logs em tempo real (reinicializações realizadas)
docker logs autoheal -f --tail=100

# Ver status do container autoheal
docker inspect autoheal --format='{{.State.Status}}'

# Listar containers com healthcheck e seus estados atuais
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(healthy|unhealthy|starting)"

# Inspecionar o healthcheck de um container específico
docker inspect <container_name> --format='{{json .State.Health}}' | jq
```

---

## Operações

```bash
# Reiniciar o autoheal
docker restart autoheal

# Parar o autoheal (desativa a recuperação automática)
docker stop autoheal

# Subir o autoheal via compose
docker compose -f /root/data/docker-compose.yml up -d autoheal

# Forçar reinício manual de um container unhealthy (sem aguardar autoheal)
docker restart <container_name>
```

---

## Containers monitorados

Com `AUTOHEAL_CONTAINER_LABEL=all`, o autoheal age sobre qualquer container que possua healthcheck definido. No stack atual, o único container com healthcheck configurado é:

| Container | Endpoint de saúde |
|---|---|
| `n8n` | `http://localhost:5678/healthz` |

---

## Comportamento esperado

- O autoheal verifica continuamente o estado dos containers.
- Quando um container entra em `unhealthy`, o autoheal aguarda o intervalo configurado e então executa `docker restart` no container afetado.
- O evento de reinício aparece nos logs com o nome do container e o motivo.

---

> O autoheal não possui acesso à rede `app_network` — ele monta diretamente o socket Docker (`/var/run/docker.sock`). Qualquer problema de comunicação com o daemon Docker indica falha no socket ou permissão insuficiente.
