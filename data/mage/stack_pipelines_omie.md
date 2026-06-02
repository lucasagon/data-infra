# Stack de Pipelines Omie no Mage

Este documento descreve como a stack foi construída para integrar a API Omie no Mage, e como replicar o mesmo padrão para outras APIs.

## 1) Objetivo da stack

Padronizar ingestão por endpoint com 3 camadas:

1. `RAW` em `omie_raw`.
2. `STAGING` em `omie_staging`.
3. Tabelas sempre com sufixo `_mage`.

Cada endpoint possui **1 pipeline próprio** no Mage.

## 2) Padrão de pipeline

Cada pipeline segue esta estrutura de blocos:

1. `data_loader`:
- Chama API externa.
- Pagina resultados.
- Enriquecimento com metadados (`extracted_at`, `ingestion_run_id`, `omie_account`).

2. `data_exporter` RAW:
- Cria tabela RAW (`CREATE TABLE IF NOT EXISTS ...`).
- Faz `upsert` com `ON CONFLICT` pela chave do endpoint.

3. `transformer`:
- Seleciona/normaliza campos para STAGING.
- Deduplica em memória por chave quando necessário.

4. `data_exporter` STAGING:
- Cria tabela STAGING.
- Faz `upsert` na tabela final de consumo.

## 3) Multi-conta Omie (App A/B)

A seleção de conta é por variável de ambiente:

- `OMIE_ACTIVE_ACCOUNT=A|B`
- `OMIE_APP_KEY_A`, `OMIE_APP_SECRET_A`
- `OMIE_APP_KEY_B`, `OMIE_APP_SECRET_B`

No loader, a credencial é resolvida dinamicamente pela conta ativa.

## 4) Endpoints implementados

Pipelines criados:

- `omie_clientes_mage`
- `omie_departamentos_mage`
- `omie_contas_corrente_mage`
- `omie_categorias_mage`
- `omie_projetos_mage`
- `omie_contas_receber_mage`
- `omie_movimentacoes_financeiras_mage`
- `omie_formas_pagamento_mage`
- `omie_vendedores_mage`

## 5) Regras de nomenclatura e schemas

- RAW: `omie_raw.<endpoint>_mage`
- STAGING: `omie_staging.<endpoint>_mage`
- Chave de `upsert`: chave natural do endpoint + `omie_account` quando aplicável.

## 6) Agendamento (triggers)

Padrão de trigger definido:

- Nome: `daily`
- Frequência: `@daily`
- Status: `ACTIVE`

Observação importante:
- Em algumas versões do Mage, editar apenas `metadata.yaml` não atualiza UI.
- A UI lê triggers do DB interno (`pipeline_schedule`).

## 7) Deduplicação

A deduplicação está em dois níveis:

1. Banco:
- `PRIMARY KEY`/`ON CONFLICT` impede duplicidade persistida.

2. Lote de inserção:
- Para casos de repetição no mesmo batch, deduplicação em memória antes do `execute_values`.

## 8) Caso especial: movimentações financeiras

### Endpoint e parâmetros

- Endpoint: `https://app.omie.com.br/api/v1/financas/mf/`
- Call: `ListarMovimentos`
- Param obrigatório mantido: `cExibirDepartamentos='S'`

### Problemas encontrados e solução

Problemas:

1. OOM (`exit 137`) em full load.
2. `500` intermitente da Omie (proteção/throttling).
3. `ON CONFLICT ... cannot affect row a second time` por duplicidade no mesmo batch.

Soluções aplicadas:

1. Loader em streaming:
- Em vez de manter tudo em RAM, grava em arquivo temporário `.jsonl`.
- Exportadores leem em lotes e fazem upsert.

2. Throttling e retry:
- Sleep entre páginas (`OMIE_MOVIMENTACOES_REQUEST_SLEEP_SECONDS=3`).
- Retry com backoff exponencial para `429/500/503`.

3. Concorrência:
- Lock de execução para impedir 2 runs simultâneas do mesmo pipeline.

4. Volume por página:
- `OMIE_MOVIMENTACOES_FINANCEIRAS_PAGE_SIZE=100` (reduz pressão na API).

## 9) Logs operacionais

Foram adicionados `print(...)` nos blocos para facilitar troubleshooting na UI/log:

- início de bloco (`START`)
- dataframe vazio
- contagem de linhas (exporters)
- progresso por página (movimentações)

## 10) Como replicar para outra API

Use esta sequência:

1. Criar novo pipeline por endpoint.
2. Definir chave de upsert e schema destino (`raw`/`staging`).
3. Implementar loader com paginação e metadados técnicos.
4. Implementar exporter RAW com `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT`.
5. Implementar transformer de normalização.
6. Implementar exporter STAGING com `ON CONFLICT`.
7. Incluir logs mínimos (`START`, contagens, progresso).
8. Configurar trigger `daily`.
9. Executar 2 rodadas e validar deduplicação por contagem e chave distinta.
10. Se alto volume/API sensível, aplicar desde o início:
- leitura em streaming
- sleep entre requisições
- retry/backoff
- limite de concorrência.

## 11) Checklist de validação

Antes de considerar pronto:

1. Pipeline executa sem erro do início ao fim.
2. Tabelas RAW/STAGING existem.
3. Contagens RAW/STAGING coerentes.
4. Segunda execução não aumenta contagem indevidamente (deduplicação ok).
5. Trigger visível na UI e ativo.

---

Arquivo criado para servir como referência operacional e template de implementação para novas integrações de API no Mage.
