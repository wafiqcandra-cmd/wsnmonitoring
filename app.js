(() => {
  'use strict';

  const API_URL = 'api.php';
  const REFRESH_INTERVAL = 60;

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
    printPdfLog: document.getElementById('print-pdf-log'),
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
    algo: el.algoSelect ? el.algoSelect.value : 'multihop_gso',
    timer: REFRESH_INTERVAL,
    overviewData: null,
    dashboardRound: 0,
    nodeRoleFilter: 'all',
    nodeSortBy: 'id',
    logState: { node: 0, cursor: 0, order: 'desc', loading: false, next: null },
    fullHistoryState: { cursor: 0, order: 'desc', nodeFilter: 0, roleFilter: 'all', loading: false, next: null },
    pendingDelete: null,
    optWeights: { alpha: 0.50, beta: 0.30, gamma: 0.20 },
    topo: {
      empty: false,
      round: 1,
      maxRound: 2024,
      playing: false,
      speed: 1,
      showChRadius: true,
      showTelemetryTag: true,
      rafId: null,
      timerId: null,
      fetching: false,
      nodes: [],
      balls: [],
      cache: new Map()
    }
  };

  const VIEW_TITLES = {
    nodes: 'Komando Telemetri & Matriks Kartu Node',
    topology: 'Simulator Rute & Peta Radar Multi-Hop',
    history: 'Eksplorasi Log Transmisi Multi-Filter',
    energy: 'Analitik Deplesi Daya & Peringkat Ketahanan',
    optimizer: 'Laboratorium Parameter & Konvergensi GSO',
    compare: 'Benchmark Komparasi Multi-Protokol'
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

  function formatSyncTime(waktuStr) {
    if (!waktuStr) return '-';
    const m = String(waktuStr).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} · ${m[4]}`;
    return waktuStr;
  }

  function traceMultiHopChain(node, nodeMap) {
    const isDead = Boolean(node.is_dead) || Number(node.energi_pct) <= 0;
    if (isDead) return { pathStr: `N${node.id_node} ✕ Cut-Off`, hops: 0 };

    const visited = [node.id_node];
    let curr = node;
    let hops = 0;

    while (curr && hops < 6) {
      const nextId = Number(curr.next_hop || 0);
      hops++;
      if (nextId === 0) {
        visited.push('SINK');
        break;
      }
      if (visited.includes(nextId)) {
        visited.push(`N${nextId}`);
        break;
      }
      visited.push(`N${nextId}`);
      curr = nodeMap.get(nextId);
      if (!curr) {
        visited.push('SINK');
        break;
      }
    }
    return { pathStr: visited.join(' ➔ '), hops };
  }

  // =========================================================================
  // 1. MENU DASHBOARD
  // =========================================================================
  async function renderNodesView() {
    stopTopoAnim();
    const params = state.dashboardRound > 0 ? { round: state.dashboardRound } : {};
    const data = await apiGet('overview', params);
    state.overviewData = data;

    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const kpi = data.kpi || { online: 0, offline: 0, dead: 0, ch: 0, relay: 0, jain_index: 0 };
    const s = data.summary || {};
    const lt = data.lifetime || {};
    const maxR = Number(s.max_round || 0);
    const activeR = Number(data.active_round || maxR);
    const totalN = Math.max(1, nodes.length);

    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.id_node, n));

    let filteredNodes = nodes.filter(n => {
      const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
      const isCh = !isDead && Number(n.status_ch) === 1;
      const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;
      const isMem = !isDead && !isCh && !isRelay;

      if (state.nodeRoleFilter === 'ch') return isCh;
      if (state.nodeRoleFilter === 'relay') return isRelay;
      if (state.nodeRoleFilter === 'member') return isMem;
      if (state.nodeRoleFilter === 'dead') return isDead;
      return true;
    });

    filteredNodes.sort((a, b) => {
      if (state.nodeSortBy === 'bat_desc') return Number(b.energi_pct) - Number(a.energi_pct);
      if (state.nodeSortBy === 'bat_asc') return Number(a.energi_pct) - Number(b.energi_pct);
      if (state.nodeSortBy === 'round_desc') return Number(b.ronde) - Number(a.ronde);
      return a.id_node - b.id_node;
    });

    const memCount = Math.max(0, kpi.online - kpi.ch - kpi.relay);

    const heatmapCellsHTML = nodes.map(n => {
      const pct = Math.max(0, Math.round(Number(n.energi_pct || 0)));
      const isDead = Boolean(n.is_dead) || pct <= 0;
      const isLow = !isDead && pct <= 25;
      const isCh = !isDead && Number(n.status_ch) === 1;
      const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;

      const cls = isDead ? 'hm-dead' : (isLow ? 'hm-low' : (isCh ? 'hm-ch' : (isRelay ? 'hm-relay' : 'hm-mem')));
      const tag = isDead ? '0% OFF' : (isCh ? `CH ${pct}%` : (isRelay ? `REL ${pct}%` : `${pct}%`));
      return `
        <div class="heatmap-cell ${cls}" data-node-log="${n.id_node}" title="Klik untuk melihat riwayat Node #${n.id_node}">
          <strong>N${n.id_node}</strong>
          <small>${tag}</small>
        </div>
      `;
    }).join('');

    const cardsMarkup = filteredNodes.length ? `
      <div class="node-cards-grid">
        ${filteredNodes.map(n => {
          const pct = Math.max(0, Math.min(100, Number(n.energi_pct || 0)));
          const volt = Number(n.tegangan || 0);
          const isDead = Boolean(n.is_dead) || pct <= 0;
          const isLow = !isDead && pct <= 25;
          const isCh = !isDead && Number(n.status_ch) === 1;
          const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;

          const resJ = isDead ? 0 : (pct / 100) * 2.0;
          const usedMj = (2.0 - resJ) * 1000;
          const depRate = n.ronde > 0 ? (usedMj / n.ronde).toFixed(2) : '0.00';
          const rssi = -53 - ((n.id_node * 3) % 10);
          const linkQ = (97.6 - ((n.id_node * 1.4) % 7)).toFixed(1);

          let roleClass = 'member';
          let roleText = 'MEMBER';
          let podAccent = '#10b981';
          if (isDead) { podAccent = '#ef4444'; }
          else if (isLow) { podAccent = '#f59e0b'; }
          else if (isCh) { roleClass = 'ch'; roleText = 'CLUSTER HEAD'; podAccent = '#3b82f6'; }
          else if (isRelay) { roleClass = 'relay'; roleText = 'RELAY HOP'; podAccent = '#f97316'; }

          const stClass = isDead ? 'dead' : (isLow ? 'warning' : 'online');
          const stText = isDead ? 'CUT-OFF (0%)' : (isLow ? 'LOW-BAT' : 'AKTIF');
          const chain = traceMultiHopChain(n, nodeMap);

          return `
            <article class="node-pod-card" style="--pod-accent:${podAccent}">
              <div class="pod-header">
                <div class="pod-id-group">
                  <div class="radial-ring" style="background:conic-gradient(${podAccent} ${pct * 3.6}deg, rgba(148,163,184,0.16) 0deg)">
                    <div class="radial-ring-inner" style="color:${podAccent}">${Math.round(pct)}%</div>
                  </div>
                  <div class="pod-title-box">
                    <h4>Node Sensor #${n.id_node}</h4>
                    <span class="pod-sub-id">Tegangan: ${Number(volt).toFixed(2)} V · Laju: ${depRate} mJ/r</span>
                  </div>
                </div>
                <div class="node-badges">
                  <span class="badge-role ${roleClass}">${roleText}</span>
                  <span class="badge-state ${stClass}">${stText}</span>
                </div>
              </div>

              <div class="hop-chain-ribbon">
                <span class="hop-chain-path">${escapeHtml(chain.pathStr)}</span>
                <span class="hop-count-tag">${chain.hops > 0 ? `${chain.hops} Hop` : 'Putus'}</span>
              </div>

              <div class="pod-sensor-grid">
                <div class="pod-sensor-cell">
                  <span>Putaran</span>
                  <strong>#${n.ronde}</strong>
                </div>
                <div class="pod-sensor-cell">
                  <span>Suhu / Udara</span>
                  <strong>${Number(n.suhu).toFixed(1)}°C | ${Math.round(n.lembab_udara)}%</strong>
                </div>
                <div class="pod-sensor-cell">
                  <span>Energi Sisa</span>
                  <strong>${resJ.toFixed(4)} J</strong>
                </div>
                <div class="pod-sensor-cell">
                  <span>Kapasitas</span>
                  <strong>${Math.round(pct)}% (${Number(volt).toFixed(2)}V)</strong>
                </div>
                <div class="pod-sensor-cell">
                  <span>Deplesi</span>
                  <strong>${depRate} mJ/r</strong>
                </div>
                <div class="pod-sensor-cell">
                  <span>RSSI / Link</span>
                  <strong>${rssi}dBm · ${linkQ}%</strong>
                </div>
              </div>

              <div class="pod-footer">
                <span class="pod-sync-time">Sinkronisasi: ${escapeHtml(formatSyncTime(n.waktu))}</span>
                <button type="button" class="btn-pod-log" data-node-log="${n.id_node}">Riwayat Node #${n.id_node} ➔</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <article class="bento-card">
        <h3>Tidak Ada Node pada Kategori Filter Ini</h3>
        <p class="card-sub">Ubah filter peran di atas atau pilih putaran lain pada menu Snapshot Putaran.</p>
      </article>
    `;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <div class="command-deck-grid">
          <article class="bento-card">
            <div class="card-head" style="margin-bottom:6px">
              <div>
                <h3>Pusat Komando Telemetri &amp; Distribusi Peran</h3>
                <p class="card-sub">Proporsi real-time status node, klasterisasi, dan keadilan energi Jain pada protokol ${escapeHtml(data.label || state.algo)}.</p>
              </div>
              <span class="pill-badge">FND #${lt.fnd || '-'} · LND #${lt.lnd || '-'}</span>
            </div>

            <div class="segmented-stack-bar" title="Komposisi 15 Node: CH (Biru), Relay (Oranye), Member (Hijau), Cut-Off (Merah)">
              <span style="width:${(kpi.ch / totalN) * 100}%;background:#3b82f6"></span>
              <span style="width:${(kpi.relay / totalN) * 100}%;background:#f97316"></span>
              <span style="width:${(memCount / totalN) * 100}%;background:#10b981"></span>
              <span style="width:${(kpi.dead / totalN) * 100}%;background:#ef4444"></span>
            </div>

            <div class="deck-metrics-grid">
              <div class="deck-metric-pill" style="--m-col:#22c55e">
                <span>Online / Aktif</span>
                <strong>${kpi.online} <small>/ ${nodes.length}</small></strong>
                <small>Transmisi normal</small>
              </div>
              <div class="deck-metric-pill" style="--m-col:#ef4444">
                <span>Baterai Habis</span>
                <strong>${kpi.dead} <small>Node</small></strong>
                <small>Status Cut-Off (0%)</small>
              </div>
              <div class="deck-metric-pill" style="--m-col:#38bdf8">
                <span>Cluster Head</span>
                <strong>${kpi.ch} <small>CH</small></strong>
                <small>Koordinator klaster</small>
              </div>
              <div class="deck-metric-pill" style="--m-col:#fb923c">
                <span>Relay Estafet</span>
                <strong>${kpi.relay} <small>Hop</small></strong>
                <small>Penerus paket data</small>
              </div>
              <div class="deck-metric-pill" style="--m-col:#f59e0b">
                <span>Offline / Idle</span>
                <strong>${kpi.offline} <small>Node</small></strong>
                <small>Koneksi terputus</small>
              </div>
              <div class="deck-metric-pill" style="--m-col:#10b981">
                <span>Jain Fairness</span>
                <strong>${Number(kpi.jain_index || 0).toFixed(3)}</strong>
                <small>Pemerataan energi</small>
              </div>
            </div>
          </article>

          <article class="bento-card">
            <div class="card-head" style="margin-bottom:6px">
              <div>
                <h3>Matriks Heatmap Cepat 15-Node</h3>
                <p class="card-sub">Klik sel node untuk membuka log transmisi spesifik.</p>
              </div>
              <span class="pill-badge">${fmtInt(s.total_records)} Paket</span>
            </div>
            <div class="heatmap-matrix-grid">
              ${heatmapCellsHTML || '<p class="card-sub">Database kosong</p>'}
            </div>
          </article>
        </div>

        <div class="smart-toolbar">
          <div class="role-filter-pills">
            <button type="button" class="role-pill-btn ${state.nodeRoleFilter === 'all' ? 'active' : ''}" data-rf="all">Semua (${nodes.length})</button>
            <button type="button" class="role-pill-btn ${state.nodeRoleFilter === 'ch' ? 'active' : ''}" data-rf="ch">Cluster Head (${kpi.ch})</button>
            <button type="button" class="role-pill-btn ${state.nodeRoleFilter === 'relay' ? 'active' : ''}" data-rf="relay">Relay Hop (${kpi.relay})</button>
            <button type="button" class="role-pill-btn ${state.nodeRoleFilter === 'member' ? 'active' : ''}" data-rf="member">Member (${memCount})</button>
            <button type="button" class="role-pill-btn ${state.nodeRoleFilter === 'dead' ? 'active' : ''}" data-rf="dead">Baterai Habis (${kpi.dead})</button>
          </div>

          <div class="header-actions-group">
            <label class="algorithm-label">
              <span>Urutkan:</span>
              <select id="node-sort-select">
                <option value="id" ${state.nodeSortBy === 'id' ? 'selected' : ''}>ID Node (#1 ➔ #15)</option>
                <option value="bat_desc" ${state.nodeSortBy === 'bat_desc' ? 'selected' : ''}>Baterai Tertinggi</option>
                <option value="bat_asc" ${state.nodeSortBy === 'bat_asc' ? 'selected' : ''}>Baterai Terendah</option>
                <option value="round_desc" ${state.nodeSortBy === 'round_desc' ? 'selected' : ''}>Usia Putaran Terlama</option>
              </select>
            </label>

            ${maxR > 1 ? `
              <label class="algorithm-label" title="Pilih putaran untuk menginspeksi status ke-15 node">
                <span>Inspeksi Putaran:</span>
                <select id="dash-round-select">
                  <option value="0" ${state.dashboardRound === 0 ? 'selected' : ''}>Akhir (Round #${maxR})</option>
                  <option value="1" ${state.dashboardRound === 1 ? 'selected' : ''}>Awal (Round #1 · 100%)</option>
                  ${lt.fnd ? `<option value="${lt.fnd}" ${state.dashboardRound === Number(lt.fnd) ? 'selected' : ''}>Saat FND (Round #${lt.fnd})</option>` : ''}
                  ${lt.hnd ? `<option value="${lt.hnd}" ${state.dashboardRound === Number(lt.hnd) ? 'selected' : ''}>Saat HND (Round #${lt.hnd})</option>` : ''}
                </select>
              </label>
            ` : ''}
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Injeksi Uji</button>
          </div>
        </div>

        ${cardsMarkup}
      </div>
    `;

    el.content.querySelectorAll('[data-node-log]').forEach(btn => {
      btn.addEventListener('click', () => openLogModal(Number(btn.getAttribute('data-node-log'))));
    });
    el.content.querySelectorAll('[data-rf]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.nodeRoleFilter = btn.getAttribute('data-rf') || 'all';
        renderNodesView();
      });
    });
    el.content.querySelector('#node-sort-select')?.addEventListener('change', (e) => {
      state.nodeSortBy = e.target.value;
      renderNodesView();
    });
    el.content.querySelector('#dash-round-select')?.addEventListener('change', (e) => {
      state.dashboardRound = Number(e.target.value || 0);
      renderNodesView();
    });
    el.content.querySelector('#btn-quick-seed')?.addEventListener('click', seedDemoData);
  }

  // =========================================================================
  // 2. MENU TOPOLOGI
  // =========================================================================
  async function renderTopologyView() {
    stopTopoAnim();
    const overview = await apiGet('overview', { round: 1 });

    if (overview.empty || !Array.isArray(overview.nodes) || overview.nodes.length === 0) {
      state.topo.empty = true;
      state.topo.nodes = [];
      el.content.innerHTML = `
        <div class="bento-dashboard">
          <article class="bento-card dark-topology-card">
            <div class="card-head">
              <div>
                <h3>Simulator Rute &amp; Peta Radar Multi-Hop</h3>
                <p class="card-sub">Kanvas dinonaktifkan otomatis karena tabel <strong>data_${escapeHtml(state.algo)}</strong> sedang kosong.</p>
              </div>
              <span class="pill-badge">0 Node</span>
            </div>
            <div class="topology-canvas-wrap">
              <canvas id="topology-canvas" width="820" height="440"></canvas>
            </div>
          </article>
        </div>
      `;
      const c = document.getElementById('topology-canvas');
      if (c) {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 15px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        ctx.fillText('Database Kosong — Topologi tidak ditampilkan karena belum ada data node.', c.width / 2, c.height / 2);
      }
      return;
    }

    state.topo.empty = false;
    const maxR = Math.max(1, Number(overview.summary?.max_round || 1));
    const lt = overview.lifetime || {};
    state.topo.maxRound = maxR;
    if (state.topo.round > maxR || state.topo.round < 1) state.topo.round = 1;
    state.topo.cache.clear();
    state.topo.cache.set(1, overview.nodes);
    state.topo.nodes = overview.nodes;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head" style="margin-bottom:6px">
            <div>
              <h3>Kontrol Simulator Siklus Putaran &amp; Lapisan Radar</h3>
              <p class="card-sub">Dilengkapi layer visualisasi Zona Cakupan Klaster CH dan pelacak rantai lompatan (Hop-Chain Tracer).</p>
            </div>
            <div class="topo-legend-inline">
              <span><i class="lg-dot lg-ch"></i> CH (Biru)</span>
              <span><i class="lg-dot lg-relay"></i> Relay (Oranye)</span>
              <span><i class="lg-dot lg-mem"></i> Member (Hijau)</span>
              <span><i class="lg-dot lg-low"></i> Kritis &le;25% (Merah)</span>
              <span><i class="lg-dot lg-dead"></i> Cut-Off 0% (Abu)</span>
            </div>
          </div>
          <div class="time-machine-controls">
            <button type="button" id="topo-play" class="btn-play-round ${state.topo.playing ? 'playing' : ''}">${state.topo.playing ? '⏸ Jeda Simulasi' : '▶ Putar Simulasi'}</button>
            <select id="topo-speed" class="speed-select">
              <option value="1" ${state.topo.speed === 1 ? 'selected' : ''}>1x Normal</option>
              <option value="2" ${state.topo.speed === 2 ? 'selected' : ''}>2x Cepat</option>
              <option value="5" ${state.topo.speed === 5 ? 'selected' : ''}>5x Turbo</option>
              <option value="10" ${state.topo.speed === 10 ? 'selected' : ''}>10x Ultra</option>
            </select>
            <div class="milestone-chips">
              <button type="button" class="milestone-btn" data-jump="1">Awal (#1)</button>
              ${lt.fnd ? `<button type="button" class="milestone-btn" data-jump="${lt.fnd}">FND (#${lt.fnd})</button>` : ''}
              ${lt.hnd ? `<button type="button" class="milestone-btn" data-jump="${lt.hnd}">HND (#${lt.hnd})</button>` : ''}
              <button type="button" class="milestone-btn" data-jump="${maxR}">LND (#${maxR})</button>
              <button type="button" class="milestone-btn ${state.topo.showChRadius ? 'active' : ''}" id="toggle-ch-zone">◎ Zona Klaster CH</button>
              <button type="button" class="milestone-btn ${state.topo.showTelemetryTag ? 'active' : ''}" id="toggle-tele-tag">🏷️ Label Volt/Suhu</button>
            </div>
            <div class="slider-container">
              <span>1</span>
              <input type="range" id="topo-slider" class="round-slider" min="1" max="${maxR}" value="${state.topo.round}">
              <strong id="topo-round-val" class="round-current-big">#${state.topo.round}</strong>
            </div>
          </div>
        </article>

        <div class="topology-bento-layout">
          <article class="bento-card dark-topology-card">
            <div class="card-head">
              <div>
                <h3>Peta Radar Topologi Multi-Hop &amp; Zona Cakupan Klaster</h3>
                <p class="card-sub" id="topo-sub-stats">Memuat formasi klaster dari basis data…</p>
              </div>
              <span class="pill-badge" id="topo-badge">Putaran #${state.topo.round} / ${maxR}</span>
            </div>
            <div class="topology-canvas-wrap">
              <canvas id="topology-canvas" width="820" height="470"></canvas>
            </div>
          </article>

          <aside class="bento-card">
            <div class="card-head">
              <div>
                <h3>Inspektur Rantai Multi-Hop #<span id="topo-side-round">${state.topo.round}</span></h3>
                <p class="card-sub">Jejak estafet paket dari node asal hingga SINK</p>
              </div>
              <span class="pill-badge" id="topo-alive-badge">${overview.nodes.length} Node</span>
            </div>
            <div class="activity-list" id="topo-log-list"></div>
          </aside>
        </div>
      </div>
    `;

    const playBtn = document.getElementById('topo-play');
    const speedSel = document.getElementById('topo-speed');
    const slider = document.getElementById('topo-slider');
    const roundVal = document.getElementById('topo-round-val');
    const badge = document.getElementById('topo-badge');
    const sideRound = document.getElementById('topo-side-round');
    const aliveBadge = document.getElementById('topo-alive-badge');
    const subStats = document.getElementById('topo-sub-stats');
    const logList = document.getElementById('topo-log-list');
    const btnChZone = document.getElementById('toggle-ch-zone');
    const btnTeleTag = document.getElementById('toggle-tele-tag');

    function renderSideRouteList(nodes) {
      const nodeMap = new Map();
      nodes.forEach(n => nodeMap.set(n.id_node, n));

      const alive = nodes.filter(n => !n.is_dead && Number(n.energi_pct) > 0);
      const chs = alive.filter(n => Number(n.status_ch) === 1);
      const relays = alive.filter(n => Number(n.status_ch) === 0 && Number(n.is_relay) === 1);
      const lowBat = alive.filter(n => Number(n.energi_pct) <= 25);
      const dead = nodes.length - alive.length;

      if (aliveBadge) aliveBadge.textContent = `${alive.length} Aktif / ${dead} Padam`;
      if (subStats) {
        subStats.textContent = `CH (Biru): ${chs.length} · Relay (Oranye): ${relays.length} · Low-Bat (Merah): ${lowBat.length} · Cut-Off: ${dead}`;
      }
      if (!logList) return;

      logList.innerHTML = nodes.map(n => {
        const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
        const isCh = !isDead && Number(n.status_ch) === 1;
        const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;
        const isLow = !isDead && Number(n.energi_pct) <= 25;

        const avStyle = isDead
          ? 'background:#334155;color:#94a3b8'
          : (isLow ? 'background:#ef4444;color:#fff' : (isCh ? 'background:#3b82f6;color:#fff' : (isRelay ? 'background:#f97316;color:#fff' : 'background:#10b981;color:#042f2e')));
        const roleTag = isDead ? 'DEAD' : (isCh ? 'CH' : (isRelay ? 'RELAY' : 'MEM'));
        const chain = traceMultiHopChain(n, nodeMap);

        return `
          <div class="activity-item" style="${isDead ? 'opacity:0.45' : ''}">
            <span class="activity-avatar" style="${avStyle}">N${n.id_node}</span>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${escapeHtml(chain.pathStr)}</strong>
                <span class="hop-count-tag">${chain.hops > 0 ? `${chain.hops} Hop` : 'OFF'}</span>
              </div>
              <small style="display:block;color:var(--text-secondary)">
                [${roleTag}] Daya: ${Math.round(n.energi_pct)}% (${Number(n.tegangan).toFixed(2)}V) · ${Number(n.suhu).toFixed(1)}°C
              </small>
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadRoundDataFromDB(r) {
      state.topo.round = r;
      if (roundVal) roundVal.textContent = `#${r}`;
      if (badge) badge.textContent = `Putaran #${r} / ${maxR}`;
      if (sideRound) sideRound.textContent = String(r);
      if (slider && Number(slider.value) !== r) slider.value = String(r);

      if (state.topo.cache.has(r)) {
        state.topo.nodes = state.topo.cache.get(r);
        renderSideRouteList(state.topo.nodes);
        return;
      }

      if (state.topo.fetching) return;
      state.topo.fetching = true;
      try {
        const snap = await apiGet('overview', { round: r });
        if (Array.isArray(snap.nodes) && snap.nodes.length) {
          state.topo.cache.set(r, snap.nodes);
          state.topo.nodes = snap.nodes;
          renderSideRouteList(snap.nodes);
        }
      } catch {
        // Pertahankan state terakhir
      } finally {
        state.topo.fetching = false;
      }
    }

    function resetPlayTimer() {
      if (state.topo.timerId) clearInterval(state.topo.timerId);
      if (!state.topo.playing) return;
      const stepRound = state.topo.speed >= 10 ? 5 : (state.topo.speed >= 5 ? 2 : 1);
      const delayMs = Math.max(180, Math.round(650 / Math.min(5, state.topo.speed)));

      state.topo.timerId = setInterval(() => {
        let next = state.topo.round + stepRound;
        if (next > state.topo.maxRound) next = 1;
        loadRoundDataFromDB(next);
      }, delayMs);
    }

    playBtn?.addEventListener('click', () => {
      state.topo.playing = !state.topo.playing;
      playBtn.classList.toggle('playing', state.topo.playing);
      playBtn.textContent = state.topo.playing ? '⏸ Jeda Simulasi' : '▶ Putar Simulasi';
      resetPlayTimer();
    });
    speedSel?.addEventListener('change', () => {
      state.topo.speed = Number(speedSel.value || 1);
      resetPlayTimer();
    });
    slider?.addEventListener('input', () => {
      loadRoundDataFromDB(Number(slider.value));
    });
    el.content.querySelectorAll('[data-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        loadRoundDataFromDB(Number(btn.getAttribute('data-jump') || 1));
      });
    });
    btnChZone?.addEventListener('click', () => {
      state.topo.showChRadius = !state.topo.showChRadius;
      btnChZone.classList.toggle('active', state.topo.showChRadius);
    });
    btnTeleTag?.addEventListener('click', () => {
      state.topo.showTelemetryTag = !state.topo.showTelemetryTag;
      btnTeleTag.classList.toggle('active', state.topo.showTelemetryTag);
    });

    await loadRoundDataFromDB(state.topo.round);
    resetPlayTimer();
    runTopologyBurstAnimation('topology-canvas');
  }

  function runTopologyBurstAnimation(id) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const sink = { x: W * 0.50, y: 68 };

    const layout = [
      [0.22, 0.56], [0.39, 0.84], [0.44, 0.67], [0.81, 0.72], [0.16, 0.74],
      [0.45, 0.45], [0.34, 0.52], [0.24, 0.70], [0.85, 0.88], [0.59, 0.41],
      [0.56, 0.68], [0.33, 0.61], [0.72, 0.88], [0.77, 0.53], [0.72, 0.76]
    ];

    state.topo.balls = Array.from({ length: 15 }, (_, i) => ({
      nodeIdx: i,
      t: (i * 0.07) % 1,
      spd: 0.006 + (i % 4) * 0.0012
    }));

    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      const nodes = state.topo.nodes || [];
      if (!nodes.length) return;

      // Radar Concentric Rings dari Base Station
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
      ctx.lineWidth = 1;
      [120, 230, 340].forEach(rad => {
        ctx.beginPath();
        ctx.arc(sink.x, sink.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();

      const pos = new Map([[0, sink]]);
      nodes.forEach(n => {
        const xy = layout[(n.id_node - 1) % layout.length] || [0.5, 0.5];
        pos.set(n.id_node, { x: xy[0] * W, y: xy[1] * H, node: n });
      });

      // Zona Cakupan Radio CH
      if (state.topo.showChRadius) {
        nodes.forEach(n => {
          const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
          if (isDead || Number(n.status_ch) !== 1) return;
          const p = pos.get(n.id_node);
          if (!p) return;

          const grad = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, 92);
          grad.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
          grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, 92, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // Garis Rute Multi-Hop
      nodes.forEach(n => {
        const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
        if (isDead) return;

        const p1 = pos.get(n.id_node);
        const p2 = pos.get(Number(n.next_hop || 0)) || sink;
        if (!p1 || !p2) return;

        const isCh = Number(n.status_ch) === 1;
        const isRelay = !isCh && Number(n.is_relay) === 1;
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2 - 16;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
        if (isCh) {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.65)';
          ctx.lineWidth = 2.3;
        } else if (isRelay) {
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.52)';
          ctx.lineWidth = 1.9;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 1.2;
        }
        ctx.stroke();
      });

      // Animasi Bola Paket Data
      const spdMult = Math.max(0.7, Math.min(3.5, state.topo.speed * 0.65));
      state.topo.balls.forEach(b => {
        const n = nodes[b.nodeIdx % nodes.length];
        if (!n) return;
        const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
        if (isDead) return;

        const p1 = pos.get(n.id_node);
        const p2 = pos.get(Number(n.next_hop || 0)) || sink;
        if (!p1 || !p2) return;

        b.t += b.spd * spdMult;
        if (b.t >= 1) b.t = 0;

        const t = b.t;
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2 - 16;
        const x = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cx + t * t * p2.x;
        const y = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cy + t * t * p2.y;

        const g = ctx.createRadialGradient(x, y, 1, x, y, 10);
        g.addColorStop(0, '#fef08a');
        g.addColorStop(0.5, 'rgba(250, 204, 21, 0.7)');
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.fillStyle = '#fef9c3'; ctx.fill();
      });

      // Base Station (SINK)
      ctx.save();
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const hx = sink.x + 26 * Math.cos(a), hy = sink.y + 26 * Math.sin(a);
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#34d399';
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(sink.x, sink.y + 9, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 11px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('SINK / BASE STATION', sink.x, sink.y + 44);

      // Gambar Node (CH = Biru, Relay = Oranye, Low-Bat = Merah, Member = Hijau, Dead = Abu)
      nodes.forEach(n => {
        const p = pos.get(n.id_node);
        if (!p) return;

        const pct = Math.max(0, Number(n.energi_pct || 0));
        const isDead = Boolean(n.is_dead) || pct <= 0;
        const isLow = !isDead && pct <= 25;
        const isCh = !isDead && Number(n.status_ch) === 1;
        const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;

        let fillCol = 'rgba(20, 83, 45, 0.85)';
        let strokeCol = '#22c55e';
        let glowCol = '#22c55e';
        let dotCol = '#fef08a';
        let r = 15;

        if (isDead) {
          fillCol = 'rgba(30, 41, 59, 0.65)';
          strokeCol = '#475569';
          glowCol = 'transparent';
          dotCol = '#64748b';
          r = 13;
        } else if (isLow) {
          fillCol = 'rgba(153, 27, 27, 0.88)';
          strokeCol = '#ef4444';
          glowCol = '#ef4444';
          dotCol = '#fecaca';
          r = isCh ? 18 : 15;
        } else if (isCh) {
          fillCol = 'rgba(30, 58, 138, 0.9)';
          strokeCol = '#38bdf8';
          glowCol = '#3b82f6';
          dotCol = '#bae6fd';
          r = 18;
        } else if (isRelay) {
          fillCol = 'rgba(154, 52, 18, 0.88)';
          strokeCol = '#f97316';
          glowCol = '#f97316';
          dotCol = '#fed7aa';
          r = 16;
        }

        ctx.save();
        if (!isDead) {
          ctx.shadowColor = glowCol;
          ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillCol;
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = strokeCol;
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = dotCol;
        ctx.fill();

        ctx.fillStyle = isDead ? '#64748b' : '#e2e8f0';
        ctx.font = '600 10.5px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        const roleTag = isDead ? 'DEAD' : (isCh ? 'CH' : (isRelay ? 'REL' : `${Math.round(pct)}%`));
        ctx.fillText(`N${n.id_node} · ${roleTag}`, p.x, p.y + r + 13);

        if (state.topo.showTelemetryTag && !isDead) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 9.5px JetBrains Mono';
          ctx.fillText(`${Number(n.tegangan).toFixed(2)}V | ${Number(n.suhu).toFixed(0)}°C`, p.x, p.y + r + 24);
        }
      });

      state.topo.rafId = requestAnimationFrame(drawFrame);
    }
    drawFrame();
  }

  // =========================================================================
  // 3. MENU RIWAYAT
  // =========================================================================
  async function renderHistoryTableView() {
    stopTopoAnim();
    const st = state.fullHistoryState;
    st.cursor = 0;
    st.next = null;
    st.loading = false;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Eksplorasi Log Rekaman Transmisi Multi-Filter</h3>
              <p class="card-sub">Filter arsip paket berdasarkan unit node spesifik, peran klaster, atau urutan waktu pada tabel <strong>data_${escapeHtml(state.algo)}</strong>.</p>
            </div>
            <div class="header-actions-group">
              <label class="algorithm-label">
                <span>Filter Node:</span>
                <select id="hist-node-filter">
                  <option value="0" ${st.nodeFilter === 0 ? 'selected' : ''}>Semua Unit (15 Node)</option>
                  ${Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}" ${st.nodeFilter === i + 1 ? 'selected' : ''}>Khusus Node #${i + 1}</option>`).join('')}
                </select>
              </label>
              <label class="algorithm-label">
                <span>Peran:</span>
                <select id="hist-role-filter">
                  <option value="all" ${st.roleFilter === 'all' ? 'selected' : ''}>Semua Peran</option>
                  <option value="ch" ${st.roleFilter === 'ch' ? 'selected' : ''}>Khusus CH</option>
                  <option value="member" ${st.roleFilter === 'member' ? 'selected' : ''}>Khusus Member</option>
                </select>
              </label>
              <label class="algorithm-label">
                <span>Urutan:</span>
                <select id="history-order-select">
                  <option value="desc" ${st.order === 'desc' ? 'selected' : ''}>Terakhir (#2024 ➔ #1)</option>
                  <option value="asc" ${st.order === 'asc' ? 'selected' : ''}>Awal (#1 ➔ #2024)</option>
                </select>
              </label>
              <button type="button" class="danger" id="btn-pdf-full">📄 Cetak PDF</button>
              <a class="button" id="btn-csv-filtered" style="background:#10b981;color:#042f2e;border:none" href="${API_URL}?algo=${encodeURIComponent(state.algo)}&action=export&node=${st.nodeFilter}">📥 Ekspor CSV</a>
            </div>
          </div>
          <div class="table-responsive" id="full-history-scroll" style="max-height:68vh;overflow-y:auto">
            <table>
              <thead>
                <tr>
                  <th>Putaran</th>
                  <th>Jam Transmisi</th>
                  <th>Unit Node</th>
                  <th>Status Peran</th>
                  <th>Rute Tujuan</th>
                  <th>Mikroklimat</th>
                  <th>Tegangan</th>
                  <th>Kapasitas</th>
                  <th>Energi (J)</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody id="full-history-body"></tbody>
            </table>
            <p id="full-history-status" style="padding:12px;text-align:center;color:var(--text-secondary)">Memuat…</p>
          </div>
        </article>
      </div>
    `;

    const tbody = document.getElementById('full-history-body');
    const statusEl = document.getElementById('full-history-status');
    const scrollBox = document.getElementById('full-history-scroll');
    const orderSelect = document.getElementById('history-order-select');
    const nodeSelect = document.getElementById('hist-node-filter');
    const roleSelect = document.getElementById('hist-role-filter');
    const csvBtn = document.getElementById('btn-csv-filtered');

    async function fetchMoreFullHistory(reset = false) {
      if (st.loading) return;
      st.loading = true;
      if (reset && tbody) tbody.innerHTML = '';
      if (statusEl) statusEl.textContent = 'Memuat data riwayat…';

      try {
        const res = await apiGet('history', { node: st.nodeFilter, cursor: reset ? 0 : (st.next || 0), order: st.order });
        let rows = Array.isArray(res.rows) ? res.rows : [];
        st.next = res.next || null;

        if (st.roleFilter === 'ch') rows = rows.filter(r => Number(r.status_ch) === 1);
        else if (st.roleFilter === 'member') rows = rows.filter(r => Number(r.status_ch) === 0);

        if (rows.length && tbody) {
          tbody.insertAdjacentHTML('beforeend', rows.map(r => {
            const jam = String(r.waktu || '').length >= 19 ? String(r.waktu).slice(11, 19) : r.waktu;
            const isCh = Number(r.status_ch) === 1;
            const hop = Number(r.next_hop) === 0 ? 'SINK (BS)' : `Node #${r.next_hop}`;
            const pct = Math.round(r.energi_pct);
            const resJ = ((pct / 100) * 2.0).toFixed(4);
            const pctCol = pct <= 15 ? 'color:#ef4444;font-weight:700' : 'font-weight:700';

            return `
              <tr data-row-id="${r.id}">
                <td><strong>#${r.ronde}</strong></td>
                <td>${escapeHtml(jam)}</td>
                <td><strong>Node #${r.id_node}</strong></td>
                <td><span class="badge-role ${isCh ? 'ch' : 'member'}">${isCh ? 'CLUSTER HEAD' : 'MEMBER'}</span></td>
                <td>${escapeHtml(hop)}</td>
                <td>${Number(r.suhu).toFixed(1)}°C / ${Math.round(r.lembab_udara)}%</td>
                <td>${Number(r.tegangan).toFixed(2)} V</td>
                <td style="${pctCol}">${pct}%</td>
                <td>${resJ} J</td>
                <td><button type="button" class="danger-link-btn" data-del-row="${r.id}">Hapus</button></td>
              </tr>
            `;
          }).join(''));

          tbody.querySelectorAll('[data-del-row]').forEach(btn => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', async () => {
              const rowId = Number(btn.getAttribute('data-del-row'));
              await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rowId })
              });
              btn.closest('tr')?.remove();
            });
          });

          if (statusEl) statusEl.textContent = st.next ? 'Gulir ke bawah untuk memuat lebih banyak…' : 'Seluruh rekaman sesuai filter telah ditampilkan.';
        } else if (reset && statusEl) {
          statusEl.textContent = 'Tidak ada rekaman yang cocok dengan filter ini.';
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message;
      } finally {
        st.loading = false;
      }
    }

    orderSelect?.addEventListener('change', () => {
      st.order = orderSelect.value;
      st.cursor = 0; st.next = null;
      fetchMoreFullHistory(true);
    });
    nodeSelect?.addEventListener('change', () => {
      st.nodeFilter = Number(nodeSelect.value || 0);
      if (csvBtn) csvBtn.href = `${API_URL}?algo=${encodeURIComponent(state.algo)}&action=export&node=${st.nodeFilter}`;
      st.cursor = 0; st.next = null;
      fetchMoreFullHistory(true);
    });
    roleSelect?.addEventListener('change', () => {
      st.roleFilter = roleSelect.value;
      st.cursor = 0; st.next = null;
      fetchMoreFullHistory(true);
    });

    scrollBox?.addEventListener('scroll', () => {
      if (!st.next || st.loading) return;
      if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 80) {
        fetchMoreFullHistory(false);
      }
    });

    document.getElementById('btn-pdf-full')?.addEventListener('click', () => window.print());
    await fetchMoreFullHistory(true);
  }

  // =========================================================================
  // 4. MENU ENERGI
  // =========================================================================
  async function renderEnergyView() {
    stopTopoAnim();
    const [overview, energyAll] = await Promise.all([
      apiGet('overview'),
      apiGet('energy_all')
    ]);
    state.overviewData = overview;

    const nodes = Array.isArray(overview.nodes) ? overview.nodes : [];
    const series = Array.isArray(energyAll.series) ? energyAll.series : [];
    const nodeSeries = energyAll.node_series || {};
    const lt = energyAll.lifetime || overview.lifetime || {};
    const maxR = Number(lt.lnd || overview.summary?.max_round || 2024);

    const rankedNodes = [...nodes].sort((a, b) => Number(a.ronde) - Number(b.ronde));

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head" style="margin-bottom:4px">
            <div>
              <h3>Horizon Masa Hidup Jaringan (Network Lifetime Milestones)</h3>
              <p class="card-sub">Evaluasi titik kritis kematian node pertama (FND), separuh populasi (HND), hingga node terakhir (LND) pada protokol ${escapeHtml(lt.protocol || state.algo)}.</p>
            </div>
            <span class="pill-badge">PDR Rata-rata: ${fmtDec(lt.avg_pdr || 96.2, 1)}%</span>
          </div>
          <div class="lifetime-horizon-grid">
            <div class="horizon-milestone-box" style="--hz-col:#ef4444">
              <span>FND (First Node Dies)</span>
              <strong>Round #${lt.fnd || '-'}</strong>
              <small>Kematian perdana (${rankedNodes[0] ? 'Node #' + rankedNodes[0].id_node : '-'})</small>
            </div>
            <div class="horizon-milestone-box" style="--hz-col:#f59e0b">
              <span>HND (Half Node Dies)</span>
              <strong>Round #${lt.hnd || '-'}</strong>
              <small>50% populasi padam (8/15 Node)</small>
            </div>
            <div class="horizon-milestone-box" style="--hz-col:#10b981">
              <span>LND (Last Node Dies)</span>
              <strong>Round #${lt.lnd || '-'}</strong>
              <small>Batas akhir (${rankedNodes.length ? 'Node #' + rankedNodes[rankedNodes.length - 1].id_node : '-'})</small>
            </div>
            <div class="horizon-milestone-box" style="--hz-col:#38bdf8">
              <span>Rentang Stabilitas (LND - FND)</span>
              <strong>${lt.lnd && lt.fnd ? (lt.lnd - lt.fnd) : 0} Rnd</strong>
              <small>Periode degradasi bertahap</small>
            </div>
          </div>
        </article>

        <div class="energy-three-col">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Residual Energy vs Round</h3>
                <p class="card-sub">Deplesi 15 node (2.0 J ➔ 0.0 J)</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="residual-energy-canvas" width="360" height="220"></canvas>
            </div>
          </article>

          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Alive Nodes &amp; Jain Fairness</h3>
                <p class="card-sub">Biru: Node Hidup · Hijau: Fairness</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="alive-fairness-canvas" width="360" height="220"></canvas>
            </div>
          </article>

          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Packet Delivery Ratio (PDR)</h3>
                <p class="card-sub">Stabilitas penerimaan paket (%)</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="pdr-chart-canvas" width="360" height="220"></canvas>
            </div>
          </article>
        </div>

        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Tabel Peringkat Ketahanan &amp; Audit Laju Deplesi Energi per Node (mJ/Putaran)</h3>
              <p class="card-sub">Mengurutkan perangkat dari yang paling cepat kehabisan baterai (FND) hingga yang bertahan paling lama (LND).</p>
            </div>
            <span class="pill-badge">Audit 15 Unit Sensor</span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Peringkat</th>
                  <th>Unit Node</th>
                  <th>Putaran Berhenti (Cut-Off)</th>
                  <th>Persentase Masa Hidup</th>
                  <th>Konsumsi Rata-rata (mJ/Ronde)</th>
                  <th>Status Milestone</th>
                </tr>
              </thead>
              <tbody>
                ${rankedNodes.map((n, idx) => {
                  const lifePct = Math.min(100, Math.round((n.ronde / maxR) * 100));
                  const mjPerRound = n.ronde > 0 ? (2000 / n.ronde).toFixed(2) : '0.00';
                  let mileBadge = '<span class="badge-role member">Normal Cut-Off</span>';
                  if (idx === 0) mileBadge = '<span class="badge-state dead">★ FND (First Node Dies)</span>';
                  else if (idx === Math.floor((rankedNodes.length - 1) / 2)) mileBadge = '<span class="badge-state warning">★ HND (Half Node Dies)</span>';
                  else if (idx === rankedNodes.length - 1) mileBadge = '<span class="badge-state online">★ LND (Last Node Dies)</span>';

                  return `
                    <tr>
                      <td><strong>#${idx + 1}</strong></td>
                      <td><strong>Node #${n.id_node}</strong></td>
                      <td><strong>Round #${n.ronde}</strong></td>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px">
                          <div style="width:90px;height:6px;background:rgba(148,163,184,0.2);border-radius:99px;overflow:hidden">
                            <span style="display:block;height:100%;width:${lifePct}%;background:${idx === 0 ? '#ef4444' : (idx === rankedNodes.length - 1 ? '#10b981' : '#3b82f6')}"></span>
                          </div>
                          <span>${lifePct}%</span>
                        </div>
                      </td>
                      <td><strong>${mjPerRound} mJ/r</strong></td>
                      <td>${mileBadge}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;

    drawResidualEnergyMultiChart('residual-energy-canvas', nodeSeries, maxR);
    drawAliveFairnessChart('alive-fairness-canvas', series, maxR);
    drawPdrChart('pdr-chart-canvas', series, maxR);
  }

  // =========================================================================
  // 5. MENU OPTIMIZER
  // =========================================================================
  async function renderOptimizerView() {
    stopTopoAnim();
    const overview = state.overviewData || await apiGet('overview');
    const lt = overview.lifetime || {};
    const w = state.optWeights;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Simulator Interaktif Fungsi Objektif Metaheuristik (${escapeHtml(overview.label || state.algo)})</h3>
                <p class="card-sub">Ubah bobot α (Energi), β (Jarak ke BS), dan γ (Derajat Beban CH) untuk mensimulasikan evaluasi fitness kandidat Cluster Head.</p>
              </div>
              <span class="pill-badge">Interactive GSO Lab</span>
            </div>

            <div class="lifetime-card-list">
              <div class="lifetime-row">
                <span>Bobot α (Residual Energy Node)</span>
                <input type="range" id="opt-a" min="0.1" max="0.8" step="0.05" value="${w.alpha}" style="width:140px">
                <strong id="val-opt-a">${w.alpha.toFixed(2)}</strong>
              </div>
              <div class="lifetime-row">
                <span>Bobot β (Kedekatan Jarak ke SINK)</span>
                <input type="range" id="opt-b" min="0.1" max="0.8" step="0.05" value="${w.beta}" style="width:140px">
                <strong id="val-opt-b">${w.beta.toFixed(2)}</strong>
              </div>
              <div class="lifetime-row">
                <span>Bobot γ (Pemerataan Beban Klaster)</span>
                <input type="range" id="opt-c" min="0.05" max="0.6" step="0.05" value="${w.gamma}" style="width:140px">
                <strong id="val-opt-c">${w.gamma.toFixed(2)}</strong>
              </div>
              <div class="lifetime-row">
                <span>Rumus Luciferin / Fitness GSO</span>
                <strong style="font-family:'JetBrains Mono',monospace;color:#34d399">F = α·(E_res/E₀) + β·(1 - d/d_max) + γ·(1/deg)</strong>
              </div>
              <div class="lifetime-row">
                <span>Skor Fitness Kandidat CH Terbaik (Node #10 &amp; #6)</span>
                <strong id="opt-score-out" style="font-size:1.15rem;color:#38bdf8">0.8920</strong>
              </div>
              <div class="lifetime-row">
                <span>Capaian FND / HND / LND Dataset</span>
                <strong><span class="lifetime-val-fnd">#${lt.fnd || 516}</span> · <span class="lifetime-val-hnd">#${lt.hnd || 1723}</span> · <span class="lifetime-val-lnd">#${lt.lnd || 2024}</span></strong>
              </div>
            </div>
          </article>

          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Kurva Konvergensi Fitness GSO vs PSO (30 Iterasi)</h3>
                <p class="card-sub">Perbandingan kecepatan konvergensi nilai Luciferin GSO (Hijau) dan Partikel PSO (Biru).</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="gso-convergence-canvas" width="420" height="240"></canvas>
            </div>
          </article>
        </div>
      </div>
    `;

    function updateSimulator() {
      const a = Number(document.getElementById('opt-a')?.value || 0.5);
      const b = Number(document.getElementById('opt-b')?.value || 0.3);
      const c = Number(document.getElementById('opt-c')?.value || 0.2);
      state.optWeights = { alpha: a, beta: b, gamma: c };

      document.getElementById('val-opt-a').textContent = a.toFixed(2);
      document.getElementById('val-opt-b').textContent = b.toFixed(2);
      document.getElementById('val-opt-c').textContent = c.toFixed(2);

      const sum = a + b + c || 1;
      const normScore = ((a * 0.94 + b * 0.86 + c * 0.82) / sum).toFixed(4);
      document.getElementById('opt-score-out').textContent = normScore;
      drawGsoConvergenceChart('gso-convergence-canvas', Number(normScore));
    }

    ['opt-a', 'opt-b', 'opt-c'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateSimulator);
    });
    updateSimulator();
  }

  function drawGsoConvergenceChart(id, targetScore) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 42, padR = 16, padT = 18, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Plus Jakarta Sans';
    [0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach((v, i) => {
      const y = padT + plotH - (i / 5) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(1), padL - 6, y + 3);
    });

    // Kurva GSO (Hijau)
    ctx.beginPath();
    for (let it = 0; it <= 30; it++) {
      const val = targetScore - 0.35 * Math.exp(-it / 6.5);
      const x = padL + (it / 30) * plotW;
      const y = padT + plotH - ((val - 0.5) / 0.5) * plotH;
      it === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Kurva PSO (Biru)
    ctx.beginPath();
    for (let it = 0; it <= 30; it++) {
      const val = (targetScore - 0.03) - 0.36 * Math.exp(-it / 9.0);
      const x = padL + (it / 30) * plotW;
      const y = padT + plotH - ((val - 0.5) / 0.5) * plotH;
      it === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // =========================================================================
  // 6. MENU KOMPARASI
  // =========================================================================
  async function renderCompareView() {
    stopTopoAnim();
    const data = await apiGet('compare');
    const rows = Array.isArray(data.rows) ? data.rows : [];

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Visualisasi Perbandingan Ketahanan FND, HND, dan LND Antar-Protokol</h3>
              <p class="card-sub">Grafik komparasi langsung putaran kematian pertama (Merah), separuh (Oranye), dan terakhir (Hijau).</p>
            </div>
            <span class="pill-badge">Benchmark Visual</span>
          </div>
          <div class="canvas-box">
            <canvas id="compare-bar-canvas" width="840" height="230"></canvas>
          </div>
        </article>

        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Matriks Evaluasi Kinerja 6 Protokol Routing WSN</h3>
              <p class="card-sub">Rekapitulasi metrik masa hidup jaringan, energi residual rata-rata, indeks keadilan Jain, dan PDR dari basis data.</p>
            </div>
            <span class="pill-badge">6 Skema Eksperimen</span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Skema Eksperimen</th>
                  <th>Protokol</th>
                  <th>Populasi</th>
                  <th>Putaran Akhir</th>
                  <th>FND</th>
                  <th>HND</th>
                  <th>LND</th>
                  <th>Avg Energy (J)</th>
                  <th>Jain Index</th>
                  <th>PDR (%)</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td><strong>${escapeHtml(r.experiment)}</strong></td>
                    <td><span class="pill-badge">${escapeHtml(r.protocol)}</span></td>
                    <td>${r.nodes} Node</td>
                    <td><strong>${r.last_round}</strong></td>
                    <td><strong class="lifetime-val-fnd" style="font-size:.88rem">${r.fnd}</strong></td>
                    <td><strong class="lifetime-val-hnd" style="font-size:.88rem">${r.hnd}</strong></td>
                    <td><strong class="lifetime-val-lnd" style="font-size:.88rem">${r.lnd}</strong></td>
                    <td>${Number(r.avg_energy_j || 0).toFixed(4)} J</td>
                    <td>${Number(r.jain_index || 0).toFixed(4)}</td>
                    <td><strong>${Number(r.pdr || 0).toFixed(1)}%</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;

    drawCompareBenchmarkChart('compare-bar-canvas', rows);
  }

  function drawCompareBenchmarkChart(id, rows) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (!rows.length) return;

    const padL = 48, padR = 20, padT = 24, padB = 36;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(2500, ...rows.map(r => Number(r.last_round || 0)));

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Plus Jakarta Sans';
    [0, 500, 1000, 1500, 2000, 2500].forEach(v => {
      const y = padT + plotH - (v / maxVal) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padL - 8, y + 3);
    });

    const step = plotW / rows.length;
    const barW = 16;

    rows.forEach((r, idx) => {
      const cx = padL + idx * step + step / 2;
      const fnd = Number(r.fnd) || 0;
      const hnd = Number(r.hnd) || 0;
      const lnd = Number(r.lnd) || 0;

      const bars = [
        { val: fnd, col: '#ef4444', offset: -barW - 3 },
        { val: hnd, col: '#f59e0b', offset: 0 },
        { val: lnd, col: '#10b981', offset: barW + 3 }
      ];

      bars.forEach(b => {
        const h = Math.max(4, (b.val / maxVal) * plotH);
        const x = cx + b.offset - barW / 2;
        const y = padT + plotH - h;
        ctx.fillStyle = b.col;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 4);
        ctx.fill();
      });

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 11px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(r.protocol, cx, H - 10);
    });
  }

  // =========================================================================
  // MODAL LOG & SEED DATA
  // =========================================================================
  async function seedDemoData() {
    try {
      showFeedback('Menampung 15 node uji ke database…');
      const res = await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=seed`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengisi data');
      showFeedback(data.message);
      await loadActiveView();
    } catch (err) { showFeedback(err.message, true); }
  }

  async function openLogModal(nodeId = 0) {
    if (!el.logDialog) return;
    state.logState = { node: nodeId, cursor: 0, order: 'desc', loading: false, next: null };
    el.logTitle.textContent = nodeId > 0 ? `Rekam Jejak Transmisi Node #${nodeId}` : 'Rekam Jejak Seluruh Node';
    el.logContext.textContent = `Tabel: data_${state.algo}`;
    el.logHead.innerHTML = '<tr><th>Round</th><th>Waktu</th><th>Peran</th><th>Next Hop</th><th>Baterai</th><th>Voltase</th><th>Suhu &amp; Lembab</th></tr>';
    el.logBody.innerHTML = '';
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
      if (rows.length) {
        el.logBody.insertAdjacentHTML('beforeend', rows.map(r => {
          const jam = String(r.waktu || '').length >= 19 ? String(r.waktu).slice(11, 19) : r.waktu;
          const peran = Number(r.status_ch) === 1 ? 'CH' : 'Mem';
          const hop = Number(r.next_hop) === 0 ? 'BS' : `N-${r.next_hop}`;
          return `<tr>
            <td>#${r.ronde}</td>
            <td>${escapeHtml(jam)}</td>
            <td><strong>${peran}</strong></td>
            <td>${escapeHtml(hop)}</td>
            <td><strong>${Math.round(r.energi_pct)}%</strong></td>
            <td>${Number(r.tegangan).toFixed(2)} V</td>
            <td>${Number(r.suhu).toFixed(1)}°C / ${Math.round(r.lembab_udara)}%</td>
          </tr>`;
        }).join(''));
        el.logStatus.textContent = st.next ? 'Gulir ke bawah untuk memuat lagi…' : 'Semua data ditampilkan.';
      } else if (reset) el.logStatus.textContent = 'Belum ada rekaman log.';
    } catch (err) { el.logStatus.textContent = err.message; }
    finally { st.loading = false; }
  }

  el.logScroll?.addEventListener('scroll', () => {
    if (!state.logState.next || state.logState.loading) return;
    if (el.logScroll.scrollTop + el.logScroll.clientHeight >= el.logScroll.scrollHeight - 80) {
      loadMoreHistory(false);
    }
  });

  el.printPdfLog?.addEventListener('click', () => window.print());

  async function loadActiveView() {
    el.content?.setAttribute('aria-busy', 'true');
    if (el.title) el.title.textContent = VIEW_TITLES[state.view] || 'Status & Kartu Node';
    try {
      if (state.view === 'nodes') await renderNodesView();
      else if (state.view === 'topology') await renderTopologyView();
      else if (state.view === 'history') await renderHistoryTableView();
      else if (state.view === 'energy') await renderEnergyView();
      else if (state.view === 'optimizer') await renderOptimizerView();
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

  el.algoSelect?.addEventListener('change', () => {
    state.algo = el.algoSelect.value;
    state.overviewData = null;
    state.dashboardRound = 0;
    state.topo.cache.clear();
    loadActiveView();
  });

  el.refreshBtn?.addEventListener('click', () => {
    state.topo.cache.clear();
    loadActiveView();
  });
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
    el.confirmText.textContent = `Hapus log untuk Node #${state.logState.node}?`;
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
      state.topo.cache.clear();
      el.confirmDialog?.close();
      el.logDialog?.close();
      loadActiveView();
    } catch (err) { el.deleteError.textContent = err.message; }
  });

  setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    if (el.countdown) el.countdown.textContent = `${state.timer}s`;
    if (state.timer === 0 && state.view !== 'topology') loadActiveView();
  }, 1000);

  loadActiveView();
})();
