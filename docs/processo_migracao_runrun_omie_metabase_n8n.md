# Processo de migracao RunRun, Omie, Mage, n8n e Metabase

Este documento consolida o que foi feito nesta VPS para separar trilhas legadas e trilhas novas com sufixo `_a`, mantendo a operacao funcional durante a transicao.

## Contexto

O ambiente passou por quatro movimentos principais:

- migracao de pipelines do Mage para suportar `client_name` e destinos controlados por tabela;
- migracao de workflows do n8n para usar fontes `_a`;
- duplicacao e ajuste de collections e dashboards no Metabase;
- organizacao de schemas `raw`, `staging` e `analytics`, com arquivamento seletivo de objetos legados.

O objetivo foi manter uma trilha nova sem quebrar a trilha original ate que a validacao fosse concluida.

## Convencao adotada

- Tabelas novas recebem sufixo `_a`.
- Tabelas legadas permanecem sem `_a` apenas quando ainda ha dependencia real.
- Quando uma tabela deixa de ser usada, ela pode ser movida para schema de archive.
- Collections novas no Metabase recebem `_a` no nome.
- Workflows novos ou migrados no n8n passam a usar as tabelas `_a`.

## Mage

### O que foi ajustado

- O comportamento dos pipelines do Mage foi alterado para trabalhar com `client_name`.
- As cargas passaram a respeitar a trilha correta por cliente.
- As tabelas de destino no `raw` e no `staging` passaram a ser resolvidas por configuracao, nao por nome fixo.

### Resultado prático

- O Mage passou a escrever em tabelas `*_a` para a trilha nova.
- Os pipelines legados continuam existindo apenas onde ainda ha dependencia.

## n8n

### Workflows analisados e migrados

#### `wyKDZ55JXLdWXqFN`

Nome:

- `[RunRun] ACTIVE_USERS | Staging -> Analytics`

Ajustes realizados:

- `dim_users` -> `runrun_analytics.dim_users_a`
- `dim_boards` -> `runrun_analytics.dim_boards_a`
- `dim_tasks` -> `runrun_analytics.dim_tasks_a`
- `f_task_events` -> `runrun_analytics.f_task_events_a`
- `task_current_state` -> `runrun_analytics.task_current_state_a`

Observacao:

- `runrun_staging.task_events` foi mantida no banco ativo porque voce pediu o retorno apenas dela.

#### `I3omC91MySHCYHRw`

Nome:

- `[RunRun] [MAGE] ACTIVE_USERS | Staging -> Analytics`

Estado:

- ja estava apontando para `_a` quando validado;
- nao havia referencia real a `dim_boards` sem `_a`.

#### `kYD15V7Znh5af7Yq`

Nome:

- `[RunRun] [Tasks Working On Guarantee] + TWO RH TRIGGER`

Estado:

- foi mantido ativo;
- referencia `task_events`, que foi restaurada para os schemas ativos.

### Validacoes feitas

- foi verificado quais workflows ativos ainda citavam tabelas `runrun_raw` ou `runrun_staging`;
- depois foi feita a mesma auditoria para `runrun_analytics`;
- nao restou workflow ativo apontando para tabela de analytics sem `_a` depois das migracoes aplicadas.

## Metabase

### Collections trabalhadas

#### Collection 15

Nome original:

- `[RunRun] Comprovantes`

O que foi feito:

- a collection foi arquivada;
- foi movida para a collection 21;
- foi criada a nova collection `23 [RunRun] Comprovantes _a`;
- o dashboard original foi duplicado para uma versao `_a`.

#### Collection 16

Nome:

- `[Runrun] Usuários Ativos v2`

O que foi feito:

- os cards foram migrados para usar `*_a`;
- houve correcao de um efeito colateral que gerou sufixo duplo em parte das queries nativas;
- a collection deixou de depender de fontes legadas.

#### Collection 10

Nome:

- `[Runrun] Usuários Ativos`

O que foi feito:

- foi arquivada apos a validacao da collection 16;
- os cards e dashboard associados tambem foram arquivados.

### Collection 23

Nome:

- `[RunRun] Comprovantes _a`

Estado:

- foi clonada a partir da collection de comprovantes;
- os cards foram duplicados com remapeamento interno;
- o dashboard `_a` foi criado e associado aos novos cards.

