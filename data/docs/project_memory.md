# Project Memory

## Como usar este arquivo

Este arquivo é a memória viva do projeto.
Antes de alterar Mage, n8n ou Postgres:
1. Ler este arquivo inteiro.
2. Identificar itens impactados.
3. Executar alteração.
4. Atualizar itens existentes ou criar novos itens.

---

## Estado Atual (resumo)

- Data de referência (UTC): 2026-06-02
- Ambiente principal:
  - Mage em Docker com volume persistente.
  - n8n em Docker.
  - Postgres em Docker.
  - pgAdmin4 para acesso ao banco (subsituiu CloudBeaver em 2026-06-02).
  - Traefik v3 como reverse proxy (subsituiu Caddy em 2026-06-02).

### Mage

- Fonte ativa dos arquivos do projeto Mage:
  - `/var/lib/docker/volumes/data_mage_data/_data/default_repo/`
- Banco de metadata do Mage:
  - Postgres database: `mage_metadata`
  - Tabela de agendamento/triggers usada pelo app: `pipeline_schedule`
- Regra atual dos exporters (exceto exceções específicas documentadas):
  - Uso de destino dinâmico via `integracoes.api_client_streams`.
  - Padrão de carga majoritário em `full refresh` (com `TRUNCATE` antes de inserir), conforme ajustes recentes.

### Runrun (pipelines)

- `runrun_tasks_mage`:
  - Destinos atuais por `api_client_streams` para `runrun_a`:
    - RAW: `runrun_raw.tasks_a`
    - STAGING: `runrun_staging.tasks_a`
  - Loader ajustado para buscar tasks abertas e fechadas com:
    - `bypass_status_default=true`
    - `is_closed=false` e `is_closed=true`
  - Loader com retry/backoff para rate limit:
    - erro recorrente observado: HTTP 429 em paginação alta de `is_closed=true`
  - Staging ajustado para manter campos base + `custom_fields` JSON (sem flatten obrigatório).
  - Campo adicional em staging: `project_id`.
  - Execuções recentes relevantes:
    - `pipeline_run_id=1646` (`COMPLETED`) em `runrun_tasks_mage` com `client_name=runrun_a`
    - `pipeline_run_id=1647` (`COMPLETED`) em `runrun_tasks_mage`
    - `pipeline_run_id=1652` (`FAILED`) por 429 no loader
    - `pipeline_run_id=1654` (`FAILED`) por serialização JSON (`ndarray`) no exporter de staging; corrigido em seguida

- `runrun_projects_mage`:
  - Destinos atuais por `api_client_streams` para `runrun_a`:
    - RAW: `runrun_raw.projects_a`
    - STAGING: `runrun_staging.projects_a`
  - Staging ajustado para carregar `name` derivado do payload da raw.

### TwoRH (pipelines)

- `tworh_employees_mage`:
  - Destinos atuais por `api_client_streams` para `tworh_a`:
    - RAW: `tworh_raw.employees_a`
    - STAGING: `tworh_staging.employees_a`
  - Staging ajustado para schema de negócio (`employees_a`) com upsert por `employee_id`.
  - Ajuste adicional: `personal_document` normalizado para `TEXT` para evitar erro de truncamento.
  - Carga validada com sucesso após ajustes.
  - **Cadeia completa (2026-06-01):** pipeline agora inclui duas etapas adicionais após o staging Python:
    1. `export_tworh_raw_to_staging_mage`: upsert de `tworh_raw.attendance_register` → `tworh_staging.attendance_register` e `tworh_raw."Employees"` (Airbyte) → `tworh_staging.employees`.
    2. `export_tworh_analytics_mage`: popula `tworh_analytics.dim_employees` (upsert por `employee_id`) e `tworh_analytics.f_attendance_register` (upsert por `attendance_register_id`; JOIN com employees deduplificado por `employee_number DESC employee_id`).
  - Nota: `tworh_staging.employees` tem `employee_number` não-único; dedup aplicado no JOIN analytics via `DISTINCT ON (employee_number) ORDER BY employee_id DESC`.

### Omie (pipelines)

- Pipelines Omie em operação com padrão dinâmico por `integracoes.api_client_streams`.
- Exceção de tratamento especial:
  - `omie_movimentacoes_financeiras_mage` mantido fora das mudanças massivas recentes de full refresh.
- Multi-conta em uso no ambiente:
  - `omie_a` e `omie_b` com diferenças de volume e paginação observadas em execuções históricas.

- `omie_contas_receber_mage` — migrado para carga incremental (2026-05-29):
  - Loader passou a usar `filtrar_por_data_de/ate` com watermark - 10 min de margem.
  - RAW exporter: TRUNCATE removido; agora faz upsert por `(codigo_lancamento_omie, omie_account)`.
  - Staging exporter: DROP+CREATE+INSERT substituído por CREATE IF NOT EXISTS + UPSERT com condição `omie_updated_at`.
  - Staging tables `contas_receber_a/b`: novas colunas `data_previsao`, `dalt`, `dinc`, `halt`, `hinc`, `omie_created_at`, `omie_updated_at` + unique constraints adicionados.
  - Analytics: novo bloco `export_omie_contas_receber_analytics_mage` (staging → analytics via upsert por `sk_lancamento`).
  - Analytics tables `f_contas_receber_a/b`: nova coluna `omie_updated_at` + unique constraint em `sk_lancamento`.
  - Watermark: tabela `integracoes.api_sync_state` criada; atualizada ao fim de cada execução bem-sucedida.
  - `integracoes.api_client_streams`: colunas `analytics_dest_schema` e `analytics_dest_table` adicionadas e populadas.
  - `utils/integracoes.py`: `get_destination()` ampliado; funções `get_sync_state()` e `update_sync_state()` adicionadas.
  - Variável `full_refresh=true` no trigger ativa TRUNCATE + janela completa (desde 01/01/2020) sem alterar watermark em falha.

### Triggers/Schedules (Mage)

