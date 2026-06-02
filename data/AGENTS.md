# Diretriz Operacional do Projeto

## 1) Fonte oficial para alterações no Mage

Toda alteração relacionada ao Mage deve ser feita diretamente nos arquivos dentro do container/volume ativo do Mage.

Referência principal atual:
- `/var/lib/docker/volumes/data_mage_data/_data/default_repo/...`

Não considerar como fonte de verdade arquivos fora do volume ativo quando houver divergência.

## 2) Regra obrigatória antes de qualquer alteração

Sempre que houver solicitação para alterar qualquer item de:
- Mage
- n8n
- tabelas/views no Postgres

a IA deve:
1. Ler o arquivo `/root/data/docs/project_memory.md`.
2. Entender o estado atual registrado.
3. Executar a alteração solicitada.
4. Atualizar o `/root/data/docs/project_memory.md` para refletir o novo estado pós-alteração.

## 3) Regra de atualização da memória

Após concluir qualquer alteração:
- Se já existir item relacionado no `/root/data/docs/project_memory.md`, atualizar o item existente.
- Se não existir item relacionado, criar novo item.
- Registrar sempre:
  - Data/hora (UTC)
  - Componente afetado (Mage, n8n, Postgres, Metabase, etc.)
  - O que mudou
  - Impacto esperado
  - Validação executada (quando aplicável)

## 4) Proibição de encerramento sem memória atualizada

A tarefa não deve ser considerada concluída enquanto o `/root/data/docs/project_memory.md` não estiver alinhado com o estado real após a alteração.
