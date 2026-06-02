import psycopg2
import os
from psycopg2 import sql

# Conexão com o banco de dados
DB_HOST = os.getenv('DB_HOST', 'pgbouncer')
DB_PORT = os.getenv('DB_PORT', '6432')
DB_NAME = os.getenv('DB_NAME', 'runrun')
DB_USER = os.getenv('DB_USER', '')
DB_PASS = os.getenv('DB_PASS', '')

def get_connection():
    """Estabelece conexão com o banco de dados"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )

def explore_schema():
    """Explora a estrutura das tabelas/views"""
    conn = get_connection()
    cur = conn.cursor()

    try:
        # Verificar estrutura de vw_task_contrato_contratante
        print("=== vw_task_contrato_contratante ===")
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'runrun_analytics'
            AND table_name = 'vw_task_contrato_contratante'
            ORDER BY ordinal_position
        """)
        for col in cur.fetchall():
            print(f"  {col[0]}: {col[1]}")

        # Verificar estrutura de vw_dim_contratante
        print("\n=== vw_dim_contratante ===")
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'runrun_analytics'
            AND table_name = 'vw_dim_contratante'
            ORDER BY ordinal_position
        """)
        for col in cur.fetchall():
            print(f"  {col[0]}: {col[1]}")

        # Verificar estrutura de vw_dim_contrato
        print("\n=== vw_dim_contrato ===")
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'runrun_analytics'
            AND table_name = 'vw_dim_contrato'
            ORDER BY ordinal_position
        """)
        for col in cur.fetchall():
            print(f"  {col[0]}: {col[1]}")

        # Mostrar amostra de dados
        print("\n=== Sample from vw_task_contrato_contratante (first 3 rows) ===")
        cur.execute("SELECT * FROM runrun_analytics.vw_task_contrato_contratante LIMIT 3")
        cols = [desc[0] for desc in cur.description]
        print(f"Colunas: {cols}")
        for row in cur.fetchall():
            print(row)

    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    explore_schema()
