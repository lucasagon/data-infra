# Stack de Pipelines RunRun + Two RH no Mage

Este arquivo estende o padrão descrito em `stack_pipelines_omie.md` para novas integrações.

## 1) Escopo

Plataformas e endpoints solicitados:

- RunRun API (`https://runrun.it/api/v1.0/`):
- `boards` (observação: endpoint público de boards no docs está via *board stages* por `board_id`)
- `projects`
- `users`
- `tasks`

- Two RH (`https://api1.tradingworks.net/v1/`):
- `employees`

## 2) Autenticação

### RunRun

Headers obrigatórios:

- `App-Key: <RUNRUN_APP_KEY>`
- `User-Token: <RUNRUN_USER_TOKEN>`
- `Content-Type: application/json`

Variáveis sugeridas:

- `RUNRUN_BASE_URL=https://runrun.it/api/v1.0`
- `RUNRUN_APP_KEY=...`
- `RUNRUN_USER_TOKEN=...`
- `RUNRUN_PAGE_LIMIT=100`
- `RUNRUN_REQUEST_SLEEP_SECONDS=0.2`
- `RUNRUN_BOARD_IDS=1,2,3` (necessário para pipeline de boards/stages)

### Two RH

Headers obrigatórios:

- `AUTH-TOKEN: <TWORH_AUTH_TOKEN>`

Variáveis sugeridas:

- `TWORH_BASE_URL=https://api1.tradingworks.net/v1`
- `TWORH_AUTH_TOKEN=...`

## 3) Pipelines (1 por endpoint)

### RunRun

1. `runrun_boards_mage`
- Rota de ingestão recomendada: `GET /boards/:board_id/stages`
- Estratégia: iterar `RUNRUN_BOARD_IDS` e buscar stages de cada board.
- Chave de upsert: `(board_id, id)` onde `id` é `board_stage_id`.

2. `runrun_projects_mage`
- Rota: `GET /projects`
- Paginação: `page` e `limit`.
- Chave de upsert: `id`.

3. `runrun_users_mage`
- Rota: `GET /users`
- Paginação: `page` e `limit`.
- Chave de upsert: `id`.

4. `runrun_tasks_mage`
- Rota: `GET /tasks`
- Paginação: `page` e `limit`.
- Chave de upsert: `id`.

### Two RH

5. `tworh_employees_mage`
- Rota: `GET /employees`
- Sem paginação documentada no artigo de colaboradores.
- Chave de upsert: `EmployeeID`.

## 4) Schemas e nomenclatura

Sugestão consistente com a stack Omie:

- RAW RunRun: `runrun_raw.<endpoint>_mage`
- STAGING RunRun: `runrun_staging.<endpoint>_mage`
- RAW Two RH: `tworh_raw.<endpoint>_mage`
- STAGING Two RH: `tworh_staging.<endpoint>_mage`

## 5) Estrutura padrão de bloco Mage

Cada pipeline deve ter 4 blocos:

1. `data_loader` (API + paginação + metadados técnicos)
2. `data_exporter` RAW (`CREATE TABLE IF NOT EXISTS` + `ON CONFLICT`)
3. `transformer` (normalização de tipos/campos)
4. `data_exporter` STAGING (`ON CONFLICT`)

Metadados técnicos mínimos por linha:

- `extracted_at` (UTC)
- `ingestion_run_id` (UUID)
- `source_endpoint`

## 6) Exemplo de loader RunRun (genérico)

