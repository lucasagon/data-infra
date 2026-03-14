# Troubleshooting: Migração n8n — SQLite para PostgreSQL

**Data:** 2026-03-13
**Status:** ✅ Concluído
**Contexto:** Implementação do PgBouncer exigiu migração do n8n para PostgreSQL

---

## Situação anterior

O n8n estava utilizando **SQLite** como banco de dados interno (padrão quando nenhuma configuração de banco é definida).

```
/home/node/.n8n/database.sqlite
```

Identificado via:
```bash
docker inspect n8n | grep -A 30 '"Env"' | grep -i db
# sem retorno — confirmando ausência de configuração de banco externo

docker exec -it n8n ls /home/node/.n8n/
# database.sqlite, database.sqlite-shm, database.sqlite-wal confirmados
```

---

## Motivação da migração

- Padronização: todos os serviços passando a usar PostgreSQL via PgBouncer
- SQLite não é recomendado para ambientes de produção com uso intenso
- Necessidade de backup centralizado e monitoramento unificado

---

## Backup antes da migração

```bash
docker cp n8n:/home/node/.n8n/database.sqlite ./n8n_backup_$(date +%Y%m%d_%H%M%S).sqlite
```

> ⚠️ Nunca pule este passo — é a única forma de reverter caso algo dê errado.

---

## Processo de migração

### 1. Criação do banco no PostgreSQL

```bash
# Executar o SQL via stdin (o arquivo pode não estar dentro do container)
docker exec -i postgres psql -U postgres < /opt/postgres/init/01-create-databases.sql
```

Ou diretamente:

```sql
SELECT 'CREATE DATABASE n8n'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
```

### 2. Configuração das variáveis de ambiente no `docker-compose.yml`

```yaml
n8n:
  environment:
    DB_TYPE: postgresdb
    DB_POSTGRESDB_HOST: pgbouncer
    DB_POSTGRESDB_PORT: 6432
    DB_POSTGRESDB_DATABASE: n8n
    DB_POSTGRESDB_USER: ${N8N_DB_USER}
    DB_POSTGRESDB_PASSWORD: ${N8N_DB_PASS}
    N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
```

### 3. Restart do container

```bash
cd /root/data && docker compose up -d --force-recreate n8n
```

---

## Validação

```bash
# Confirmar que n8n subiu corretamente
docker logs n8n --tail 30

# Confirmar pool ativo no PgBouncer
PGPASSWORD=<senha> docker exec -it pgbouncer \
  psql -h 127.0.0.1 -p 6432 -U postgres pgbouncer -c "SHOW POOLS;"

# Confirmar tabelas criadas no banco n8n
docker exec postgres psql -U postgres -d n8n -c "\dt" | head -20
```

---

## Rollback (se necessário)

```bash
# Restaurar SQLite
docker cp ./n8n_backup_YYYYMMDD_HHMMSS.sqlite n8n:/home/node/.n8n/database.sqlite

# Remover variáveis de banco do docker-compose.yml e recriar
cd /root/data && docker compose up -d --force-recreate n8n
```

---

## Aprendizados

| # | Aprendizado |
|---|---|
| 1 | Sempre verificar como o serviço está armazenando dados antes de qualquer migração |
| 2 | SQLite não deve ser usado em produção para serviços críticos |
| 3 | Backup do SQLite é simples (`docker cp`) e deve ser feito antes de qualquer alteração |
| 4 | O n8n suporta migração nativa para PostgreSQL apenas via variáveis de ambiente — sem scripts manuais |
| 5 | O arquivo de init do PostgreSQL precisa ser executado via stdin (`<`) quando o container já está rodando, pois o volume `initdb.d` só é lido na criação do container |
