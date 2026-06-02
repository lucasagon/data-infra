# Processo de migração e duplicação de collections, dashboards e workflows

Este arquivo resume o padrão usado nesta VPS para migrar integrações entre versões antigas e novas de dados, principalmente quando há necessidade de criar uma trilha nova com sufixo `_a` sem quebrar o conteúdo original.

## Objetivo

Manter duas linhas de consumo em paralelo:

- original, legada ou existente;
- nova, normalmente com sufixo `_a`.

Isso vale para:

- pipelines do Mage;
- tabelas `raw` e `staging`;
- views e fatos em `*_analytics`;
- collections e dashboards no Metabase;
- workflows no n8n.

## Padrão adotado

### 1. Mage

Cada pipeline passa a ler credenciais e destino a partir do esquema de controle `integracoes`.

Tabelas usadas:

- `integracoes.api_clients`
- `integracoes.api_streams`
- `integracoes.api_client_streams`

Fluxo padrão:

- loader lê `client_name` do trigger;
- loader resolve credenciais em `api_clients`;
- loader resolve endpoint e paginação em `api_streams`;
- loader resolve destino em `api_client_streams`;
- exporter raw grava em `dest_schema.dest_table`;
- transformer preserva o destino até o staging exporter;
- exporter staging grava em `staging_dest_schema.staging_dest_table`.

Regra prática:

- se a versão antiga gravava em `*_mage`, a nova deve gravar em `*_a` quando o cliente for A;
- o destino nunca deve depender de variável global fixa quando a stack já usa `client_name`.

### 2. n8n

O workflow normalmente consome as tabelas `*_staging` e publica dados analíticos em `*_analytics`.

Padrão adotado:

- copiar o workflow original;
- trocar a origem das queries para as tabelas novas `*_a`;
- trocar o destino para tabelas novas com `_a` no final;
- remover nós que não façam parte do novo escopo;
- validar se os cards/queries ainda usam a mesma regra de negócio.

### 3. Metabase

Para duplicar uma collection e isolar a trilha `_a`:

- clonar a collection original com sufixo `_a`;
- duplicar cards que referenciam as tabelas novas;
- trocar os dataset queries para as tabelas `_a`;
- ajustar dashboards para apontar só para os cards novos;
- remover da nova collection qualquer card que não seja usado pelos novos dashboards.

Regra importante:

- o dashboard novo deve ficar funcional sozinho;
- se um card antigo não for usado no dashboard novo, ele pode ser removido da collection nova;
- isso evita duplicação de manutenção e mistura de base antiga com nova.

## Checklist de migração

### Mage

- [ ] Loader usa `client_name`.
- [ ] Credenciais vêm de `integracoes.api_clients`.
- [ ] Endpoint/params vêm de `integracoes.api_streams`.
- [ ] Destino raw/staging vem de `integracoes.api_client_streams`.
- [ ] Exporters não têm schema/tabela hardcoded.
- [ ] Trigger foi ajustado para o cliente correto.
- [ ] Run de teste confirmou escrita nas tabelas novas.

### n8n

- [ ] Workflow aponta para as tabelas `*_a`.
- [ ] Tabelas de destino usam `_a`.
- [ ] Fórmulas e joins continuam válidos com os dados novos.
- [ ] Datas e tipos de dados foram normalizados.
- [ ] Os nós não usados foram removidos.

### Metabase

- [ ] Collection nova criada com `_a`.
- [ ] Cards duplicados e ajustados para `_a`.
- [ ] Dashboards novos apontam apenas para cards novos.
- [ ] Cards antigos não utilizados foram removidos da collection nova.
- [ ] O dashboard novo foi validado com os números corretos.

## Lições práticas observadas

1. Alterar só o dashboard não basta se os cards continuam apontando para a fonte antiga.
2. Alterar só o workflow não basta se a collection ainda mostra cards velhos.
3. Alterar só o raw não basta se o staging e o analytics continuam legados.
4. Quando houver métricas comparando ativos/inativos, valide se as regras são iguais em todos os cards antes de considerar o painel pronto.
5. Se houver duplicação entre `A` e `B`, sempre confirme se realmente existe credencial para as duas contas antes de criar estrutura duplicada.

## Convenção prática de nomes

- Raw: `<schema>.<tabela>_a`
- Staging: `<schema>.<tabela>_a`
- Analytics: `<schema>.<dim|fact|view>_a`
- Collection: `<nome original>_a`
- Dashboard: mesmo nome lógico, mas ligado apenas à trilha `_a`

## Uso futuro

Sempre que precisar repetir o processo, siga esta ordem:

1. validar a fonte de dados nova;
2. migrar ingestão;
3. migrar staging/analytics;
4. duplicar collection e dashboards;
5. remover da cópia tudo o que ainda for legado;
6. revalidar contagens e consistência.
