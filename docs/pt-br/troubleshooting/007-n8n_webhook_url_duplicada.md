# Troubleshooting: n8n — URL de Webhook Duplicada (`https://https://...`)

**Data:** 2026-03-16
**Status:** ✅ Resolvido
**Contexto:** Após deploy do PgBouncer, a variável `N8N_WEBHOOK_URL` foi adicionada ao compose com o protocolo incluso

---

## Sintoma

Ao abrir um nó de Webhook no n8n, a URL exibida aparece com o protocolo duplicado:

```
https://https://automacoes.vivaceengenharia.com/webhook-test/4ba2d77f-ee41-4c5a-95f8-fb4fe4c7ac8a
```

O webhook não funciona — qualquer cliente externo que tente chamar essa URL recebe erro de DNS/conexão, pois a URL é inválida.

---

## Causa

O n8n monta a URL pública do webhook concatenando internamente o protocolo `https://` com o valor de `N8N_WEBHOOK_URL`. Quando o valor já contém `https://`, o resultado é a duplicação.

```
N8N_WEBHOOK_URL = "https://automacoes.vivaceengenharia.com"
                   ↑ protocolo já presente

n8n internamente faz (simplificado):
  url = "https://" + N8N_WEBHOOK_URL + "/webhook/..."
      = "https://https://automacoes.vivaceengenharia.com/webhook/..."
                                                                    ↑ INVÁLIDA
```

> Esse comportamento varia conforme a versão do n8n. Em algumas versões, `N8N_WEBHOOK_URL` é usada diretamente como prefixo; em outras, é tratada como host puro. O ponto seguro é sempre incluir o protocolo no valor — e não confiar em concatenação implícita.

---

## Diagnóstico

```bash
# Verificar o valor atual da variável no container
docker exec n8n env | grep -i webhook

# Verificar no .env
grep -i webhook /root/data/.env
```

A URL exibida na interface do n8n também entrega o problema imediatamente — basta abrir qualquer nó Webhook e ver o campo "Webhook URL".

---

## Solução

Definir `N8N_WEBHOOK_URL` com o protocolo incluído, sem trailing slash — exatamente como o n8n espera receber para usar como base:

### `.env` — antes (incorreto)

```env
N8N_WEBHOOK_URL=https://automacoes.vivaceengenharia.com
```

> O problema não estava no valor em si, mas em como ele estava sendo processado. A solução correta é garantir que o valor inclua o protocolo e seja usado como URL base completa.

### `.env` — depois (correto)

```env
N8N_WEBHOOK_URL=https://automacoes.vivaceengenharia.com
```

Se o n8n estiver duplicando o protocolo, a correção é remover o `https://` do valor e deixar apenas o host — ou, dependendo da versão, o oposto. Verificar com:

```bash
# Testar qual formato elimina a duplicação
docker exec n8n env | grep WEBHOOK_URL
```

**Para a versão em uso neste stack, o valor correto é sem protocolo:**

```env
N8N_WEBHOOK_URL=automacoes.vivaceengenharia.com
```

### Aplicar a mudança

```bash
# 1. Editar o .env
nano /root/data/.env
# Alterar: N8N_WEBHOOK_URL=automacoes.vivaceengenharia.com

# 2. Recriar o container para aplicar a nova variável
cd /root/data && docker compose up -d --force-recreate n8n

# 3. Confirmar que o container subiu
docker logs n8n --tail 10
# Esperado: "n8n ready on ::, port 5678"

# 4. Validar a URL na interface
# Abrir qualquer nó Webhook no n8n e verificar se a URL está correta:
# https://automacoes.vivaceengenharia.com/webhook-test/<uuid>
```

---

## Por que isso aconteceu agora?

A variável `N8N_WEBHOOK_URL` **não existia** no compose antes do deploy do PgBouncer. Sem ela, o n8n tentava inferir a URL pública a partir de outras variáveis (`N8N_HOST`, `N8N_PROTOCOL`, `N8N_PORT`) ou deixava a URL como localhost.

Durante o deploy do PgBouncer, o compose foi reorganizado e `N8N_WEBHOOK_URL` foi adicionada com o valor `https://automacoes.vivaceengenharia.com` — incluindo o protocolo — o que causou a duplicação.

```
Antes do PgBouncer:
  N8N_WEBHOOK_URL não definida → n8n inferia a URL internamente → sem problema

Depois do PgBouncer:
  N8N_WEBHOOK_URL=https://automacoes.vivaceengenharia.com
  → n8n concatenou https:// + valor → https://https://...
```

---

## Referência rápida — formatos aceitos por versão

| Comportamento observado | Valor correto para `N8N_WEBHOOK_URL` |
|---|---|
| URL duplica o protocolo (`https://https://...`) | `automacoes.vivaceengenharia.com` (sem protocolo) |
| URL aparece como `http://` quando deveria ser `https://` | `https://automacoes.vivaceengenharia.com` (com protocolo) |
| URL usa porta errada ou caminho errado | Incluir porta e/ou subpath: `automacoes.vivaceengenharia.com:5678` |

> Sempre validar na interface após qualquer mudança nesta variável.

---

## Aprendizados

| # | Aprendizado |
|---|---|
| 1 | `N8N_WEBHOOK_URL` define o **prefixo base** da URL pública — o comportamento de concatenação varia por versão |
| 2 | Ao adicionar `N8N_WEBHOOK_URL` pela primeira vez, testar na interface antes de usar em produção |
| 3 | A variável deve estar no `.env`, não hardcoded no `docker-compose.yml`, para facilitar ajustes sem alterar o versionado |
| 4 | Reorganizações de compose (como durante deploys de novos serviços) são um momento de risco para introdução de variáveis com formato errado |
| 5 | O sintoma (`https://https://`) é autoexplicativo — qualquer URL de webhook com protocolo duplicado aponta direto para esta variável |

---

## Referência

- [n8n Docs — Environment Variables](https://docs.n8n.io/hosting/environment-variables/environment-variables/#webhooks)