- Triggers ficam persistidos no metadata do Mage (não apenas no `metadata.yaml`).
- Exemplo validado:
  - `runrun_tasks_mage` com schedule `@daily` e status `ACTIVE`.
- Regra operacional:
  - quando houver divergência entre UI/execução e arquivos, considerar metadata do Mage como fonte runtime.

### n8n (workflows)

- Workflows ativos e ajustados em etapas anteriores para arquitetura `_a`:
  - `wyKDZ55JXLdWXqFN` (`[RunRun] ACTIVE_USERS | Staging -> Analytics`)
  - `kYD15V7Znh5af7Yq` (`[RunRun] [Tasks Working On Guarantee] + TWO RH TRIGGER`)
- Workflows analisados/ajustados em frentes anteriores (histórico desta iniciativa):
  - `I3omC91MySHCYHRw`
  - `MwOs4k8y8Rs673SJ`
  - `Zf0TMkBQPjKfBf5f`
  - `Aot2dUbyDMcGLeNo`
- Padrão adotado: migrar origem/destino para tabelas `_a` quando aplicável.
- Ajuste recente no workflow `kYD15V7Znh5af7Yq` (node `c65892` / `f_task_events`):
  - carga de `runrun_analytics.f_task_events_a` alterada para origem `runrun_staging.task_events` (antes: `runrun_raw.task_events`);
  - política de `ON CONFLICT (raw_id)` alterada para `DO UPDATE` dos campos de evento, garantindo sincronização de `event_type` com staging.
- Ajuste recente no workflow `kYD15V7Znh5af7Yq` (node `67547698-544f-4a04-9ee7-2034da042f0d` / `task_current_state`):
  - lógica alterada para reconstruir `runrun_analytics.task_current_state_a` com `TRUNCATE + INSERT`;
  - seleção baseada no último evento por `task_id` (`ROW_NUMBER` em `happened_at DESC, raw_id DESC`) e filtro final `event_type='working'`.
  - mesmo node passou a:
    - registrar snapshot por execução em `runrun_analytics.task_current_state_capture_log_a`;
    - recalcular a tabela de reconciliação `runrun_analytics.f_task_capture_reconciliation_a`.

### Metabase (dashboards/cards)

- Dashboard `7` (`RunRun - Relatório de Atividades v2`):
  - Card `246` (`Contagens`) ajustado para usar `source-card=245` (base `_a`), removendo dependência do card legado `128`.
  - Com isso, os cards derivados `247`, `248`, `249` e `250` passam a consumir a cadeia `_a` de forma consistente.
- Card legado `128` (`Ponto de Hoje`):
  - Mantido arquivado e desvinculado de dashboard para evitar reuso acidental.

### Postgres (estruturas relevantes)

- `runrun_staging.tasks_a`:
  - limpeza de schema concluída para manter apenas colunas base + JSON (`custom_fields`, `assignments`, `tags`, `follower_ids`).
  - colunas legado `custom_*` removidas do staging principal.
- Backup de segurança criado:
  - `runrun_staging_archive.tasks_a_backup_20260526182715`
- `runrun_analytics.vw_tasks_flattened_a`:
  - recriada para refletir schema novo de `tasks_a` sem dependências de colunas legado.
- Migração de chaves em analytics (histórico relevante):
  - transição de `sk_task` para `task_id` em fluxos `_a`.
  - ajustes em views e consumidores para manter compatibilidade.
- Descontinuação de tabela legado:
  - `runrun_analytics.dim_users` removida após refatorar dependências para `dim_users_a`.
- `runrun_analytics.f_task_events_a`:
  - sincronização corretiva executada via upsert completo por `raw_id` a partir de `runrun_staging.task_events`;
  - estado validado após correção: contagem e `event_type` alinhados com staging.
- `runrun_analytics.task_current_state_a`:
  - saneamento aplicado para remover estados stale de tarefas já encerradas (`past`);
  - tabela passou a refletir apenas tarefas cujo último evento é `working`.
- `runrun_analytics.task_current_state_capture_log_a`:
  - nova tabela para auditoria de capturas por execução, com granularidade por `capture_run_id + task_id + performer_id`.
- `runrun_analytics.f_task_capture_reconciliation_a`:
  - nova tabela de tira-teima por `task_id + performer_id` com:
    - `capture_count`,
    - janela capturada (`first_captured_at`/`last_captured_at`),
    - `recorded_time_seconds` (de `runrun_staging.task_events.time_worked`),
    - `gap_seconds` e `gap_ratio`.
- `runrun_analytics.vw_task_capture_reconciliation_a`:
  - nova view de consumo no Metabase com status de reconciliação (`OK`, `Possível ajuste manual`, `Sem base suficiente`).

---

## Registro de Mudanças

> Formato:
> - Data/hora UTC
> - Componente
> - Mudança
> - Impacto
> - Validação

- 2026-05-27T00:00:00Z
  - Componente: Governança do projeto
  - Mudança: criação de `diretriz.md` e `project_memory.md`.
  - Impacto: estabelece regra obrigatória de leitura e atualização da memória antes/depois de alterações em Mage, n8n e Postgres.
  - Validação: arquivos criados em `/root/data/`.

- 2026-05-27T00:00:00Z
  - Componente: Memória do projeto
  - Mudança: consolidação do contexto operacional de Mage, triggers/runs, n8n e Postgres.
  - Impacto: cria baseline única para próximas alterações e auditoria técnica.
  - Validação: seções deste arquivo atualizadas com estado conhecido até esta data.

- 2026-05-27T11:06:00Z
  - Componente: Metabase
  - Mudança: no dashboard `7`, card `246` (`Contagens`) alterado de `source-card=128` para `source-card=245`, eliminando dependência legada no fluxo de métricas de colaboradores.
  - Impacto: padroniza os indicadores (`247`, `248`, `249`, `250`) para a cadeia `_a`, reduzindo risco de divergência futura por uso de fonte legada.
  - Validação: consulta no metadata confirmou `report_card.id=246` com `source_card=245` e ausência de cards referenciando `\"source-card\": 128`.

