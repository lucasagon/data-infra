import json
import psycopg2

DSN='host=postgres dbname=metabase-db user=metabase_user password=Nu3wMHPXPh66'
conn=psycopg2.connect(DSN)
cur=conn.cursor()
try:
    cur.execute('SELECT dataset_query FROM report_card WHERE id=241')
    q=json.loads(cur.fetchone()[0])
    q={
        "lib/type": "mbql/query",
        "database": 3,
        "stages": [
            {
                "lib/type": "mbql.stage/mbql",
                "source-table": 120,
                "filters": [
                    [
                        "=",
                        {"lib/uuid": "active-filter", "effective-type": "type/Text", "base-type": "type/Text"},
                        ["field", {"lib/uuid": "status-field", "effective-type": "type/Text", "base-type": "type/Text"}, "status"],
                        "Ativo"
                    ]
                ],
                "aggregation": [
                    [
                        "distinct",
                        {"lib/uuid": "active-count", "effective-type": "type/Integer"},
                        ["field", {"lib/uuid": "user-id-field", "effective-type": "type/Text", "base-type": "type/Text"}, "user_id"]
                    ]
                ]
            }
        ]
    }
    cur.execute('UPDATE report_card SET dataset_query=%s, source_card_id=NULL WHERE id=241', (json.dumps(q, ensure_ascii=False),))
    conn.commit()
    print('updated')
except Exception as e:
    conn.rollback()
    raise
finally:
    cur.close(); conn.close()
