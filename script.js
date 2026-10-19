/* ═══════════════════════════════════════════════════
   AGROVISION — Dashboard Script (Unificado & Estável)
   ═══════════════════════════════════════════════════ */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const MISSION = {
  running: false,
  everStarted: false,
  status: 'parado',

  elapsed: 0,
  distanceKm: 0,
  altitudeM: 0,
  scannedPct: 0,
  healthPct: 0,

  temp: 28.6,
  humidity: 65,
  wind: 12.4,
  lat: -26.3047,
  lng: -48.8456,

  updateSecs: 0,
};

const BASE_URL = 'http://127.0.0.1:8000';

/* ─── Utilitários ────────────────────────────────────── */
function fmtTime(totalSecs) {
  const m = String(Math.floor(totalSecs / 60)).padStart(2, '0');
  const s = String(totalSecs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtNum(n, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',');
}

function clearActionsPanel() {
  const panel = document.getElementById('actions-panel');
  if (panel) panel.innerHTML = '';
}

/* ─── 1. HISTÓRICO NO BANCO ──────────────────────────── */
async function clearHistoryDB() {
  try {
    await fetch(`${BASE_URL}/limpar-historico`, { method: 'DELETE' });
  } catch (e) {
    console.error('[AgroVision] Erro ao limpar histórico do MySQL:', e);
  }
}

async function renderHistoryModal() {
  const body = document.getElementById('history-table-body');
  const empty = document.getElementById('history-empty');
  const table = document.getElementById('history-table');
  const countEl = document.getElementById('history-count');
  if (!body || !empty || !table || !countEl) return;

  try {
    const res = await fetch(`${BASE_URL}/historico`);
    if (!res.ok) throw new Error('Falha na resposta do servidor');

    const history = await res.json();
    body.innerHTML = '';
    countEl.textContent = `${history.length} registro(s)`;

    if (history.length === 0) {
      table.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    table.classList.remove('hidden');
    empty.classList.add('hidden');

    history.forEach(rec => {
      const tr = document.createElement('tr');

      const tdHora = document.createElement('td');
      tdHora.textContent = rec.data_hora ? new Date(rec.data_hora).toLocaleTimeString('pt-BR') : '--';

      const tdPos = document.createElement('td');
      tdPos.textContent = `X:${rec.posicao_x}, Y:${rec.posicao_y}`;

      const tdPraga = document.createElement('td');
      tdPraga.textContent = rec.praga_nome;

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `sev-badge ${rec.status === 'CRÍTICO' ? 'sev-alta' : 'sev-media'}`;
      badge.textContent = rec.status;
      tdStatus.appendChild(badge);

      tr.appendChild(tdHora);
      tr.appendChild(tdPos);
      tr.appendChild(tdPraga);
      tr.appendChild(tdStatus);

      body.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar histórico do banco:", err);
  }
}

function openHistoryModal() {
  renderHistoryModal();
  document.getElementById('history-modal')?.classList.remove('hidden');
}
function closeHistoryModal() {
  document.getElementById('history-modal')?.classList.add('hidden');
}

/* ─── 2. CONTROLE DA MISSÃO ───────────────────────────── */
function statusLabel() {
  switch (MISSION.status) {
    case 'em_voo': return { text: 'Em voo', cls: 'green' };
    case 'pausado': return { text: 'Pausado', cls: 'yellow' };
    case 'concluido': return { text: 'Concluído', cls: 'green' };
    default: return { text: 'Parado', cls: 'gray' };
  }
}

async function startMapping(e) {
  if (e) e.preventDefault();

  if (MISSION.scannedPct >= 100) {
    resetMapping();
  }

  // 1. Limpa o histórico no banco para iniciar do zero
  await clearHistoryDB();

  // 2. Notifica a API sobre o início do mapeamento
  try {
    await fetch(`${BASE_URL}/mapeamento/iniciar`, { method: 'POST' });
  } catch (err) {
    console.error('Erro ao acionar início de mapeamento no backend:', err);
  }

  // 3. Define o estado ativo
  MISSION.running = true;
  MISSION.everStarted = true;
  MISSION.status = 'em_voo';
  MISSION.scannedPct = 0;
  MISSION.healthPct = 0;
  MISSION.elapsed = 0;
  MISSION.distanceKm = 0;

  clearActionsPanel();
  updateButtonStates();
  renderMission();
}

async function stopMapping(e) {
  if (e) e.preventDefault();
  if (!MISSION.running) return;

  try {
    await fetch(`${BASE_URL}/mapeamento/parar`, { method: 'POST' });
  } catch (err) {
    console.error('Erro ao pausar mapeamento no backend:', err);
  }

  MISSION.running = false;
  MISSION.status = 'pausado';
  updateButtonStates();
  renderMission();
}

async function completeMapping() {
  if (!MISSION.running && MISSION.status === 'concluido') return;

  MISSION.running = false;
  MISSION.status = 'concluido';
  MISSION.scannedPct = 100;

  updateButtonStates();
  renderMission();

  // Abre o modal do ortomosaico automaticamente ao concluir
  setTimeout(() => {
    openMosaicModal();
    generateMosaic();
  }, 500);
}

async function resetMapping(e) {
  if (e) e.preventDefault();

  try {
    await fetch(`${BASE_URL}/mapeamento/parar`, { method: 'POST' });
  } catch (e) { }

  MISSION.running = false;
  MISSION.everStarted = false;
  MISSION.status = 'parado';
  MISSION.elapsed = 0;
  MISSION.distanceKm = 0;
  MISSION.altitudeM = 0;
  MISSION.scannedPct = 0;
  MISSION.healthPct = 0;
  MISSION.temp = 28.6;
  MISSION.humidity = 65;
  MISSION.wind = 12.4;
  MISSION.lat = -26.3047;
  MISSION.lng = -48.8456;
  MISSION.updateSecs = 0;

  clearActionsPanel();
  updateButtonStates();
  renderMission();
  updateFreshnessText();
}

function updateButtonStates() {
  const startBtn = document.getElementById('btn-start-mission');
  const stopBtn = document.getElementById('btn-stop-mission');
  if (startBtn) startBtn.disabled = MISSION.running;
  if (stopBtn) stopBtn.disabled = !MISSION.running;
}

/* ─── 3. RENDERIZAÇÃO VISUAL DO DASHBOARD ─────────────── */
function updateHealthDonut(pct, color) {
  const circle = document.getElementById('health-donut-fill');
  if (!circle) return;
  const circumference = 188.5;
  const dash = (pct / 100) * circumference;
  circle.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${circumference}`);
  if (color) circle.setAttribute('stroke', color);
}

function renderMission() {
  const flightTimeEl = document.getElementById('flight-time');
  if (flightTimeEl) flightTimeEl.textContent = fmtTime(MISSION.elapsed);

  // Atualiza os Pontos Concluídos (calculados a partir da Área Escaneada - Grade 4x3 = 12 Pontos)
  const distEl = document.getElementById('distance-value');
  if (distEl) {
    const totalPontos = Math.min(12, Math.round((MISSION.scannedPct / 100) * 12));
    distEl.textContent = `${totalPontos} / 12`;
  }

  // Atualiza o Quadrante Atual se o mapeamento estiver parado
  const altEl = document.getElementById('altitude-value');
  if (altEl && !MISSION.running) {
    altEl.textContent = `X: --, Y: --`;
  }

  const statusEl = document.getElementById('flight-status-value');
  if (statusEl) {
    const s = statusLabel();
    statusEl.textContent = s.text;
    statusEl.className = `flight-val ${s.cls}`;
  }

  const scannedRounded = Math.round(MISSION.scannedPct);
  const scannedValEl = document.getElementById('scanned-value');
  const scannedBarEl = document.getElementById('scanned-bar-fill');
  if (scannedValEl) scannedValEl.textContent = `${scannedRounded}%`;
  if (scannedBarEl) scannedBarEl.style.width = `${scannedRounded}%`;

  const pctDaninhas = Math.round(MISSION.healthPct);
  const pctFrutiferas = MISSION.everStarted ? Math.max(0, 100 - pctDaninhas) : 0;

  const healthyBar = document.getElementById('distrib-healthy-bar');
  const healthyPctEl = document.getElementById('distrib-healthy-pct');
  const riskyBar = document.getElementById('distrib-risky-bar');
  const riskyPctEl = document.getElementById('distrib-risky-pct');

  if (healthyBar) healthyBar.style.width = `${pctFrutiferas}%`;
  if (healthyPctEl) healthyPctEl.textContent = `${pctFrutiferas}%`;
  if (riskyBar) riskyBar.style.width = `${pctDaninhas}%`;
  if (riskyPctEl) riskyPctEl.textContent = `${pctDaninhas}%`;

  const liveBadge = document.getElementById('live-badge');
  const liveText = document.getElementById('live-badge-text');
  if (liveBadge && liveText) {
    if (MISSION.running) {
      liveBadge.classList.remove('offline');
      liveText.textContent = 'AO VIVO';
    } else {
      liveBadge.classList.add('offline');
      liveText.textContent = MISSION.status === 'concluido' ? 'CONCLUÍDO' : MISSION.status === 'pausado' ? 'PAUSADO' : 'OFFLINE';
    }
  }
}

function updateFreshnessText() {
  const el = document.getElementById('update-notice-text');
  if (!el) return;
  if (!MISSION.everStarted) {
    el.textContent = 'Aguardando início do mapeamento';
    return;
  }
  el.textContent = `Dados atualizados há ${MISSION.updateSecs} segundos`;
}

/* ─── 4. MOSAICO ─────────────────────────────────────── */
function openMosaicModal() {
  document.getElementById('mosaic-modal')?.classList.remove('hidden');
}
function closeMosaicModal() {
  document.getElementById('mosaic-modal')?.classList.add('hidden');
}

async function generateMosaic(e) {
  if (e) e.preventDefault();

  const statusText = document.getElementById('mosaic-status-text');
  const progressFill = document.getElementById('mosaic-progress-fill');
  const progressText = document.getElementById('mosaic-progress-text');

  if (statusText) statusText.textContent = "Processando ortomosaico via OpenCV...";
  
  // Coloca a barra em 30% enquanto busca a imagem no backend
  if (progressFill) progressFill.style.width = '30%';
  if (progressText) progressText.textContent = '30%';

  try {
    const timestamp = Date.now();
    const urlFoto = `${BASE_URL}/gerar-mosaico?t=${timestamp}`;

    const canvas = document.getElementById('mosaic-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = urlFoto;

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (statusText) statusText.textContent = "Ortomosaico gerado com sucesso!";
        
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '100%';

        document.getElementById('mosaic-download-btn')?.classList.remove('hidden');
      };

      img.onerror = () => {
        if (statusText) statusText.textContent = "Erro ao carregar imagem do mosaico.";
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
      };
    }
  } catch (err) {
    console.error("Erro ao gerar mosaico:", err);
    if (statusText) statusText.textContent = "Falha ao conectar com o backend.";
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
  }
}

function downloadMosaic() {
  const canvas = document.getElementById('mosaic-canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `ortomosaico-agrovision-${Date.now()}.jpg`;
  link.href = canvas.toDataURL('image/jpeg');
  link.click();
}

/* ─── 5. CONTROLADOR DE SINCRONIZAÇÃO EM TEMPO REAL ───────────── */
async function sincronizarDashboard() {
  try {
    const resAnalise = await fetch(`${BASE_URL}/ultima-analise`);
    if (resAnalise.ok) {
      const dadosIA = await resAnalise.json();
      if (dadosIA && dadosIA.praga_nome) {
        const nomeEl = document.getElementById('ai-detected-name');
        const pctEl = document.getElementById('health-pct');
        const statusEl = document.getElementById('health-status-text');

        const confianca = Math.round((dadosIA.confianca || 0) * 100);
        const isCritico = dadosIA.status === 'CRÍTICO';

        if (nomeEl) nomeEl.textContent = dadosIA.praga_nome;

        if (pctEl) {
          pctEl.textContent = `${confianca}%`;
          pctEl.style.color = isCritico ? '#f59e0b' : '#4ade80';
        }

        if (statusEl) {
          statusEl.textContent = isCritico ? 'Alerta Detectado' : 'Reconhecimento Ativo';
          statusEl.style.color = isCritico ? '#f59e0b' : '#4ade80';
        }

        updateHealthDonut(confianca, isCritico ? '#f59e0b' : '#4ade80');

        if (dadosIA && dadosIA.posicao_x !== undefined && dadosIA.posicao_y !== undefined && MISSION.running) {
          const altEl = document.getElementById('altitude-value');
          if (altEl) altEl.textContent = `X: ${dadosIA.posicao_x}, Y: ${dadosIA.posicao_y}`;
        }
      }
      if (dadosIA && dadosIA.fps !== undefined) {
        const fpsEl = document.getElementById('camera-fps-text');
        if (fpsEl) fpsEl.textContent = `FPS: ${dadosIA.fps}`;
      }
    }
  } catch (e) {
    console.error("Erro ao buscar IA live:", e);
  }

  if (!MISSION.running) return;

  if (MISSION.running && Date.now() - (window.lastTick || 0) >= 1000) {
    MISSION.elapsed += 1;
    window.lastTick = Date.now();
  }
  MISSION.distanceKm += 0.01;
  MISSION.updateSecs = (MISSION.updateSecs + 1) % 30;
  updateFreshnessText();

  try {
    const resStatus = await fetch(`${BASE_URL}/mapeamento/status`);
    if (resStatus.ok) {
      const statusData = await resStatus.json();
      if (!statusData.ativo) {
        completeMapping();
        return;
      }
    }

    const resProp = await fetch(`${BASE_URL}/proporcao-vegetacao`);
    if (resProp.ok) {
      const propData = await resProp.json();
      MISSION.healthPct = propData.pct_daninhas || 0;
      const totalPontos = propData.total || 0;
      MISSION.scannedPct = Math.min(100, Math.round((totalPontos / 12) * 100));
    }

    const resAlertas = await fetch(`${BASE_URL}/alertas-recentes`);
    if (resAlertas.ok) {
      const alertas = await resAlertas.json();
      const container = document.getElementById('alerts-container');
      const actionsContainer = document.getElementById('actions-container');

      if (container && alertas.length > 0) {
        let temDaninha = false;
        container.innerHTML = alertas.map(rec => {
          const nomePraga = rec.praga_nome || '';
          const isDaninha = rec.status === 'CRÍTICO' || rec.status === 'ALERTA' || nomePraga.includes('Daninha');
          if (isDaninha) temDaninha = true;

          const zona = escapeHtml(rec.setor || 'Ponto');
          const praga = escapeHtml(nomePraga);
          const cardClass = isDaninha ? 'alert-yellow' : 'alert-green';
          const badgeClass = isDaninha ? 'yellow-zone' : 'green-zone';

          return `
            <div class="alert-card ${cardClass}">
              <div class="alert-body">
                <div class="alert-title-row">
                  <span class="alert-title">${praga}</span>
                  <span class="zone-badge ${badgeClass}">${zona}</span>
                </div>
                <div class="alert-desc">Status: ${escapeHtml(rec.status)}</div>
              </div>
            </div>
          `;
        }).join('');

        if (actionsContainer) {
          actionsContainer.innerHTML = temDaninha
            ? `<div class="action-card warning-action" style="padding:10px; background:rgba(245,158,11,0.1); border-left:3px solid #f59e0b; border-radius:4px;">
                <div style="font-weight:bold; color:#f59e0b; font-size:12px;">⚠️ Ação Recomendada</div>
                <div style="font-size:11px; color:#cbd5e1; margin-top:4px;">Presença de Erva Daninha detectada. Agendar aplicação localizada.</div>
               </div>`
            : '<div class="empty-state">Área sob controle. Nenhuma intervenção necessária.</div>';
        }
      }
    }

    renderMission();
  } catch (e) {
    console.error("Erro ao sincronizar missão:", e);
  }
}

// Atualiza o painel de IA a cada 300ms (frequência de vídeo ao vivo)
setInterval(sincronizarDashboard, 300);

/* ─── VINCULAÇÃO DE EVENTOS NOS BOTÕES ─────────────────── */
document.getElementById('btn-start-mission')?.addEventListener('click', startMapping);
document.getElementById('btn-stop-mission')?.addEventListener('click', stopMapping);
document.getElementById('btn-reset-mission')?.addEventListener('click', resetMapping);

document.getElementById('btn-history')?.addEventListener('click', openHistoryModal);
document.getElementById('history-modal-close')?.addEventListener('click', closeHistoryModal);
document.getElementById('history-close-btn')?.addEventListener('click', closeHistoryModal);
document.getElementById('history-clear-btn')?.addEventListener('click', async () => {
  if (confirm('Tem certeza que deseja apagar todo o histórico de pragas no MySQL?')) {
    await clearHistoryDB();
    renderHistoryModal();
  }
});

document.getElementById('btn-mosaic')?.addEventListener('click', openMosaicModal);
document.getElementById('mosaic-modal-close')?.addEventListener('click', closeMosaicModal);
document.getElementById('mosaic-generate-btn')?.addEventListener('click', generateMosaic);
document.getElementById('mosaic-download-btn')?.addEventListener('click', downloadMosaic);

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// Injeta o stream da câmara assim que a página carrega no navegador
window.addEventListener('load', () => {
  const camFeed = document.getElementById('camera-feed');
  if (camFeed) {
    camFeed.src = `${BASE_URL}/video_feed`;
    camFeed.classList.add('active');
  }
});

// Inicialização da interface
updateButtonStates();
renderMission();
updateFreshnessText();

/* ─── 6. RECURSOS SISTÊMICOS (FPS, MYSQL E CLIMA REAL) ───────── */

// 1. Cálculo do FPS Real da Câmera
let frameCount = 0;
let lastFpsTime = performance.now();

function medirFpsCamera() {
  const now = performance.now();
  frameCount++;

  if (now - lastFpsTime >= 1000) {
    const realFPS = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;

    const fpsEl = document.getElementById('camera-fps-text');
    if (fpsEl) fpsEl.textContent = `FPS: ${realFPS}`;
  }
}

// 2. Verificação de Conexão com o MySQL
async function verificarStatusBanco() {
  const dbDot = document.getElementById('db-status-dot');
  const dbText = document.getElementById('db-status-text');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.ok) {
      if (dbText) dbText.textContent = "MySQL: Conectado";
      if (dbDot) dbDot.style.backgroundColor = "#4ade80";
    } else {
      throw new Error();
    }
  } catch {
    if (dbText) dbText.textContent = "MySQL: Indisponível";
    if (dbDot) dbDot.style.backgroundColor = "#ef4444";
  }
}

// 3. Clima Real (São Carlos / Geolocalização) via Open-Meteo API
let userLat = -22.0174;
let userLon = -47.8915;
let nomeCidade = "São Carlos - SP";

async function buscarClimaReal() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${userLat}&longitude=${userLon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;
    const response = await fetch(url);
    if (!response.ok) return;

    const data = await response.json();
    const current = data.current;

    const tempEl = document.getElementById('stat-temp');
    const umidEl = document.getElementById('stat-humidity');
    const ventoEl = document.getElementById('stat-wind');
    const coordsEl = document.getElementById('stat-coords');

    if (tempEl) tempEl.textContent = `${Math.round(current.temperature_2m)} °C`;
    if (umidEl) umidEl.textContent = `${current.relative_humidity_2m}%`;
    if (ventoEl) ventoEl.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    if (coordsEl) coordsEl.textContent = nomeCidade;
  } catch (e) {
    console.error("Erro ao buscar clima:", e);
  }
}

function obterLocalizacaoEClima() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
        nomeCidade = "Local Atual";
        buscarClimaReal();
      },
      () => {
        buscarClimaReal();
      }
    );
  } else {
    buscarClimaReal();
  }
}

// Inicializações dos novos recursos ao carregar
window.addEventListener('load', () => {
  const camFeed = document.getElementById('camera-feed');
  if (camFeed) {
    camFeed.addEventListener('load', medirFpsCamera);
  }

  verificarStatusBanco();
  obterLocalizacaoEClima();

  setInterval(verificarStatusBanco, 5000);
  setInterval(buscarClimaReal, 600000);
});