- 2026-05-27T11:09:00Z
  - Componente: Metabase
  - Mudança: remoção do vínculo do card legado `128` (`Ponto de Hoje`) com o dashboard `4` (`report_dashboardcard`), mantendo o card arquivado.
  - Impacto: elimina exposição operacional do card legado e reduz risco de reutilização indevida em análises ativas.
  - Validação: consulta no metadata confirmou ausência de linhas em `report_dashboardcard` para `card_id=128`.

- 2026-05-27T11:16:00Z
  - Componente: n8n + Postgres
  - Mudança: no workflow `kYD15V7Znh5af7Yq`, node `c65892` (`f_task_events`) alterado para carregar `runrun_analytics.f_task_events_a` a partir de `runrun_staging.task_events` com `ON CONFLICT (raw_id) DO UPDATE`; em seguida executada sincronização corretiva no Postgres para atualizar histórico já carregado.
  - Impacto: `f_task_events_a.event_type` passa a refletir o `event_type` de `runrun_staging.task_events` de forma determinística, evitando divergência histórica entre staging e fato.
  - Validação: `runrun_staging.task_events` e `runrun_analytics.f_task_events_a` com `596405` linhas cada; distribuição idêntica de `event_type` (`past=596401`, `working=4`); divergências por `raw_id` em `event_type` = `0`.

- 2026-05-27T11:22:00Z
  - Componente: n8n + Postgres
  - Mudança: no workflow `kYD15V7Znh5af7Yq`, node `task_current_state` (`67547698-544f-4a04-9ee7-2034da042f0d`) alterado para recalcular `runrun_analytics.task_current_state_a` por snapshot do último evento por tarefa (com filtro final `working`), substituindo estratégia anterior de upsert incremental apenas sobre eventos `working`.
  - Impacto: elimina tarefas com estado obsoleto em `task_current_state_a` e corrige base usada por views de atividade/inatividade no Metabase.
  - Validação: recarga corretiva executada; `task_current_state_a` com `4` linhas (`working=4`), `stale_rows=0` ao comparar com último evento de `runrun_staging.task_events`.

- 2026-05-27T11:33:00Z
  - Componente: n8n + Postgres + Metabase source layer
  - Mudança:
    - criação de `runrun_analytics.task_current_state_capture_log_a`;
    - criação de `runrun_analytics.f_task_capture_reconciliation_a`;
    - criação de `runrun_analytics.vw_task_capture_reconciliation_a`;
    - extensão do SQL do node `task_current_state` no workflow `kYD15V7Znh5af7Yq` para registrar captura por execução e recalcular reconciliação.
  - Impacto: habilita tira-teima operacional entre tempo registrado (`time_worked`) e tempo inferido pela captura da integração, com rastreabilidade por execução.
  - Validação:
    - carga inicial executada com sucesso;
    - `task_current_state_capture_log_a`: `4` linhas, `1` execução;
    - `f_task_capture_reconciliation_a`: `4` linhas;
    - `vw_task_capture_reconciliation_a`: status retornando `OK` e `Possível ajuste manual`.

- 2026-05-27T13:08:22Z
  - Componente: n8n + Postgres (runrun_analytics)
  - Mudança:
    - workflow `kYD15V7Znh5af7Yq`, node `cb5890ea-78fc-4598-924b-cecb29a8431a` (`f_task_faturamento`) alterado para carregar `runrun_analytics.f_task_faturamento_a.data` a partir de `runrun_staging.task_custom_fields_a` (`field_id='custom_31'`), convertendo `value_label` no padrão `MM/AAAA` para data (`01/MM/AAAA`);
    - mantido cálculo de `faturamento` (`custom_11`) e `coparticipacao` (`custom_170`);
    - `runrun_analytics.f_task_faturamento_a` teve coluna renomeada de `data_criacao` para `data`;
    - views `runrun_analytics.vw_faturamento_filial_mes_a` e `runrun_analytics.vw_ranking_operacional_a` recriadas para usar `ftfa.data`.
  - Impacto:
    - fatos de faturamento passam a usar mês de competência informado no custom field (`custom_31`), e não mais `created_at` da task;
    - consumo analítico mensal nas views impactadas passa a refletir competência operacional do workflow.
  - Validação:
    - estrutura da `f_task_faturamento_a` confirmada com coluna `data` e sem `data_criacao`;
    - carga executada via SQL do node: `INSERT 0 12895`;
    - contagem atual da fato: `12907` linhas (`4601` com `data` preenchida);
    - workflow persistido no n8n com `custom_31` presente e `data_criacao` ausente no JSON de nodes (`has_old=0`, `has_custom31=1`).

- 2026-05-27T13:11:24Z
  - Componente: Postgres (runrun_analytics)
  - Mudança: `runrun_analytics.vw_ranking_operacional_a` ajustada para considerar apenas tarefas com `ftfa.data IS NOT NULL` no CTE base.
  - Impacto: ranking operacional passa a computar somente tasks com `custom_31` preenchido/convertido em data.
  - Validação: query de base retornou `3472` `task_id` distintos elegíveis com `data` não nula, `equipe_fechamento` não nula e boards permitidos.


- 2026-05-27T13:14:15Z
  - Componente: Postgres (runrun_analytics)
  - Mudança: `runrun_analytics.vw_faturamento_filial_mes_a` ajustada para seguir a mesma regra de faturamento por competência, incluindo filtro `ftfa.data IS NOT NULL`.
  - Impacto: agregações de faturamento mensal passam a considerar apenas tasks com `custom_31` preenchido/convertido.
  - Validação: base elegível para a view com `data` não nula e boards permitidos = `4308` `task_id` distintos.

