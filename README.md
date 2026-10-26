# 🌱 AgroVision 2.0 — Dashboard & Monitoramento Agrícola

Sistema de **Agricultura de Precisão** desenvolvido como Trabalho de Conclusão de Curso (TCC) em Tecnologia da Informação. O AgroVision combina visão computacional em tempo real, inteligência artificial e mapeamento aéreo simulado por drone para identificação precoce de pragas e ervas daninhas.

---

## 📌 Sobre o Projeto

O **AgroVision** utiliza inteligência artificial e visão computacional para auxiliar produtores rurais e agrónomos no monitoramento inteligente de plantações. Através de simulação aérea de drones (ou câmaras acopladas), o sistema analisa o terreno, classifica a vegetação e deteta possíveis focos de contaminação e anomalias.

### 🎯 Principais Funcionalidades
* **Classificação em Tempo Real:** Análise instantânea de frames para identificação de *Solo Limpo*, *Erva Daninha* e *Vegetação/Árvores*.
* **Mapeamento & Varredura:** Mapeamento por quadrantes ($X, Y$) registando históricos completos de inspeção na base de dados.
* **Ortomosaico Aéreo (OpenCV):** Geração e costura (*stitching*) automática de imagens aéreas em grid $3 \times 4$ com normalização de cor (LAB) e suavização de bordas (*feathering*).
* **Dashboard Interativo:** Exibição de FPS real da câmara, estado da base de dados MySQL, alertas em tempo real e indicadores climáticos consumidos da Open-Meteo API.

---

## 💻 Tecnologias Utilizadas

### **Backend & Inteligência Artificial**
* **Python 3.10+**
* **FastAPI** (API REST Assíncrona & Streaming MJPEG)
* **OpenCV** (Processamento de Imagem & Algoritmo de Ortomosaico)
* **Keras / TensorFlow** (Classificação de Imagem via Redes Neuronais Convolucionais)
* **MySQL 8.0** (Base de Dados Relacional)

### **Frontend**
* **HTML5 / CSS3 / JavaScript (Vanilla ES6)**
* Sincronização assíncrona (polling a cada 300ms) com a API FastAPI

---

## 📁 Estrutura do Projeto

```text
AgroVision/
├── app/
│   ├── model/
│   │   └── database.py        # Conexão e consultas à base de dados MySQL
│   └── view/
│       └── agrovision_tiles_4x4/  # Capturas dos quadrantes para o ortomosaico
├── index.html                 # Dashboard Principal
├── style.css                  # Estilização e Layout do Dashboard
├── script.js                  # Lógica de sincronização e comunicação REST
├── main.py                    # Servidor FastAPI (Endpoints & Ortomosaico)
├── servico_ia.py              # Captura de câmara, inferência Keras e loop ao vivo
├── keras_model.h5             # Modelo treinado
├── labels.txt                 # Rótulos das classes
├── setup_banco.py             # Script de inicialização da base de dados MySQL
├── .env.example               # Modelo de variáveis de ambiente
└── README.md                  # Documentação do projeto
