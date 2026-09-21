import os
import cv2
import numpy as np
from datetime import datetime
from enum import Enum
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.model.database import get_db_connection, buscar_ultima_analise_no_banco

app = FastAPI(title="AgroVision API")

# Restrição de CORS para segurança e conformidade com boas práticas
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501",
        "http://127.0.0.1:8000",
        "http://localhost:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estado global de controle da missão
mapeamento_ativo = False

class StatusEnum(str, Enum):
    OK = "OK"
    ALERTA = "ALERTA"
    CRITICO = "CRÍTICO"

class AnaliseRequest(BaseModel):
    setor: str
    praga_nome: str
    confianca: float = Field(..., ge=0.0, le=1.0, description="Intervalo de confiança entre 0.0 e 1.0")
    status: str
    posicao_x: int = 0
    posicao_y: int = 0
    fase: str = "MAPEAMENTO"

@app.get("/health")
def health_check():
    try:
        conn = get_db_connection()
        if conn and conn.is_connected():
            conn.close()
            return {"status": "online", "database": "connected"}
        raise Exception("Sem conexão com o MySQL")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro de infraestrutura: {str(e)}")

@app.post("/mapeamento/iniciar")
def iniciar_mapeamento():
    global mapeamento_ativo
    mapeamento_ativo = True
    return {"status": "sucesso", "mensagem": "Mapeamento iniciado no backend"}

@app.post("/mapeamento/parar")
def parar_mapeamento():
    global mapeamento_ativo
    mapeamento_ativo = False
    return {"status": "sucesso", "mensagem": "Mapeamento pausado no backend"}

@app.get("/mapeamento/status")
def status_mapeamento():
    return {"ativo": mapeamento_ativo}

@app.post("/salvar-analise")
def salvar_analise(dados: AnaliseRequest):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        comando = """
            INSERT INTO historico 
            (data_hora, setor, praga_nome, confianca, status, posicao_x, posicao_y, fase) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(comando, (
            datetime.now(), dados.setor, dados.praga_nome, 
            dados.confianca, dados.status, dados.posicao_x, 
            dados.posicao_y, dados.fase
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar análise no banco: {str(e)}")

@app.get("/ultima-analise")
def buscar_ultima_analise():
    try:
        res = buscar_ultima_analise_no_banco()
        return res if res else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar última análise: {str(e)}")

@app.get("/alertas-recentes")
def buscar_alertas_recentes():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, data_hora, setor, praga_nome, confianca, status, posicao_x, posicao_y 
            FROM historico 
            WHERE praga_nome != 'Mapeamento Inicial' 
            ORDER BY id DESC 
            LIMIT 5
        """)
        alertas = cursor.fetchall()
        cursor.close()
        conn.close()
        return alertas
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar alertas recentes: {str(e)}")

@app.get("/gerar-mosaico")
def endpoint_gerar_mosaico():
    try:
        pasta_tiles = "app/view/agrovision_tiles_4x4"
        os.makedirs(pasta_tiles, exist_ok=True)
        
        colunas, linhas = 4, 4
        tam_tile = (300, 300)
        grid_linhas = []

        for y in range(linhas):
            linha_tiles = []
            for x in range(colunas):
                caminho_tile = os.path.join(pasta_tiles, f"tile_r{y+1}_c{x+1}.jpg")
                if not os.path.exists(caminho_tile):
                    caminho_tile = os.path.join(pasta_tiles, f"tile_r{y+1}_c{x+1}.png")

                if os.path.exists(caminho_tile):
                    img = cv2.imread(caminho_tile)
                    img = cv2.resize(img, tam_tile)
                else:
                    img = np.zeros((tam_tile[1], tam_tile[0], 3), dtype=np.uint8)
                    img[:] = (50 + y * 20, 110 + x * 25, 20)
                    cv2.rectangle(img, (0, 0), (tam_tile[0]-1, tam_tile[1]-1), (74, 222, 128), 2)
                
                linha_tiles.append(img)
            
            grid_linhas.append(np.hstack(linha_tiles))

        # Inverte verticalmente a ordem das linhas para corrigir a orientação
        grid_linhas_corrigidas = grid_linhas[::-1]
        mosaico_final = np.vstack(grid_linhas_corrigidas)

        caminho_resultado = "app/view/mosaico_fazenda.jpg"
        cv2.imwrite(caminho_resultado, mosaico_final)

        return FileResponse(caminho_resultado, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar mosaico com OpenCV: {str(e)}")

@app.get("/historico")
def buscar_historico_completo():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM historico WHERE praga_nome != 'Mapeamento Inicial' ORDER BY id DESC LIMIT 50")
        registros = cursor.fetchall()
        cursor.close()
        conn.close()
        return registros
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar histórico: {str(e)}")

@app.delete("/limpar-historico")
def endpoint_limpar_historico():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("TRUNCATE TABLE historico;")
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "mensagem": "Histórico limpo no MySQL!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao apagar histórico: {str(e)}")