- 2026-05-27T13:16:29Z
  - Componente: Postgres (runrun_analytics)
  - Mudança: criada a view `runrun_analytics.vw_faturamento_board_filial_task_mes_a`, derivada da lógica de `vw_faturamento_filial_mes_a`, adicionando `board_name` antes de `filial` e `task_id` após `filial`.
  - Impacto: habilita análise de faturamento por task com contexto de board e filial, mantendo filtro de competência (`data IS NOT NULL`).
  - Validação: view criada com `4308` linhas.

- 2026-05-27T13:20:48Z
  - Componente: Postgres (runrun_analytics)
  - Mudança: `runrun_analytics.vw_faturamento_board_filial_task_mes_a` atualizada para incluir as colunas `contratante` e `contrato` (joins com `dim_contratante_a` e `dim_contrato_a`).
  - Impacto: visão por task passa a permitir corte por contratante/contrato junto de board e filial.
  - Validação: recriação da view concluída com `4308` linhas.

- 2026-06-01T18:46:27Z
  - Componente: Mage (`runrun_tasks_mage`)
  - Mudança: correção no SQL `_DIM_TASKS_SQL` do bloco `export_runrun_staging_to_analytics_mage` em `/var/lib/docker/volumes/data_mage_data/_data/default_repo/data_exporters/export_runrun_staging_to_analytics_mage.py`, trocando seleção direta com `DISTINCT ON (task_id)` por subquery com alias (`src.task_id`, `src.extracted_at`) para resolver erro de escopo no `ORDER BY`.
  - Impacto: elimina a falha `psycopg2.errors.UndefinedColumn` observada na run `pipeline_run_id=2379`, preservando a regra de manter o registro mais recente por `task_id` em `runrun_analytics.dim_tasks_a`.
  - Validação: execução manual da consulta corrigida no Postgres retornou sucesso (`SELECT DISTINCT ON ... ORDER BY ... LIMIT 5`) sem erro de coluna.

- 2026-05-27T13:47:55Z
  - Componente: Postgres (omie_analytics + omie_staging)
  - Mudança: preenchimento de `omie_analytics.dim_clientes_a.codigo_cliente_omie` via match entre `dim_clientes_a.sk_cliente` e `clientes_a.documento`.
  - Impacto: dimensão de clientes `_a` passa a ter chave de cliente Omie preenchida para integração e joins downstream.
  - Validação: `UPDATE 5958`; total preenchidos `5958`; nulos remanescentes `0`.

- 2026-05-28T15:37:28Z
  - Componente: n8n (workflow `tE96j81Cyj0uH8R0`)
  - Mudança:
    - correção do erro de pareamento (`Multiple matches found`) na execução `456703`;
    - node `extract_documents_from_custom_64` passou a emitir 1 item por documento com metadados completos (`task_id`, `task_link`, `board_id`, `parent_id`, `doc_id`, `doc_name`);
    - node `get_runrun_fields1` ajustado para usar apenas `$json` do item corrente (sem referência cruzada ambígua a outro node);
    - retries habilitados em `GET_document`, `create_document`, `upload_file`, `Mark as Uploaded` com `retryOnFail=true`, `maxTries=3`, `waitBetweenTries=2000` e timeouts de 30s/60s.
  - Impacto:
    - elimina falha estrutural por múltiplos matches ao processar tasks com vários documentos em `custom_64`;
    - melhora resiliência contra falhas transitórias de API/rate limit.
  - Validação:
    - `workflow_entity` atualizado com sucesso (`UPDATE 1`);
    - validação dos nodes HTTP confirmou retries ativos e timeouts esperados;
    - validação dos nodes `extract_documents_from_custom_64` e `get_runrun_fields1` confirmou novo contrato 1:1 por documento.

- 2026-05-28T15:41:14Z
  - Componente: n8n (workflow `tE96j81Cyj0uH8R0`)
  - Mudança: ajuste no node `GET_document` para resolução determinística de `doc_id` via fallback (`$json.doc_id || $('get_runrun_fields1').item.json.doc_id || $('check_logged_exists1').item.json.doc_id`), mitigando chamadas com URL `.../documents//download`.
  - Impacto: reduz falha 404 causada por item sem `doc_id` no contexto corrente do node após merge.
  - Validação: expressão persistida no workflow (`UPDATE 1`) e confirmada via leitura de `workflow_entity.nodes`.

- 2026-05-29T00:00:00Z
  - Componente: Mage + Postgres (omie_contas_receber_mage)
  - Mudança:
    - pipeline `omie_contas_receber_mage` migrado de full refresh para carga incremental com watermark;
    - loader passa a usar `filtrar_por_data_de/ate` da API Omie com margem de 10 min sobre o último `last_watermark_at`;
    - RAW exporter: TRUNCATE removido, upsert puro por `(codigo_lancamento_omie, omie_account)`;
    - staging exporter: DROP+CREATE+INSERT → CREATE IF NOT EXISTS + UPSERT condicional por `omie_updated_at`;
    - novos campos em staging: `data_previsao`, `dalt/dinc/halt/hinc`, `omie_created_at`, `omie_updated_at`;
    - unique constraints adicionados: `contas_receber_a_uk` e `contas_receber_b_uk`;
    - novo exporter `export_omie_contas_receber_analytics_mage`: staging → `f_contas_receber_a/b` via upsert por `sk_lancamento`;
    - coluna `omie_updated_at` e unique constraint `f_contas_receber_a/b_uk` adicionados às analytics tables;
    - tabela `integracoes.api_sync_state` criada (watermark); linhas iniciais inseridas para `omie_a` e `omie_b` (client_id 1/2, stream_id 9);
    - `api_client_streams`: colunas `analytics_dest_schema/table` adicionadas e populadas;
    - `utils/integracoes.py`: `get_destination()` retorna também analytics dest + client/stream_id; novas funções `get_sync_state()` e `update_sync_state()`;
    - pipeline metadata.yaml: novo bloco `export_omie_contas_receber_analytics_mage` adicionado downstream do staging exporter.
  - Impacto: carga passa a ser incremental por padrão; full refresh manual disponível via variável `full_refresh=true` no trigger; watermark atualizado após cada execução bem-sucedida.
  - Validação: sintaxe Python OK em todos os 6 arquivos; DDL aplicado sem erros; zero duplicatas confirmadas antes das unique constraints.

