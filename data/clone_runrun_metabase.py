import json
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor

DSN = "host=postgres dbname=metabase-db user=metabase_user password=Nu3wMHPXPh66"
TABLE_MAP = {45: 116, 50: 117, 52: 118, 55: 119, 57: 120}
NEW_COLLECTION_NAME = "[Runrun] Usuários Ativos _a"
NEW_COLLECTION_SLUG = "_runrun__usuarios_ativos__a"
NEW_DASHBOARD_NAME = "RunRun - Relatório de Atividades _a"

def gen_entity_id():
    return uuid.uuid4().hex[:21]

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
        return [rewrite_query(x, field_map, table_map, card_map) for x in obj]
    return obj

print('connecting...')
conn = psycopg2.connect(DSN)
conn.autocommit = False
cur = conn.cursor(cursor_factory=RealDictCursor)
try:
    cur.execute('SELECT * FROM collection WHERE id=10')
    old_collection = cur.fetchone()
    cur.execute('SELECT * FROM report_dashboard WHERE id=4')
    old_dashboard = cur.fetchone()
    cur.execute('SELECT * FROM dashboard_tab WHERE dashboard_id=4 ORDER BY position, id')
    old_tabs = cur.fetchall()
    cur.execute('SELECT * FROM report_card WHERE collection_id=10 ORDER BY id')
    old_cards = cur.fetchall()
    cur.execute('SELECT * FROM report_card WHERE id BETWEEN 127 AND 133 ORDER BY id')
    external_cards = {r['id']: r for r in cur.fetchall()}

    print('creating collection')
    cur.execute(
        '''INSERT INTO collection (
            name, description, archived, location, personal_owner_id, slug, namespace,
            authority_level, entity_id, created_at, type, is_sample, archive_operation_id,
            archived_directly, is_remote_synced, workspace_id
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s,%s,%s,%s,%s,%s) RETURNING id''',
        (
            NEW_COLLECTION_NAME, old_collection['description'], False, old_collection['location'], None,
            NEW_COLLECTION_SLUG, old_collection['namespace'], old_collection['authority_level'], gen_entity_id(),
            old_collection['type'], old_collection['is_sample'], None, old_collection['archived_directly'],
            old_collection['is_remote_synced'], old_collection['workspace_id'],
        ),
    )
    new_collection_id = cur.fetchone()['id']

    print('creating dashboard')
    cur.execute(
        '''INSERT INTO report_dashboard (
            created_at, updated_at, name, description, creator_id, parameters, points_of_interest,
            caveats, show_in_getting_started, public_uuid, made_public_by_id, enable_embedding,
            embedding_params, archived, position, collection_id, collection_position, cache_ttl,
            entity_id, auto_apply_filters, width, initially_published_at, view_count, archived_directly,
            last_viewed_at, dependency_analysis_version, embedding_type
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
        (
            old_dashboard['created_at'], old_dashboard['updated_at'], NEW_DASHBOARD_NAME,
            old_dashboard['description'], old_dashboard['creator_id'], old_dashboard['parameters'],
            old_dashboard['points_of_interest'], old_dashboard['caveats'], old_dashboard['show_in_getting_started'],
            None, None, old_dashboard['enable_embedding'], old_dashboard['embedding_params'], old_dashboard['archived'],
            old_dashboard['position'], new_collection_id, old_dashboard['collection_position'], old_dashboard['cache_ttl'],
            gen_entity_id(), old_dashboard['auto_apply_filters'], old_dashboard['width'],
            old_dashboard['initially_published_at'], old_dashboard['view_count'], old_dashboard['archived_directly'],
            old_dashboard['last_viewed_at'], old_dashboard['dependency_analysis_version'], old_dashboard['embedding_type'],
        ),
    )
    new_dashboard_id = cur.fetchone()['id']

    tab_map = {}
    print('cloning tabs')
    for tab in old_tabs:
        cur.execute(
            '''INSERT INTO dashboard_tab (dashboard_id, name, position, entity_id, created_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s) RETURNING id''',
            (new_dashboard_id, tab['name'], tab['position'], gen_entity_id(), tab['created_at'], tab['updated_at'])
        )
        tab_map[tab['id']] = cur.fetchone()['id']

    cur.execute('''
        SELECT oldf.id AS old_id, newf.id AS new_id
        FROM metabase_field oldf
        JOIN metabase_field newf ON newf.name = oldf.name
        JOIN metabase_table oldt ON oldt.id = oldf.table_id
        JOIN metabase_table newt ON newt.id = newf.table_id
        WHERE oldf.table_id IN (45,50,52,55,57)
          AND newf.table_id IN (116,117,118,119,120)
    ''')
    field_map = {r['old_id']: r['new_id'] for r in cur.fetchall()}

    card_map = {}
    def clone_card(old_card, source_card_id=None, rewrite_sources=False):
        q = json.loads(old_card['dataset_query'])
        q = rewrite_query(q, field_map, TABLE_MAP, card_map if rewrite_sources else {})
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
                old_card['created_at'], old_card['updated_at'], old_card['name'], old_card['description'],
                old_card['display'], json.dumps(q, ensure_ascii=False), old_card['visualization_settings'],
                old_card['creator_id'], old_card['database_id'], old_card['table_id'], old_card['query_type'],
                old_card['archived'], new_collection_id, None, None, old_card['enable_embedding'],
                old_card['embedding_params'], old_card['cache_ttl'], old_card['result_metadata'],
                old_card['collection_position'], gen_entity_id(), old_card['parameters'], old_card['parameter_mappings'],
                old_card['collection_preview'], old_card['metabase_version'], old_card['type'],
                old_card['initially_published_at'], old_card['cache_invalidated_at'], old_card['last_used_at'],
                old_card['view_count'], old_card['archived_directly'], old_card['dataset_query_metrics_v2_migration_backup'],
                source_card_id, old_card['dashboard_id'], old_card['card_schema'], old_card['document_id'],
                old_card['dependency_analysis_version'], old_card['legacy_query'], old_card['embedding_type'],
            )
        )
        new_id = cur.fetchone()['id']
        card_map[old_card['id']] = new_id

    direct_ids = [113, 115, 116, 119, 121, 122, 124, 125]
    derived_ids = [114, 117, 118, 120, 123, 126]
    print('cloning direct cards')
    for cid in direct_ids:
        clone_card(next(c for c in old_cards if c['id'] == cid))
    print('cloning derived cards')
    for cid in derived_ids:
        old_card = next(c for c in old_cards if c['id'] == cid)
        clone_card(old_card, source_card_id=card_map[old_card['source_card_id']], rewrite_sources=True)

    print('cloning dashboard cards')
    cur.execute('SELECT * FROM report_dashboardcard WHERE dashboard_id=4 ORDER BY row, col, id')
    old_dashcards = cur.fetchall()
    for dc in old_dashcards:
        cur.execute(
            '''INSERT INTO report_dashboardcard (
                created_at, updated_at, size_x, size_y, row, col, card_id, dashboard_id,
                parameter_mappings, visualization_settings, entity_id, action_id, dashboard_tab_id,
                inline_parameters
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (
                dc['created_at'], dc['updated_at'], dc['size_x'], dc['size_y'], dc['row'], dc['col'],
                card_map.get(dc['card_id'], dc['card_id']), new_dashboard_id, dc['parameter_mappings'],
                dc['visualization_settings'], gen_entity_id(), dc['action_id'], tab_map.get(dc['dashboard_tab_id'], dc['dashboard_tab_id']),
                dc['inline_parameters'],
            )
        )

    conn.commit()
    print('done', new_collection_id, new_dashboard_id)
    print('cards', card_map)
    print('tabs', tab_map)
except Exception as e:
    conn.rollback()
    print('ERROR:', type(e).__name__, e)
    raise
finally:
    cur.close(); conn.close()
