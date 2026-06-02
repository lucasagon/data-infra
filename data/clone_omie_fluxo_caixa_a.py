import json
import re
import subprocess
import uuid
from collections import deque

DSN_ENV = ["-e", "PGPASSWORD=Nu3wMHPXPh66"]
PSQL_BASE = ["docker", "exec", *DSN_ENV, "postgres", "psql", "-U", "metabase_user", "-d", "metabase-db", "-Atc"]

OLD_COLLECTION_ID = 9
OLD_DASHBOARD_IDS = [3, 5]
NEW_COLLECTION_NAME = "[Omie] Fluxo de Caixa _a"
NEW_COLLECTION_SLUG = "_omie__fluxo_de_caixa__a"
NEW_DASHBOARD_NAMES = {
    3: "Omie - Relatório Financeiro - Geral _a",
    5: "Omie - Relatório Financeiro _a",
}

TABLE_MAP = {
    33: 105,  # dim_departamento -> dim_departamento_a
    34: 112,  # dim_categoria -> dim_categoria_a
    35: 106,  # dim_projeto -> dim_projeto_a
    36: 109,  # f_financeiro -> f_financeiro_a
    37: 111,  # dim_filial -> dim_filial_a
    38: 101,  # f_contas_receber -> f_contas_receber_a
    40: 109,  # f_financeiro_app2 -> f_financeiro_a
    41: 107,  # dim_conta_corrente -> dim_conta_corrente_a
    79: 103,  # dim_departamento_extracted -> dim_departamento_extracted_a
}

SQL_REPLACEMENTS = [
    ("omie_analytics.f_financeiro_app2", "omie_analytics.f_financeiro_a"),
    ("omie_analytics.f_financeiro", "omie_analytics.f_financeiro_a"),
    ("omie_analytics.f_contas_receber", "omie_analytics.f_contas_receber_a"),
    ("omie_analytics.dim_departamento_extracted", "omie_analytics.dim_departamento_extracted_a"),
    ("omie_analytics.dim_departamento", "omie_analytics.dim_departamento_a"),
    ("omie_analytics.dim_categoria", "omie_analytics.dim_categoria_a"),
    ("omie_analytics.dim_conta_corrente", "omie_analytics.dim_conta_corrente_a"),
    ("omie_analytics.dim_filial", "omie_analytics.dim_filial_a"),
    ("omie_analytics.dim_projeto", "omie_analytics.dim_projeto_a"),
]


def q(sql: str) -> str:
    out = subprocess.check_output(PSQL_BASE + [sql], text=True)
    out = out.rstrip()
    out = re.sub(r"\n(?:INSERT|UPDATE|DELETE) \d+ \d+\s*$", "", out, flags=re.S)
    return out.strip()


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def gen_entity_id():
    return uuid.uuid4().hex[:21]


def fetch_json(sql: str):
    raw = q(sql)
    return json.loads(raw) if raw else []


def rewrite_query(obj, field_map, table_map, card_map):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == 'source-table' and isinstance(v, int) and v in table_map:
                out[k] = table_map[v]
            elif k == 'source-card' and isinstance(v, int) and v in card_map:
                out[k] = card_map[v]
            else:
                out[k] = rewrite_query(v, field_map, table_map, card_map)
        return out
    if isinstance(obj, list):
        if len(obj) >= 3 and obj[0] == 'field' and isinstance(obj[2], int) and obj[2] in field_map:
            obj = list(obj)
            obj[2] = field_map[obj[2]]
        if len(obj) >= 3 and obj[0] == 'metric' and isinstance(obj[2], int) and obj[2] in card_map:
            obj = list(obj)
            obj[2] = card_map[obj[2]]
        return [rewrite_query(x, field_map, table_map, card_map) for x in obj]
    return obj


def find_card_refs(obj):
    refs = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == 'source-card' and isinstance(v, int):
                    refs.add(v)
                else:
                    walk(v)
        elif isinstance(x, list):
            if len(x) >= 3 and x[0] == 'metric' and isinstance(x[2], int):
                refs.add(x[2])
            for item in x:
                walk(item)

    walk(obj)
    return refs


