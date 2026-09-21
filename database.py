import os
import mysql.connector
from dotenv import load_dotenv

# Garante o carregamento do arquivo .env a partir da pasta 'files'
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env_path = os.path.join(base_dir, ".env")

if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "agrovision"),
            port=int(os.getenv("DB_PORT", 3306))
        )
        return conn
    except Exception as e:
        print(f"Erro ao conectar ao banco de dados: {e}")
        return None

def buscar_ultima_analise_no_banco():
    try:
        conn = get_db_connection()
        if not conn:
            return {}
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM historico ORDER BY id DESC LIMIT 1")
        resultado = cursor.fetchone()
        cursor.close()
        conn.close()
        return resultado if resultado else {}
    except Exception as e:
        print(f"Erro ao buscar última análise no banco: {e}")
        return {}