# Padrão Incremental para endpoints `Listar*` da Omie

## Objetivo
Padronizar ingestão incremental para endpoints `Listar*` (clientes, categorias, contas, projetos, etc.) usando os filtros nativos da Omie por data/hora de inclusão/alteração.

## Por que usar este padrão
- Evita full refresh desnecessário.
- Reduz tempo e custo de processamento.
- Diminui risco de lock/conflito por `TRUNCATE`.
- Permite reuso do mesmo desenho em todos os pipelines `Listar*`.

## Filtros nativos recomendados
No payload de `Listar*`, usar:
- `filtrar_por_data_de`
- `filtrar_por_data_ate`
- `filtrar_por_hora_de`
- `filtrar_por_hora_ate`
- `filtrar_apenas_alteracao` = `"S"` (principal)
- `filtrar_apenas_inclusao` = `"S"` (opcional em segunda passada)

## Watermark (checkpoint)
Armazenar, por stream e conta, o último timestamp processado com sucesso.

Exemplo de chave lógica:
- `system=omie`
- `stream=clientes`
- `account=omie_a`

Timestamp de referência (ordem de prioridade):
1. `info.dAlt + info.hAlt`
2. fallback: `info.dInc + info.hInc`

## Estratégia de janela
1. Ler último watermark salvo.
2. Calcular início da janela com sobreposição de segurança (ex.: `-5 minutos`).
3. Definir fim da janela como `agora`.
4. Chamar `Listar*` paginando normalmente.
5. Fazer `UPSERT` no destino (nunca `TRUNCATE` em incremental).
6. Atualizar watermark para o maior timestamp realmente processado.

## Regras de robustez
- Se resposta vier vazia, não retroceder watermark.
- Se erro no meio da execução, não avançar watermark.
- Tratar timezone explicitamente (UTC no pipeline; conversão apenas no payload, se necessário).
- Aplicar deduplicação por chave natural do endpoint + conta Omie.

## Modelo de persistência do watermark (sugestão)
Tabela: `integracoes.omie_sync_state`

Campos mínimos:
- `system` (text)
- `stream` (text)
- `account` (text)
- `last_event_at` (timestamptz)
- `updated_at` (timestamptz)

Constraint:
- `UNIQUE (system, stream, account)`

## Full refresh x Incremental
- Full refresh: uso excepcional (bootstrap/reconciliação), pode truncar.
- Incremental: operação padrão diária/contínua, sempre por `UPSERT`.

## Aplicação para outros endpoints `Listar*`
Para refatorar outros pipelines, repetir exatamente:
1. inserir filtros de janela no loader,
2. remover `TRUNCATE` no modo incremental,
3. salvar watermark por stream/conta,
4. manter full refresh opcional por flag.

