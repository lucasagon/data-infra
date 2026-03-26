# 008 — Postgres reiniciando com WAL recovery após atualização do Watchtower

## Sintoma

O container `postgres` reinicia inesperadamente e sobe em modo de recuperação WAL:

```
database system was not properly shut down; automatic recovery in progress
redo starts at 4A/4261DF18
```

O PgBouncer registra erros temporários de conexão:

```
pooler error: server login has been failing, cached error: the database system is not yet accepting connections
```

Aplicações dependentes (n8n, Metabase) ficam indisponíveis por 30–60 segundos até o Postgres terminar o recovery.

## Causa raiz

O **Watchtower** detectou uma nova versão da imagem `postgres:16` e recriou o container. Sem um `--stop-timeout` configurado, o Watchtower encerra o container com **SIGKILL** imediatamente, não dando tempo ao Postgres de fazer flush do WAL de forma graciosa.

O Postgres interpreta isso como uma queda abrupta e obrigatoriamente executa recovery na próxima inicialização.

Confirmação nos logs do Docker:

```
04:08:03 → image pulled: docker.io/library/postgres:16
04:08:19 → exitStatus={137 ...}   ← SIGKILL (código 137)
           execDuration=23h55m    ← container rodava há quase 24h
```

## Solução aplicada

Adicionar `--stop-timeout 60` ao comando do Watchtower em `infra/docker-compose.yml`:

```yaml
watchtower:
  command: --cleanup --interval 300 --stop-timeout 60
```

Isso dá 60 segundos para o Postgres executar checkpoint e encerrar graciosamente antes do Watchtower forçar o SIGKILL.

Após a alteração, recriar o container:

```bash
cd /root/infra
docker compose up -d --force-recreate watchtower
```

## Verificação

Após a próxima atualização automática do Watchtower, o Postgres deve subir sem mensagens de recovery:

```
database system is ready to accept connections
```

Para acompanhar em tempo real:

```bash
docker logs postgres -f
```

---

## Problema adicional detectado: Healthcheck do n8n com `curl` inexistente

### Sintoma

O container `n8n` subia sem healthcheck ativo. O Autoheal não conseguia monitorar ou reiniciar o serviço em caso de falha.

Ao inspecionar o container após recriar com o compose:

```
"Output": "OCI runtime exec failed: exec failed: unable to start container process: exec: \"curl\": executable file not found in $PATH"
```

### Causa raiz

O `healthcheck` em `data/docker-compose.yml` usava `curl`, que **não está disponível na imagem `n8nio/n8n`**. A imagem é baseada em Alpine e só disponibiliza `wget`.

### Solução aplicada

Substituir `curl` por `wget` no healthcheck em `data/docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:5678/healthz"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

Recriar o container para aplicar:

```bash
cd /root/data
docker compose up -d --force-recreate n8n
```

### Verificação

```bash
docker ps --filter name=n8n
# Deve mostrar: n8n   Up X minutes (healthy)

docker inspect n8n | grep -A 5 '"Health"'
# "Status": "healthy"
```
