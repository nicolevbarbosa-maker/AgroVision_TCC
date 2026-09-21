import time
import requests
import random

API_URL = "http://127.0.0.1:8000/salvar-analise"
MOSAICO_URL = "http://127.0.0.1:8000/gerar-mosaico"

pragas_possiveis = [
    ("Lagarta do Cartucho", "CRÍTICO"),
    ("Percevejo Castanho", "ALERTA"),
    ("Planta Seca / Amarelada", "ALERTA"),
    ("Nenhuma praga detectada", "OK")
]

def simular_varredura_maquete():
    print("🤖 [Maquete] Iniciando Etapa 1: MAPEAMENTO DE PLANTAS (Eixos X, Y)...")
    
    # Etapa 1: Mapeamento da maquete (4x4)
    for x in range(0, 4):
        for y in range(0, 4):
            setor = f"Ponto X:{x} Y:{y}"
            tem_planta = random.choice([True, True, False])
            status_mapeamento = "DETECTADA" if tem_planta else "AUSENTE"
            
            payload = {
                "setor": setor,
                "posicao_x": x,
                "posicao_y": y,
                "praga_nome": "Mapeamento Inicial",
                "confianca": 0.99 if tem_planta else 0.0,
                "status": status_mapeamento,
                "fase": "MAPEAMENTO"
            }
            
            try:
                requests.post(API_URL, json=payload)
                print(f"📍 Mapping Coordenada ({x}, {y}) -> Planta: {status_mapeamento}")
            except Exception as e:
                print(f"❌ Erro ao conectar com o FastAPI: {e}")
                
            time.sleep(1)

    # Solicita a montagem do mosaico ao finalizar o mapeamento
    print("\n📸 [Maquete] Mapeamento finalizado! Solicitando geração do mosaico...")
    try:
        res_mosaico = requests.get(MOSAICO_URL)
        if res_mosaico.status_code == 200:
            print("✅ [Maquete] Ortomosaico gerado com sucesso no servidor!")
        else:
            print(f"⚠️ Erro ao gerar mosaico: {res_mosaico.text}")
    except Exception as e:
        print(f"❌ Falha ao chamar rota do mosaico: {e}")

    # Etapa 2: Varredura de pragas
    print("\n🔬 [Maquete] Iniciando Etapa 2: VARREDURA DE SAÚDE DA VEGETAÇÃO...")
    
    for x in range(0, 4):
        for y in range(0, 4):
            setor = f"Ponto X:{x} Y:{y}"
            praga, status = random.choice(pragas_possiveis)
            confianca = round(random.uniform(0.75, 0.98), 2) if status != "OK" else 0.99
            
            payload = {
                "setor": setor,
                "posicao_x": x,
                "posicao_y": y,
                "praga_nome": praga,
                "confianca": confianca,
                "status": status,
                "fase": "VARREDURA"
            }
            
            try:
                requests.post(API_URL, json=payload)
                print(f"🔍 Analisando Ponto ({x}, {y}) -> Resultado: {praga} [{status}]")
            except Exception as e:
                print(f"❌ Erro: {e}")
                
            time.sleep(2)

if __name__ == "__main__":
    simular_varredura_maquete()