### Observacao sobre fontes compartilhadas

- A fonte `integracoes.log_comprovante_sup_frota_fin` apareceu como base da trilha de comprovantes.
- Ela nao foi tratada como fonte `_a` porque nao havia versao `_a` equivalente no catalogo do Metabase.

## Schemas do Postgres

### Schemas mantidos ativos com `_a`

#### `runrun_raw`

- `boards_a`
- `projects_a`
- `tasks_a`
- `users_a`

#### `runrun_staging`

- `boards_a`
- `projects_a`
- `task_custom_fields_a`
- `tasks_a`
- `users_a`

#### `runrun_analytics`

Tabelas e objetos `_a` mantidos:

- `dim_boards_a`
- `dim_tasks_a`
- `dim_users_a`
- `f_task_events_a`
- `task_current_state_a`
- views `_a` equivalentes

### Schemas de archive criados

- `runrun_raw_archive`
- `runrun_staging_archive`
- `runrun_analytics_archive`

### O que foi arquivado

#### Em `runrun_raw` e `runrun_staging`

Primeiro houve uma tentativa de arquivar tudo, mas isso foi revertido.

Depois, a estrategia final foi manter somente os objetos `_a` ativos.

#### Em `runrun_analytics`

Foram movidos para archive os objetos legados sem dependencia ativa imediata:

- `dim_boards`
- `f_task_events`
- `dim_tasks_colaborador`
- `dim_tasks_regiao`
- `f_tasks_faturamento`

### O que ficou ativo em `runrun_analytics` por dependencia real

- `dim_tasks`
- `dim_users`
- `task_current_state`

Motivo:

- essas tabelas ainda sao usadas por views do proprio schema `runrun_analytics`.

## Views de analytics analisadas

### Views que ainda dependem de objetos legados

- `vw_colaborador_dim_users`
- `vw_ranking_colaboradores`
- `vw_ranking_equipe_tecnica`
- `vw_ranking_operacional`
- `vw_users_activity_status`
- `vw_users_current_activity`
- `vw_users_current_inactive`

### Views `_a` ja existentes

- `vw_users_activity_status_a`
- `vw_users_current_activity_a`
- `vw_users_current_inactive_a`
- `vw_task_custom_fields_a`
- `vw_tasks_flattened_a`
- `vw_tasks_operacional_a`

### Ponto importante

Parte dessas views ainda referencia objetos no archive:

- `runrun_analytics_archive.dim_tasks_colaborador`
- `runrun_analytics_archive.dim_tasks_regiao`
- `runrun_analytics_archive.f_tasks_faturamento`

Isso significa que o archive nao pode ser removido sem antes migrar ou substituir essas views.

## Backup gerado

Foi gerado backup do conjunto `runrun_raw` + `runrun_staging` durante a etapa de arquivamento:

- arquivo: `/root/data/backups/runrun_raw_staging_20260515_194142.dump`
- tamanho aproximado: `249MB`

## Decisoes praticas tomadas

1. Nao misturar dados legados e `_a` no mesmo dashboard novo.
2. Nao arquivar uma tabela enquanto ainda houver workflow ativo usando ela.
3. Nao apagar schema sem antes validar dependencias em:
   - n8n;
   - Metabase;
   - views do `analytics`.
4. Manter `task_events` ativo porque voce solicitou a volta dele.
5. Manter `dim_tasks`, `dim_users` e `task_current_state` ativos ate migrar completamente as views dependentes.

## Riscos conhecidos

- Se algum workflow antigo for reativado sem migracao para `_a`, ele pode voltar a depender dos objetos legados.
- Se as views de ranking ainda dependerem dos objetos arquivados, o archive precisa continuar existindo.
- Se algum card novo no Metabase continuar apontando para fonte sem `_a`, a colecao nova perde isolamento.

## Como repetir o processo

1. Identificar a fonte original.
2. Criar ou validar a versao `_a`.
3. Migrar o workflow do n8n.
4. Migrar as collections do Metabase.
5. Auditar dependencias em views do analytics.
6. Arquivar apenas o que nao tiver mais uso.
7. Manter backup antes de qualquer movimentacao estrutural.
