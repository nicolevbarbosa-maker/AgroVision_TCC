import os
import cv2
import numpy as np
from datetime import datetime
from enum import Enum
from fastapi import FastAPI, HTTPException, Response, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
import asyncio

from app.model.database import get_db_connection, buscar_ultima_analise_no_banco

app = FastAPI(title="AgroVision API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mapeamento_ativo = False
ultima_classificacao_live = {
    "praga_nome": "Solo Limpo",
    "status": "OK",
    "confianca": 0.99,
    "fps": 0
}

class LiveClassificacaoRequest(BaseModel):
    praga_nome: str
    status: str
    confianca: float
    fps: int = Field(default=0, ge=0)

class AnaliseRequest(BaseModel):
    setor: str
    praga_nome: str
    confianca: float = Field(..., ge=0.0, le=1.0)
    status: str
    posicao_x: int = 0
    posicao_y: int = 0
    fase: str = "VARREDURA"

@app.get("/health")
def health_check():
    conn = get_db_connection()
    if conn:
        conn.close()
        return {"api": "online", "database": "conectado"}
    raise HTTPException(status_code=503, detail="Banco MySQL Indisponível")

def _pasta_tiles_mosaico():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(base_dir, "..", "view", "agrovision_tiles_4x4"))

def _limpar_tiles_mosaico():
    pasta_tiles = _pasta_tiles_mosaico()
    os.makedirs(pasta_tiles, exist_ok=True)
    for nome in os.listdir(pasta_tiles):
        if nome.lower().endswith(".jpg") and (nome.startswith("tile_r") or nome.startswith("ponto_x")):
            caminho = os.path.join(pasta_tiles, nome)
            if os.path.isfile(caminho):
                try:
                    os.remove(caminho)
                except OSError:
                    pass

@app.post("/mapeamento/iniciar")
def iniciar_mapeamento():
    global mapeamento_ativo
    _limpar_tiles_mosaico()
    mapeamento_ativo = True
    return {"status": "sucesso"}

@app.post("/mapeamento/parar")
def parar_mapeamento():
    global mapeamento_ativo
    mapeamento_ativo = False
    return {"status": "sucesso"}

@app.get("/mapeamento/status")
def status_mapeamento():
    return {"ativo": mapeamento_ativo}

@app.post("/salvar-analise-live")
def salvar_analise_live(dados: LiveClassificacaoRequest):
    global ultima_classificacao_live
    ultima_classificacao_live = {
        "praga_nome": dados.praga_nome,
        "status": dados.status,
        "confianca": dados.confianca,
        "fps": dados.fps
    }
    return {"status": "ok"}

@app.post("/salvar-analise")
def salvar_analise(dados: AnaliseRequest):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=503, detail="Banco indisponível.")
    try:
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ultima-analise")
def buscar_ultima_analise():
    return ultima_classificacao_live

@app.get("/alertas-recentes")
def buscar_alertas_recentes():
    conn = get_db_connection()
    if not conn:
        return []
    try:
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
    except Exception:
        return []

# --- PROCESSAMENTO DO ORTOMOSAICO (LAB COLOR MATCH + FEATHERING) ---
LINHAS, COLUNAS = 4, 3
CELULA = 400
SOBREPOSICAO = 35
FORCA_COR = 0.70

def _recorte_quadrado(img):
    h, w = img.shape[:2]
    lado = min(h, w)
    y0, x0 = (h - lado) // 2, (w - lado) // 2
    return img[y0:y0 + lado, x0:x0 + lado]

def _normalizar_cor(tiles_reais):
    if len(tiles_reais) < 2:
        return tiles_reais
    labs = [cv2.cvtColor(t, cv2.COLOR_BGR2LAB).astype(np.float32) for t in tiles_reais]
    medias = np.array([l.reshape(-1, 3).mean(0) for l in labs])
    desvios = np.array([l.reshape(-1, 3).std(0) + 1e-6 for l in labs])
    alvo_m, alvo_d = medias.mean(0), desvios.mean(0)

    saida = []
    for lab, m, d in zip(labs, medias, desvios):
        m2 = m + FORCA_COR * (alvo_m - m)
        d2 = d + FORCA_COR * (alvo_d - d)
        ganho = np.clip(d2 / d, 0.75, 1.35)
        lab_norm = np.clip((lab - m) * ganho + m2, 0, 255).astype(np.uint8)
        saida.append(cv2.cvtColor(lab_norm, cv2.COLOR_LAB2BGR))
    return saida

