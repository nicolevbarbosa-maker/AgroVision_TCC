import os
import time
import threading
import requests
import cv2
import numpy as np

# Silencia avisos do OpenCV e TensorFlow
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

from tensorflow.keras.models import load_model
from tensorflow.keras.layers import DepthwiseConv2D

class CustomDepthwiseConv2D(DepthwiseConv2D):
    def __init__(self, *args, **kwargs):
        kwargs.pop('groups', None)
        super().__init__(*args, **kwargs)

BASE_URL = "http://127.0.0.1:8000"
API_URL = f"{BASE_URL}/salvar-analise"
LIVE_IA_URL = f"{BASE_URL}/salvar-analise-live"
MOSAICO_URL = f"{BASE_URL}/gerar-mosaico"
TILE_URL = f"{BASE_URL}/salvar-tile"
STATUS_URL = f"{BASE_URL}/mapeamento/status"
PARAR_URL = f"{BASE_URL}/mapeamento/parar"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "keras_model.h5")
LABELS_PATH = os.path.join(BASE_DIR, "labels.txt")

frame_atual = None
frame_sequencia = 0
lock_frame = threading.Lock()
fps_real = 0  # Atualizado a partir dos frames realmente lidos pela webcam.
modelo_carregado = False
model = None
class_names = []

# Carrega Modelo e Labels
try:
    if os.path.exists(MODEL_PATH) and os.path.exists(LABELS_PATH):
        with open(LABELS_PATH, "r", encoding="utf-8") as f:
            class_names = [line.strip().split(' ', 1)[-1] for line in f.readlines() if line.strip()]
        
        model = load_model(MODEL_PATH, compile=False, custom_objects={'DepthwiseConv2D': CustomDepthwiseConv2D})
        modelo_carregado = True
        print(f"🧠 [IA] Modelo Keras (.h5) carregado! Classes encontradas: {class_names}")
    else:
        print("⚠️ [IA] Arquivos do modelo não encontrados.")
except Exception as e:
    print(f"⚠️ [IA] Erro ao carregar modelo: {e}")

def classificar_frame(frame):
    """Classifica a imagem mantendo os nomes EXATOS do Teachable Machine."""
    if frame is None or not modelo_carregado:
        return "Solo Limpo", "OK", 0.99

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    h, w = frame_rgb.shape[:2]
    lado = min(h, w)
    y0, x0 = (h - lado) // 2, (w - lado) // 2
    frame_crop = frame_rgb[y0:y0 + lado, x0:x0 + lado]

    img_resized = cv2.resize(frame_crop, (224, 224), interpolation=cv2.INTER_AREA)
    img_array = np.asarray(img_resized, dtype=np.float32).reshape(1, 224, 224, 3)
    img_normalized = (img_array / 127.5) - 1.0

    prediction = model.predict(img_normalized, verbose=0)
    index = int(np.argmax(prediction))
    label_exata = class_names[index] if index < len(class_names) else "Desconhecido"
    confianca = float(prediction[0][index])

    label_lower = label_exata.lower()

    # Define o status conforme a classe identificada
    if "erva" in label_lower or "daninha" in label_lower:
        status = "CRÍTICO"
    else:
        status = "OK"

    return label_exata, status, round(confianca, 2)

def capturar_e_transmitir_video():
    """Lê a webcam e mede os frames recebidos sem bloquear no upload HTTP."""
    global frame_atual, frame_sequencia, fps_real

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        fps_real = 0
        print("❌ Erro ao abrir a webcam.")
        cap.release()
        return

    # Reduz atraso acumulado quando o driver suporta esse parâmetro.
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    contagem = 0
    inicio_janela = time.perf_counter()

    try:
        while True:
            ret, frame = cap.read()
            agora = time.perf_counter()

            if ret and frame is not None:
                with lock_frame:
                    frame_atual = frame.copy()
                    frame_sequencia += 1
                contagem += 1

            # FPS = frames capturados com sucesso / duração real da janela.
            decorrido = agora - inicio_janela
            if decorrido >= 1.0:
                fps_real = int(round(contagem / decorrido))
                contagem = 0
                inicio_janela = agora

            if not ret or frame is None:
                time.sleep(0.005)
    finally:
        cap.release()


