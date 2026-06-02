import json
import psycopg2
DSN='host=postgres dbname=metabase-db user=metabase_user password=Nu3wMHPXPh66'
conn=psycopg2.connect(DSN)
cur=conn.cursor()
cur.execute('SELECT dataset_query FROM report_card WHERE id=232')
q=json.loads(cur.fetchone()[0])
field_map={1143:1985,1144:1986,1145:1987,1146:1988,1147:1989,1148:1990,1149:1991,1150:1992,1151:1993}

def rec(o):
    if isinstance(o, dict):
        for k,v in list(o.items()):
            if k == 'source-table' and v == 54:
                o[k] = 121
            elif k == 'source-table' and v == 53:
                o[k] = 125
            else:
                o[k] = rec(v)
        return o
    if isinstance(o, list):
        if len(o) >= 3 and o[0] == 'field' and isinstance(o[2], int) and o[2] in field_map:
            o = list(o)
            o[2] = field_map[o[2]]
        return [rec(x) for x in o]
    return o

q = rec(q)
cur.execute('UPDATE report_card SET dataset_query=%s WHERE id=232', (json.dumps(q, ensure_ascii=False),))
conn.commit()
print('updated')
