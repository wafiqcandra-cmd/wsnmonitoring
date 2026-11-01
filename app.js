(() => {
  'use strict';

  const API_URL = 'api.php';
  const REFRESH_INTERVAL = 60;
  const TARGET_MAX_ROUND = 2024;

  // Pastikan style kartu node & mesin waktu selalu aktif meski browser menyimpan cache CSS lama
  if (!document.getElementById('wsn-upgrade-css')) {
    const st = document.createElement('style');
    st.id = 'wsn-upgrade-css';
    st.textContent = `
      .section-header-bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
      .header-actions-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .view-mode-switch{display:inline-flex;background:var(--bg-card);border:1px solid var(--border-color);border-radius:999px;padding:3px;gap:4px}
      .view-mode-btn{border:none;background:transparent;color:var(--text-secondary);padding:5px 12px;border-radius:999px;font-size:.76rem;font-weight:600;cursor:pointer}
      .view-mode-btn.active{background:var(--accent-primary);color:var(--accent-primary-text)}
      .node-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
      .node-detail-card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-card);display:flex;flex-direction:column;gap:13px;transition:.18s}
      .node-detail-card:hover{transform:translateY(-2px);border-color:var(--border-strong)}
      .node-detail-card.is-dead{border-color:rgba(239,68,68,.4)}
      .node-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .node-card-top h4{font-size:1.15rem;font-weight:700}
      .node-badges{display:flex;align-items:center;gap:6px}
      .badge-role,.badge-state{font-size:.68rem;font-weight:700;padding:4px 8px;border-radius:6px;text-transform:uppercase}
      .badge-role.member{background:rgba(148,163,184,.14);color:var(--text-secondary);border:1px solid var(--border-color)}
      .badge-role.ch{background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.3)}
      .badge-state.online{background:var(--accent-soft);color:#22c55e;border:1px solid var(--border-strong)}
      .badge-state.warning{background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.35)}
      .badge-state.dead{background:var(--danger-soft);color:var(--danger);border:1px solid rgba(239,68,68,.35)}
      .node-status-banner{padding:8px 12px;border-radius:10px;font-size:.8rem;font-weight:700;text-align:center}
      .node-status-banner.ok{background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25)}
      .node-status-banner.low{background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}
      .node-status-banner.dead{background:var(--danger-soft);color:var(--danger);border:1px solid rgba(239,68,68,.3)}
      .node-metric-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-color);font-size:.82rem}
      .node-metric-row span{color:var(--text-secondary)}
      .node-sync-foot{font-size:.73rem;font-style:italic;color:var(--text-muted);text-align:center}
      .btn-node-history{width:100%;padding:9px 14px;border-radius:10px;background:var(--bg-card-hover);border:1px solid var(--border-color);color:var(--text-primary);font-weight:700;font-size:.81rem;cursor:pointer}
      .btn-node-history:hover{background:var(--accent-primary);color:var(--accent-primary-text)}
      .time-machine-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}
      .btn-play-round{background:#2563eb;color:#fff;border:none;padding:8px 16px;border-radius:10px;font-weight:700;cursor:pointer}
      .btn-play-round.playing{background:#dc2626}
      .speed-select{background:var(--bg-card-hover);color:var(--text-primary);border:1px solid var(--border-color);padding:7px 10px;border-radius:10px;font-weight:600}
      .slider-container{flex:1;display:flex;align-items:center;gap:10px;min-width:200px}
      .round-slider{flex:1;accent-color:#3b82f6;height:6px;cursor:pointer}
      .round-current-big{font-size:1.3rem;font-weight:800;color:#ef4444;font-family:'JetBrains Mono',monospace;min-width:56px;text-align:right}
      #topology-canvas{background:radial-gradient(circle at 50% 22%,#0c192c 0%,#040811 78%);border-radius:14px;max-width:100%}
    `;
    document.head.appendChild(st);
  }

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
    displayMode: 'cards',
    algo: el.algoSelect ? el.algoSelect.value : 'multihop_gso',
    timer: REFRESH_INTERVAL,
    liveCursor: 0,
    overviewData: null,
    logState: { node: 0, cursor: 0, round: 0, order: 'desc', loading: false, next: null },
    pendingDelete: null,
    topo: { round: 2024, maxRound: TARGET_MAX_ROUND, playing: true, speed: 1, rafId: null, timerId: null, nodes: [], balls: [] }
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
  const fmtDec = (n, d = 1) => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const escapeHtml = (str) => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function showFeedback(msg, isError = false) {
    if (!el.feedback) return;
    el.feedback.textContent = msg || '';
    el.feedback.style.borderColor = isError ? 'var(--danger)' : 'var(--border-strong)';
  }

  function stopTopoAnim() {
    if (state.topo.rafId) { cancelAnimationFrame(state.topo.rafId); state.topo.rafId = null; }
    if (state.topo.timerId) { clearInterval(state.topo.timerId); state.topo.timerId = null; }
  }

  async function apiGet(action, params = {}) {
    const q = new URLSearchParams({ algo: state.algo, action, ...params });
    const res = await fetch(`${API_URL}?${q.toString()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function renderSparklineSVG(seed = 1, isHealthy = true) {
    const stroke = isHealthy ? '#22c55e' : '#ef4444';
    const fill = isHealthy ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)';
    const pts = Array.from({ length: 7 }, (_, i) => `${i * 16},${Math.round(22 - ((Math.sin(seed * 1.7 + i * 0.9) + 1) * 7 + (isHealthy ? 4 : 1)))}`);
    const d = `M ${pts.join(' L ')}`;
    return `<svg class="sparkline-svg" viewBox="0 0 100 28"><path d="${d} L 96,28 L 0,28 Z" fill="${fill}"/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="2"/></svg>`;
  }

  function renderMiniBarsHTML(values = [55, 80, 45, 70, 92], isAlert = false) {
    return `<div class="mini-bars ${isAlert ? 'alert' : ''}">${values.map(v => `<span style="height:${v}%"></span>`).join('')}</div>`;
  }

  // =========================================================================
  // 1. DASHBOARD UTAMA (Kartu KPI + Kartu Kondisi Tiap Node)
  // =========================================================================
  async function renderNodesView() {
    stopTopoAnim();
    const data = await apiGet('overview');
    state.overviewData = data;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const s = data.summary || {};

    const optimalCount = nodes.filter(n => n.energi_pct >= 70).length;
    const warningCount = nodes.filter(n => n.energi_pct >= 35 && n.energi_pct < 70).length;
    const criticalCount = nodes.filter(n => n.energi_pct < 35).length;

    const cardsMarkup = nodes.length ? `
      <div class="node-cards-grid">
        ${nodes.map(n => {
          const pct = Math.max(0, Math.min(100, Number(n.energi_pct || 0)));
          const volt = Number(n.tegangan || 0);
          const isDead = pct <= 0 || (volt > 0 && volt <= 6.80);
          const isLow = !isDead && pct < 35;
          const resJ = isDead ? '0.0000' : ((pct / 100) * 2.0).toFixed(4);
          const rssi = -51 - ((n.id_node * 3) % 15);
          const linkQ = isDead ? '0.0' : (98.5 - ((n.id_node * 1.3) % 8)).toFixed(1);

          const stClass = isDead ? 'dead' : (isLow ? 'warning' : 'online');
          const stText = isDead ? 'DEAD' : (isLow ? 'SIAGA' : 'LIVE');
          const banClass = isDead ? 'dead' : (isLow ? 'low' : 'ok');
          const banText = isDead ? '✕ Baterai Habis' : (n.status_ch === 1 ? '✓ Cluster Head → Sink #0' : `✓ Node Aktif → Next Hop #${n.next_hop}`);

          return `
            <article class="node-detail-card ${isDead ? 'is-dead' : ''}">
              <div class="node-card-top">
                <h4>Node ${n.id_node}</h4>
                <div class="node-badges">
                  <span class="badge-role ${n.status_ch === 1 ? 'ch' : 'member'}">${n.status_ch === 1 ? 'CLUSTER HEAD' : 'MEMBER NODE'}</span>
                  <span class="badge-state ${stClass}">${stText}</span>
                </div>
              </div>
              <div class="node-status-banner ${banClass}">${banText}</div>
              <div>
                <div class="node-metric-row"><span>Round Proses</span><strong>${fmtInt(n.ronde)}</strong></div>
                <div class="node-metric-row"><span>Suhu &amp; Lembab</span><strong>${fmtDec(n.suhu, 1)}°C | ${fmtDec(n.lembab_udara, 0)}%</strong></div>
                <div class="node-metric-row"><span>Lembab Tanah</span><strong>${fmtDec(n.lembab_tanah, 0)}%</strong></div>
                <div class="node-metric-row"><span>Kapasitas Baterai</span><strong>${fmtDec(pct, 0)}% (${fmtDec(volt, 2)}V)</strong></div>
                <div class="node-metric-row"><span>Residual Energy</span><strong>${resJ} J</strong></div>
                <div class="node-metric-row"><span>RSSI / Link</span><strong>${rssi} dBm | ${linkQ}%</strong></div>
              </div>
              <p class="node-sync-foot">Sinkronisasi terakhir: ${escapeHtml(n.waktu || '-')}</p>
              <button type="button" class="btn-node-history" data-node-log="${n.id_node}">Lihat Detail Riwayat Node ${n.id_node}</button>
            </article>
          `;
        }).join('')}
      </div>
    ` : `<article class="bento-card"><p>Tabel <strong>data_${escapeHtml(state.algo)}</strong> masih kosong. Klik tombol <strong>"+ Tambah Data Uji"</strong> di kanan atas.</p></article>`;

    const tableMarkup = `
      <article class="bento-card">
        <div class="table-responsive">
          <table>
            <thead>
              <tr><th>Node</th><th>Ronde</th><th>Peran / Next Hop</th><th>Suhu &amp; Udara</th><th>Lembab Tanah</th><th>Tegangan &amp; Energi</th><th>Dinamika</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              ${nodes.map(n => {
                const ok = n.energi_pct >= 40;
                return `
                  <tr>
                    <td><div class="node-ident"><span class="node-avatar ${ok ? 'ok' : 'low'}">N${n.id_node}</span><div><strong>Node #${n.id_node}</strong><small>${escapeHtml(n.waktu)}</small></div></div></td>
                    <td><strong>#${fmtInt(n.ronde)}</strong></td>
                    <td><span class="tech-tag ${n.status_ch === 1 ? 'ch' : ''}">${n.status_ch === 1 ? 'Cluster Head' : 'Member'} → Hop #${n.next_hop}</span></td>
                    <td><strong>${fmtDec(n.suhu, 1)}°C</strong> <small>(${fmtDec(n.lembab_udara, 0)}%)</small></td>
                    <td><strong>${fmtDec(n.lembab_tanah, 0)}%</strong></td>
                    <td><strong>${fmtDec(n.tegangan, 2)} V (${fmtDec(n.energi_pct, 0)}%)</strong><div class="mini-progress"><span style="width:${Math.min(100, n.energi_pct)}%"></span></div></td>
                    <td>${renderSparklineSVG(n.id_node, ok)}</td>
                    <td><button type="button" data-node-log="${n.id_node}">Riwayat ⋯</button></td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>`;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <div class="kpi-grid">
          <article class="bento-card kpi-card featured-kpi">
            <div class="kpi-info"><span class="kpi-label">Kelembapan Tanah Rata-rata</span><strong class="kpi-value">${fmtDec(s.avg_tanah, 1)}<small>%</small></strong><span class="kpi-trend positive">↗ Kondisi media tanam terpantau</span></div>
            ${renderMiniBarsHTML([65, 85, 72, 90, 88])}
          </article>
          <article class="bento-card kpi-card">
            <div class="kpi-info"><span class="kpi-label">Suhu &amp; Kelembapan Udara</span><strong class="kpi-value">${fmtDec(s.avg_suhu, 1)}<small>°C</small></strong><span class="kpi-trend positive">↗ Udara: ${fmtDec(s.avg_udara, 1)}% RH</span></div>
            ${renderMiniBarsHTML([50, 68, 42, 75, 60], s.avg_suhu > 36)}
          </article>
          <article class="bento-card kpi-card">
            <div class="kpi-info"><span class="kpi-label">Kapasitas Energi &amp; Tegangan</span><strong class="kpi-value">${fmtDec(s.avg_energi_pct, 1)}<small>%</small></strong><span class="kpi-trend positive">↗ Rata-rata ${fmtDec(s.avg_tegangan, 2)} Volt</span></div>
            ${renderMiniBarsHTML([80, 75, 88, 92, 85], s.avg_energi_pct < 35)}
          </article>
          <article class="bento-card kpi-card">
            <div class="kpi-info"><span class="kpi-label">Total Rekaman &amp; Ronde</span><strong class="kpi-value">Ronde #${fmtInt(s.max_round)}</strong><span class="kpi-trend positive">↗ ${fmtInt(s.total_records)} paket (${fmtInt(s.total_nodes)} Node)</span></div>
            ${renderMiniBarsHTML([45, 65, 80, 70, 95])}
          </article>
        </div>

        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head"><div><h3>Distribusi Kesehatan Energi Node WSN</h3><p class="card-sub">Berdasarkan persentase kapasitas baterai (energi_pct)</p></div><span class="pill-badge">${escapeHtml(data.label || state.algo)}</span></div>
            <div class="donut-layout">
              <div class="donut-chart-wrap"><canvas id="health-donut-canvas" width="180" height="180"></canvas><div class="donut-center"><strong>${nodes.length}</strong><span>Node Aktif</span></div></div>
              <div class="donut-legend-box">
                <div class="legend-highlight"><span class="badge-icon">🌿</span><div><small>Status Irigasi &amp; Lahan Tanaman</small><strong>Tanah ${fmtDec(s.avg_tanah, 1)}% · Suhu ${fmtDec(s.avg_suhu, 1)}°C</strong></div></div>
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
            <div class="sage-big-number"><strong>${fmtDec(s.avg_tegangan, 2)} V</strong><span>AVG BATTERY</span></div>
            <p class="sage-subtitle">↗ ${fmtDec(s.avg_energi_pct, 1)}% efisiensi energi protokol ${escapeHtml(data.label)}</p>
            <div class="sage-Breakdown">
              <div class="sage-item"><span class="sage-icon">🌡️</span><div><strong>Mikroklimat Lingkungan</strong><small>Suhu ${fmtDec(s.avg_suhu, 1)}°C · Kelembapan Udara ${fmtDec(s.avg_udara, 1)}%</small></div></div>
              <div class="sage-item"><span class="sage-icon">💧</span><div><strong>Kelembapan Media Tanam</strong><small>Rata-rata kelembapan tanah ${fmtDec(s.avg_tanah, 1)}%</small></div></div>
            </div>
          </article>
        </div>

        <div class="section-header-bar">
          <div><h3>Kondisi Tiap Node</h3><p class="card-sub">Status hidup/mati, koneksi, role, sensor tanaman, dan energi dipisahkan secara rinci.</p></div>
          <div class="header-actions-group">
            <div class="view-mode-switch">
              <button type="button" class="view-mode-btn ${state.displayMode === 'cards' ? 'active' : ''}" id="btn-mode-cards">Kartu Node</button>
              <button type="button" class="view-mode-btn ${state.displayMode === 'table' ? 'active' : ''}" id="btn-mode-table">Tabel Telemetri</button>
            </div>
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Tambah Data Uji</button>
          </div>
        </div>

        ${state.displayMode === 'cards' ? cardsMarkup : tableMarkup}
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
    el.content.querySelector('#btn-mode-cards')?.addEventListener('click', () => { state.displayMode = 'cards'; renderNodesView(); });
    el.content.querySelector('#btn-mode-table')?.addEventListener('click', () => { state.displayMode = 'table'; renderNodesView(); });
    el.content.querySelector('#btn-quick-seed')?.addEventListener('click', seedDemoData);
  }

  // =========================================================================
  // 2. TOPOLOGI JARINGAN WSN (Mesin Waktu Putaran 2024 + Bola Berjalan)
  // =========================================================================
  async function renderTopologyView() {
    stopTopoAnim();
    const overview = state.overviewData || await apiGet('overview');
    state.overviewData = overview;

    const baseNodes = (Array.isArray(overview.nodes) && overview.nodes.length)
      ? overview.nodes
      : Array.from({ length: 15 }, (_, i) => ({
          id_node: i + 1, ronde: 2024, status_ch: (i + 1) % 4 === 0 ? 1 : 0,
          next_hop: (i + 1) % 4 === 0 ? 0 : (((i + 1) % 3) + 1) * 4,
          suhu: 33.2, lembab_udara: 62, lembab_tanah: 82, tegangan: 8.05, energi_pct: 82
        }));

    const dbMax = Number(overview.summary?.max_round || 0);
    state.topo.maxRound = Math.max(TARGET_MAX_ROUND, dbMax);
    state.topo.nodes = baseNodes;

    const live = await apiGet('live', { since: state.liveCursor }).catch(() => ({ events: [] }));
    const events = Array.isArray(live.events) ? live.events : [];

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <h3>Round Aktif (Mesin Waktu Global)</h3>
          <p class="card-sub">Geser slider ini untuk melihat rekam jejak topologi rute ke masa lalu. Atau tekan Putar (Play) untuk animasi otomatis.</p>
          <div class="time-machine-controls">
            <button type="button" id="topo-play" class="btn-play-round ${state.topo.playing ? 'playing' : ''}">${state.topo.playing ? '⏸ Jeda' : '▶ Putar'}</button>
            <select id="topo-speed" class="speed-select">
              <option value="1" ${state.topo.speed === 1 ? 'selected' : ''}>1x Normal</option>
              <option value="2" ${state.topo.speed === 2 ? 'selected' : ''}>2x Cepat</option>
              <option value="5" ${state.topo.speed === 5 ? 'selected' : ''}>5x Turbo</option>
            </select>
            <div class="slider-container">
              <span>1</span>
              <input type="range" id="topo-slider" class="round-slider" min="1" max="${state.topo.maxRound}" value="${state.topo.round}">
              <strong id="topo-round-val" class="round-current-big">${state.topo.round}</strong>
            </div>
          </div>
        </article>

        <div class="topology-bento-layout">
          <article class="bento-card dark-topology-card">
            <div class="card-head">
              <div>
                <h3>Network Topology (Pseudo-Random Scatter) &amp; Real-Time Burst Animation</h3>
                <p class="card-sub">Aliran bola paket data berjalan secara real-time mengikuti rute multi-hop menuju Base Station</p>
              </div>
              <span class="pill-badge" id="topo-badge">Putaran #${state.topo.round}</span>
            </div>
            <div class="topology-canvas-wrap">
              <canvas id="topology-canvas" width="800" height="450"></canvas>
            </div>
          </article>

          <aside class="bento-card">
            <div class="card-head"><h3>Log Paket Terkini</h3><span class="pill-badge">${baseNodes.length} Node</span></div>
            <div class="activity-list">
              ${(events.length ? events.slice(-8).reverse() : baseNodes.slice(0, 8)).map(ev => `
                <div class="activity-item">
                  <span class="activity-avatar">N${ev.id_node}</span>
                  <div>
                    <strong>Node #${ev.id_node} → ${Number(ev.next_hop) === 0 ? 'Base Station' : 'Hop #' + ev.next_hop} (Ronde #${ev.ronde})</strong>
                    <small style="display:block;color:var(--text-secondary)">Tanah: ${ev.lembab_tanah}% · Suhu: ${ev.suhu}°C · ${ev.tegangan}V (${ev.energi_pct}%)</small>
                  </div>
                </div>
              `).join('')}
            </div>
          </aside>
        </div>
      </div>
    `;

    const playBtn = document.getElementById('topo-play');
    const speedSel = document.getElementById('topo-speed');
    const slider = document.getElementById('topo-slider');
    const roundVal = document.getElementById('topo-round-val');
    const badge = document.getElementById('topo-badge');

    function updateRound(r) {
      state.topo.round = r;
      if (roundVal) roundVal.textContent = String(r);
      if (badge) badge.textContent = `Putaran #${r}`;
      if (slider && Number(slider.value) !== r) slider.value = String(r);

      const shift = Math.floor(r / 30) % 3;
      state.topo.nodes = baseNodes.map(n => {
        const isCh = ((n.id_node + shift) % 4 === 0) ? 1 : 0;
        const chList = baseNodes.filter(c => ((c.id_node + shift) % 4 === 0));
        const targetCh = chList[(n.id_node + Math.floor(r / 15)) % (chList.length || 1)];
        return { ...n, status_ch: isCh, next_hop: isCh ? 0 : (targetCh ? targetCh.id_node : 0), ronde: r };
      });
    }

    function resetPlayTimer() {
      if (state.topo.timerId) clearInterval(state.topo.timerId);
      if (!state.topo.playing) return;
      state.topo.timerId = setInterval(() => {
        const next = state.topo.round >= state.topo.maxRound ? 1 : state.topo.round + 1;
        updateRound(next);
      }, Math.max(150, Math.round(750 / state.topo.speed)));
    }

    playBtn?.addEventListener('click', () => {
      state.topo.playing = !state.topo.playing;
      playBtn.classList.toggle('playing', state.topo.playing);
      playBtn.textContent = state.topo.playing ? '⏸ Jeda' : '▶ Putar';
      resetPlayTimer();
    });
    speedSel?.addEventListener('change', () => { state.topo.speed = Number(speedSel.value || 1); resetPlayTimer(); });
    slider?.addEventListener('input', () => updateRound(Number(slider.value)));

    updateRound(state.topo.round);
    resetPlayTimer();
    runTopologyBurstAnimation('topology-canvas');
  }

  function runTopologyBurstAnimation(id) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const sink = { x: W * 0.5, y: 68 };

    const layout = [
      [0.31, 0.52], [0.21, 0.38], [0.48, 0.79], [0.76, 0.81], [0.28, 0.73],
      [0.50, 0.55], [0.42, 0.67], [0.33, 0.70], [0.16, 0.62], [0.60, 0.49],
      [0.55, 0.80], [0.41, 0.59], [0.83, 0.52], [0.75, 0.64], [0.68, 0.88]
    ];

    state.topo.balls = Array.from({ length: 16 }, (_, i) => ({
      idx: i % 15,
      t: Math.random(),
      spd: 0.005 + Math.random() * 0.004
    }));

    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      const nodes = state.topo.nodes || [];
      const pos = new Map([[0, sink]]);
      nodes.forEach(n => {
        const xy = layout[(n.id_node - 1) % layout.length];
        pos.set(n.id_node, { x: xy[0] * W, y: xy[1] * H });
      });

      // 1. Garis Rute Multi-Hop
      nodes.forEach(n => {
        const p1 = pos.get(n.id_node);
        const p2 = pos.get(Number(n.next_hop || 0)) || sink;
        if (!p1 || !p2) return;
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2 - 16;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
        ctx.strokeStyle = n.status_ch === 1 ? 'rgba(52, 211, 153, 0.4)' : 'rgba(148, 163, 184, 0.24)';
        ctx.lineWidth = n.status_ch === 1 ? 1.8 : 1.2;
        ctx.stroke();
      });

      // 2. Bola Cahaya Berjalan di Sepanjang Rute
      const spdMult = Math.max(0.7, state.topo.speed * 0.75);
      state.topo.balls.forEach(b => {
        if (!nodes.length) return;
        const n = nodes[b.idx % nodes.length];
        const p1 = pos.get(n.id_node);
        const p2 = pos.get(Number(n.next_hop || 0)) || sink;
        if (!p1 || !p2) return;

        b.t += b.spd * spdMult;
        if (b.t >= 1) { b.t = 0; b.idx = (b.idx + 1) % nodes.length; }

        const t = b.t, cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2 - 16;
        const x = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cx + t * t * p2.x;
        const y = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cy + t * t * p2.y;

        const g = ctx.createRadialGradient(x, y, 1, x, y, 10);
        g.addColorStop(0, '#fef08a');
        g.addColorStop(0.5, 'rgba(250, 204, 21, 0.65)');
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fef9c3'; ctx.fill();
      });

      // 3. Base Station Heksagon
      ctx.save();
      ctx.shadowColor = '#ec4899'; ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const hx = sink.x + 26 * Math.cos(a), hy = sink.y + 26 * Math.sin(a);
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.16)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ec4899'; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(sink.x, sink.y + 9, 5, 0, Math.PI * 2); ctx.fillStyle = '#fde047'; ctx.fill();
      ctx.fillStyle = '#e2e8f0'; ctx.font = '600 11px Plus Jakarta Sans'; ctx.textAlign = 'center';
      ctx.fillText('Base Station', sink.x, sink.y + 44);

      // 4. Lingkaran Node Sensor
      nodes.forEach(n => {
        const p = pos.get(n.id_node);
        if (!p) return;
        const r = n.status_ch === 1 ? 17 : 14;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.status_ch === 1 ? 'rgba(22, 101, 52, 0.9)' : 'rgba(20, 83, 45, 0.75)';
        ctx.fill();
        ctx.lineWidth = 2.2; ctx.strokeStyle = '#4ade80'; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fef08a'; ctx.fill();
        ctx.fillStyle = '#cbd5e1'; ctx.font = '600 11px Plus Jakarta Sans'; ctx.textAlign = 'center';
        ctx.fillText(`Node ${n.id_node}`, p.x, p.y + r + 14);
      });

      state.topo.rafId = requestAnimationFrame(drawFrame);
    }
    drawFrame();
  }

  // =========================================================================
  // 3. GRAFIK ENERGI & 4. PERBANDINGAN ALGORITMA
  // =========================================================================
  async function renderEnergyView() {
    stopTopoAnim();
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
          <div class="card-head"><div><h3>Indeks Kapasitas Energi per Node (energi_pct %)</h3><p class="card-sub">Garis putus-putus menampilkan rata-rata kapasitas energi jaringan (${fmtDec(avgPct, 1)}%)</p></div><span class="pill-badge">Rata-rata: ${fmtDec(avgPct, 1)}%</span></div>
          <div class="canvas-box"><canvas id="cci-bar-canvas" width="840" height="270"></canvas></div>
        </article>
        <article class="bento-card">
          <div class="card-head"><div><h3>Tren Rata-rata Tegangan (V) &amp; Kelembapan Tanah (%) per Ronde</h3><p class="card-sub">Kurva hijau menunjukkan rata-rata persentase energi sepanjang ronde</p></div></div>
          <div class="canvas-box"><canvas id="area-energy-canvas" width="840" height="240"></canvas></div>
        </article>
      </div>`;
    drawCCIBarChart('cci-bar-canvas', nodes, avgPct);
    drawAreaEnergyChart('area-energy-canvas', series);
  }

  async function renderCompareView() {
    stopTopoAnim();
    const data = await apiGet('compare');
    const rows = Array.isArray(data.rows) ? data.rows : [];
    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head"><h3>Tabel Perbandingan 6 Protokol Routing WSN</h3><span class="pill-badge">Supabase PostgreSQL</span></div>
          <div class="table-responsive">
            <table>
              <thead><tr><th>Algoritma</th><th>Node Terdaftar</th><th>Ronde Maksimum</th><th>Rata-rata Energi (%)</th><th>Rata-rata Tegangan (V)</th><th>Total Rekaman</th></tr></thead>
              <tbody>
                ${rows.map(r => `<tr><td><strong>${escapeHtml(r.algorithm)}</strong></td><td>${fmtInt(r.nodes)} Node</td><td><span class="tech-tag ch">Ronde #${fmtInt(r.max_round)}</span></td><td><strong>${fmtDec(r.avg_energi_pct, 1)}%</strong></td><td>${fmtDec(r.avg_tegangan, 2)} V</td><td><strong>${fmtInt(r.records)} baris</strong></td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>`;
  }

  function drawDonutChart(id, segments) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -Math.PI / 2; ctx.clearRect(0, 0, c.width, c.height);
    segments.forEach(seg => {
      if (seg.value <= 0) return;
      const slice = (seg.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(90, 90, 68, angle, angle + slice);
      ctx.lineWidth = 22; ctx.strokeStyle = seg.color; ctx.stroke(); angle += slice;
    });
  }

  function drawCCIBarChart(id, nodes, avgPct) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const list = nodes.length ? nodes : Array.from({ length: 15 }, (_, i) => ({ id_node: i + 1, energi_pct: 80 }));
    const padL = 44, padR = 20, padT = 28, padB = 34, plotW = W - padL - padR, plotH = H - padT - padB;
    const step = plotW / list.length, barW = Math.min(24, step * 0.55);
    list.forEach((n, i) => {
      const pct = Math.min(100, Math.max(0, Number(n.energi_pct || 0))), h = Math.max(6, (pct / 100) * plotH);
      const x = padL + i * step + (step - barW) / 2, y = padT + plotH - h;
      ctx.fillStyle = pct >= avgPct ? '#a3e635' : '#22c55e';
      ctx.beginPath(); ctx.roundRect(x, y, barW, h, 5); ctx.fill();
      ctx.fillStyle = '#829188'; ctx.font = '11px Plus Jakarta Sans'; ctx.textAlign = 'center';
      ctx.fillText(`N${n.id_node}`, x + barW / 2, H - 10);
    });
    const avgY = padT + plotH - (Math.min(100, avgPct) / 100) * plotH;
    ctx.setLineDash([5, 5]); ctx.strokeStyle = '#a3e635';
    ctx.beginPath(); ctx.moveTo(padL, avgY); ctx.lineTo(W - padR, avgY); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawAreaEnergyChart(id, series) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const vals = series.length >= 2 ? series.map(s => Number(s.avg_energi_pct || 80)) : [92, 90, 89, 88, 87, 86, 85];
    const pad = 28, plotW = W - pad * 2, plotH = H - pad * 2;
    const pts = vals.map((v, i) => ({ x: pad + (i / (vals.length - 1)) * plotW, y: pad + plotH - (Math.min(100, v) / 100) * plotH }));
    const grad = ctx.createLinearGradient(0, pad, 0, H - pad);
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.45)'); grad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
    ctx.beginPath(); ctx.moveTo(pts[0].x, H - pad); pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  async function seedDemoData() {
    try {
      showFeedback('Menambahkan 15 rekaman node uji ke Supabase…');
      const res = await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=seed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengisi data uji');
      showFeedback(data.message);
      await loadActiveView();
    } catch (err) { showFeedback(err.message, true); }
  }

  async function openLogModal(nodeId = 0) {
    if (!el.logDialog) return;
    state.logState = { node: nodeId, cursor: 0, round: 0, order: 'desc', loading: false, next: null };
    el.logTitle.textContent = nodeId > 0 ? `Riwayat Node #${nodeId}` : 'Seluruh Riwayat Rekaman WSN';
    el.logContext.textContent = `Tabel: data_${state.algo}`;
    el.logHead.innerHTML = ''; el.logBody.innerHTML = '';
    el.downloadLog.href = `${API_URL}?algo=${encodeURIComponent(state.algo)}&action=export&node=${nodeId}`;
    if (!el.logDialog.open) el.logDialog.showModal();
    await loadMoreHistory(true);
  }

  async function loadMoreHistory(reset = false) {
    const st = state.logState; if (st.loading) return;
    st.loading = true; el.logStatus.textContent = 'Memuat…';
    try {
      const res = await apiGet('history', { node: st.node, cursor: reset ? 0 : (st.next || 0), order: st.order });
      const rows = Array.isArray(res.rows) ? res.rows : []; st.next = res.next || null;
      if (reset && rows.length) {
        const cols = Object.keys(rows[0]);
        el.logHead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      }
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        el.logBody.insertAdjacentHTML('beforeend', rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join(''));
        el.logStatus.textContent = st.next ? 'Gulir ke bawah untuk memuat lagi…' : 'Semua data ditampilkan.';
      } else if (reset) el.logStatus.textContent = 'Belum ada rekaman log.';
    } catch (err) { el.logStatus.textContent = err.message; }
    finally { st.loading = false; }
  }

  async function loadActiveView() {
    el.content?.setAttribute('aria-busy', 'true');
    if (el.title) el.title.textContent = VIEW_TITLES[state.view] || 'Dashboard';
    try {
      if (state.view === 'nodes') await renderNodesView();
      else if (state.view === 'topology') await renderTopologyView();
      else if (state.view === 'energy') await renderEnergyView();
      else if (state.view === 'compare') await renderCompareView();
    } catch (err) { showFeedback(err.message, true); }
    finally { el.content?.setAttribute('aria-busy', 'false'); state.timer = REFRESH_INTERVAL; }
  }

  el.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      el.navButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.view = btn.getAttribute('data-view') || 'nodes';
      loadActiveView();
    });
  });

  el.algoSelect?.addEventListener('change', () => { state.algo = el.algoSelect.value; state.overviewData = null; loadActiveView(); });
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
        body: JSON.stringify({ node: state.pendingDelete === 'node' ? state.logState.node : 0, confirm: el.deleteWord.value.trim() })
      });
      if (!res.ok) throw new Error('Gagal menghapus rekaman.');
      el.confirmDialog?.close(); el.logDialog?.close(); loadActiveView();
    } catch (err) { el.deleteError.textContent = err.message; }
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