def enviar_frames_para_api():
    """Envia o frame mais recente em uma thread separada da captura da webcam."""
    ultima_sequencia_enviada = -1

    while True:
        with lock_frame:
            sequencia = frame_sequencia
            frame = frame_atual.copy() if frame_atual is not None else None

        if frame is None or sequencia == ultima_sequencia_enviada:
            time.sleep(0.005)
            continue

        try:
            sucesso, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82]
            )
            if sucesso:
                requests.post(
                    f"{BASE_URL}/upload-frame",
                    files={"file": ("frame.jpg", buffer.tobytes(), "image/jpeg")},
                    timeout=0.5
                )
        except Exception:
            # Se o backend estiver temporariamente indisponível, captura continua.
            time.sleep(0.05)
        finally:
            # A próxima iteração tentará enviar o frame mais recente, não uma fila antiga.
            ultima_sequencia_enviada = sequencia


def loop_ia_tempo_real():
    """Roda a predição da IA em tempo real em segundo plano."""
    while True:
        with lock_frame:
            frame_copia = frame_atual.copy() if frame_atual is not None else None

        if frame_copia is not None:
            praga_exata, status, confianca = classificar_frame(frame_copia)
            try:
                requests.post(LIVE_IA_URL, json={
                    "praga_nome": praga_exata,
                    "status": status,
                    "confianca": confianca,
                    "fps": fps_real
                }, timeout=0.1)
            except Exception:
                pass

        time.sleep(0.15) # Analisa ~6x por segundo

def verificar_mapeamento_ativo():
    try:
        res = requests.get(STATUS_URL, timeout=1)
        if res.status_code == 200:
            return res.json().get("ativo", False)
    except Exception:
        pass
    return False

def desligar_mapeamento_no_backend():
    try:
        requests.post(PARAR_URL, timeout=1)
    except Exception:
        pass

def iniciar_servico():
    t_video = threading.Thread(
        target=capturar_e_transmitir_video, daemon=True, name="captura-webcam"
    )
    t_video.start()

    t_upload = threading.Thread(
        target=enviar_frames_para_api, daemon=True, name="upload-video"
    )
    t_upload.start()

    t_ia = threading.Thread(
        target=loop_ia_tempo_real, daemon=True, name="classificacao-ia"
    )
    t_ia.start()

    print("\n🤖 [Serviço IA] Pronto e monitorando as 4 classes do Teachable Machine em tempo real!\n")

    while True:
        while not verificar_mapeamento_ativo():
            time.sleep(0.5)

        print("\n🚀 [Mapeamento Iniciado] Gravando pontos no MySQL...")
        mapeamento_cancelado = False

        for x in range(0, 4):
            for y in range(0, 3):
                if not verificar_mapeamento_ativo():
                    mapeamento_cancelado = True
                    break

                with lock_frame:
                    frame_copia = frame_atual.copy() if frame_atual is not None else None

                # Guarda a foto real deste ponto para o endpoint /gerar-mosaico.
                if frame_copia is not None:
                    try:
                        sucesso, tile_buffer = cv2.imencode(
                            ".jpg", frame_copia, [cv2.IMWRITE_JPEG_QUALITY, 92]
                        )
                        if sucesso:
                            resposta_tile = requests.post(
                                TILE_URL,
                                data={"x": x, "y": y},
                                files={
                                    "file": (
                                        f"tile_x{x}_y{y}.jpg",
                                        tile_buffer.tobytes(),
                                        "image/jpeg"
                                    )
                                },
                                timeout=2
                            )
                            resposta_tile.raise_for_status()
                    except Exception as e:
                        print(f"⚠️ Erro ao salvar foto do ponto X:{x} Y:{y}: {e}")

                praga_exata, status, confianca = classificar_frame(frame_copia)

                payload = {
                    "setor": f"Ponto X:{x} Y:{y}",
                    "posicao_x": x,
                    "posicao_y": y,
                    "praga_nome": praga_exata,
                    "confianca": confianca,
                    "status": status,
                    "fase": "VARREDURA"
                }

                try:
                    requests.post(API_URL, json=payload, timeout=2)
                    print(f"📍 [Ponto X:{x} Y:{y}] Registrado: {praga_exata} ({int(confianca*100)}%)")
                except Exception as e:
                    print(f"⚠️ Erro ao enviar para API: {e}")

                time.sleep(1.0)

            if mapeamento_cancelado:
                break

        if not mapeamento_cancelado:
            print("\n✅ [Mapeamento Concluído] Gerando mosaico...")
            try:
                requests.get(MOSAICO_URL, timeout=5)
            except Exception:
                pass
            desligar_mapeamento_no_backend()
        else:
            print("\n🛑 Mapeamento Interrompido.")

        time.sleep(1.0)

if __name__ == "__main__":
    iniciar_servico()