def montar_ortomosaico(pasta_tiles):
    lado_tile = CELULA + 2 * SOBREPOSICAO
    rampa = 2 * SOBREPOSICAO
    idx = np.arange(lado_tile, dtype=np.float32)
    janela_1d = np.minimum(1.0, np.minimum((idx + 1) / rampa, (lado_tile - idx) / rampa))
    janela = np.outer(janela_1d, janela_1d)[..., None]

    imagens, reais = {}, []
    for y_tela in range(LINHAS):
        for x_tela in range(COLUNAS):
            r_num, c_num = x_tela + 1, LINHAS - y_tela
            caminho = os.path.join(pasta_tiles, f"tile_r{r_num}_c{c_num}.jpg")
            caminho_alt = os.path.join(pasta_tiles, f"ponto_x{x_tela}_y{y_tela}.jpg")

            caminho_final = caminho if os.path.exists(caminho) else (caminho_alt if os.path.exists(caminho_alt) else None)
            if caminho_final:
                img = cv2.imread(caminho_final)
                if img is not None:
                    imagens[(y_tela, x_tela)] = cv2.resize(_recorte_quadrado(img), (lado_tile, lado_tile), interpolation=cv2.INTER_AREA)
                    reais.append((y_tela, x_tela))

    if reais:
        imgs_corrigidas = _normalizar_cor([imagens[k] for k in reais])
        for k, img in zip(reais, imgs_corrigidas):
            imagens[k] = img

    acc = np.zeros((LINHAS * CELULA + 2 * SOBREPOSICAO, COLUNAS * CELULA + 2 * SOBREPOSICAO, 3), dtype=np.float32)
    peso = np.zeros(acc.shape[:2] + (1,), dtype=np.float32)

    for y_tela in range(LINHAS):
        for x_tela in range(COLUNAS):
            img = imagens.get((y_tela, x_tela))
            if img is None:
                img = np.zeros((lado_tile, lado_tile, 3), dtype=np.uint8)
                img[:] = (50 + y_tela * 20, 110 + x_tela * 25, 20)

            y0, x0 = y_tela * CELULA, x_tela * CELULA
            acc[y0:y0 + lado_tile, x0:x0 + lado_tile] += img.astype(np.float32) * janela
            peso[y0:y0 + lado_tile, x0:x0 + lado_tile] += janela

    mosaico = acc / np.maximum(peso, 1e-6)
    o = SOBREPOSICAO
    mosaico_crop = mosaico[o:-o, o:-o] if o > 0 else mosaico
    return np.clip(mosaico_crop, 0, 255).astype(np.uint8)

@app.get("/gerar-mosaico")
def endpoint_gerar_mosaico():
    try:
        pasta_tiles = _pasta_tiles_mosaico()
        os.makedirs(pasta_tiles, exist_ok=True)
        mosaico_final = montar_ortomosaico(pasta_tiles)
        ok, buffer = cv2.imencode('.jpg', mosaico_final, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if not ok:
            raise HTTPException(status_code=500, detail="Falha ao codificar imagem JPEG.")
        return Response(content=buffer.tobytes(), media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/salvar-tile")
async def salvar_tile(
    x: int = Form(..., ge=0, le=3),
    y: int = Form(..., ge=0, le=2),
    file: UploadFile = File(...)
):
    conteudo = await file.read()
    img = cv2.imdecode(np.frombuffer(conteudo, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Arquivo inválido.")

    pasta_tiles = _pasta_tiles_mosaico()
    os.makedirs(pasta_tiles, exist_ok=True)

    nome = f"tile_r{x + 1}_c{3 - y}.jpg"
    caminho = os.path.join(pasta_tiles, nome)
    if not cv2.imwrite(caminho, img, [cv2.IMWRITE_JPEG_QUALITY, 92]):
        raise HTTPException(status_code=500, detail="Erro ao salvar tile.")

    return {"status": "ok", "arquivo": nome}

@app.get("/historico")
def buscar_historico_completo():
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM historico WHERE praga_nome != 'Mapeamento Inicial' ORDER BY id DESC LIMIT 50")
        registros = cursor.fetchall()
        cursor.close()
        conn.close()
        return registros
    except Exception:
        return []

@app.delete("/limpar-historico")
def endpoint_limpar_historico():
    conn = get_db_connection()
    if not conn:
        return {"status": "erro"}
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM historico;")
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/proporcao-vegetacao")
def proporcao_vegetacao():
    conn = get_db_connection()
    if not conn:
        return {"daninhas": 0, "total": 0, "pct_daninhas": 0, "pct_frutiferas": 0}
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN praga_nome LIKE '%Daninha%' THEN 1 ELSE 0 END) AS daninhas,
                COUNT(*) AS total
            FROM historico 
            WHERE fase = 'VARREDURA'
        """)
        r = cursor.fetchone()
        cursor.close()
        conn.close()

        total = r["total"] if r and r["total"] else 0
        daninhas = int(r["daninhas"]) if r and r["daninhas"] else 0
        pct = round((daninhas / total) * 100) if total > 0 else 0

        return {
            "daninhas": daninhas,
            "total": total,
            "pct_daninhas": pct,
            "pct_frutiferas": 100 - pct if total > 0 else 0
        }
    except Exception:
        return {"daninhas": 0, "total": 0, "pct_daninhas": 0, "pct_frutiferas": 0}

# Streaming de Vídeo
ultimo_frame_jpeg = None

@app.post("/upload-frame")
async def upload_frame(file: UploadFile = File(...)):
    global ultimo_frame_jpeg
    ultimo_frame_jpeg = await file.read()
    return {"status": "ok"}

async def gerar_stream_mjpeg():
    global ultimo_frame_jpeg
    img_vazia = np.zeros((480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode('.jpg', img_vazia)
    frame_padrao = buf.tobytes()

    while True:
        frame = ultimo_frame_jpeg if ultimo_frame_jpeg is not None else frame_padrao
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        await asyncio.sleep(0.04)

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(gerar_stream_mjpeg(), media_type="multipart/x-mixed-replace; boundary=frame")