print('fetching source data...')
old_collection = fetch_json(
    "SELECT json_agg(t) FROM (SELECT id, name, description, archived, location, personal_owner_id, slug, namespace, authority_level, entity_id::text AS entity_id, created_at::text AS created_at, type, is_sample, archive_operation_id::text AS archive_operation_id, archived_directly, is_remote_synced, workspace_id FROM public.collection WHERE id = 9) t"
)[0]
old_dashboards = {row['id']: row for row in fetch_json(
    "SELECT json_agg(t) FROM (SELECT id, created_at::text AS created_at, updated_at::text AS updated_at, name, description, creator_id, parameters::text AS parameters, points_of_interest::text AS points_of_interest, caveats::text AS caveats, show_in_getting_started, public_uuid::text AS public_uuid, made_public_by_id, enable_embedding, embedding_params::text AS embedding_params, archived, position, collection_id, collection_position, cache_ttl, entity_id::text AS entity_id, auto_apply_filters, width, initially_published_at::text AS initially_published_at, view_count, archived_directly, last_viewed_at::text AS last_viewed_at, dependency_analysis_version, embedding_type FROM public.report_dashboard WHERE id IN (3,5) ORDER BY id) t"
)}
old_tabs = fetch_json(
    "SELECT json_agg(t) FROM (SELECT id, dashboard_id, name, position, entity_id::text AS entity_id, created_at::text AS created_at, updated_at::text AS updated_at FROM public.dashboard_tab WHERE dashboard_id IN (3,5) ORDER BY dashboard_id, position, id) t"
)
old_cards = {row['id']: row for row in fetch_json(
    "SELECT json_agg(t) FROM (SELECT id, created_at::text AS created_at, updated_at::text AS updated_at, name, description, display, dataset_query::text AS dataset_query, visualization_settings::text AS visualization_settings, creator_id, database_id, table_id, query_type, archived, collection_id, public_uuid::text AS public_uuid, made_public_by_id, enable_embedding, embedding_params::text AS embedding_params, cache_ttl, result_metadata::text AS result_metadata, collection_position, entity_id::text AS entity_id, parameters::text AS parameters, parameter_mappings::text AS parameter_mappings, collection_preview, metabase_version, type, initially_published_at::text AS initially_published_at, cache_invalidated_at::text AS cache_invalidated_at, last_used_at::text AS last_used_at, view_count, archived_directly, dataset_query_metrics_v2_migration_backup::text AS dataset_query_metrics_v2_migration_backup, source_card_id, dashboard_id, card_schema, document_id, dependency_analysis_version, legacy_query::text AS legacy_query, embedding_type FROM public.report_card WHERE collection_id = 9 ORDER BY id) t"
)}
old_dashcards = fetch_json(
    "SELECT json_agg(t) FROM (SELECT dc.dashboard_id, dc.card_id, dc.row, dc.col, dc.size_x, dc.size_y, dc.dashboard_tab_id, dc.parameter_mappings::text AS parameter_mappings, dc.visualization_settings::text AS visualization_settings, dc.inline_parameters::text AS inline_parameters, dc.action_id, dc.created_at::text AS created_at, dc.updated_at::text AS updated_at FROM public.report_dashboardcard dc WHERE dc.dashboard_id IN (3,5) ORDER BY dc.dashboard_id, dc.row, dc.col, dc.id) t"
)

root_ids = sorted({dc['card_id'] for dc in old_dashcards if isinstance(dc.get('card_id'), int)})
needed = set(root_ids)
changed = True
while changed:
    changed = False
    for cid in list(needed):
        card = old_cards.get(cid)
        if not card or not card['dataset_query']:
            continue
        refs = find_card_refs(json.loads(card['dataset_query']))
        for ref in refs:
            if ref in old_cards and ref not in needed:
                needed.add(ref)
                changed = True

closure = sorted(needed)
print(f'root dashboard cards: {len(root_ids)}')
print(f'closure size: {len(closure)}')

# Fetch field mapping for the tables that change.
field_map = {}
for old_table_id, new_table_id in TABLE_MAP.items():
    sql = f"""
    SELECT json_agg(t)
    FROM (
      SELECT oldf.id AS old_id, newf.id AS new_id
      FROM metabase_field oldf
      JOIN metabase_field newf ON newf.name = oldf.name
      JOIN metabase_table oldt ON oldt.id = oldf.table_id
      JOIN metabase_table newt ON newt.id = newf.table_id
      WHERE oldf.table_id = {old_table_id}
        AND newf.table_id = {new_table_id}
    ) t
    """
    rows = fetch_json(sql)
    for row in rows:
        field_map[row['old_id']] = row['new_id']

