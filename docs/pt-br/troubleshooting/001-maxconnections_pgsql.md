# Troubleshooting: Too Many Connections — PostgreSQL (Docker)

**Data:** 2026-03-13
**Ambiente:** PostgreSQL 16 via Docker / Docker Compose
**Status:** ✅ Resolvido

---

## 1. Sintoma

O banco de dados passou a rejeitar novas conexões com o erro:

```
FATAL: sorry, too many clients already
```

O erro impedia inclusive conexões administrativas via `psql`, impossibilitando diagnóstico direto.

---

## 2. Diagnóstico

### 2.1 Tentativa de conexão administrativa

```bash
docker exec -it postgres psql -U postgres -d postgres
# Resultado: FATAL: sorry, too many clients already
```

### 2.2 Identificação da configuração atual

```bash
docker inspect postgres | grep -A 20 '"Env"'
docker inspect postgres | grep -A 5 'max_connections'
```

**Conclusão:** O container estava rodando com `max_connections` padrão do PostgreSQL (**100 conexões**), sem nenhuma configuração explícita no `docker-compose.yml`.

### 2.3 Causa raiz

O servidor PostgreSQL atingiu o limite padrão de 100 conexões simultâneas. As conexões não estavam sendo encerradas adequadamente pelas aplicações (conexões em estado `idle` acumuladas), esgotando o pool disponível.

**Agravante:** Ausência de um connection pooler (ex: PgBouncer) para gerenciar e reutilizar conexões.

---

## 3. Resolução

### 3.1 Alteração no `docker-compose.yml`

Adicionado o parâmetro `command` e variável de ambiente para tornar `max_connections` configurável via `.env`:

```yaml
postgres:
    image: postgres:16
    container_name: postgres
    restart: unless-stopped
    command: postgres -c max_connections=${POSTGRES_MAX_CONNECTIONS:-300}
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_MAX_CONNECTIONS: ${POSTGRES_MAX_CONNECTIONS:-300}
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app_network
```

### 3.2 Adição no `.env`

```env
POSTGRES_MAX_CONNECTIONS=300
```

### 3.3 Aplicação da mudança

```bash
cd /root/infra && docker compose up -d --force-recreate postgres
```

### 3.4 Validação

```bash
docker exec -it postgres psql -U postgres -c "SHOW max_connections;"
```

---

## 4. Observações Importantes

- `max_connections` é uma configuração **global do servidor** — vale para todos os databases da instância.
- Aumentar `max_connections` consome mais memória RAM (~5–10MB por conexão adicional). Monitore o consumo após a alteração.
- O valor `:-300` no `docker-compose.yml` é um fallback padrão caso a variável não esteja definida no `.env`.

---

## 5. Aprendizados

| # | Aprendizado |
|---|---|
| 1 | Sempre configurar `max_connections` explicitamente no ambiente de produção — nunca depender do valor padrão (100) |
| 2 | Conexões `idle` acumuladas são um sinal de que as aplicações não estão encerrando conexões corretamente |
| 3 | Sem um connection pooler, cada serviço abre conexões diretamente no PostgreSQL, esgotando o limite rapidamente |
| 4 | Em situações críticas onde nem o `psql` consegue conectar, o caminho é forçar via `docker exec` com comando direto |

---

## 6. Ações Preventivas Recomendadas

- [ ] **Implementar PgBouncer** como connection pooler para reduzir conexões diretas ao PostgreSQL
- [ ] **Configurar alertas** de monitoramento quando conexões ativas ultrapassarem 80% do `max_connections`
- [ ] **Query de monitoramento** para rodar periodicamente:

```sql
SELECT usename, application_name, state, count(*)
FROM pg_stat_activity
GROUP BY usename, application_name, state
ORDER BY count(*) DESC;
```

---

## 7. Referências

- [PostgreSQL Docs — Connection Settings](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PgBouncer — Connection Pooler](https://www.pgbouncer.org/)
- [Docker Postgres Image — Environment Variables](https://hub.docker.com/_/postgres)
