import json
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor

DSN = 'host=postgres dbname=metabase-db user=metabase_user password=Nu3wMHPXPh66'
NEW_COLLECTION_NAME = '[TWO RH] Pontos _a'
NEW_COLLECTION_SLUG = '_two_rh__pontos__a'
TABLE_MAP = {
    58: 'fact_attendance_daily_a',
    59: 'v_attendance_today_a',
    60: 'fact_attendance_event_a',
    61: 'dim_employee_a',
    62: 'dim_date_a',
    63: 'dim_status_a',
}


def gen_entity_id():
    return uuid.uuid4().hex[:21]


def rewrite(obj, field_map, table_map, card_map):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == 'source-table' and isinstance(v, int) and v in table_map:
                out[k] = table_map[v]
            elif k == 'source-card' and isinstance(v, int) and v in card_map:
                out[k] = card_map[v]
            else:
                out[k] = rewrite(v, field_map, table_map, card_map)
        return out
    if isinstance(obj, list):
        if len(obj) >= 3 and obj[0] == 'field' and isinstance(obj[2], int) and obj[2] in field_map:
            obj = list(obj)
            obj[2] = field_map[obj[2]]
        return [rewrite(x, field_map, table_map, card_map) for x in obj]
    return obj

conn = psycopg2.connect(DSN)
conn.autocommit = False
cur = conn.cursor(cursor_factory=RealDictCursor)
try:
    # Resolve source metadata
    cur.execute("SELECT * FROM collection WHERE id=12")
    src_collection = cur.fetchone()
    cur.execute("SELECT * FROM report_card WHERE collection_id=12 ORDER BY id")
    src_cards = cur.fetchall()
    cur.execute("SELECT * FROM dashboard_tab WHERE dashboard_id=7 ORDER BY position, id")
    src_tabs = cur.fetchall()
    cur.execute("SELECT * FROM report_dashboard WHERE id=7")
    src_dashboard = cur.fetchone()
    cur.execute("SELECT * FROM report_dashboardcard WHERE dashboard_id=7 ORDER BY id")
    src_dashcards = cur.fetchall()

    # Create collection clone
    cur.execute("SELECT id FROM collection WHERE slug=%s", (NEW_COLLECTION_SLUG,))
    row = cur.fetchone()
    if row is None:
        cur.execute(
            '''INSERT INTO collection (
                name, description, archived, location, personal_owner_id, slug, namespace,
                authority_level, entity_id, created_at, type, is_sample, archive_operation_id,
                archived_directly, is_remote_synced, workspace_id
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s,%s,%s,%s,%s,%s) RETURNING id''',
            (
                NEW_COLLECTION_NAME,
                src_collection['description'],
                src_collection['archived'],
                src_collection['location'],
                src_collection['personal_owner_id'],
                NEW_COLLECTION_SLUG,
                src_collection['namespace'],
                src_collection['authority_level'],
                gen_entity_id(),
                src_collection['type'],
                src_collection['is_sample'],
                None,
                src_collection['archived_directly'],
                src_collection['is_remote_synced'],
                src_collection['workspace_id'],
            ),
        )
        new_collection_id = cur.fetchone()['id']
    else:
        new_collection_id = row['id']

    # Ensure metabase catalog exists for the _a views
    # Clone tables 58-63 to the matching _a views in tworh_analytics.
    cur.execute("SELECT id, name FROM metabase_table WHERE db_id=3 AND schema='tworh_analytics' AND name IN %s", (tuple(TABLE_MAP.values()),))
    existing = {r['name']: r['id'] for r in cur.fetchall()}

    src_table_ids = [58, 59, 60, 61, 62, 63]
    new_table_ids = {}
    for src_table_id in src_table_ids:
        new_name = TABLE_MAP[src_table_id]
        if new_name in existing:
            new_table_ids[src_table_id] = existing[new_name]
            continue
        cur.execute("SELECT * FROM metabase_table WHERE id=%s", (src_table_id,))
        oldt = cur.fetchone()
        cur.execute(
            '''INSERT INTO metabase_table (
                created_at, updated_at, name, description, entity_type, active, db_id, display_name,
                visibility_type, schema, points_of_interest, caveats, show_in_getting_started,
                field_order, initial_sync_status, is_upload, database_require_filter, estimated_row_count,
                view_count, is_defective_duplicate, data_authority, data_source, data_layer,
                owner_email, owner_user_id, collection_id, is_published, transform_id
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
            (
                oldt['created_at'], oldt['updated_at'], new_name, oldt['description'], oldt['entity_type'], oldt['active'],
                oldt['db_id'], f"{oldt['display_name']} A" if oldt['display_name'] else new_name,
                oldt['visibility_type'], oldt['schema'], oldt['points_of_interest'], oldt['caveats'], oldt['show_in_getting_started'],
                oldt['field_order'], oldt['initial_sync_status'], oldt['is_upload'], oldt['database_require_filter'], oldt['estimated_row_count'],
                oldt['view_count'], oldt['is_defective_duplicate'], oldt['data_authority'], oldt['data_source'], oldt['data_layer'],
                oldt['owner_email'], oldt['owner_user_id'], oldt['collection_id'], oldt['is_published'], oldt['transform_id'],
            ),
        )
        new_table_ids[src_table_id] = cur.fetchone()['id']

        # Clone fields for the new table.
        cur.execute("SELECT * FROM metabase_field WHERE table_id=%s ORDER BY position, id", (src_table_id,))
        fields = cur.fetchall()
        for f in fields:
            cur.execute(
                '''INSERT INTO metabase_field (
                    created_at, updated_at, name, base_type, semantic_type, active, description, preview_display,
                    position, table_id, parent_id, display_name, visibility_type, fk_target_field_id, last_analyzed,
                    points_of_interest, caveats, fingerprint, fingerprint_version, database_type, has_field_values,
                    settings, database_position, custom_position, effective_type, coercion_strategy, nfc_path,
                    database_required, json_unfolding, database_is_auto_increment, database_indexed, database_partitioned,
                    is_defective_duplicate, database_is_pk, database_is_nullable, database_is_generated, database_default
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
                (
                    f['created_at'], f['updated_at'], f['name'], f['base_type'], f['semantic_type'], f['active'], f['description'], f['preview_display'],
                    f['position'], new_table_ids[src_table_id], None, f['display_name'], f['visibility_type'], f['fk_target_field_id'], f['last_analyzed'],
                    f['points_of_interest'], f['caveats'], f['fingerprint'], f['fingerprint_version'], f['database_type'], f['has_field_values'],
                    f['settings'], f['database_position'], f['custom_position'], f['effective_type'], f['coercion_strategy'], f['nfc_path'],
                    f['database_required'], f['json_unfolding'], f['database_is_auto_increment'], f['database_indexed'], f['database_partitioned'],
                    f['is_defective_duplicate'], f['database_is_pk'], f['database_is_nullable'], f['database_is_generated'], f['database_default'],
                ),
            )

    # Clone cards into the new collection.
    card_map = {}
    direct = [128, 132]
    derived = [129, 130, 131, 133, 134]
    cur.execute(
        "SELECT oldf.id AS old_id, newf.id AS new_id FROM metabase_field oldf JOIN metabase_field newf ON newf.name = oldf.name AND newf.table_id IN %s WHERE oldf.table_id IN %s",
        (tuple(new_table_ids.values()), tuple(src_table_ids)),
    )
    field_map = {r['old_id']: r['new_id'] for r in cur.fetchall()}

    def clone_card(old_card, new_source_card_id=None, rewrite_source_cards=False):
        q = json.loads(old_card['dataset_query'])
        q = rewrite(q, field_map, new_table_ids, card_map if rewrite_source_cards else {})
        cur.execute(
            '''INSERT INTO report_card (
                created_at, updated_at, name, description, display, dataset_query, visualization_settings,
                creator_id, database_id, table_id, query_type, archived, collection_id, public_uuid,
                made_public_by_id, enable_embedding, embedding_params, cache_ttl, result_metadata,
                collection_position, entity_id, parameters, parameter_mappings, collection_preview,
                metabase_version, type, initially_published_at, cache_invalidated_at, last_used_at,
                view_count, archived_directly, dataset_query_metrics_v2_migration_backup, source_card_id,
                dashboard_id, card_schema, document_id, dependency_analysis_version, legacy_query,
                embedding_type
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
            ) RETURNING id''',
            (
                old_card['created_at'], old_card['updated_at'], old_card['name'], old_card['description'], old_card['display'],
                json.dumps(q, ensure_ascii=False), old_card['visualization_settings'], old_card['creator_id'], old_card['database_id'],
                old_card['table_id'], old_card['query_type'], old_card['archived'], new_collection_id, None, None,
                old_card['enable_embedding'], old_card['embedding_params'], old_card['cache_ttl'], old_card['result_metadata'],
                old_card['collection_position'], gen_entity_id(), old_card['parameters'], old_card['parameter_mappings'],
                old_card['collection_preview'], old_card['metabase_version'], old_card['type'], old_card['initially_published_at'],
                old_card['cache_invalidated_at'], old_card['last_used_at'], old_card['view_count'], old_card['archived_directly'],
                old_card['dataset_query_metrics_v2_migration_backup'], new_source_card_id, old_card['dashboard_id'], old_card['card_schema'],
                old_card['document_id'], old_card['dependency_analysis_version'], old_card['legacy_query'], old_card['embedding_type'],
            ),
        )
        new_id = cur.fetchone()['id']
        card_map[old_card['id']] = new_id

    for cid in direct:
        clone_card(next(c for c in src_cards if c['id'] == cid))
    for cid in derived:
        old_card = next(c for c in src_cards if c['id'] == cid)
        clone_card(old_card, new_source_card_id=card_map[old_card['source_card_id']], rewrite_source_cards=True)

    # Update dashboard 7 to reference the new TWO RH _a cards.
    cur.execute('SELECT * FROM report_dashboardcard WHERE dashboard_id=7 ORDER BY id')
    dashcards = cur.fetchall()
    for dc in dashcards:
        if dc['card_id'] in card_map:
            cur.execute('UPDATE report_dashboardcard SET card_id=%s WHERE id=%s', (card_map[dc['card_id']], dc['id']))

    conn.commit()
    print(json.dumps({'collection_id': new_collection_id, 'card_map': card_map, 'table_map': new_table_ids}, indent=2))
except Exception:
    conn.rollback()
    raise
finally:
    cur.close()
    conn.close()