# Create or reuse collection.
existing_collection = q(
    f"SELECT id FROM public.collection WHERE slug = {sql_literal(NEW_COLLECTION_SLUG)} LIMIT 1"
)
if existing_collection:
    new_collection_id = int(existing_collection.splitlines()[0])
    print(f'reusing collection {new_collection_id}...')
else:
    print('creating collection...')
    new_collection_id = int(q(
        f"""
        INSERT INTO collection (
          name, description, archived, location, personal_owner_id, slug, namespace, authority_level, entity_id, created_at, type, is_sample, archive_operation_id, archived_directly, is_remote_synced, workspace_id
        ) VALUES (
          {sql_literal(NEW_COLLECTION_NAME)},
          {sql_literal(old_collection['description'])},
          false,
          {sql_literal(old_collection['location'])},
          NULL,
          {sql_literal(NEW_COLLECTION_SLUG)},
          {sql_literal(old_collection['namespace'])},
          {sql_literal(old_collection['authority_level'])},
          {sql_literal(gen_entity_id())},
          now(),
          {sql_literal(old_collection['type'])},
          {sql_literal(old_collection['is_sample'])},
          NULL,
          {sql_literal(old_collection['archived_directly'])},
          {sql_literal(old_collection['is_remote_synced'])},
          {sql_literal(old_collection['workspace_id'])}
        ) RETURNING id
        """
    ))

# Create dashboards.
new_dashboard_ids = {}
for old_id in OLD_DASHBOARD_IDS:
    old = old_dashboards[old_id]
    print(f'creating dashboard {old_id}...')
    new_dashboard_ids[old_id] = int(q(
        f"""
        INSERT INTO report_dashboard (
          created_at, updated_at, name, description, creator_id, parameters, points_of_interest, caveats,
          show_in_getting_started, public_uuid, made_public_by_id, enable_embedding, embedding_params,
          archived, position, collection_id, collection_position, cache_ttl, entity_id, auto_apply_filters,
          width, initially_published_at, view_count, archived_directly, last_viewed_at,
          dependency_analysis_version, embedding_type
        ) VALUES (
          {sql_literal(old['created_at'])},
          {sql_literal(old['updated_at'])},
          {sql_literal(NEW_DASHBOARD_NAMES[old_id])},
          {sql_literal(old['description'])},
          {sql_literal(old['creator_id'])},
          {sql_literal(old['parameters'])},
          {sql_literal(old['points_of_interest'])},
          {sql_literal(old['caveats'])},
          {sql_literal(old['show_in_getting_started'])},
          NULL,
          NULL,
          {sql_literal(old['enable_embedding'])},
          {sql_literal(old['embedding_params'])},
          {sql_literal(old['archived'])},
          {sql_literal(old['position'])},
          {sql_literal(new_collection_id)},
          {sql_literal(old['collection_position'])},
          {sql_literal(old['cache_ttl'])},
          {sql_literal(gen_entity_id())},
          {sql_literal(old['auto_apply_filters'])},
          {sql_literal(old['width'])},
          {sql_literal(old['initially_published_at'])},
          {sql_literal(old['view_count'])},
          {sql_literal(old['archived_directly'])},
          {sql_literal(old['last_viewed_at'])},
          {sql_literal(old['dependency_analysis_version'])},
          {sql_literal(old['embedding_type'])}
        ) RETURNING id
        """
    ))

# Create tabs.
tab_map = {}
for tab in old_tabs:
    new_dashboard_id = new_dashboard_ids[tab['dashboard_id']]
    tab_map[tab['id']] = int(q(
        f"""
        INSERT INTO dashboard_tab (dashboard_id, name, position, entity_id, created_at, updated_at)
        VALUES (
          {sql_literal(new_dashboard_id)},
          {sql_literal(tab['name'])},
          {sql_literal(tab['position'])},
          {sql_literal(gen_entity_id())},
          {sql_literal(tab['created_at'])},
          {sql_literal(tab['updated_at'])}
        ) RETURNING id
        """
    ))

