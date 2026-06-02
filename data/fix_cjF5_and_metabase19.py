import json
import re
import subprocess

N8N_PSQL = ["docker", "exec", "-e", "PGPASSWORD=7UhAqX9Wj5TZ", "postgres", "psql", "-U", "postgres", "-d", "n8n", "-Atc"]
MB_PSQL = ["docker", "exec", "-e", "PGPASSWORD=Nu3wMHPXPh66", "postgres", "psql", "-U", "metabase_user", "-d", "metabase-db", "-Atc"]

WORKFLOW_ID = 'cjF5USTILl5U0d9o'
COLLECTION_ID = 19

NEW_FATO_QUERY = """
ALTER TABLE IF EXISTS omie_analytics.f_financeiro_b
  ALTER COLUMN cnatureza TYPE varchar(50);

TRUNCATE TABLE omie_analytics.f_financeiro_b;

INSERT INTO omie_analytics.f_financeiro_b (
    sk_categoria,
    sk_conta_corrente,
    sk_departamento,
    cnatureza,
    cgrupo,
    cstatus,
    valor_pago,
    valor_distribuido,
    data_emissao,
    data_previsao,
    data_pagamento,
    data_registro,
    ccpfcnpjcliente,
    ccodprojeto,
    extracted_at
)
SELECT
    ccodcateg AS sk_categoria,
    ncodcc AS sk_conta_corrente,
    COALESCE(codigo_departamento, 'SEM_DEP') AS sk_departamento,
    cnatureza,
    grupo AS cgrupo,
    status AS cstatus,
    valor_pago,
    distr_valor AS valor_distribuido,
    ddtemissao::date AS data_emissao,
    data_previsao::date,
    data_pagamento::date,
    ddtregistro::date AS data_registro,
    ccpfcnpjcliente,
    ccodprojeto,
    extracted_at::timestamp
FROM omie_staging.movimentacoes_financeiras_b
WHERE grupo IN ('CONTA_CORRENTE_PAG', 'CONTA_CORRENTE_REC');
""".strip()

TABLE_MAP = {
    33: 105,
    34: 112,
    35: 106,
    36: 109,
    37: 111,
    38: 101,
    39: 104,
    40: 99,
    41: 107,
    79: 103,
}

SQL_PATTERNS = [
    (r"\\bomie_analytics\\.f_financeiro_app2\\b", "omie_analytics.f_financeiro_b"),
    (r"\\bomie_analytics\\.dim_departamentos_app2\\b", "omie_analytics.dim_departamento_b"),
    (r"\\bomie_analytics\\.f_financeiro\\b", "omie_analytics.f_financeiro_a"),
    (r"\\bomie_analytics\\.f_contas_receber\\b", "omie_analytics.f_contas_receber_a"),
    (r"\\bomie_analytics\\.dim_departamento_extracted\\b", "omie_analytics.dim_departamento_extracted_a"),
    (r"\\bomie_analytics\\.dim_departamento\\b", "omie_analytics.dim_departamento_a"),
    (r"\\bomie_analytics\\.dim_categoria\\b", "omie_analytics.dim_categoria_a"),
    (r"\\bomie_analytics\\.dim_conta_corrente\\b", "omie_analytics.dim_conta_corrente_a"),
    (r"\\bomie_analytics\\.dim_filial\\b", "omie_analytics.dim_filial_a"),
    (r"\\bomie_analytics\\.dim_projeto\\b", "omie_analytics.dim_projeto_a"),
]


def run(psql_base, sql):
    return subprocess.check_output(psql_base + [sql], text=True).strip()


def lit(s):
    return "'" + s.replace("'", "''") + "'"


def rewrite_query(obj, field_map, table_map):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == 'source-table' and isinstance(v, int) and v in table_map:
                out[k] = table_map[v]
            else:
                out[k] = rewrite_query(v, field_map, table_map)
        return out
    if isinstance(obj, list):
        if len(obj) >= 3 and obj[0] == 'field' and isinstance(obj[2], int) and obj[2] in field_map:
            cp = list(obj)
            cp[2] = field_map[obj[2]]
            return [rewrite_query(x, field_map, table_map) for x in cp]
        return [rewrite_query(x, field_map, table_map) for x in obj]
    return obj


def rewrite_sql(text):
    out = text
    for pat, rep in SQL_PATTERNS:
        out = re.sub(pat, rep, out)
    return out

# Fix workflow node
nodes_text = run(N8N_PSQL, f"select nodes::text from workflow_entity where id={lit(WORKFLOW_ID)}")
nodes = json.loads(nodes_text)
found = False
for node in nodes:
    if node.get('name') == 'fato_financeiro':
        node.setdefault('parameters', {})['query'] = NEW_FATO_QUERY
        found = True
        break
if not found:
    raise RuntimeError('node fato_financeiro not found')
run(N8N_PSQL, f"update workflow_entity set nodes={lit(json.dumps(nodes, ensure_ascii=False))}::json, \"updatedAt\"=now() where id={lit(WORKFLOW_ID)}")
print('workflow updated')

# Build field map
field_map = {}
for old_tid, new_tid in TABLE_MAP.items():
    rows = run(MB_PSQL, f"select oldf.id,newf.id from metabase_field oldf join metabase_field newf on newf.name=oldf.name where oldf.table_id={old_tid} and newf.table_id={new_tid}")
    if rows:
        for line in rows.splitlines():
            a,b = line.split('|')
            field_map[int(a)] = int(b)

# Update cards
cards_out = run(MB_PSQL, f"select id,coalesce(table_id::text,''),dataset_query::text from report_card where collection_id={COLLECTION_ID} order by id")
updated = 0
for line in cards_out.splitlines():
    parts = line.split('|', 2)
    cid = int(parts[0])
    old_table_id = int(parts[1]) if parts[1] else None
    dq_text = parts[2]
    dq = json.loads(dq_text)
    new_table_id = TABLE_MAP.get(old_table_id, old_table_id)
    new_dq = rewrite_query(dq, field_map, TABLE_MAP)
    if isinstance(new_dq, dict):
        native = new_dq.get('native')
        if isinstance(native, dict) and isinstance(native.get('query'), str):
            native['query'] = rewrite_sql(native['query'])
    new_dq_text = json.dumps(new_dq, ensure_ascii=False)
    if new_table_id != old_table_id or new_dq_text != dq_text:
        tid_sql = 'NULL' if new_table_id is None else str(new_table_id)
        run(MB_PSQL, f"update report_card set table_id={tid_sql}, dataset_query={lit(new_dq_text)}::jsonb, updated_at=now() where id={cid}")
        updated += 1

print(f'cards updated: {updated}')
