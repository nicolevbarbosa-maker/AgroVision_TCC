/* ═══════════════════════════════════════════════════
   AGROVISION — Dashboard Script (Unificado & Refatorado)
   ═══════════════════════════════════════════════════ */

const MISSION = {
  running: false,
  everStarted: false,
  status: 'parado',

  elapsed: 0,
  distanceKm: 0,
  altitudeM: 0,
  scannedPct: 0,
  healthPct: 100,

  temp: 28.6,
  humidity: 65,
  wind: 12.4,
  lat: -26.3047,
  lng: -48.8456,

  updateSecs: 0,
};

const BASE_URL = 'http://127.0.0.1:8000';

/* ─── Utilitários de Formatação ─────────────────────── */
function fmtTime(totalSecs) {
  const m = String(Math.floor(totalSecs / 60)).padStart(2, '0');
  const s = String(totalSecs % 60).padStart(2, '0');
  return `${m}:${s}`;
}
function fmtNum(n, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',');
}

/* ═══════════════════════════════════════════════════
   1. HISTÓRICO DE PRAGAS (Integração Total MySQL)
   ═══════════════════════════════════════════════════ */
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

    // Construção segura dos nós do DOM (Proteção contra XSS)
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

/* ═══════════════════════════════════════════════════
   2. SIMULAÇÃO E CONTROLE DA MISSÃO
   ═══════════════════════════════════════════════════ */
function statusLabel() {
  switch (MISSION.status) {
    case 'em_voo':    return { text: 'Em voo',    cls: 'green' };
    case 'pausado':   return { text: 'Pausado',   cls: 'yellow' };
    case 'concluido': return { text: 'Concluído', cls: 'green' };
    default:          return { text: 'Parado',    cls: 'gray' };
  }
}

async function startMapping() {
  if (MISSION.scannedPct >= 100) return;
  
  try {
    await fetch(`${BASE_URL}/mapeamento/iniciar`, { method: 'POST' });
  } catch (err) {
    console.error('Erro ao acionar início de mapeamento no backend:', err);
  }

  MISSION.running = true;
  MISSION.everStarted = true;
  MISSION.status = 'em_voo';
  updateButtonStates();
  renderMission();
}