- 2026-05-29T12:00:00Z
  - Componente: n8n (infraestrutura) + n8n (workflow `Aot2dUbyDMcGLeNo`)
  - Mudança:
    - adicionada variável `N8N_TRUST_PROXY: "true"` no serviço n8n do `docker-compose.yml` para corrigir erro `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` causado pelo proxy reverso;
    - renomeado workflow `Aot2dUbyDMcGLeNo` de `[Omie] [MAGE] [Omie_A] Staging -> Analytics` para `[Omie] [MAGE] [Omie_A] Staging → Analytics` (seta ASCII `->` substituída por Unicode `→`) diretamente via `UPDATE workflow_entity` no Postgres.
  - Impacto:
    - erro de rate limit / proxy trust eliminado nos logs do n8n;
    - autosave do workflow `Aot2dUbyDMcGLeNo` passa a funcionar, pois o `>` ASCII em `->` era HTML-escapado para `&gt;` pela lib XSS do n8n, fazendo o `xssCheck` falhar e bloquear qualquer save.
  - Validação:
    - logs do n8n após restart: sem `ValidationError X-Forwarded-For`;
    - teste do novo nome via `node -e "xss(name, {whiteList:{}}) === name"` retornou `true`;
    - `UPDATE 1` confirmado no banco.

- 2026-05-28T15:43:04Z
  - Componente: n8n (workflow `tE96j81Cyj0uH8R0`)
  - Mudança: `get_runrun_fields1` ajustado com fallback explícito para os dados do node `extract_documents_from_custom_64` quando o item corrente chega vazio do `check_logged`.
  - Impacto: permite primeiro registro no banco mesmo quando a consulta de existência não encontra linha prévia (caso normal de primeira execução).
  - Validação: `workflow_entity` atualizado (`UPDATE 1`) e expressões dos 6 campos (`task_id`, `task_link`, `board_id`, `parent_id`, `doc_id`, `doc_name`) confirmadas com fallback para `extract_documents_from_custom_64`.

- 2026-06-01T16:23:17Z
  - Componente: Mage + Postgres (Omie staging -> analytics)
  - Mudança:
    - criado novo exporter `data_exporters/export_omie_staging_to_analytics_mage.py` para executar carga de `omie_staging` para `omie_analytics` sem depender do n8n;
    - exporter dinâmico por conta (`_a`/`_b`) com inferência por `client_name`/destino de staging;
    - rotinas incluídas: `dim_filial`, `dim_categoria`, `dim_departamento`, `dim_conta_corrente`, `dim_projeto`, `dim_clientes` (incluindo update de `codigo_cliente_omie`), `dim_calendario` e `f_financeiro` (truncate+insert);
    - adicionado block `export_omie_staging_to_analytics_mage` em todos os pipelines `omie_*_mage` com upstream no exporter de staging de cada pipeline.
  - Impacto:
    - pipelines Omie do Mage passam a ter capacidade nativa de transformação e carga analytics após staging;
    - reduz dependência do workflow n8n `Aot2dUbyDMcGLeNo` para este trajeto.
  - Validação:
    - compilação sintática do exporter concluída (`python3 -m py_compile` = OK);
    - metadados dos 9 pipelines Omie validados com presença do novo block e upstream correto;
    - execução funcional local do exporter fora do runtime Mage não validada neste host por ausência de `pandas` no Python do sistema (esperado validar via run do próprio Mage).

- 2026-06-01T16:28:06Z
  - Componente: Mage (pipeline `omie_contas_receber_mage`)
  - Mudança: removido bloco redundante `export_omie_staging_to_analytics_mage` do metadata do pipeline de contas a receber.
  - Impacto: mantém apenas o fluxo analytics específico já existente (`export_omie_contas_receber_analytics_mage`), evitando dupla carga.
  - Validação: metadata confirmado sem `export_omie_staging_to_analytics_mage` e com cadeia `export_omie_contas_receber_staging_mage -> export_omie_contas_receber_analytics_mage` preservada.

- 2026-06-01T16:32:14Z
  - Componente: Mage (exporter `export_omie_staging_to_analytics_mage`)
  - Mudança: correção de conflito em `dim_filial_*` no bloco analytics (`ON CONFLICT (sk_filial)` -> `ON CONFLICT (nome_filial)` em inserts de `nome_filial`).
  - Impacto: elimina erro `duplicate key value violates unique constraint dim_filial_*_nome_filial_key` observado na run `2368` (`omie_movimentacoes_financeiras_mage`, conta `_b`) e evita recorrência nos demais pipelines Omie que compartilham o mesmo exporter.
  - Validação: erro raiz confirmado em logs da run `2368` (block `export_omie_staging_to_analytics_mage`); exporter recompilado com sucesso (`py_compile`) e padrões `ON CONFLICT (nome_filial)` verificados no arquivo.

- 2026-06-01T16:34:36Z
  - Componente: Mage (exporter `export_omie_staging_to_analytics_mage`)
  - Mudança: ajuste de compatibilidade de schema em `dim_clientes_*`; o exporter agora detecta dinamicamente se existe a coluna `codigo_cliente_omie` e executa `INSERT/UPSERT` compatível com a estrutura real da tabela (`_a` vs `_b`).
  - Impacto: corrige falha da run `2369` (`UndefinedColumn: codigo_cliente_omie em dim_clientes_b`) e reduz risco de erro cruzado entre ambientes com schemas diferentes.
  - Validação: `dim_clientes_b` conferida sem coluna `codigo_cliente_omie`; exporter recompilado com sucesso (`py_compile`).

