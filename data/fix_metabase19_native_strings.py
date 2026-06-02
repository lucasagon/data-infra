import json
import re
import subprocess

MB_PSQL = ["docker", "exec", "-e", "PGPASSWORD=Nu3wMHPXPh66", "postgres", "psql", "-U", "metabase_user", "-d", "metabase-db", "-Atc"]
COLLECTION_ID = 19

PATTERNS = [
    (r"\\bomie_analytics\\.f_financeiro_app2\\b", "omie_analytics.f_financeiro_b"),
    (r"\\bomie_analytics\\.dim_departamentos_app2\\b", "omie_analytics.dim_departamento_b"),
    (r"\\bsk_departamento_app2\\b", "sk_departamento"),
    (r"\\bomie_analytics\\.f_financeiro\\b", "omie_analytics.f_financeiro_a"),
    (r"\\bomie_analytics\\.f_contas_receber\\b", "omie_analytics.f_contas_receber_a"),
    (r"\\bomie_analytics\\.dim_departamento_extracted\\b", "omie_analytics.dim_departamento_extracted_a"),
    (r"\\bomie_analytics\\.dim_departamento\\b", "omie_analytics.dim_departamento_a"),
    (r"\\bomie_analytics\\.dim_categoria\\b", "omie_analytics.dim_categoria_a"),
    (r"\\bomie_analytics\\.dim_conta_corrente\\b", "omie_analytics.dim_conta_corrente_a"),
    (r"\\bomie_analytics\\.dim_filial\\b", "omie_analytics.dim_filial_a"),
    (r"\\bomie_analytics\\.dim_projeto\\b", "omie_analytics.dim_projeto_a"),
]

def run(sql):
    return subprocess.check_output(MB_PSQL + [sql], text=True).strip()

def lit(s):
    return "'" + s.replace("'", "''") + "'"

def rewrite_text(s):
    out = s
    for pat, rep in PATTERNS:
        out = re.sub(pat, rep, out)
    return out

def rewrite_obj(x):
    if isinstance(x, dict):
        return {k: rewrite_obj(v) for k, v in x.items()}
    if isinstance(x, list):
        return [rewrite_obj(i) for i in x]
    if isinstance(x, str):
        return rewrite_text(x)
    return x

rows = run(f"select id,dataset_query::text from report_card where collection_id={COLLECTION_ID} order by id")
count=0
for line in rows.splitlines():
    cid, dq_text = line.split('|',1)
    obj = json.loads(dq_text)
    new_obj = rewrite_obj(obj)
    new_text = json.dumps(new_obj, ensure_ascii=False)
    if new_text != dq_text:
        run(f"update report_card set dataset_query={lit(new_text)}::jsonb, updated_at=now() where id={cid}")
        count += 1

print(count)