# Clone cards in dependency order.
card_map = {}
remaining = set(closure)
print('cloning cards...')
while remaining:
    progress = False
    for cid in sorted(list(remaining)):
        old = old_cards[cid]
        qtext = old['dataset_query']
        refs = find_card_refs(json.loads(qtext)) if qtext else set()
        unresolved = [ref for ref in refs if ref in remaining]
        if unresolved:
            continue
        rewritten = json.dumps(rewrite_query(json.loads(qtext), field_map, TABLE_MAP, card_map), ensure_ascii=False) if qtext else None
        # Keep original names; only collection/destination changes.
        new_source_card_id = card_map.get(old['source_card_id']) if old['source_card_id'] in card_map else None
        new_card_id = int(q(
            f"""
            INSERT INTO report_card (
              created_at, updated_at, name, description, display, dataset_query, visualization_settings,
              creator_id, database_id, table_id, query_type, archived, collection_id, public_uuid,
              made_public_by_id, enable_embedding, embedding_params, cache_ttl, result_metadata,
              collection_position, entity_id, parameters, parameter_mappings, collection_preview,
              metabase_version, type, initially_published_at, cache_invalidated_at, last_used_at,
              view_count, archived_directly, dataset_query_metrics_v2_migration_backup, source_card_id,
              dashboard_id, card_schema, document_id, dependency_analysis_version, legacy_query,
              embedding_type
            ) VALUES (
              {sql_literal(old['created_at'])},
              {sql_literal(old['updated_at'])},
              {sql_literal(old['name'])},
              {sql_literal(old['description'])},
              {sql_literal(old['display'])},
              {sql_literal(rewritten)},
              {sql_literal(old['visualization_settings'])},
              {sql_literal(old['creator_id'])},
              {sql_literal(old['database_id'])},
              {sql_literal(old['table_id'])},
              {sql_literal(old['query_type'])},
              {sql_literal(old['archived'])},
              {sql_literal(new_collection_id)},
              NULL,
              NULL,
              {sql_literal(old['enable_embedding'])},
              {sql_literal(old['embedding_params'])},
              {sql_literal(old['cache_ttl'])},
              {sql_literal(old['result_metadata'])},
              {sql_literal(old['collection_position'])},
              {sql_literal(gen_entity_id())},
              {sql_literal(old['parameters'])},
              {sql_literal(old['parameter_mappings'])},
              {sql_literal(old['collection_preview'])},
              {sql_literal(old['metabase_version'])},
              {sql_literal(old['type'])},
              {sql_literal(old['initially_published_at'])},
              {sql_literal(old['cache_invalidated_at'])},
              {sql_literal(old['last_used_at'])},
              {sql_literal(old['view_count'])},
              {sql_literal(old['archived_directly'])},
              {sql_literal(old['dataset_query_metrics_v2_migration_backup'])},
              {sql_literal(new_source_card_id)},
              {sql_literal(old['dashboard_id'])},
              {sql_literal(old['card_schema'])},
              {sql_literal(old['document_id'])},
              {sql_literal(old['dependency_analysis_version'])},
              {sql_literal(old['legacy_query'])},
              {sql_literal(old['embedding_type'])}
            ) RETURNING id
            """
        ))
        card_map[cid] = new_card_id
        remaining.remove(cid)
        progress = True
    if not progress:
        raise RuntimeError(f'Could not resolve card dependencies for ids: {sorted(remaining)}')

# Clone dashboard cards.
for dc in old_dashcards:
    if dc['card_id'] is None:
        continue
    new_dashboard_id = new_dashboard_ids[dc['dashboard_id']]
    new_card_id = card_map[dc['card_id']]
    new_tab_id = tab_map.get(dc['dashboard_tab_id']) if dc['dashboard_tab_id'] is not None else None
    q(
        f"""
        INSERT INTO report_dashboardcard (
          created_at, updated_at, size_x, size_y, row, col, card_id, dashboard_id,
          parameter_mappings, visualization_settings, entity_id, action_id, dashboard_tab_id,
          inline_parameters
        ) VALUES (
          {sql_literal(dc['created_at'])},
          {sql_literal(dc['updated_at'])},
          {sql_literal(dc['size_x'])},
          {sql_literal(dc['size_y'])},
          {sql_literal(dc['row'])},
          {sql_literal(dc['col'])},
          {sql_literal(new_card_id)},
          {sql_literal(new_dashboard_id)},
          {sql_literal(dc['parameter_mappings'])},
          {sql_literal(dc['visualization_settings'])},
          {sql_literal(gen_entity_id())},
          {sql_literal(dc['action_id'])},
          {sql_literal(new_tab_id)},
          {sql_literal(dc['inline_parameters'])}
        )
        """
    )

print('done')
print('new collection id:', new_collection_id)
print('new dashboards:', new_dashboard_ids)
print('cards cloned:', len(card_map))