async function stopMapping() {
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

function completeMapping() {
  MISSION.running = false;
  MISSION.status = 'concluido';
  updateButtonStates();
  renderMission();
}

async function resetMapping() {
  try {
    await fetch(`${BASE_URL}/mapeamento/parar`, { method: 'POST' });
  } catch (e) {}

  MISSION.running = false;
  MISSION.everStarted = false;
  MISSION.status = 'parado';
  MISSION.elapsed = 0;
  MISSION.distanceKm = 0;
  MISSION.altitudeM = 0;
  MISSION.scannedPct = 0;
  MISSION.healthPct = 100;
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
  const stopBtn  = document.getElementById('btn-stop-mission');
  if (startBtn) startBtn.disabled = MISSION.running || MISSION.scannedPct >= 100;
  if (stopBtn)  stopBtn.disabled  = !MISSION.running;
}

function tick() {
  MISSION.elapsed++;

  const speedSlider = document.getElementById('speed-slider');
  const speed = speedSlider ? Number(speedSlider.value) : 50;
  const speedFactor = Math.max(speed, 5) / 50;

  MISSION.distanceKm += 0.012 * speedFactor;
  MISSION.scannedPct = Math.min(100, MISSION.scannedPct + 0.55 * speedFactor);

  const targetAlt = 125;
  MISSION.altitudeM += (targetAlt - MISSION.altitudeM) * 0.12 + (Math.random() - 0.5) * 1.4;
  if (MISSION.altitudeM < 0) MISSION.altitudeM = 0;

  MISSION.temp += (Math.random() - 0.5) * 0.15;
  MISSION.humidity = Math.min(100, Math.max(0, MISSION.humidity + (Math.random() - 0.5) * 0.4));
  MISSION.wind = Math.max(0, MISSION.wind + (Math.random() - 0.5) * 0.3);
  MISSION.lat += (Math.random() - 0.5) * 0.0004;
  MISSION.lng += (Math.random() - 0.5) * 0.0004;

  renderMission();

  if (MISSION.scannedPct >= 100) {
    completeMapping();
  }
}

/* ─── Renderização de Alertas Reais do MySQL ────────── */
async function carregarAlertasDoBanco() {
  const container = document.getElementById('alerts-container');
  const actionsContainer = document.getElementById('actions-container');
  if (!container) return;

  try {
    const res = await fetch(`${BASE_URL}/alertas-recentes`);
    if (!res.ok) return;

    const alertas = await res.json();

    if (alertas.length === 0) {
      container.innerHTML = '<div class="empty-state" id="alerts-empty">Nenhum alerta no momento. Inicie o mapeamento para monitorar.</div>';
      if (actionsContainer) actionsContainer.innerHTML = '<div class="empty-state">Nenhuma ação sugerida no momento.</div>';
      return;
    }

    container.innerHTML = alertas.map(rec => {
      const isHigh = rec.status === 'CRÍTICO';
      const zona = rec.setor || 'Zona A';
      return `
        <div class="alert-card ${isHigh ? 'alert-red' : 'alert-yellow'}">
          <div class="alert-icon-wrap ${isHigh ? 'red-icon-wrap' : 'yellow-icon-wrap'}">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
              <path d="M10 3L2 17h16L10 3z" stroke="${isHigh ? '#ef4444' : '#f59e0b'}" stroke-width="1.5" stroke-linejoin="round"/>
              <line x1="10" y1="9" x2="10" y2="13" stroke="${isHigh ? '#ef4444' : '#f59e0b'}" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="10" cy="15.5" r="0.8" fill="${isHigh ? '#ef4444' : '#f59e0b'}"/>
            </svg>
          </div>
          <div class="alert-body">
            <div class="alert-title-row">
              <span class="alert-title ${isHigh ? 'red-text' : 'yellow-text'}">${rec.praga_nome} detectado(a)</span>
              <span class="zone-badge ${isHigh ? 'red-zone' : 'yellow-zone'}">${zona}</span>
            </div>
            <div class="alert-desc">Severidade: ${rec.status} — Confiança: ${(rec.confianca * 100).toFixed(0)}%</div>
            <div class="alert-time">${rec.data_hora ? new Date(rec.data_hora).toLocaleTimeString('pt-BR') : 'Detectado agora'}</div>
          </div>
        </div>
      `;
    }).join('');

    if (actionsContainer && alertas.length > 0) {
      actionsContainer.innerHTML = alertas.slice(0, 3).map(rec => `
        <div class="action-item">
          <div class="action-check">
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#4ade80" stroke-width="1.8">
              <polyline points="2,6 5,9 10,3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="action-text">Aplicar manejo para ${rec.praga_nome} em ${rec.setor || 'Zona A'}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('[AgroVision] Erro ao buscar alertas do MySQL:', err);
  }
}

function clearActionsPanel() {
  const container = document.getElementById('actions-container');
  if (container) container.innerHTML = '<div class="empty-state" id="actions-empty">Nenhuma ação sugerida no momento.</div>';
}

/* ─── Sensores Ambientais & Donuts ──────────────────── */
function tempBadge() {
  if (!MISSION.everStarted) return { text: '—', cls: 'gray-badge' };
  return (MISSION.temp >= 18 && MISSION.temp <= 32) ? { text: 'Ideal', cls: 'green-badge' } : { text: 'Atenção', cls: 'gray-badge' };
}
function humidityBadge() {
  if (!MISSION.everStarted) return { text: '—', cls: 'gray-badge' };
  return (MISSION.humidity >= 45 && MISSION.humidity <= 80) ? { text: 'Ideal', cls: 'green-badge' } : { text: 'Atenção', cls: 'gray-badge' };
}
function windBadge() {
  if (!MISSION.everStarted) return { text: '—', cls: 'gray-badge' };
  return MISSION.wind <= 20 ? { text: 'Moderado', cls: 'gray-badge' } : { text: 'Forte', cls: 'gray-badge' };
}
function setStat(valueId, valueText, badgeId, badgeInfo) {
  const valEl = document.getElementById(valueId);
  if (valEl) valEl.textContent = valueText;
  const badgeEl = document.getElementById(badgeId);
  if (badgeEl && badgeInfo) {
    badgeEl.textContent = badgeInfo.text;
    badgeEl.className = `stat-badge ${badgeInfo.cls}`;
  }
}

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

  const distEl = document.getElementById('distance-value');
  if (distEl) distEl.textContent = `${fmtNum(MISSION.distanceKm, 1)} km`;

  const altEl = document.getElementById('altitude-value');
  if (altEl) altEl.textContent = `${fmtNum(MISSION.altitudeM, 1)} m`;

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

  const healthRounded = Math.round(MISSION.healthPct);
  const healthPctEl = document.getElementById('health-pct');
  const healthStatusEl = document.getElementById('health-status-text');

  let statusText = 'Aguardando';
  let statusColor = '#4ade80';

  if (MISSION.everStarted) {
    if (healthRounded >= 80) {
      statusText = 'Saudável';
      statusColor = '#4ade80';
    } else if (healthRounded >= 60) {
      statusText = 'Atenção';
      statusColor = '#f59e0b';
    } else {
      statusText = 'Crítico';
      statusColor = '#ef4444';
    }
  }

  if (healthPctEl) {
    healthPctEl.textContent = MISSION.everStarted ? `${healthRounded}%` : '0%';
    healthPctEl.style.color = MISSION.everStarted ? statusColor : '#4ade80';
  }

  if (healthStatusEl) {
    healthStatusEl.textContent = statusText;
    healthStatusEl.style.color = MISSION.everStarted ? statusColor : '#94a3b8';
  }

  updateHealthDonut(MISSION.everStarted ? MISSION.healthPct : 0, MISSION.everStarted ? statusColor : '#4ade80');

  const healthyVal = MISSION.everStarted ? healthRounded : 0;
  const riskyVal   = MISSION.everStarted ? 100 - healthRounded : 0;
  const healthyBar = document.getElementById('distrib-healthy-bar');
  const healthyPctEl = document.getElementById('distrib-healthy-pct');
  const riskyBar = document.getElementById('distrib-risky-bar');
  const riskyPctEl = document.getElementById('distrib-risky-pct');
  if (healthyBar) healthyBar.style.width = `${healthyVal}%`;
  if (healthyPctEl) healthyPctEl.textContent = `${healthyVal}%`;
  if (riskyBar) riskyBar.style.width = `${riskyVal}%`;
  if (riskyPctEl) riskyPctEl.textContent = `${riskyVal}%`;

  setStat('stat-temp', MISSION.everStarted ? `${fmtNum(MISSION.temp, 1)} °C` : '--', 'stat-temp-badge', tempBadge());
  setStat('stat-humidity', MISSION.everStarted ? `${Math.round(MISSION.humidity)}%` : '--', 'stat-humidity-badge', humidityBadge());
  setStat('stat-wind', MISSION.everStarted ? `${fmtNum(MISSION.wind, 1)} km/h` : '--', 'stat-wind-badge', windBadge());

  const coordsEl = document.getElementById('stat-coords');
  if (coordsEl) coordsEl.textContent = MISSION.everStarted ? `${MISSION.lat.toFixed(4)}, ${MISSION.lng.toFixed(4)}` : '--, --';

  const liveBadge = document.getElementById('live-badge');
  const liveText  = document.getElementById('live-badge-text');
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
  el.textContent = MISSION.updateSecs === 1
    ? 'Dados atualizados há 1 segundo'
    : `Dados atualizados há ${MISSION.updateSecs} segundos`;
}

/* ═══════════════════════════════════════════════════
   3. GERADOR DE MOSAICO (OpenCV Direct Rendering)
   ═══════════════════════════════════════════════════ */
function openMosaicModal() {
  document.getElementById('mosaic-modal')?.classList.remove('hidden');
}
function closeMosaicModal() {
  document.getElementById('mosaic-modal')?.classList.add('hidden');
}

async function generateMosaic(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const statusText = document.getElementById('mosaic-status-text');
  if (statusText) statusText.textContent = "Processando tiles no backend via OpenCV...";

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
        if (statusText) statusText.textContent = "Ortomosaico gerado e renderizado com sucesso!";
        document.getElementById('mosaic-download-btn')?.classList.remove('hidden');
      };
      img.onerror = () => {
        if (statusText) statusText.textContent = "Erro ao carregar imagem do mosaico.";
      };
    }
  } catch (err) {
    console.error("Erro ao gerar mosaico:", err);
    if (statusText) statusText.textContent = "Falha ao conectar com o backend.";
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

/* ═══════════════════════════════════════════════════
   4. WEBCAM LIVE FEED
   ═══════════════════════════════════════════════════ */
(function initWebcam() {
  const videoEl       = document.getElementById('camera-feed');
  const placeholderEl = document.getElementById('video-bg');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !videoEl) return;

  const constraints = {
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    audio: false
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      videoEl.srcObject = stream;
      videoEl.addEventListener('canplay', function onCanPlay() {
        videoEl.classList.add('active');
        if (placeholderEl) placeholderEl.style.display = 'none';
        videoEl.removeEventListener('canplay', onCanPlay);
      });
    })
    .catch(err => {
      console.warn('[AgroVision] Câmera indisponível ou permissão negada:', err.message);
    });
})();

/* ═══════════════════════════════════════════════════
   5. VERIFICAÇÃO DINÂMICA DA API (/health)
   ═══════════════════════════════════════════════════ */
async function checarConexaoBackend() {
  const statusConnected = document.querySelector('.status-connected');
  if (!statusConnected) return;

  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      statusConnected.innerHTML = '<span class="dot-green"></span><span>API ONLINE</span>';
    } else {
      throw new Error('Servidor instável');
    }
  } catch (err) {
    statusConnected.innerHTML = '<span class="dot-green" style="background:#ef4444; box-shadow:0 0 6px #ef4444;"></span><span style="color:#ef4444;">API OFFLINE</span>';
  }
}

/* ═══════════════════════════════════════════════════
   6. ATUALIZAÇÃO DO DASHBOARD E EVENTOS
   ═══════════════════════════════════════════════════ */
async function atualizarDashboard() {
  if (MISSION.running) tick();
  if (MISSION.everStarted) {
    MISSION.updateSecs++;
    if (MISSION.updateSecs > 30) MISSION.updateSecs = 0;
    updateFreshnessText();
  }

  try {
    const resposta = await fetch(`${BASE_URL}/ultima-analise`);
    if (!resposta.ok) return;

    const dados = await resposta.json();
    if (!dados || Object.keys(dados).length === 0) return;

    const coordsEl = document.getElementById('stat-coords');
    if (coordsEl && dados.posicao_x !== undefined) {
      coordsEl.textContent = `X: ${dados.posicao_x}, Y: ${dados.posicao_y}`;
    }

    const statusEl = document.getElementById('flight-status-value');
    if (statusEl && dados.fase) {
      statusEl.textContent = dados.fase;
      statusEl.className = 'flight-val green';
    }
  } catch (erro) {
    console.error("[AgroVision] Erro ao integrar com FastAPI:", erro);
  }
}

// Sliders e Controles da missão
const slider = document.getElementById('speed-slider');
if (slider) {
  slider.addEventListener('input', () => {
    const v = slider.value;
    const display = document.getElementById('speed-display');
    if (display) display.textContent = v + '%';
    slider.style.background = `linear-gradient(90deg, #4ade80 0%, #4ade80 ${v}%, rgba(74,222,128,0.15) ${v}%, rgba(74,222,128,0.15) 100%)`;
  });
}

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
    carregarAlertasDoBanco();
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

// Loops de execução
setInterval(atualizarDashboard, 2000);
setInterval(carregarAlertasDoBanco, 2000);
setInterval(checarConexaoBackend, 5000);

// Execuções iniciais
updateButtonStates();
renderMission();
updateFreshnessText();
checarConexaoBackend();
carregarAlertasDoBanco();