- 2026-06-01T18:00:00Z
  - Componente: Mage (pipeline `runrun_tasks_mage`) + Postgres (runrun_analytics)
  - Mudança:
    - criado novo exporter `data_exporters/export_runrun_staging_to_analytics_mage.py`;
    - replica exatamente o SQL dos 5 nodes do workflow n8n `wyKDZ55JXLdWXqFN` (`[RunRun] ACTIVE_USERS | Staging -> Analytics`);
    - sequência de execução: Fase 1 (independentes) → dim_users_a, dim_boards_a, dim_tasks_a; Fase 2 (dependentes das dims) → f_task_events_a, task_current_state_a;
    - bloco adicionado ao `metadata.yaml` do pipeline como downstream paralelo de `export_runrun_tasks_staging_mage` (ao lado do `export_runrun_task_custom_fields_staging_mage`).
  - Impacto:
    - as 5 tabelas de analytics (`dim_users_a`, `dim_boards_a`, `dim_tasks_a`, `f_task_events_a`, `task_current_state_a`) passam a ser atualizadas automaticamente a cada run diária do `runrun_tasks_mage`;
    - o workflow n8n `wyKDZ55JXLdWXqFN` permanece ativo por ora (pode ser desativado após validação do Mage).
  - Validação: `py_compile` OK; metadata atualizado com bloco e upstreams corretos.

- 2026-06-01T17:30:00Z
  - Componente: Mage (pipeline `runrun_tasks_mage`) + Postgres (`runrun_staging.task_custom_fields_a`)
  - Mudança:
    - criado novo exporter `data_exporters/export_runrun_task_custom_fields_staging_mage.py`;
    - exporter flattena o JSONB `custom_fields` de `runrun_raw.tasks_a` via `jsonb_each()`, faz LEFT JOIN com `runrun_staging.custom_fields_a` para obter `field_name`, e upserta em `runrun_staging.task_custom_fields_a` (PK: `record_id + field_id`; `record_id = md5(task_id || '-' || field_id)`);
    - bloco adicionado ao `metadata.yaml` do pipeline com upstream em `export_runrun_tasks_staging_mage`;
    - extrai `value_id`, `value_color`, `value_label` de acordo com o tipo do valor JSONB (object/array/scalar).
  - Impacto:
    - `runrun_staging.task_custom_fields_a` passa a ser atualizada automaticamente a cada run diária do pipeline `runrun_tasks_mage`, sem depender do workflow n8n `[RunRun] Custom Fields API` (ID: `bY03OyaUrf5J9wDi`);
    - o workflow n8n permanece inativo; o loop de API (GET /tasks/{task_id}/fields) não foi migrado pois é lento e os metadados em `custom_fields_a` já estão estáveis.
  - Validação: `py_compile` do exporter = OK; metadata do pipeline atualizado com o novo bloco.

- 2026-06-01T17:00:00Z
  - Componente: Mage (exporter `export_runrun_tasks_staging_mage`)
  - Mudança: adicionado upsert de `runrun_staging.patrimonio` ao final do exporter de staging do pipeline `runrun_tasks_mage`.
    - Fonte: `{dest_schema}.{dest_table}` (tabela de staging carregada na mesma execução).
    - Critério de inclusão: `(custom_fields ->> 'custom_11') IS NOT NULL`.
    - Campos mapeados: `task_id`, `data` (`created_at::timestamptz`), `regiao` (`custom_56.label`), `uf` (CASE sobre `custom_56.label`), `valor_total` (`custom_11`), `patrimonio` (`custom_173`).
    - Estratégia: `ON CONFLICT (task_id) DO UPDATE` para todos os campos.
    - Execução: ocorre dentro do mesmo bloco de conexão, após o TRUNCATE+INSERT principal de staging.
  - Impacto: a cada execução do pipeline `runrun_tasks_mage`, `runrun_staging.patrimonio` é automaticamente atualizada com as tasks que possuem `custom_11` preenchido.
  - Validação: `py_compile` do exporter retornou OK; tabela `runrun_staging.patrimonio` confirmada com PK em `task_id`.

- 2026-06-01T16:36:24Z
  - Componente: Mage (exporter `export_omie_staging_to_analytics_mage`) + análise de schema `omie_analytics`
  - Mudança:
    - tratamento dinâmico de `dim_filial_*` conforme presença de constraint unique em `nome_filial` (upsert por `ON CONFLICT` quando existir; fallback com `NOT EXISTS` quando não existir);
    - tratamento dinâmico de `f_financeiro_*` conforme presença da coluna `sk_conta_corrente`;
    - manutenção do tratamento já aplicado para `dim_clientes_*` com/sem `codigo_cliente_omie`.
  - Impacto:
    - corrige falha da run `2369` (`UndefinedColumn` em `dim_clientes_b`) e previne novas quebras por divergência estrutural entre `_a` e `_b`;
    - torna o bloco analytics reutilizável em múltiplos pipelines Omie com schemas heterogêneos.
  - Validação:
    - run `2369` analisada em log: erro confirmado no block `export_omie_staging_to_analytics_mage`;
    - `py_compile` do exporter: OK após ajustes;
    - inventário de `omie_analytics` validado: `dim_filial_b` tem unique em `nome_filial` (a não), `dim_clientes_b` sem `codigo_cliente_omie`, `f_financeiro_b` sem `sk_conta_corrente`.

- 2026-06-01T18:00:00Z
  - Componente: Mage + Postgres (tworh_employees_mage — analytics)
  - Mudança:
    - criado `data_exporters/export_tworh_raw_to_staging_mage.py`: upsert de `tworh_raw.attendance_register` → `tworh_staging.attendance_register` e `tworh_raw."Employees"` (Airbyte) → `tworh_staging.employees`;
    - criado `data_exporters/export_tworh_analytics_mage.py`: popula `tworh_analytics.dim_employees` e `tworh_analytics.f_attendance_register` a partir das staging tables;
    - `metadata.yaml` do pipeline `tworh_employees_mage` atualizado com os dois novos blocos em cadeia após `export_tworh_employees_staging_mage`.
  - Impacto:
    - pipeline tworh passa a ter etapa analytics nativa no Mage;
    - `tworh_analytics.dim_employees`: 123 employees;
    - `tworh_analytics.f_attendance_register`: 19.372 registros; 18.965 com `employee_id` preenchido via JOIN.
  - Validação:
    - `py_compile` OK em ambos os exporters;
    - SQL testado diretamente no Postgres (ROLLBACK): INSERT confirmado sem erros;
    - dedup por `employee_number` necessário (há duplicatas em `tworh_staging.employees`); implementado via `DISTINCT ON (employee_number) ORDER BY employee_id DESC`.

