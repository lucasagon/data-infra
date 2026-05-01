# Bootstrap do PostgreSQL

Use esta pasta para versionar scripts SQL ou shell executados no primeiro boot do container `postgres`.

Exemplos de uso:

- criação de bancos como `n8n` e `metabase-db`;
- criação do schema `pgbouncer`;
- criação da função `pgbouncer.get_auth`;
- grants necessários para o `pgbouncer_auth`.

Se o ambiente de produção usar outro diretório no host, ajuste `POSTGRES_INIT_PATH` em `infra/.env`.
