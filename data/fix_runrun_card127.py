import json, uuid, psycopg2, traceback
from psycopg2.extras import RealDictCursor
DSN='host=postgres dbname=metabase-db user=metabase_user password=Nu3wMHPXPh66'
conn=psycopg2.connect(DSN)
cur=conn.cursor(cursor_factory=RealDictCursor)

def gen_entity_id():
    return uuid.uuid4().hex[:21]
try:
    cur.execute('SELECT * FROM report_card WHERE id=127')
    old=cur.fetchone()
    q=json.loads(old['dataset_query'])
    def rec(o):
        if isinstance(o, dict):
            out={}
            for k,v in o.items():
                if k=='source-card' and v==124:
                    out[k]=237
                else:
                    out[k]=rec(v)
            return out
        if isinstance(o, list):
            return [rec(x) for x in o]
        return o
    q=rec(q)
    cur.execute('''INSERT INTO report_card (
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
    ) RETURNING id''',(
        old['created_at'], old['updated_at'], old['name'], old['description'], old['display'], json.dumps(q, ensure_ascii=False), old['visualization_settings'],
        old['creator_id'], old['database_id'], old['table_id'], old['query_type'], old['archived'], 16, None, None, old['enable_embedding'], old['embedding_params'],
        old['cache_ttl'], old['result_metadata'], old['collection_position'], gen_entity_id(), old['parameters'], old['parameter_mappings'], old['collection_preview'],
        old['metabase_version'], old['type'], old['initially_published_at'], old['cache_invalidated_at'], old['last_used_at'], old['view_count'], old['archived_directly'],
        old['dataset_query_metrics_v2_migration_backup'], 237, old['dashboard_id'], old['card_schema'], old['document_id'], old['dependency_analysis_version'], old['legacy_query'], old['embedding_type']
    ))
    new_id=cur.fetchone()['id']
    cur.execute('UPDATE report_dashboardcard SET card_id=%s WHERE dashboard_id=7 AND card_id=127', (new_id,))
    conn.commit()
    print(new_id)
except Exception as e:
    conn.rollback()
    print('ERR', type(e).__name__, e)
    traceback.print_exc()
finally:
    cur.close(); conn.close()
