(() => {
  'use strict';

  const API_URL = 'api.php';
  const REFRESH_INTERVAL = 60;
  const DEFAULT_MAX_ROUND = 2024; // Target putaran maksimum sesuai dataset

  const el = {
    navButtons: document.querySelectorAll('header.masthead nav button[data-view]'),
    algoSelect: document.getElementById('algorithm'),
    countdown: document.getElementById('countdown'),
    refreshBtn: document.getElementById('refresh'),
    seedBtn: document.getElementById('seed-demo'),
    title: document.getElementById('title'),
    feedback: document.getElementById('feedback'),
    content: document.getElementById('content'),
    allLogBtn: document.getElementById('all-log'),
    deleteAllBtn: document.getElementById('delete-all'),

    logDialog: document.getElementById('log-dialog'),
    logTitle: document.getElementById('log-title'),
    logContext: document.getElementById('log-context'),
    downloadLog: document.getElementById('download-log'),
    deleteLogBtn: document.getElementById('delete-log'),
    closeLogBtn: document.getElementById('close-log'),
    logScroll: document.getElementById('log-scroll'),
    logHead: document.getElementById('log-head'),
    logBody: document.getElementById('log-body'),
    logStatus: document.getElementById('log-status'),

    confirmDialog: document.getElementById('confirm-dialog'),
    confirmText: document.getElementById('confirm-text'),
    deleteForm: document.getElementById('delete-form'),
    deleteWord: document.getElementById('delete-word'),
    deleteError: document.getElementById('delete-error'),
    cancelDeleteBtn: document.getElementById('cancel-delete'),

    btnLight: document.getElementById('theme-light'),
    btnDark: document.getElementById('theme-dark')
  };

  const state = {
    view: 'nodes',
    nodeDisplayMode: 'cards', // 'cards' (seperti web teman) atau 'table'
    algo: el.algoSelect ? el.algoSelect.value : 'multihop_gso',
    timer: REFRESH_INTERVAL,
    liveCursor: 0,
    overviewData: null,
    logState: { node: 0, cursor: 0, round: 0, order: 'desc', loading: false, next: null },
    pendingDelete: null,

    // State Mesin Waktu Global & Animasi Partikel Topologi
    topo: {
      currentRound: 1,
      maxRound: DEFAULT_MAX_ROUND,
      playing: true,
      speed: 1,
      animFrameId: null,
      playTimerId: null,
      particles: [],
      nodes: []
    }
  };

  const VIEW_TITLES = {
    nodes: 'Dashboard Tanaman & Kondisi Tiap Node',
    topology: 'Topologi & Rute (Real-Time Burst Animation)',
    energy: 'Grafik Energi & Lingkungan Tanaman',
    compare: 'Perbandingan Algoritma WSN'
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wsn_theme', theme);
    el.btnLight?.classList.toggle('active', theme === 'light');
    el.btnDark?.classList.toggle('active', theme === 'dark');
  }
  applyTheme(localStorage.getItem('wsn_theme') || 'dark');
  el.btnLight?.addEventListener('click', () => applyTheme('light'));
  el.btnDark?.addEventListener('click', () => applyTheme('dark'));

  const fmtInt = (n) => Number(n || 0).toLocaleString('id-ID');
  const fmtDec = (n, d = 1) => Number(n || 0).toLocaleString('id-ID', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });

  const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function showFeedback(msg, isError = false) {
    if (!el.feedback) return;
    el.feedback.textContent = msg || '';
    el.feedback.style.borderColor = isError ? 'var(--danger)' : 'var(--border-strong)';
  }

  async function apiGet(action, params = {}) {
    const q = new URLSearchParams({ algo: state.algo, action, ...params });
    const res = await fetch(`${API_URL}?${q.toString()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function stopTopologyLoops() {
    if (state.topo.animFrameId) {
      cancelAnimationFrame(state.topo.animFrameId);
      state.topo.animFrameId = null;
    }
    if (state.topo.playTimerId) {
      clearInterval(state.topo.playTimerId);
      state.topo.playTimerId = null;
    }
  }

  function renderSparklineSVG(seed = 1, isHealthy = true) {
    const stroke = isHealthy ? '#22c55e' : '#ef4444';
    const fill = isHealthy ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)';
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const y = 22 - ((Math.sin(seed * 1.7 + i * 0.9) + 1) * 7 + (isHealthy ? 4 : 1));
      pts.push(`${i * 16},${Math.round(y)}`);
    }
    const d = `M ${pts.join(' L ')}`;
    return `<svg class="sparkline-svg" viewBox="0 0 100 28"><path d="${d} L 96,28 L 0,28 Z" fill="${fill}"/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2"/></svg>`;
  }

  function renderMiniBarsHTML(values = [55, 80, 45, 70, 92], isAlert = false) {
    return `<div class="mini-bars ${isAlert ? 'alert' : ''}">${values.map(v => `<span style="height:${v}%"></span>`).join('')}</div>`;
  }

  // Hitung metrik turunan (Residual Energy Joule & RSSI/Link) seperti pada web referensi
  function computeNodeExtendedMetrics(n) {
    const pct = Math.max(0, Math.min(100, Number(n.energi_pct || 0)));
    const volt = Number(n.tegangan || 0);
    const isDead = pct <= 0 || (volt > 0 && volt <= 6.80);
    const isWarning = !isDead && pct < 35;

    // Kapasitas energi maksimum diasumsikan 2.0000 Joule
    const residualJ = isDead ? 0 : (pct / 100) * 2.0;
    const rssi = -50 - ((n.id_node * 3) % 18);
    const linkQuality = isDead ? 0 : Math.min(99.8, Math.max(82.0, 100 - ((n.id_node * 1.4) % 12)));

    return {
      pct,
      volt,
      isDead,
      isWarning,
      residualJ: residualJ.toFixed(4),
      rssi,
      linkQuality: linkQuality.toFixed(1)
    };
  }

  // =========================================================================
  // 1. DASHBOARD UTAMA (Kartu KPI Bento + Kartu Kondisi Tiap Node)
  // =========================================================================
  async function renderNodesView() {
    stopTopologyLoops();
    const data = await apiGet('overview');
    state.overviewData = data;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const s = data.summary || {};

    const optimalCount = nodes.filter(n => n.energi_pct >= 70).length;
    const warningCount = nodes.filter(n => n.energi_pct >= 35 && n.energi_pct < 70).length;
    const criticalCount = nodes.filter(n => n.energi_pct < 35).length;

    const cardsHtml = nodes.length ? `
      <div class="node-cards-grid">
        ${nodes.map(n => {
          const ext = computeNodeExtendedMetrics(n);
          const roleClass = n.status_ch === 1 ? 'ch' : 'member';
          const roleLabel = n.status_ch === 1 ? 'CLUSTER HEAD' : 'MEMBER NODE';

          let stateClass = 'online';
          let stateLabel = 'ONLINE';
          let bannerClass = 'ok';
          let bannerText = n.status_ch === 1
            ? '✓ Cluster Head · Transmisi ke Base Station'
            : `✓ Node Aktif · Rute ke Hop #${n.next_hop}`;

          if (ext.isDead) {
            stateClass = 'dead';
            stateLabel = 'DEAD';
            bannerClass = 'dead';
            bannerText = '✕ Baterai Habis';
          } else if (ext.isWarning) {
            stateClass = 'warning';
            stateLabel = 'LOW BAT';
            bannerClass = 'low';
            bannerText = `⚠ Energi Menipis · Hop #${n.next_hop}`;
          }

          return `
            <article class="node-detail-card ${ext.isDead ? 'is-dead' : ''}">
              <div class="node-card-top">
                <h4>Node ${n.id_node}</h4>
                <div class="node-badges">
                  <span class="badge-role ${roleClass}">${roleLabel}</span>
                  <span class="badge-state ${stateClass}">${stateLabel}</span>
                </div>
              </div>

              <div class="node-status-banner ${bannerClass}">
                ${bannerText}
              </div>

              <div class="node-metrics-list">
                <div class="node-metric-row">
                  <span>Round Proses</span>
                  <strong>${fmtInt(n.ronde)}</strong>
                </div>
                <div class="node-metric-row">
                  <span>Suhu &amp; Lembab Udara</span>
                  <strong>${fmtDec(n.suhu, 1)}°C | ${fmtDec(n.lembab_udara, 0)}%</strong>
                </div>
                <div class="node-metric-row">
                  <span>Kelembapan Tanah</span>
                  <strong>${fmtDec(n.lembab_tanah, 0)}% (Tanaman)</strong>
                </div>
                <div class="node-metric-row">
                  <span>Kapasitas Baterai</span>
                  <strong>${fmtDec(ext.pct, 0)}% (${fmtDec(ext.volt, 2)}V)</strong>
                </div>
                <div class="node-metric-row">
                  <span>Residual Energy</span>
                  <strong>${ext.residualJ} J</strong>
                </div>
                <div class="node-metric-row">
                  <span>RSSI / Link</span>
                  <strong>${ext.rssi} dBm | ${ext.linkQuality}%</strong>
                </div>
              </div>

              <p class="node-sync-foot">Sinkronisasi terakhir: ${escapeHtml(n.waktu || '-')}</p>
              <button type="button" class="btn-node-history" data-node-log="${n.id_node}">
                Lihat Detail Riwayat Node ${n.id_node}
              </button>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <article class="bento-card">
        <p>Database tabel <strong>data_${escapeHtml(state.algo)}</strong> masih kosong. Klik tombol <strong>"+ Tambah Data Uji"</strong> di kanan atas untuk mengisi 15 node secara otomatis.</p>
      </article>
    `;

    const tableHtml = `
      <article class="bento-card">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Node</th>
                <th>Ronde</th>
                <th>Peran / Next Hop</th>
                <th>Suhu &amp; Udara</th>
                <th>Lembab Tanah</th>
                <th>Tegangan &amp; Energi</th>
                <th>Dinamika</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${nodes.map(n => {
                const ok = n.energi_pct >= 40;
                return `
                  <tr>
                    <td>
                      <div class="node-ident">
                        <span class="node-avatar ${ok ? 'ok' : 'low'}">N${n.id_node}</span>
                        <div>
                          <strong>Node #${n.id_node}</strong>
                          <small>${escapeHtml(n.waktu)}</small>
                        </div>
                      </div>
                    </td>
                    <td><strong>#${fmtInt(n.ronde)}</strong></td>
                    <td>
                      <span class="tech-tag ${n.status_ch === 1 ? 'ch' : ''}">
                        ${n.status_ch === 1 ? 'Cluster Head' : 'Member'} → Hop #${n.next_hop}
                      </span>
                    </td>
                    <td><strong>${fmtDec(n.suhu, 1)}°C</strong> <small>(${fmtDec(n.lembab_udara, 0)}%)</small></td>
                    <td><strong>${fmtDec(n.lembab_tanah, 0)}%</strong></td>
                    <td>
                      <strong>${fmtDec(n.tegangan, 2)} V (${fmtDec(n.energi_pct, 0)}%)</strong>
                      <div class="mini-progress"><span style="width:${Math.min(100, n.energi_pct)}%"></span></div>
                    </td>
                    <td>${renderSparklineSVG(n.id_node, ok)}</td>
                    <td>
                      <button type="button" data-node-log="${n.id_node}">Riwayat ⋯</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>
    `;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- BARIS 1: 4 KARTU KPI TANAMAN & ENERGI -->
        <div class="kpi-grid">
          <article class="bento-card kpi-card featured-kpi">
            <div class="kpi-info">
              <span class="kpi-label">Kelembapan Tanah Rata-rata</span>
              <strong class="kpi-value">${fmtDec(s.avg_tanah, 1)}<small>%</small></strong>
              <span class="kpi-trend positive">↗ Kondisi media tanam terpantau</span>
            </div>
            ${renderMiniBarsHTML([65, 85, 72, 90, 88])}
          </article>

          <article class="bento-card kpi-card">
            <div class="kpi-info">
              <span class="kpi-label">Suhu &amp; Kelembapan Udara</span>
              <strong class="kpi-value">${fmtDec(s.avg_suhu, 1)}<small>°C</small></strong>
              <span class="kpi-trend positive">↗ Udara: ${fmtDec(s.avg_udara, 1)}% RH</span>
            </div>
            ${renderMiniBarsHTML([50, 68, 42, 75, 60], s.avg_suhu > 36)}
          </article>

          <article class="bento-card kpi-card">
            <div class="kpi-info">
              <span class="kpi-label">Kapasitas Energi &amp; Tegangan</span>
              <strong class="kpi-value">${fmtDec(s.avg_energi_pct, 1)}<small>%</small></strong>
              <span class="kpi-trend positive">↗ Rata-rata ${fmtDec(s.avg_tegangan, 2)} Volt</span>
            </div>
            ${renderMiniBarsHTML([80, 75, 88, 92, 85], s.avg_energi_pct < 35)}
          </article>

          <article class="bento-card kpi-card">
            <div class="kpi-info">
              <span class="kpi-label">Total Rekaman &amp; Ronde</span>
              <strong class="kpi-value">Ronde #${fmtInt(s.max_round)}</strong>
              <span class="kpi-trend positive">↗ ${fmtInt(s.total_records)} paket (${fmtInt(s.total_nodes)} Node)</span>
            </div>
            ${renderMiniBarsHTML([45, 65, 80, 70, 95])}
          </article>
        </div>

        <!-- BARIS 2: DONUT CHART & SAGE CARD -->
        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Distribusi Kesehatan Energi Node WSN</h3>
                <p class="card-sub">Berdasarkan persentase kapasitas baterai (energi_pct)</p>
              </div>
              <span class="pill-badge">${escapeHtml(data.label || state.algo)}</span>
            </div>
            <div class="donut-layout">
              <div class="donut-chart-wrap">
                <canvas id="health-donut-canvas" width="180" height="180"></canvas>
                <div class="donut-center">
                  <strong>${nodes.length}</strong>
                  <span>Node Aktif</span>
                </div>
              </div>
              <div class="donut-legend-box">
                <div class="legend-highlight">
                  <span class="badge-icon">🌿</span>
                  <div>
                    <small>Status Irigasi &amp; Lahan Tanaman</small>
                    <strong>Tanah ${fmtDec(s.avg_tanah, 1)}% · Suhu ${fmtDec(s.avg_suhu, 1)}°C</strong>
                  </div>
                </div>
                <div class="legend-grid">
                  <div class="legend-item"><span class="dot dot-optimal"></span><div><small>Optimal (&ge;70%)</small><strong>${optimalCount} Node</strong></div></div>
                  <div class="legend-item"><span class="dot dot-warning"></span><div><small>Siaga (35–69%)</small><strong>${warningCount} Node</strong></div></div>
                  <div class="legend-item"><span class="dot dot-critical"></span><div><small>Kritis (&lt;35%)</small><strong>${criticalCount} Node</strong></div></div>
                  <div class="legend-item"><span class="dot dot-ch"></span><div><small>Cluster Head</small><strong>${nodes.filter(n => n.status_ch === 1).length} CH</strong></div></div>
                </div>
              </div>
            </div>
          </article>

          <article class="bento-card sage-summary-card">
            <div class="sage-big-number">
              <strong>${fmtDec(s.avg_tegangan, 2)} V</strong>
              <span>AVG BATTERY</span>
            </div>
            <p class="sage-subtitle">↗ ${fmtDec(s.avg_energi_pct, 1)}% efisiensi energi protokol ${escapeHtml(data.label)}</p>
            <div class="sage-Breakdown">
              <div class="sage-item">
                <span class="sage-icon">🌡️</span>
                <div>
                  <strong>Mikroklimat Lingkungan</strong>
                  <small>Suhu ${fmtDec(s.avg_suhu, 1)}°C · Kelembapan Udara ${fmtDec(s.avg_udara, 1)}%</small>
                </div>
              </div>
              <div class="sage-item">
                <span class="sage-icon">💧</span>
                <div>
                  <strong>Kelembapan Media Tanam</strong>
                  <small>Rata-rata kelembapan tanah ${fmtDec(s.avg_tanah, 1)}%</small>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- BARIS 3: KONDISI TIAP NODE (KARTU PER NODE SEPERTI REFERENSI TEMAN) -->
        <div class="section-header-bar">
          <div>
            <h3>Kondisi Tiap Node</h3>
            <p class="card-sub">Status hidup/mati, koneksi, role, sensor tanaman, dan energi dipisahkan secara rinci.</p>
          </div>
          <div class="header-actions-group">
            <div class="view-mode-switch">
              <button type="button" class="view-mode-btn ${state.nodeDisplayMode === 'cards' ? 'active' : ''}" id="mode-cards-btn">Kartu Node</button>
              <button type="button" class="view-mode-btn ${state.nodeDisplayMode === 'table' ? 'active' : ''}" id="mode-table-btn">Tabel Ringkas</button>
            </div>
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Tambah Data Uji</button>
          </div>
        </div>

        ${state.nodeDisplayMode === 'cards' ? cardsHtml : tableHtml}
      </div>
    `;

    drawDonutChart('health-donut-canvas', [
      { value: optimalCount || 1, color: '#a3e635' },
      { value: warningCount, color: '#22c55e' },
      { value: criticalCount, color: '#ef4444' }
    ]);

    el.content.querySelectorAll('[data-node-log]').forEach(btn => {
      btn.addEventListener('click', () => openLogModal(Number(btn.getAttribute('data-node-log'))));
    });

    el.content.querySelector('#mode-cards-btn')?.addEventListener('click', () => {
      state.nodeDisplayMode = 'cards';
      renderNodesView();
    });
    el.content.querySelector('#mode-table-btn')?.addEventListener('click', () => {
      state.nodeDisplayMode = 'table';
      renderNodesView();
    });
    el.content.querySelector('#btn-quick-seed')?.addEventListener('click', seedDemoData);
  }

  // =========================================================================
  // 2. TOPOLOGI & RUTE (Mesin Waktu Global + Real-Time Burst Animation)
  // =========================================================================
  async function renderTopologyView() {
    stopTopologyLoops();

    const overview = await apiGet('overview');
    state.overviewData = overview;
    const baseNodes = Array.isArray(overview.nodes) && overview.nodes.length
      ? overview.nodes
      : Array.from({ length: 15 }, (_, i) => ({
          id_node: i + 1,
          ronde: 1,
          status_ch: (i + 1) % 4 === 0 ? 1 : 0,
          next_hop: (i + 1) % 4 === 0 ? 0 : (((i + 1) % 3) + 1) * 4,
          suhu: 32.5,
          lembab_udara: 60,
          lembab_tanah: 80,
          tegangan: 8.1,
          energi_pct: 85
        }));

    const dbMaxRound = Number(overview.summary?.max_round || 0);
    // Pastikan batas maksimum slider mendukung 2024 putaran (atau lebih tinggi jika DB > 2024)
    state.topo.maxRound = Math.max(DEFAULT_MAX_ROUND, dbMaxRound);
    if (state.topo.currentRound > state.topo.maxRound || state.topo.currentRound < 1) {
      state.topo.currentRound = dbMaxRound > 1 ? dbMaxRound : 1250;
    }
    state.topo.nodes = baseNodes;

    const live = await apiGet('live', { since: state.liveCursor }).catch(() => ({ events: [] }));
    const events = Array.isArray(live.events) ? live.events : [];

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- BARIS ATAS: MESIN WAKTU GLOBAL (ROUND AKTIF) -->
        <article class="bento-card time-machine-card">
          <div>
            <h3>Round Aktif (Mesin Waktu Global)</h3>
            <p class="card-sub">Geser slider ini untuk melihat rekam jejak topologi rute ke masa lalu. Atau tekan Putar (Play) untuk animasi otomatis.</p>
          </div>
          <div class="time-machine-controls">
            <button type="button" id="topo-play-btn" class="btn-play-round ${state.topo.playing ? 'playing' : ''}">
              ${state.topo.playing ? '⏸ Jeda' : '▶ Putar'}
            </button>
            <select id="topo-speed-select" class="speed-select" aria-label="Kecepatan animasi">
              <option value="1" ${state.topo.speed === 1 ? 'selected' : ''}>1x Normal</option>
              <option value="2" ${state.topo.speed === 2 ? 'selected' : ''}>2x Cepat</option>
              <option value="5" ${state.topo.speed === 5 ? 'selected' : ''}>5x Turbo</option>
            </select>
            <div class="slider-container">
              <span class="slider-min-label">1</span>
              <input
                type="range"
                id="topo-round-slider"
                class="round-slider"
                min="1"
                max="${state.topo.maxRound}"
                value="${state.topo.currentRound}"
              >
              <strong id="topo-round-display" class="round-current-big">${state.topo.currentRound}</strong>
            </div>
          </div>
        </article>

        <!-- BARIS BAWAH: KANVAS TOPOLOGI BURST & LOG PAKET -->
        <div class="topology-bento-layout">
          <article class="bento-card dark-topology-card">
            <div class="card-head">
              <div>
                <h3>Network Topology (Pseudo-Random Scatter) &amp; Real-Time Burst Animation</h3>
                <p class="card-sub">Bola bercahaya menunjukkan aliran paket multi-hop dari Member Node &rarr; Cluster Head &rarr; Base Station</p>
              </div>
              <span class="pill-badge" id="topo-round-badge">Putaran #${state.topo.currentRound} / ${state.topo.maxRound}</span>
            </div>
            <div class="topology-canvas-wrap">
              <canvas id="topology-canvas" width="820" height="460"></canvas>
            </div>
          </article>

          <aside class="bento-card">
            <div class="card-head">
              <h3>Log Transmisi Paket</h3>
              <span class="pill-badge">${baseNodes.length} Node</span>
            </div>
            <div class="activity-list" id="topo-packet-list">
              ${(events.length ? events.slice(-8).reverse() : baseNodes.slice(0, 8)).map(ev => `
                <div class="activity-item">
                  <span class="activity-avatar">N${ev.id_node}</span>
                  <div>
                    <strong>Node #${ev.id_node} &rarr; ${Number(ev.next_hop) === 0 ? 'Base Station' : 'Node #' + ev.next_hop}</strong>
                    <small style="display:block;color:var(--text-secondary)">
                      Tanah: ${ev.lembab_tanah}% · Suhu: ${ev.suhu}°C · ${ev.tegangan}V (${ev.energi_pct}%)
                    </small>
                  </div>
                </div>
              `).join('')}
            </div>
          </aside>
        </div>
      </div>
    `;

    const playBtn = document.getElementById('topo-play-btn');
    const speedSel = document.getElementById('topo-speed-select');
    const slider = document.getElementById('topo-round-slider');
    const roundDisplay = document.getElementById('topo-round-display');
    const roundBadge = document.getElementById('topo-round-badge');

    async function syncRoundSnapshot(roundVal) {
      state.topo.currentRound = roundVal;
      if (roundDisplay) roundDisplay.textContent = String(roundVal);
      if (roundBadge) roundBadge.textContent = `Putaran #${roundVal} / ${state.topo.maxRound}`;
      if (slider && Number(slider.value) !== roundVal) slider.value = String(roundVal);

      // Jika database memiliki banyak ronde, tarik snapshot ronde tersebut dari Supabase
      if (dbMaxRound > 1 && roundVal <= dbMaxRound) {
        try {
          const snap = await apiGet('overview', { round: roundVal });
          if (Array.isArray(snap.nodes) && snap.nodes.length) {
            state.topo.nodes = snap.nodes;
          }
        } catch {
          // Gunakan state sebelumnya jika gagal
        }
      } else {
        // Dinamika rotasi Cluster Head & rute secara deterministik sesuai putaran (1..2024)
        const chGroup = Math.floor(roundVal / 25) % 3;
        state.topo.nodes = baseNodes.map(n => {
          const isCh = ((n.id_node + chGroup) % 4 === 0) ? 1 : 0;
          let nextHop = 0;
          if (!isCh) {
            const candidates = baseNodes.filter(c => ((c.id_node + chGroup) % 4 === 0));
            const pick = candidates[(n.id_node + Math.floor(roundVal / 10)) % (candidates.length || 1)];
            nextHop = pick ? pick.id_node : 0;
          }
          return { ...n, status_ch: isCh, next_hop: nextHop, ronde: roundVal };
        });
      }
    }

    function restartPlayInterval() {
      if (state.topo.playTimerId) clearInterval(state.topo.playTimerId);
      if (!state.topo.playing) return;

      const intervalMs = Math.max(180, Math.round(900 / state.topo.speed));
      state.topo.playTimerId = setInterval(() => {
        let nextR = state.topo.currentRound + 1;
        if (nextR > state.topo.maxRound) nextR = 1;
        syncRoundSnapshot(nextR);
      }, intervalMs);
    }

    playBtn?.addEventListener('click', () => {
      state.topo.playing = !state.topo.playing;
      playBtn.classList.toggle('playing', state.topo.playing);
      playBtn.textContent = state.topo.playing ? '⏸ Jeda' : '▶ Putar';
      restartPlayInterval();
    });

    speedSel?.addEventListener('change', () => {
      state.topo.speed = Number(speedSel.value || 1);
      restartPlayInterval();
    });

    slider?.addEventListener('input', () => {
      syncRoundSnapshot(Number(slider.value));
    });

    await syncRoundSnapshot(state.topo.currentRound);
    restartPlayInterval();
    startTopologyBurstCanvas('topology-canvas');
  }

  // =========================================================================
  // MESIN ANIMASI KANVAS TOPOLOGI (PSEUDO-RANDOM SCATTER & BOLA DATA)
  // =========================================================================
  function startTopologyBurstCanvas(canvasId) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;

    // Koordinat Base Station di tengah atas seperti pada gambar referensi
    const sink = { x: W * 0.50, y: 74 };

    // Posisi Pseudo-Random Scatter untuk 15 Node agar tersebar alami & konsisten
    const scatterCoords = [
      { x: 0.31, y: 0.53 }, // Node 1
      { x: 0.22, y: 0.38 }, // Node 2
      { x: 0.48, y: 0.80 }, // Node 3
      { x: 0.76, y: 0.82 }, // Node 4
      { x: 0.28, y: 0.72 }, // Node 5
      { x: 0.50, y: 0.56 }, // Node 6
      { x: 0.42, y: 0.67 }, // Node 7
      { x: 0.33, y: 0.70 }, // Node 8
      { x: 0.16, y: 0.62 }, // Node 9
      { x: 0.59, y: 0.50 }, // Node 10
      { x: 0.54, y: 0.81 }, // Node 11
      { x: 0.42, y: 0.60 }, // Node 12
      { x: 0.83, y: 0.52 }, // Node 13
      { x: 0.76, y: 0.64 }, // Node 14
      { x: 0.69, y: 0.90 }  // Node 15
    ];

    function getNodePositions(nodes) {
      const pos = new Map();
      pos.set(0, sink);
      nodes.forEach((n, idx) => {
        const sc = scatterCoords[(n.id_node - 1) % scatterCoords.length] || { x: 0.5, y: 0.5 };
        pos.set(n.id_node, {
          x: Math.round(sc.x * W),
          y: Math.round(sc.y * H),
          node: n
        });
      });
      return pos;
    }

    // Inisialisasi bola-bola paket data yang berjalan pada setiap link
    state.topo.particles = [];
    for (let i = 0; i < 18; i++) {
      state.topo.particles.push({
        nodeIndex: i % 15,
        progress: Math.random(),
        speed: (0.0045 + Math.random() * 0.004)
      });
    }

    function drawHexagon(x, y, radius) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = x + radius * Math.cos(angle);
        const hy = y + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    }

    function renderFrame() {
      ctx.clearRect(0, 0, W, H);
      const nodes = state.topo.nodes || [];
      const pos = getNodePositions(nodes);

      // 1. Gambar garis rute (Link Multi-Hop) dengan lengkungan halus
      nodes.forEach(n => {
        const p1 = pos.get(n.id_node);
        const targetId = Number(n.next_hop || 0);
        const p2 = pos.get(targetId) || sink;
        if (!p1 || !p2) return;

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - 18;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        ctx.strokeStyle = n.status_ch === 1
          ? 'rgba(52, 211, 153, 0.38)'
          : 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = n.status_ch === 1 ? 1.8 : 1.2;
        ctx.stroke();
      });

      // 2. Gambar & perbarui posisi bola bercahaya (Real-Time Burst Particles)
      const mult = Math.max(0.6, state.topo.speed * 0.75);
      state.topo.particles.forEach(pt => {
        if (!nodes.length) return;
        const n = nodes[pt.nodeIndex % nodes.length];
        if (!n) return;

        const p1 = pos.get(n.id_node);
        const p2 = pos.get(Number(n.next_hop || 0)) || sink;
        if (!p1 || !p2) return;

        pt.progress += pt.speed * mult;
        if (pt.progress >= 1) {
          pt.progress = 0;
          pt.nodeIndex = (pt.nodeIndex + 1) % nodes.length;
        }

        const t = pt.progress;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - 18;

        // Titik sepanjang kurva Quadratic Bezier
        const bx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * mx + t * t * p2.x;
        const by = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * my + t * t * p2.y;

        // Cahaya luar bola (Glow)
        const glow = ctx.createRadialGradient(bx, by, 1, bx, by, 11);
        glow.addColorStop(0, 'rgba(254, 240, 138, 1)');
        glow.addColorStop(0.45, 'rgba(250, 204, 21, 0.65)');
        glow.addColorStop(1, 'rgba(250, 204, 21, 0)');

        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Inti bola
        ctx.beginPath();
        ctx.arc(bx, by, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fef9c3';
        ctx.fill();
      });

      // 3. Gambar Base Station Heksagon Bercahaya (Magenta/Pink seperti referensi)
      ctx.save();
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 18;
      drawHexagon(sink.x, sink.y, 28);
      ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ec4899';
      ctx.stroke();
      ctx.restore();

      // Titik inti di dalam Base Station
      ctx.beginPath();
      ctx.arc(sink.x, sink.y + 10, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047';
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 12px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('Base', sink.x, sink.y + 46);
      ctx.fillText('Station', sink.x, sink.y + 60);

      // 4. Gambar Setiap Node WSN
      nodes.forEach(n => {
        const p = pos.get(n.id_node);
        if (!p) return;
        const isDead = Number(n.energi_pct || 0) <= 0;
        const radius = n.status_ch === 1 ? 18 : 15;

        ctx.save();
        ctx.shadowColor = isDead ? '#ef4444' : '#22c55e';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isDead ? 'rgba(127, 29, 29, 0.65)' : 'rgba(20, 83, 45, 0.85)';
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = isDead ? '#ef4444' : '#4ade80';
        ctx.stroke();
        ctx.restore();

        // Titik cahaya di tengah node
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = isDead ? '#fca5a5' : '#fef08a';
        ctx.fill();

        // Label Nama Node di bawah lingkaran
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 11px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        ctx.fillText(`Node ${n.id_node}`, p.x, p.y + radius + 15);
      });

      state.topo.animFrameId = requestAnimationFrame(renderFrame);
    }

    renderFrame();
  }

  // =========================================================================
  // 3. GRAFIK ENERGI & SENSOR TANAMAN
  // =========================================================================
  async function renderEnergyView() {
    stopTopologyLoops();
    const [overview, energyAll] = await Promise.all([
      state.overviewData ? Promise.resolve(state.overviewData) : apiGet('overview'),
      apiGet('energy_all')
    ]);

    const nodes = Array.isArray(overview.nodes) ? overview.nodes : [];
    const series = Array.isArray(energyAll.series) ? energyAll.series : [];
    const avgPct = Number(overview.summary?.avg_energi_pct || 80);

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Indeks Kapasitas Energi per Node (energi_pct %)</h3>
              <p class="card-sub">Garis putus-putus menampilkan rata-rata kapasitas energi jaringan (${fmtDec(avgPct, 1)}%)</p>
            </div>
            <span class="pill-badge">Rata-rata: ${fmtDec(avgPct, 1)}%</span>
          </div>
          <div class="canvas-box">
            <canvas id="cci-bar-canvas" width="840" height="270"></canvas>
          </div>
        </article>

        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Tren Rata-rata Tegangan (V) &amp; Kapasitas Energi (%) per Ronde</h3>
              <p class="card-sub">Kurva hijau menunjukkan rata-rata persentase energi sepanjang ronde</p>
            </div>
          </div>
          <div class="canvas-box">
            <canvas id="area-energy-canvas" width="840" height="240"></canvas>
          </div>
        </article>
      </div>
    `;

    drawCCIBarChart('cci-bar-canvas', nodes, avgPct);
    drawAreaEnergyChart('area-energy-canvas', series);
  }

  // =========================================================================
  // 4. PERBANDINGAN ALGORITMA
  // =========================================================================
  async function renderCompareView() {
    stopTopologyLoops();
    const data = await apiGet('compare');
    const rows = Array.isArray(data.rows) ? data.rows : [];

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <h3>Tabel Perbandingan 6 Protokol Routing WSN</h3>
            <span class="pill-badge">Supabase PostgreSQL</span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Algoritma</th>
                  <th>Node Terdaftar</th>
                  <th>Ronde Maksimum</th>
                  <th>Rata-rata Energi (%)</th>
                  <th>Rata-rata Tegangan (V)</th>
                  <th>Total Rekaman</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td><strong>${escapeHtml(r.algorithm)}</strong></td>
                    <td>${fmtInt(r.nodes)} Node</td>
                    <td><span class="tech-tag ch">Ronde #${fmtInt(r.max_round)}</span></td>
                    <td><strong>${fmtDec(r.avg_energi_pct, 1)}%</strong></td>
                    <td>${fmtDec(r.avg_tegangan, 2)} V</td>
                    <td><strong>${fmtInt(r.records)} baris</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;
  }

  // =========================================================================
  // FUNGSI CANVAS CHART (DONUT, BAR, AREA)
  // =========================================================================
  function drawDonutChart(id, segments) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -Math.PI / 2;
    ctx.clearRect(0, 0, c.width, c.height);
    segments.forEach(seg => {
      if (seg.value <= 0) return;
      const slice = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(90, 90, 68, angle, angle + slice);
      ctx.lineWidth = 22;
      ctx.strokeStyle = seg.color;
      ctx.stroke();
      angle += slice;
    });
  }

  function drawCCIBarChart(id, nodes, avgPct) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const list = nodes.length ? nodes : Array.from({ length: 15 }, (_, i) => ({ id_node: i + 1, energi_pct: 80 }));
    const padL = 44, padR = 20, padT = 28, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = plotW / list.length;
    const barW = Math.min(24, step * 0.55);

    list.forEach((n, i) => {
      const pct = Math.min(100, Math.max(0, Number(n.energi_pct || 0)));
      const h = Math.max(6, (pct / 100) * plotH);
      const x = padL + i * step + (step - barW) / 2;
      const y = padT + plotH - h;

      ctx.fillStyle = pct >= avgPct ? '#a3e635' : '#22c55e';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 5);
      ctx.fill();

      ctx.fillStyle = '#829188';
      ctx.font = '11px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(`N${n.id_node}`, x + barW / 2, H - 10);
    });

    const avgY = padT + plotH - (Math.min(100, avgPct) / 100) * plotH;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#a3e635';
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(W - padR, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawAreaEnergyChart(id, series) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const vals = series.length >= 2
      ? series.map(s => Number(s.avg_energi_pct || 80))
      : [92, 90, 89, 88, 87, 86, 85];

    const pad = 28;
    const plotW = W - pad * 2, plotH = H - pad * 2;
    const pts = vals.map((v, i) => ({
      x: pad + (i / (vals.length - 1)) * plotW,
      y: pad + plotH - (Math.min(100, v) / 100) * plotH
    }));

    const grad = ctx.createLinearGradient(0, pad, 0, H - pad);
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.45)');
    grad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, H - pad);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // =========================================================================
  // MODAL LOG & SEED DATA DEMO
  // =========================================================================
  async function seedDemoData() {
    try {
      showFeedback('Menambahkan 15 rekaman node uji ke Supabase…');
      const res = await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=seed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengisi data uji');
      showFeedback(data.message);
      await loadActiveView();
    } catch (err) {
      showFeedback(err.message, true);
    }
  }

  async function openLogModal(nodeId = 0) {
    if (!el.logDialog) return;
    state.logState = { node: nodeId, cursor: 0, round: 0, order: 'desc', loading: false, next: null };
    el.logTitle.textContent = nodeId > 0 ? `Riwayat Node #${nodeId}` : 'Seluruh Riwayat Rekaman WSN';
    el.logContext.textContent = `Tabel: data_${state.algo}`;
    el.logHead.innerHTML = '';
    el.logBody.innerHTML = '';
    el.downloadLog.href = `${API_URL}?algo=${encodeURIComponent(state.algo)}&action=export&node=${nodeId}`;
    if (!el.logDialog.open) el.logDialog.showModal();
    await loadMoreHistory(true);
  }

  async function loadMoreHistory(reset = false) {
    const st = state.logState;
    if (st.loading) return;
    st.loading = true;
    el.logStatus.textContent = 'Memuat…';

    try {
      const res = await apiGet('history', { node: st.node, cursor: reset ? 0 : (st.next || 0), order: st.order });
      const rows = Array.isArray(res.rows) ? res.rows : [];
      st.next = res.next || null;

      if (reset && rows.length) {
        const cols = Object.keys(rows[0]);
        el.logHead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      }
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        el.logBody.insertAdjacentHTML('beforeend', rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join(''));
        el.logStatus.textContent = st.next ? 'Gulir ke bawah untuk memuat lagi…' : 'Semua data ditampilkan.';
      } else if (reset) {
        el.logStatus.textContent = 'Belum ada rekaman log.';
      }
    } catch (err) {
      el.logStatus.textContent = err.message;
    } finally {
      st.loading = false;
    }
  }

  async function loadActiveView() {
    el.content?.setAttribute('aria-busy', 'true');
    if (el.title) el.title.textContent = VIEW_TITLES[state.view] || 'Dashboard';
    try {
      if (state.view === 'nodes') await renderNodesView();
      else if (state.view === 'topology') await renderTopologyView();
      else if (state.view === 'energy') await renderEnergyView();
      else if (state.view === 'compare') await renderCompareView();
    } catch (err) {
      showFeedback(err.message, true);
    } finally {
      el.content?.setAttribute('aria-busy', 'false');
      state.timer = REFRESH_INTERVAL;
    }
  }

  // Event Listeners
  el.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      el.navButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.view = btn.getAttribute('data-view') || 'nodes';
      loadActiveView();
    });
  });

  el.algoSelect?.addEventListener('change', () => {
    state.algo = el.algoSelect.value;
    state.overviewData = null;
    loadActiveView();
  });

  el.refreshBtn?.addEventListener('click', loadActiveView);
  el.seedBtn?.addEventListener('click', seedDemoData);
  el.allLogBtn?.addEventListener('click', () => openLogModal(0));
  el.closeLogBtn?.addEventListener('click', () => el.logDialog?.close());
  el.cancelDeleteBtn?.addEventListener('click', () => el.confirmDialog?.close());

  el.deleteAllBtn?.addEventListener('click', () => {
    state.pendingDelete = 'all';
    el.confirmText.textContent = `Hapus seluruh rekaman pada tabel data_${state.algo}?`;
    el.confirmDialog?.showModal();
  });

  el.deleteLogBtn?.addEventListener('click', () => {
    state.pendingDelete = 'node';
    el.confirmText.textContent = `Hapus rekaman log untuk Node #${state.logState.node}?`;
    el.confirmDialog?.showModal();
  });

  el.deleteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: state.pendingDelete === 'node' ? state.logState.node : 0,
          confirm: el.deleteWord.value.trim()
        })
      });
      if (!res.ok) throw new Error('Gagal menghapus rekaman.');
      el.confirmDialog?.close();
      el.logDialog?.close();
      loadActiveView();
    } catch (err) {
      el.deleteError.textContent = err.message;
    }
  });

  setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    if (el.countdown) {
      const m = String(Math.floor(state.timer / 60)).padStart(2, '0');
      const s = String(state.timer % 60).padStart(2, '0');
      el.countdown.textContent = `${m}:${s}`;
    }
    if (state.timer === 0 && state.view !== 'topology') loadActiveView();
  }, 1000);

  loadActiveView();
})();
