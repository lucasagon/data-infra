import json
import psycopg2
from psycopg2.extras import RealDictCursor

PG_DSN = 'host=postgres dbname=postgres user=postgres password=7UhAqX9Wj5TZ'
N8N_DSN = 'host=postgres dbname=n8n user=postgres password=7UhAqX9Wj5TZ'
WORKFLOW_ID = 'MwOs4k8y8Rs673SJ'

postgres_conn = psycopg2.connect(PG_DSN)
postgres_conn.autocommit = False
cur = postgres_conn.cursor(cursor_factory=RealDictCursor)

try:
    # Preserve the old generic employees_a table before replacing it with the transformed version.
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'tworh_staging' AND table_name = 'employees_a'
            ) THEN
                EXECUTE 'ALTER TABLE tworh_staging.employees_a RENAME TO employees_a_raw';
            END IF;
        END $$;
    """)

    # Recreate transformed staging tables with the same shape as the current transformed tables.
    cur.execute("CREATE TABLE IF NOT EXISTS tworh_staging.attendance_register_a (LIKE tworh_staging.attendance_register INCLUDING ALL)")
    cur.execute("CREATE TABLE IF NOT EXISTS tworh_staging.employees_a (LIKE tworh_staging.employees INCLUDING ALL)")

    cur.execute("TRUNCATE TABLE tworh_staging.attendance_register_a, tworh_staging.employees_a")

    cur.execute("""
        INSERT INTO tworh_staging.attendance_register_a (
            attendance_register_id,
            employee_number,
            personal_document,
            base_date,
            event_datetime,
            event_date,
            synced,
            status_id,
            status,
            extracted_at
        )
        SELECT
            attendance_register_id,
            NULLIF(employee_number, '')::INTEGER,
            regexp_replace(personal_document, '[^0-9]', '', 'g'),
            base_date,
            event_datetime,
            DATE(event_datetime),
            synced,
            status_id,
            status,
            extracted_at
        FROM tworh_raw.attendance_register
        ON CONFLICT (attendance_register_id)
        DO UPDATE SET
            employee_number = EXCLUDED.employee_number,
            personal_document = EXCLUDED.personal_document,
            base_date = EXCLUDED.base_date,
            event_datetime = EXCLUDED.event_datetime,
            event_date = EXCLUDED.event_date,
            synced = EXCLUDED.synced,
            status_id = EXCLUDED.status_id,
            status = EXCLUDED.status,
            extracted_at = EXCLUDED.extracted_at;
    """)

    cur.execute("""
        INSERT INTO tworh_staging.employees_a (
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
            NULLIF(payload_json->>'EmployeeNumber', '')::INTEGER,
            payload_json->>'FullName',
            payload_json->>'FirstName',
            payload_json->>'LastName',
            NULLIF(payload_json->>'Email', ''),
            regexp_replace(COALESCE(payload_json->>'PersonalDocument', ''), '[^0-9]', '', 'g'),
            payload_json->>'Department',
            payload_json->>'JobTitle',
            payload_json->>'EmployerName',
            NULLIF(payload_json->>'AdmissionDate', '')::DATE,
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
            extracted_at = EXCLUDED.extracted_at;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.dim_date_a AS
        SELECT DISTINCT
            event_date AS date,
            EXTRACT(YEAR FROM event_date) AS year,
            EXTRACT(MONTH FROM event_date) AS month,
            EXTRACT(DAY FROM event_date) AS day,
            EXTRACT(DOW FROM event_date) AS day_of_week,
            CASE WHEN EXTRACT(DOW FROM event_date) IN (0, 6) THEN true ELSE false END AS weekend
        FROM tworh_staging.attendance_register_a;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.dim_employee_a AS
        SELECT
            employee_id,
            employee_number,
            full_name,
            department,
            job_title,
            employer_name,
            admission_date,
            active
        FROM tworh_staging.employees_a;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.dim_status_a AS
        SELECT DISTINCT
            status_id,
            status
        FROM tworh_staging.attendance_register_a;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.fact_attendance_daily_a AS
        SELECT
            e.employee_id,
            ar.employee_number,
            ar.event_date,
            MIN(ar.event_datetime) AS first_punch,
            MAX(ar.event_datetime) AS last_punch,
            COUNT(ar.attendance_register_id) AS punches,
            (MAX(ar.event_datetime) - MIN(ar.event_datetime)) AS worked_time
        FROM tworh_staging.attendance_register_a ar
        LEFT JOIN tworh_staging.employees_a e
            ON e.employee_number = ar.employee_number
        GROUP BY e.employee_id, ar.employee_number, ar.event_date;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.fact_attendance_event_a AS
        SELECT
            ar.attendance_register_id,
            e.employee_id,
            ar.employee_number,
            ar.event_datetime,
            ar.event_date,
            ar.status_id,
            ar.synced
        FROM tworh_staging.attendance_register_a ar
        LEFT JOIN tworh_staging.employees_a e
            ON e.employee_number = ar.employee_number;
    """)

    cur.execute("""
        CREATE OR REPLACE VIEW tworh_analytics.v_attendance_today_a AS
        WITH ordered_events AS (
            SELECT
                ar.employee_number,
                e.full_name,
                e.email,
                ar.event_datetime,
                ar.event_date,
                lag(ar.event_datetime) OVER (
                    PARTITION BY ar.employee_number, ar.event_date
                    ORDER BY ar.event_datetime
                ) AS prev_event
            FROM tworh_staging.attendance_register_a ar
            LEFT JOIN tworh_staging.employees_a e
                ON e.employee_number = ar.employee_number
            WHERE ar.event_date = CURRENT_DATE
        ), worked_time AS (
            SELECT
                ordered_events.employee_number,
                ordered_events.full_name,
                ordered_events.email,
                ordered_events.event_datetime,
                sum(
                    CASE
                        WHEN ordered_events.prev_event IS NULL THEN '00:00:00'::interval
                        ELSE ordered_events.event_datetime - ordered_events.prev_event
                    END
                ) OVER (PARTITION BY ordered_events.employee_number, ordered_events.full_name) AS total_interval
            FROM ordered_events
        ), base AS (
            SELECT
                worked_time.employee_number,
                worked_time.full_name,
                worked_time.email,
                string_agg(to_char(worked_time.event_datetime, 'HH24:MI'), ', ' ORDER BY worked_time.event_datetime) AS working_hours,
                to_char(max(worked_time.total_interval), 'HH24:MI') AS total_worked
            FROM worked_time
            GROUP BY worked_time.employee_number, worked_time.full_name, worked_time.email
        ), runrun_match AS (
            SELECT
                b.employee_number,
                b.full_name,
                b.working_hours,
                b.total_worked,
                u.user_id,
                b.email AS tworh_email,
                u.email AS runrun_email
            FROM base b
            LEFT JOIN runrun_analytics.dim_users_a u
                ON lower(u.email) = lower(b.email)
        )
        SELECT
            r.employee_number,
            r.full_name,
            r.working_hours,
            r.total_worked,
            CASE WHEN r.user_id IS NOT NULL THEN 'Sim' ELSE 'Não' END AS runrun_found,
            CASE WHEN a.user_id IS NOT NULL THEN 'Em Atividade' ELSE 'Inativo' END AS runrun_status,
            r.tworh_email,
            r.runrun_email
        FROM runrun_match r
        LEFT JOIN runrun_analytics.vw_users_current_activity_a a
            ON a.user_id = r.user_id;
    """)

    cur.execute("""
        GRANT USAGE ON SCHEMA tworh_staging TO metabase_user;
        GRANT USAGE ON SCHEMA tworh_analytics TO metabase_user;
        GRANT SELECT ON
            tworh_staging.attendance_register_a,
            tworh_staging.employees_a,
            tworh_analytics.dim_date_a,
            tworh_analytics.dim_employee_a,
            tworh_analytics.dim_status_a,
            tworh_analytics.fact_attendance_daily_a,
            tworh_analytics.fact_attendance_event_a,
            tworh_analytics.v_attendance_today_a
        TO metabase_user;
    """)

    postgres_conn.commit()
    print('postgres objects updated')
except Exception as e:
    postgres_conn.rollback()
    raise
finally:
    cur.close()
    postgres_conn.close()

n8n_conn = psycopg2.connect(N8N_DSN)
n8n_conn.autocommit = False
cur = n8n_conn.cursor(cursor_factory=RealDictCursor)
try:
    cur.execute("SELECT nodes::jsonb AS nodes FROM workflow_entity WHERE id=%s", (WORKFLOW_ID,))
    nodes = cur.fetchone()['nodes']

    for node in nodes:
        if node.get('type') != 'n8n-nodes-base.postgres':
            continue
        name = node.get('name')
        query = node.get('parameters', {}).get('query', '')
        if name == 'ATTENDANCE':
            node['parameters']['query'] = query.replace('INSERT INTO tworh_staging.attendance_register (', 'INSERT INTO tworh_staging.attendance_register_a (')
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

    cur.execute(
        "UPDATE workflow_entity SET nodes=%s, updatedAt=now() WHERE id=%s",
        (json.dumps(nodes), WORKFLOW_ID),
    )
    n8n_conn.commit()
    print('workflow updated')
except Exception:
    n8n_conn.rollback()
    raise
finally:
    cur.close()
    n8n_conn.close()
