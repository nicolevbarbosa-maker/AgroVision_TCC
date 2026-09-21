import mysql.connector

conn = mysql.connector.connect(
    host="localhost",
    port=3306,
    user="root",
    password="root123456"
)
cursor = conn.cursor()

cursor.execute("CREATE DATABASE IF NOT EXISTS agrovision")
cursor.execute("USE agrovision")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS historico (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        setor VARCHAR(50),
        praga_nome VARCHAR(100),
        confianca FLOAT,
        status VARCHAR(20),
        posicao_x INT DEFAULT 0,
        posicao_y INT DEFAULT 0,
        fase VARCHAR(50) DEFAULT 'MAPEAMENTO'
    )
""")

print("Banco e Tabela criados/atualizados com sucesso!")
cursor.close()
conn.close()