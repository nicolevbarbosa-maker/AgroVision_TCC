import os
from PIL import Image

def encontrar_pasta_tiles():
    for raiz, diretorios, _ in os.walk('.'):
        if 'agrovision_tiles_4x4' in diretorios:
            return os.path.join(raiz, 'agrovision_tiles_4x4')
    return None

def testar_uniao_mosaico(linhas=4, colunas=4, tam_tile=(300, 300)):
    pasta_tiles = encontrar_pasta_tiles()
    
    if not pasta_tiles:
        print("❌ A pasta 'agrovision_tiles_4x4' não foi encontrada!")
        return

    print(f"📸 [Teste Mosaico] Ajeitando o mosaico pelo seu percurso...\n")
    
    largura_total = colunas * tam_tile[0]
    altura_total = linhas * tam_tile[1]
    mosaico = Image.new('RGB', (largura_total, altura_total))
    fotos_encontradas = 0
    
    # Mapeamento do teu percurso:
    # r = Coluna (1 a 4 da esquerda pra direita)
    # c = Linha (1 a 4 de BAIXO para CIMA)
    for r in range(1, colunas + 1):
        for c in range(1, linhas + 1):
            base_nome = f"tile_r{r}_c{c}"
            
            # Posição X na tela
            x_pos = (r - 1) * tam_tile[0]
            
            # Posição Y inalterada na tela: c=1 vai para o fundo (chão), c=4 vai para o topo
            y_pos = (linhas - c) * tam_tile[1]
            
            caminho_foto = None
            for ext in [".jpg.jpg", ".jpg", ".jpeg", ".png"]:
                teste = os.path.join(pasta_tiles, base_nome + ext)
                if os.path.exists(teste):
                    caminho_foto = teste
                    break
            
            if caminho_foto:
                img = Image.open(caminho_foto).resize(tam_tile)
                mosaico.paste(img, (x_pos, y_pos))
                fotos_encontradas += 1
                print(f"  ✅ Colada: {os.path.basename(caminho_foto)} -> Posição Real X:{r}, Y:{c}")
            else:
                print(f"  ❌ Faltando: {base_nome}")

    print(f"\n📊 Resumo: {fotos_encontradas} de {linhas * colunas} fotos processadas.")
    
    caminho_saida = "mosaico_resultado_teste.jpg"
    mosaico.save(caminho_saida)
    print(f"🎯 Mosaico perfeito gerado em: {caminho_saida}")
    
    try:
        os.startfile(caminho_saida)
    except Exception:
        pass

if __name__ == "__main__":
    testar_uniao_mosaico()