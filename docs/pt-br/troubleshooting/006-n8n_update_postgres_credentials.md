# Troubleshooting: Atualização de Credenciais Postgres nos Workflows do n8n

**Data:** 2026-03-14
**Ambiente:** n8n + PostgreSQL via PgBouncer (Docker)
**Status:** ✅ Resolvido

---

## Contexto

Após trocar a credencial Postgres no n8n (novo host, usuário ou senha), todos os nós Postgres dos workflows continuam apontando para a credencial antiga. É necessário atualizar o `id` da credencial em cada nó de cada workflow.

---

## Causa

No n8n, cada nó que usa uma credencial armazena o `id` da credencial diretamente no JSON do workflow:

```json
"credentials": {
  "postgres": {
    "id": "Jztz3shgyqyCJR7y",
    "name": "Supabase"
  }
}
```

Criar uma nova credencial gera um novo `id`. Os nós existentes não são atualizados automaticamente.

---

## Solução — Atualização via API n8n

### Pré-requisitos

- API Key do n8n: `Settings → n8n API → Create an API key`
- URL da instância

### Script Python

```python
import requests

API_BASE = "https://<seu-dominio>/api/v1"
TOKEN = "<n8n-api-key>"
HEADERS = {"X-N8N-API-KEY": TOKEN, "Content-Type": "application/json"}

NEW_CRED_ID   = "<novo-id-da-credencial>"
NEW_CRED_NAME = "Postgres account"

def get_all_workflows():
    workflows = []
    cursor = None
    while True:
        params = {"limit": 50}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(f"{API_BASE}/workflows", headers=HEADERS, params=params)
        resp.raise_for_status()
        data = resp.json()
        workflows.extend(data["data"])
        cursor = data.get("nextCursor")
        if not cursor:
            break
    return workflows

def update_workflow_credentials(workflow):
    changed = False
    for node in workflow.get("nodes", []):
        if "postgres" in node.get("type", "").lower():
            creds = node.get("credentials", {})
            if "postgres" in creds:
                creds["postgres"] = {"id": NEW_CRED_ID, "name": NEW_CRED_NAME}
                changed = True
    return workflow, changed

workflows = get_all_workflows()
updated = 0

for wf in workflows:
    wf, changed = update_workflow_credentials(wf)
    if changed:
        resp = requests.patch(
            f"{API_BASE}/workflows/{wf['id']}",
            headers=HEADERS,
            json=wf
        )
        resp.raise_for_status()
        print(f"✅ Atualizado: {wf['name']} (id: {wf['id']})")
        updated += 1

print(f"\nTotal atualizado: {updated} workflows")
```

---

## Solução alternativa — Atualização nos JSONs de backup

Se os workflows foram exportados como JSON:

```python
import json, glob

NEW_CRED = {"id": "<novo-id>", "name": "Postgres account"}

for path in glob.glob("backup/*.json"):
    with open(path) as f:
        wf = json.load(f)
    changed = False
    for node in wf.get("nodes", []):
        if "postgres" in node.get("type", "").lower():
            if "postgres" in node.get("credentials", {}):
                node["credentials"]["postgres"] = NEW_CRED
                changed = True
    if changed:
        with open(path, "w") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        print(f"Atualizado: {path}")
```

Após atualizar os JSONs, reimportar via:
```bash
docker exec -it n8n n8n import:workflow --separate --input=/backup
```

---

## Verificação

Após executar o script, confirme no n8n:

1. Abrir um workflow com nó Postgres
2. Clicar no nó → verificar se a credencial exibida é a nova
3. Executar um teste manual do nó

---

## Checklist

- [ ] Nova credencial criada no n8n com o ID desejado
- [ ] Script executado sem erros para todos os workflows
- [ ] Workflows ativos testados manualmente
- [ ] Workflows archived ignorados (não é necessário atualizar)

---

## Automação futura

Para evitar retrabalho em futuras trocas de credencial:
- Manter uma única credencial Postgres e apenas editar seus dados (host, usuário, senha) em vez de criar uma nova
- Editar a credencial existente não requer atualização nos nós

---

## Referências

- [Arquitetura: n8n](../archtecture/n8n.md)
- [n8n API — Workflows](https://docs.n8n.io/api/api-reference/#tag/Workflow)