```python
import os
import time
import uuid
import requests
import pandas as pd
from datetime import datetime, timezone


def runrun_get_paginated(path: str, params: dict | None = None) -> list[dict]:
    base_url = os.getenv("RUNRUN_BASE_URL", "https://runrun.it/api/v1.0")
    app_key = os.getenv("RUNRUN_APP_KEY")
    user_token = os.getenv("RUNRUN_USER_TOKEN")
    limit = int(os.getenv("RUNRUN_PAGE_LIMIT", "100"))
    sleep_s = float(os.getenv("RUNRUN_REQUEST_SLEEP_SECONDS", "0.2"))

    headers = {
        "App-Key": app_key,
        "User-Token": user_token,
        "Content-Type": "application/json",
    }

    page = 1
    rows = []
    while True:
        q = {"page": page, "limit": limit}
        if params:
            q.update(params)

        resp = requests.get(f"{base_url}{path}", headers=headers, params=q, timeout=60)
        resp.raise_for_status()
        data = resp.json()

        if not data:
            break

        if isinstance(data, dict):
            data = [data]

        rows.extend(data)

        if len(data) < limit:
            break

        page += 1
        time.sleep(sleep_s)

    return rows


def load_runrun_endpoint(path: str, endpoint_name: str) -> pd.DataFrame:
    run_id = str(uuid.uuid4())
    extracted_at = datetime.now(timezone.utc).isoformat()

    items = runrun_get_paginated(path)
    for item in items:
        item["extracted_at"] = extracted_at
        item["ingestion_run_id"] = run_id
        item["source_endpoint"] = endpoint_name

    return pd.DataFrame(items)
```

## 7) Exemplo específico de boards (via board stages)

```python
import os
import pandas as pd


def load_runrun_boards_stages() -> pd.DataFrame:
    board_ids = [x.strip() for x in os.getenv("RUNRUN_BOARD_IDS", "").split(",") if x.strip()]
    all_rows = []

    for board_id in board_ids:
        rows = runrun_get_paginated(f"/boards/{board_id}/stages")
        for row in rows:
            row["board_id"] = int(board_id)
        all_rows.extend(rows)

    return pd.DataFrame(all_rows)
```

## 8) Exemplo de loader Two RH (employees)

```python
import os
import uuid
import requests
import pandas as pd
from datetime import datetime, timezone


def load_tworh_employees() -> pd.DataFrame:
    base_url = os.getenv("TWORH_BASE_URL", "https://api1.tradingworks.net/v1")
    token = os.getenv("TWORH_AUTH_TOKEN")

    headers = {
        "AUTH-TOKEN": token,
    }

    resp = requests.get(f"{base_url}/employees", headers=headers, timeout=60)
    resp.raise_for_status()

    data = resp.json()
    if isinstance(data, dict):
        data = [data]

    run_id = str(uuid.uuid4())
    extracted_at = datetime.now(timezone.utc).isoformat()

    for item in data:
        item["extracted_at"] = extracted_at
        item["ingestion_run_id"] = run_id
        item["source_endpoint"] = "employees"

    return pd.DataFrame(data)
```

## 9) DDL base sugerida (RAW)

Exemplo `runrun_tasks_mage`:

```sql
CREATE SCHEMA IF NOT EXISTS runrun_raw;

CREATE TABLE IF NOT EXISTS runrun_raw.tasks_mage (
  id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  ingestion_run_id UUID NOT NULL,
  source_endpoint TEXT NOT NULL
);
```

Upsert:

```sql
INSERT INTO runrun_raw.tasks_mage (id, payload, extracted_at, ingestion_run_id, source_endpoint)
VALUES (...)
ON CONFLICT (id) DO UPDATE
SET
  payload = EXCLUDED.payload,
  extracted_at = EXCLUDED.extracted_at,
  ingestion_run_id = EXCLUDED.ingestion_run_id,
  source_endpoint = EXCLUDED.source_endpoint;
```

## 10) Triggers

Mesmo padrão do Omie:

- Trigger: `daily`
- Frequência: `@daily`
- Status: `ACTIVE`

## 11) Checklist rápido

1. Criar 5 pipelines no Mage (4 RunRun + 1 Two RH).
2. Configurar variáveis de ambiente.
3. Rodar cada pipeline 2 vezes.
4. Validar deduplicação pelas chaves de upsert.
5. Confirmar trigger `daily` ativo.

## 12) Fontes utilizadas

- RunRun API docs: `https://runrun.it/api/documentation`
- Two RH (Colaboradores): `https://suporte.tradingworks.net/article/13-colaboradores`