- 2026-06-01T19:49:52Z
  - Componente: n8n (Postgres `n8n`)
  - Mudança: backup e remoção de todos os workflows arquivados (`isArchived=true`) em `workflow_entity`.
  - Impacto: workflows arquivados deixam de existir no n8n runtime/metadata; recuperação possível via arquivos de backup JSONL gerados.
  - Validação:
    - quantidade arquivados antes: `2`;
    - remoção executada com `DELETE ... RETURNING`;
    - quantidade arquivados após: `0`;
    - backup salvo em `/root/data/backups/n8n_archived_workflows_20260601T194911Z` com `workflow_entity`, `workflow_history`, `workflow_publish_history` e listas de IDs removidos.

- 2026-06-02T00:12:49Z
  - Componente: Mage (triggers/schedules)
  - Mudança:
    - substituição dos schedules `@daily` por cron escalonado na madrugada (UTC) para reduzir concorrência entre pipelines;
    - novos horários:
      - `runrun_boards_mage` `10 0 * * *`
      - `runrun_users_mage` `25 0 * * *`
      - `runrun_projects_mage` `40 0 * * *`
      - `runrun_tasks_mage` `55 0 * * *`
      - `tworh_employees_mage` `20 1 * * *`
      - `omie_categorias_mage` `35 1 * * *`
      - `omie_departamentos_mage` `50 1 * * *`
      - `omie_contas_corrente_mage` `5 2 * * *`
      - `omie_formas_pagamento_mage` `20 2 * * *`
      - `omie_vendedores_mage` `35 2 * * *`
      - `omie_clientes_mage` `50 2 * * *`
      - `omie_projetos_mage` `5 3 * * *`
      - `omie_contas_receber_mage` `20 3 * * *`
      - `omie_movimentacoes_financeiras_mage` `25 3 * * *`
  - Impacto:
    - execuções diárias passam a ocorrer na madrugada com menor sobreposição temporal entre cargas;
    - redução esperada de contenção de recursos e de risco de timeout/rate limit por concorrência.
  - Validação:
    - conferência via `rg` em `pipelines/*/metadata.yaml` confirmou todos os `schedule_interval` em cron explícito e ausência de `@daily` nos pipelines alterados.

- 2026-06-02T00:14:41Z
  - Componente: Mage + Postgres (`mage_metadata.pipeline_schedule`)
  - Mudança:
    - aplicação dos mesmos cron da madrugada diretamente no runtime do Mage (tabela `pipeline_schedule`), substituindo `@daily` apenas em triggers `ACTIVE` dos pipelines alvo;
    - atualização executada por `pipeline_uuid`, incluindo schedules Omie A/B (`Omie_A_Daily` e `Omie_B_Daily`).
  - Impacto:
    - UI e agendador runtime do Mage passam a refletir imediatamente a nova distribuição horária;
    - reduz divergência entre arquivo `metadata.yaml` e estado efetivo de agendamento.
  - Validação:
    - `UPDATE 23` em `pipeline_schedule`;
    - consulta pós-update confirmou `schedule_interval` em cron explícito para todos os triggers `ACTIVE` dos 14 pipelines e preservação dos triggers `@hourly` `INACTIVE`.

- 2026-06-02T13:41:54Z
  - Componente: Docker (infraestrutura + Caddy)
  - Mudança:
    - substituição do serviço CloudBeaver pelo pgAdmin4 (`dpage/pgadmin4:latest`);
    - container renomeado para `pgadmin-prod`;
    - porta mantida em `8978` (mapeamento `8978:80` do container);
    - domínio `cb.vivaceengenharia.com` mantido; reverse proxy atualizado no Caddy de `cloudbeaver:8978` para `pgadmin-prod:80`;
    - criado arquivo `/opt/pgadmin/servers.json` com pré-configuração de conexão ao servidor PostgreSQL (`postgres:5432`);
    - variáveis de ambiente alteradas: removidas `CB_ADMIN_USER/PASSWORD`, adicionadas `PGADMIN_EMAIL` e `PGADMIN_PASSWORD` (mantida mesma senha do CB anterior para transição suave);
    - volume alterado: `cloudbeaver_data` → `pgadmin_data` (Docker volume novo);
    - Docker Compose em `/root/data/docker-compose.yml` atualizado com novo serviço e volumes.
  - Impacto:
    - ferramenta de acesso ao banco PostgreSQL substituída com interface mais leve (pgAdmin4);
    - endereço e porta de acesso preservados (`https://cb.vivaceengenharia.com:8978` / `https://cb.vivaceengenharia.com`);
    - todos os databases PostgreSQL (postgres, n8n, metabase, mage) visíveis automaticamente na árvore do pgAdmin após login.
  - Validação:
    - container `pgadmin-prod` iniciado com sucesso (`docker ps`);
    - Caddy recarregado sem erros (`docker exec caddy caddy reload`);
    - logs do container confirmam inicialização completa;
    - commit `40297c9` pushado para `github.com:lucasagon/data-infra.git` branch `master`.


