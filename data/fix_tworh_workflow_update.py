import json
import psycopg2
from psycopg2.extras import RealDictCursor

N8N_DSN = 'host=postgres dbname=n8n user=postgres password=7UhAqX9Wj5TZ'
WORKFLOW_ID = 'MwOs4k8y8Rs673SJ'

conn = psycopg2.connect(N8N_DSN)
cur = conn.cursor(cursor_factory=RealDictCursor)
try:
    cur.execute('SELECT nodes::jsonb AS nodes FROM workflow_entity WHERE id=%s', (WORKFLOW_ID,))
    nodes = cur.fetchone()['nodes']
    for node in nodes:
        if node.get('type') != 'n8n-nodes-base.postgres':
            continue
        name = node.get('name')
        if name == 'ATTENDANCE':
            node['parameters']['query'] = node['parameters']['query'].replace('INSERT INTO tworh_staging.attendance_register (', 'INSERT INTO tworh_staging.attendance_register_a (')
        elif name == 'EMPLOYEES':
            node['parameters']['query'] = """INSERT INTO tworh_staging.employees_a (
    employee_id,
    employee_number,
    full_name,
    first_name,
    last_name,
    email,
    personal_document,
    department,
    job_title,
    employer_name,
    admission_date,
    access_level,
    active,
    extracted_at
)
SELECT
    (payload_json->>'EmployeeID')::bigint,
    NULLIF(payload_json->>'EmployeeNumber','')::INTEGER,
    payload_json->>'FullName',
    payload_json->>'FirstName',
    payload_json->>'LastName',
    NULLIF(payload_json->>'Email',''),
    regexp_replace(COALESCE(payload_json->>'PersonalDocument', ''), '[^0-9]', '', 'g'),
    payload_json->>'Department',
    payload_json->>'JobTitle',
    payload_json->>'EmployerName',
    NULLIF(payload_json->>'AdmissionDate','')::DATE,
    payload_json->>'AccessLevel',
    COALESCE((payload_json->>'NeedAttendance')::boolean, false),
    extracted_at
FROM tworh_raw.employees_a
ON CONFLICT (employee_id)
DO UPDATE SET
    employee_number = EXCLUDED.employee_number,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    personal_document = EXCLUDED.personal_document,
    department = EXCLUDED.department,
    job_title = EXCLUDED.job_title,
    employer_name = EXCLUDED.employer_name,
    admission_date = EXCLUDED.admission_date,
    access_level = EXCLUDED.access_level,
    active = EXCLUDED.active,
    extracted_at = EXCLUDED.extracted_at;"""
    cur.execute('UPDATE workflow_entity SET nodes=%s, "updatedAt"=now() WHERE id=%s', (json.dumps(nodes), WORKFLOW_ID))
    conn.commit()
    print('workflow updated')
finally:
    cur.close(); conn.close()
