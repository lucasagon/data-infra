# Troubleshooting: n8n — URL de Webhook Duplicada (`https://https://...`)

**Data:** 2026-03-16
**Status:** ✅ Resolvido
**Contexto:** Após reorganizar o compose, a variável `N8N_WEBHOOK_URL` passou a ser preenchida manualmente no `.env`

---

## Sintoma

Ao abrir um nó de Webhook no n8n, a URL exibida aparecia com o protocolo duplicado:

```text
https://https://automacoes.exemplo.com/webhook-test/<uuid>
```

Nesse estado, o webhook não funciona. A URL fica inválida e qualquer cliente externo recebe erro de DNS ou conexão.

---

## Causa

Na versão usada neste ambiente, o n8n já concatenava `https://` internamente ao montar a URL pública. Quando `N8N_WEBHOOK_URL` foi preenchida com o protocolo incluído, o resultado final ficou duplicado.

```text
N8N_WEBHOOK_URL = "https://automacoes.exemplo.com"
                   ↑ protocolo já presente

n8n monta internamente:
  url = "https://" + N8N_WEBHOOK_URL + "/webhook/..."
      = "https://https://automacoes.exemplo.com/webhook/..."
```

Esse comportamento varia por versão. O ponto importante aqui é não assumir que todo n8n interpreta `N8N_WEBHOOK_URL` do mesmo jeito.

---

## Diagnóstico

```bash
# Verificar o valor atual da variável no container
docker exec n8n env | grep -i webhook

# Verificar no .env
grep -i webhook data/.env
```

Também vale validar diretamente na interface: basta abrir qualquer nó Webhook e conferir o campo "Webhook URL".

---

## Solução

Para a versão em uso neste stack, o valor correto ficou **sem protocolo** e sem trailing slash:

### `.env` — antes (incorreto)

```env
N8N_WEBHOOK_URL=https://automacoes.exemplo.com
```

### `.env` — depois (correto neste ambiente)

```env
N8N_WEBHOOK_URL=automacoes.exemplo.com
```

### Aplicar a mudança

```bash
# 1. Editar o .env
nano data/.env

# 2. Ajustar a variável
# N8N_WEBHOOK_URL=automacoes.exemplo.com

# 3. Recriar o container
cd data && docker compose up -d --force-recreate n8n

# 4. Confirmar
docker logs n8n --tail 10
```

### Verificação esperada

Abrindo qualquer nó Webhook na interface, a URL deve aparecer no formato:

```text
https://automacoes.exemplo.com/webhook-test/<uuid>
```

---

## Por que isso aconteceu agora?

Antes dessa reorganização, `N8N_WEBHOOK_URL` não estava sendo usada. O n8n tentava inferir a URL pública a partir de outras variáveis, como `N8N_HOST` e `N8N_PROTOCOL`.

Quando `N8N_WEBHOOK_URL` passou a ser preenchida manualmente com `https://` incluso, a versão em uso do n8n concatenou o protocolo novamente e produziu a URL inválida.

```text
Antes:
  N8N_WEBHOOK_URL não definida
  → n8n inferia a URL internamente

Depois:
  N8N_WEBHOOK_URL=https://automacoes.exemplo.com
  → n8n concatenou https:// + valor
  → https://https://...
```

---

## Referência rápida

| Comportamento observado | Valor a testar em `N8N_WEBHOOK_URL` |
|---|---|
| URL duplica o protocolo (`https://https://...`) | `automacoes.exemplo.com` |
| URL sai com `http://` quando deveria ser `https://` | `https://automacoes.exemplo.com` |
| URL usa porta ou caminho errados | incluir porta e/ou subpath necessários |

Sempre validar na interface depois de alterar essa variável. O formato correto depende da versão e do modo como o n8n está montando a URL pública.

---

## Aprendizados

| # | Aprendizado |
|---|---|
| 1 | `N8N_WEBHOOK_URL` precisa ser validada na prática, não só “preenchida corretamente” em tese |
| 2 | O comportamento dessa variável pode mudar entre versões |
| 3 | Reorganizações de compose e `.env` são um ponto comum para introduzir regressões de webhook |
| 4 | Quando o sintoma é `https://https://...`, o primeiro lugar para revisar é `N8N_WEBHOOK_URL` |

---

## Referência

- [n8n Docs — Environment Variables](https://docs.n8n.io/hosting/environment-variables/environment-variables/#webhooks)