- 2026-06-02T14:52:00Z
  - Componente: Infraestrutura (Reverse Proxy)
  - Mudança:
    - Migração completa de Caddy para Traefik v3
    - Removidos volumes antigos do Caddy (`caddy_caddy_config`, `caddy_caddy_data`)
    - Adicionados labels Traefik explícitos em todos os 24 routers
    - Criado script de monitoramento de domínios em `/opt/traefik/monitor-domains.sh`
  - Impacto:
    - Traefik agora gerencia todos os 12 domínios (flow, dev-flow, estoque, mage, automacoes, metabase, uptime, pgadmin, api, portainer, airbyte, grafana)
    - Let's Encrypt integrado nativamente (certificados em `/opt/traefik/` via Docker volume)
    - Path stripping automático via middlewares (6 caminhos em flow.vivaceengenharia.com)
    - Suporte para múltiplas redes (app_network, app_network_dev)
  - Validação:
    - 27 containers rodando sem erros críticos
    - Certificados TLS gerados automaticamente (114KB acme.json)
    - Todos os domínios testáveis via script de monitoramento
    - 4 warnings residuais de ambigüidade (não afetam roteamento)
    - Script criado: `bash /opt/traefik/monitor-domains.sh`

- 2026-06-02T15:05:00Z
  - Componente: Infraestrutura (Traefik - Validação Final)
  - Mudança:
    - Validação completa de certificados SSL via Let's Encrypt
    - Reiniciado container Portainer (estava parado por 3 semanas)
    - Corrigido vivace-api-redis (estava parado, causando timeout na app)
    - Confirmado funcionamento de todos os routers após inicialização
  - Impacto:
    - **10 certificados Let's Encrypt carregados com sucesso** (todos os domínios principais)
    - api.vivaceengenharia.com agora com certificado válido (Let's Encrypt YR1)
    - Portainer agora respondendo com HTTP 200
  - Validação:
    - flow.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - dev-flow.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - estoque.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - mage.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - automacoes.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - metabase.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - uptime.vivaceengenharia.com: HTTP 302 + Let's Encrypt ✅
    - pgadmin.vivaceengenharia.com: HTTP 302 + Let's Encrypt ✅
    - api.vivaceengenharia.com: HTTP 200 (/health) + Let's Encrypt ✅
    - portainer.vivaceengenharia.com: HTTP 200 + Let's Encrypt ✅
    - Traefik container rodando sem erros
    - Todos os certificados válidos (CN correto, Issuer Let's Encrypt)

- 2026-06-04T00:30:00Z
  - Componente: Infraestrutura (PostgreSQL - Restauração de Bancos Locais)
  - Mudança:
    - Restauração completa de todos os bancos de dados do PostgreSQL local a partir dos backups em `/root/migration_backups/20260603T170639Z/postgres/`:
      1. Globals (usuários, roles, permissões): `00_globals.sql`
      2. Bancos de aplicações: `metabase-db.dump`, `n8n.dump`, `mage_metadata.dump`
      3. Banco principal com schemas de dados: `postgres.dump` (519MB)
    - Containers Metabase e n8n reiniciados para reconectar ao PostgreSQL local via pgbouncer
  - Impacto:
    - **Toda a infraestrutura de dados agora aponta para o PostgreSQL local do docker-compose** (via pgbouncer na porta 6432)
    - Bancos de aplicações totalmente restaurados:
      - `metabase-db`: Metabase reports/cards/dashboards
      - `n8n`: n8n workflows e execuções
      - `mage_metadata`: Mage pipelines, schedules, runs
    - Banco principal (postgres) com todos os schemas de dados:
      - `runrun_*` (raw, staging, analytics + archives)
      - `omie_*` (raw, staging, analytics + integration_control)
      - `tworh_*` (raw, staging, analytics)
      - `integracoes` (api_client_streams, api_sync_state)
      - `inventory_control` (controle de estoque)
  - Validação:
    - Restauração dos 3 dumps das aplicações: ✅ (concluído em < 1 minuto)
    - Restauração do banco principal: ✅ (519MB concluído sem erros)
    - Containers Metabase e n8n reiniciados e em execução: ✅
    - Confirmação de presença de todos os schemas no banco postgres via `\dn`: ✅ (17 schemas presentes)
    - Status dos containers: Metabase (Up 22s), n8n (healthy após restart)

- 2026-06-04T01:15:00Z
  - Componente: Infraestrutura (Remoção do pgbouncer - Conexão Direta ao PostgreSQL)
  - Mudança:
    - **Remoção completa do pgbouncer da arquitetura** (serviço parado e removido do docker-compose.yml em `/root/infra/`)
    - **Atualização de configurações** para conexão direta ao PostgreSQL:
      - Metabase: `MB_DB_HOST=pgbouncer:6432` → `MB_DB_HOST=postgres:5432`
      - n8n: `DB_POSTGRESDB_HOST=pgbouncer:6432` → `DB_POSTGRESDB_HOST=postgres:5432`
      - Mage: `MAGE_PG_HOST=pgbouncer:6432` → `MAGE_PG_HOST=postgres:5432`
      - pgAdmin: mantém conexão direta ao postgres (sem mudança necessária)
    - Atualizações em dois níveis:
      1. Arquivo `/root/infra/docker-compose.yml`: remoção do serviço pgbouncer (linhas 68-80)
      2. Arquivo `/root/data/docker-compose.yml`: ambiente de Metabase e n8n reconfigurados para postgres:5432
      3. Arquivo `/root/data/.env`: adicionadas variáveis `MB_DB_HOST`, `MB_DB_PORT`, `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_PORT`
  - Impacto:
    - **Arquitetura simplificada**: elimina layer de pool de conexões desnecessário
    - **Conexão direta ao PostgreSQL**: reduz latência e complexidade
    - **Redução de resource**: pgbouncer (container + configuração) removido
    - **Configuração mais clara**: cada aplicação aponta direto para `postgres:5432`
  - Validação:
    - pgbouncer parado e removido do docker-compose: ✅
    - Containers reiniciados (metabase, n8n, mage) após atualização: ✅
    - Metabase operacional: ✅ (Up 44s, conectado a postgres:5432)
    - n8n operacional: ✅ (Up 18s, health: starting, conectado a postgres:5432)
    - Mage operacional: ✅ (Up 31s, logs mostram "AlembicContext impl PostgresqlImpl")
    - Nenhum erro de conectividade nos logs dos containers: ✅
