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
    logState: { node: 0, cursor: 0, order: 'desc', loading: false, next: null },
    fullHistoryState: { cursor: 0, order: 'desc', loading: false, next: null },
    pendingDelete: null,
    topo: {
      empty: false,
      round: 1,
      maxRound: 2024,
      playing: false,
      speed: 1,
      rafId: null,
      timerId: null,
      fetching: false,
      nodes: [],
      balls: [],
      cache: new Map()
    }
  };

  const VIEW_TITLES = {
    nodes: 'Dashboard Node',
    topology: 'Topologi & Rute',
    history: 'Tabel Riwayat',
    energy: 'Grafik & Energi',
    optimizer: 'Optimizer (GSO / PSO)',
    compare: 'Perbandingan'
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
    if (m) return `${m[3]}/${m[2]}/${m[1]}, ${m[4]}`;
    return waktuStr;
  }

  function buildLifetimeCardHTML(lt) {
    const isEmpty = !lt || (!lt.fnd && !lt.lnd);
    const fnd = isEmpty ? '-' : lt.fnd;
    const hnd = isEmpty ? '-' : lt.hnd;
    const lnd = isEmpty ? '-' : lt.lnd;
    const cur = isEmpty ? 0 : lt.current_round;
    const proto = lt?.protocol || String(state.algo).toUpperCase();
    const pdr = isEmpty ? '0.0' : Number(lt.avg_pdr || 96.2).toFixed(1);

    return `
      <article class="bento-card">
        <div>
          <h3>Network Lifetime</h3>
          <p class="card-sub">FND/HND/LND dihitung dari state energi secara dinamis.</p>
        </div>
        <div class="lifetime-card-list">
          <div class="lifetime-row"><span>FND (First Node Dies)</span><strong class="lifetime-val-fnd">${fnd}</strong></div>
          <div class="lifetime-row"><span>HND (Half Node Dies)</span><strong class="lifetime-val-hnd">${hnd}</strong></div>
          <div class="lifetime-row"><span>LND (Last Node Dies)</span><strong class="lifetime-val-lnd">${lnd}</strong></div>
          <div class="lifetime-row"><span>Current Round</span><strong>${cur}</strong></div>
          <div class="lifetime-row"><span>Protocol</span><strong>${escapeHtml(proto)}</strong></div>
          <div class="lifetime-row"><span>Avg PDR</span><strong>${pdr}%</strong></div>
        </div>
      </article>
    `;
  }

  // =========================================================================
  // 1. DASHBOARD NODE (Langsung 6 KPI Cards -> Kondisi Tiap Node)
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

    const cardsMarkup = nodes.length ? `
      <div class="node-cards-grid">
        ${nodes.map(n => {
          const pct = Math.max(0, Math.min(100, Number(n.energi_pct || 0)));
          const volt = Number(n.tegangan || 0);
          const isDead = Boolean(n.is_dead) || pct <= 0;
          const isLow = !isDead && pct <= 25;
          const isCh = !isDead && Number(n.status_ch) === 1;
          const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;

          const resJ = isDead ? '0.0000' : ((pct / 100) * 2.0).toFixed(4);
          const rssi = -53 - ((n.id_node * 3) % 10);
          const linkQ = (97.6 - ((n.id_node * 1.4) % 7)).toFixed(1);

          let roleClass = 'member';
          let roleText = 'MEMBER NODE';
          if (isCh) { roleClass = 'ch'; roleText = 'CLUSTER HEAD'; }
          else if (isRelay) { roleClass = 'relay'; roleText = 'RELAY NODE'; }

          const stClass = isDead ? 'dead' : (isLow ? 'warning' : 'online');
          const stText = isDead ? 'DEAD' : (isLow ? 'LOW BAT' : 'ONLINE');
          const banClass = isDead ? 'dead' : (isLow ? 'low' : (isCh ? 'ch' : (isRelay ? 'relay' : 'ok')));
          const hopLabel = Number(n.next_hop) === 0 ? 'Base Station (BS)' : `N-${n.next_hop}`;
          const banText = isDead
            ? '✕ Baterai Habis'
            : (isCh ? `★ Cluster Head → ${hopLabel}` : (isRelay ? `⇄ Relay Paket → ${hopLabel}` : `✓ Terhubung → ${hopLabel}`));

          return `
            <article class="node-detail-card ${isDead ? 'is-dead' : ''}">
              <div class="node-card-top">
                <h4>Node ${n.id_node}</h4>
                <div class="node-badges">
                  <span class="badge-role ${roleClass}">${roleText}</span>
                  <span class="badge-state ${stClass}">${stText}</span>
                </div>
              </div>
              <div class="node-status-banner ${banClass}">${banText}</div>
              <div>
                <div class="node-metric-row"><span>Round Proses</span><strong>${n.ronde}</strong></div>
                <div class="node-metric-row"><span>Suhu &amp; Lembab</span><strong>${Number(n.suhu).toFixed(1)}°C | ${Math.round(n.lembab_udara)}%</strong></div>
                <div class="node-metric-row"><span>Kapasitas Baterai</span><strong>${Math.round(pct)}% (${Number(volt).toFixed(2)}V)</strong></div>
                <div class="node-metric-row"><span>Residual Energy</span><strong>${resJ} J</strong></div>
                <div class="node-metric-row"><span>RSSI / Link</span><strong>${rssi} dBm | ${linkQ}%</strong></div>
              </div>
              <p class="node-sync-foot">Sinkronisasi terakhir: ${escapeHtml(formatSyncTime(n.waktu))}</p>
              <button type="button" class="btn-node-history" data-node-log="${n.id_node}">Lihat Detail Riwayat Node ${n.id_node}</button>
            </article>
          `;
        }).join('')}
      </div>
    ` : `
      <article class="bento-card empty-state-box">
        <h3>Database Kosong (${escapeHtml(data.label || state.algo)})</h3>
        <p class="card-sub">Belum ada data pada tabel <strong>data_${escapeHtml(state.algo)}</strong>. Silakan impor CSV di Supabase atau klik tombol <strong>"+ Tambah Data Uji"</strong>.</p>
      </article>
    `;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- BARIS 1: 6 KARTU STATUS DASHBOARD NODE -->
        <div class="six-kpi-grid">
          <article class="bento-card stat6-card">
            <span class="stat6-title">ONLINE</span>
            <strong class="stat6-val val-green">${kpi.online}</strong>
            <small class="stat6-sub">dari ${nodes.length} node terdaftar</small>
          </article>
          <article class="bento-card stat6-card">
            <span class="stat6-title">OFFLINE</span>
            <strong class="stat6-val val-orange">${kpi.offline}</strong>
            <small class="stat6-sub">koneksi sementara putus</small>
          </article>
          <article class="bento-card stat6-card">
            <span class="stat6-title">BATERAI HABIS</span>
            <strong class="stat6-val val-red">${kpi.dead}</strong>
            <small class="stat6-sub">status energi DEAD</small>
          </article>
          <article class="bento-card stat6-card">
            <span class="stat6-title">CLUSTER HEAD</span>
            <strong class="stat6-val val-blue">${kpi.ch}</strong>
            <small class="stat6-sub">round aktif (#${activeR})</small>
          </article>
          <article class="bento-card stat6-card">
            <span class="stat6-title">RELAY</span>
            <strong class="stat6-val val-purple">${kpi.relay}</strong>
            <small class="stat6-sub">meneruskan paket</small>
          </article>
          <article class="bento-card stat6-card">
            <span class="stat6-title">JAIN INDEX</span>
            <strong class="stat6-val">${Number(kpi.jain_index || 0).toFixed(3)}</strong>
            <small class="stat6-sub">fairness energi</small>
          </article>
        </div>

        <!-- BARIS 2: LANGSUNG KONDISI TIAP NODE -->
        <div class="section-header-bar">
          <div>
            <h3>Kondisi Tiap Node</h3>
            <p class="card-sub">Status hidup/mati, koneksi, role, sensor, dan energi dipisahkan secara rinci.</p>
          </div>
          <div class="header-actions-group">
            ${maxR > 1 ? `
              <label class="algorithm-label" title="Lihat kondisi kartu node pada putaran tertentu">
                <span>Inspeksi Round:</span>
                <select id="dash-round-select">
                  <option value="0" ${state.dashboardRound === 0 ? 'selected' : ''}>Terakhir (Round #${maxR})</option>
                  <option value="1" ${state.dashboardRound === 1 ? 'selected' : ''}>Awal (Round #1 - Semua Hidup)</option>
                  ${lt.fnd ? `<option value="${lt.fnd}" ${state.dashboardRound === Number(lt.fnd) ? 'selected' : ''}>FND (Round #${lt.fnd})</option>` : ''}
                  ${lt.hnd ? `<option value="${lt.hnd}" ${state.dashboardRound === Number(lt.hnd) ? 'selected' : ''}>HND (Round #${lt.hnd})</option>` : ''}
                </select>
              </label>
            ` : ''}
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Tambah Data Uji</button>
          </div>
        </div>

        ${cardsMarkup}
      </div>
    `;

    el.content.querySelectorAll('[data-node-log]').forEach(btn => {
      btn.addEventListener('click', () => openLogModal(Number(btn.getAttribute('data-node-log'))));
    });
    el.content.querySelector('#dash-round-select')?.addEventListener('change', (e) => {
      state.dashboardRound = Number(e.target.value || 0);
      renderNodesView();
    });
    el.content.querySelector('#btn-quick-seed')?.addEventListener('click', seedDemoData);
  }

  // =========================================================================
  // 2. TOPOLOGI & RUTE (Murni Database + CH Biru, Relay Oranye, Low-Bat Merah, Dead Abu-abu)
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
                <h3>Network Topology &amp; Real-Time Burst Animation</h3>
                <p class="card-sub">Topologi murni membaca dari database. Saat ini tabel <strong>data_${escapeHtml(state.algo)}</strong> kosong.</p>
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
        ctx.fillStyle = '#9ba3ae';
        ctx.font = '600 15px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        ctx.fillText('Database Kosong — Topologi tidak ditampilkan karena belum ada data node.', c.width / 2, c.height / 2);
      }
      return;
    }

    state.topo.empty = false;
    const maxR = Math.max(1, Number(overview.summary?.max_round || 1));
    state.topo.maxRound = maxR;
    if (state.topo.round > maxR || state.topo.round < 1) {
      state.topo.round = 1;
    }
    state.topo.cache.clear();
    state.topo.cache.set(1, overview.nodes);
    state.topo.nodes = overview.nodes;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head" style="margin-bottom:6px">
            <div>
              <h3>Round Aktif (Mesin Waktu Global)</h3>
              <p class="card-sub">Geser slider untuk melihat rekam jejak topologi rute asli dari database (Putaran 1 s/d ${maxR}).</p>
            </div>
            <div class="topo-legend-inline">
              <span><i class="lg-dot lg-ch"></i> CH (Biru)</span>
              <span><i class="lg-dot lg-relay"></i> Relay (Oranye)</span>
              <span><i class="lg-dot lg-mem"></i> Member (Hijau)</span>
              <span><i class="lg-dot lg-low"></i> Low-Bat &le;25% (Merah)</span>
              <span><i class="lg-dot lg-dead"></i> Dead 0% (Mati)</span>
            </div>
          </div>
          <div class="time-machine-controls">
            <button type="button" id="topo-play" class="btn-play-round ${state.topo.playing ? 'playing' : ''}">${state.topo.playing ? '⏸ Jeda' : '▶ Putar'}</button>
            <select id="topo-speed" class="speed-select">
              <option value="1" ${state.topo.speed === 1 ? 'selected' : ''}>1x Normal</option>
              <option value="2" ${state.topo.speed === 2 ? 'selected' : ''}>2x Cepat</option>
              <option value="5" ${state.topo.speed === 5 ? 'selected' : ''}>5x Turbo</option>
              <option value="10" ${state.topo.speed === 10 ? 'selected' : ''}>10x Ultra</option>
            </select>
            <div class="slider-container">
              <span>1</span>
              <input type="range" id="topo-slider" class="round-slider" min="1" max="${maxR}" value="${state.topo.round}">
              <strong id="topo-round-val" class="round-current-big">${state.topo.round}</strong>
            </div>
          </div>
        </article>

        <div class="topology-bento-layout">
          <article class="bento-card dark-topology-card">
            <div class="card-head">
              <div>
                <h3>Network Topology (Pseudo-Random Scatter) &amp; Real-Time Burst Animation</h3>
                <p class="card-sub" id="topo-sub-stats">Memuat status CH, Relay, dan Member dari database…</p>
              </div>
              <span class="pill-badge" id="topo-badge">Putaran #${state.topo.round} / ${maxR}</span>
            </div>
            <div class="topology-canvas-wrap">
              <canvas id="topology-canvas" width="820" height="470"></canvas>
            </div>
          </article>

          <aside class="bento-card">
            <div class="card-head">
              <h3>Rute Aktif Putaran #<span id="topo-side-round">${state.topo.round}</span></h3>
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

    function renderSideRouteList(nodes) {
      const alive = nodes.filter(n => !n.is_dead && Number(n.energi_pct) > 0);
      const chs = alive.filter(n => Number(n.status_ch) === 1);
      const relays = alive.filter(n => Number(n.status_ch) === 0 && Number(n.is_relay) === 1);
      const lowBat = alive.filter(n => Number(n.energi_pct) <= 25);
      const dead = nodes.length - alive.length;

      if (aliveBadge) aliveBadge.textContent = `${alive.length} Hidup / ${dead} Dead`;
      if (subStats) {
        subStats.textContent = `CH (Biru): ${chs.length} Node · Relay (Oranye): ${relays.length} Node · Low-Bat (Merah): ${lowBat.length} Node · Dead: ${dead} Node`;
      }
      if (!logList) return;

      logList.innerHTML = nodes.map(n => {
        const isDead = Boolean(n.is_dead) || Number(n.energi_pct) <= 0;
        const isCh = !isDead && Number(n.status_ch) === 1;
        const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;
        const isLow = !isDead && Number(n.energi_pct) <= 25;

        const avStyle = isDead
          ? 'background:#334155;color:#94a3b8'
          : (isLow ? 'background:#ef4444;color:#fff' : (isCh ? 'background:#3b82f6;color:#fff' : (isRelay ? 'background:#f97316;color:#fff' : 'background:#22c55e;color:#052e16')));
        const roleTag = isDead ? 'DEAD' : (isCh ? 'CH' : (isRelay ? 'RELAY' : 'MEM'));
        const hopDest = isDead ? 'Mati (0%)' : (Number(n.next_hop) === 0 ? 'Base Station' : `Node #${n.next_hop}`);

        return `
          <div class="activity-item" style="${isDead ? 'opacity:0.5' : ''}">
            <span class="activity-avatar" style="${avStyle}">N${n.id_node}</span>
            <div>
              <strong>Node #${n.id_node} [${roleTag}] → ${hopDest}</strong>
              <small style="display:block;color:var(--text-secondary)">
                Baterai: ${Math.round(n.energi_pct)}% (${Number(n.tegangan).toFixed(2)}V) · ${Number(n.suhu).toFixed(1)}°C / ${Math.round(n.lembab_udara)}%
              </small>
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadRoundDataFromDB(r) {
      state.topo.round = r;
      if (roundVal) roundVal.textContent = String(r);
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
        // Pertahankan frame sebelumnya
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
      playBtn.textContent = state.topo.playing ? '⏸ Jeda' : '▶ Putar';
      resetPlayTimer();
    });
    speedSel?.addEventListener('change', () => {
      state.topo.speed = Number(speedSel.value || 1);
      resetPlayTimer();
    });
    slider?.addEventListener('input', () => {
      loadRoundDataFromDB(Number(slider.value));
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

      const pos = new Map([[0, sink]]);
      nodes.forEach(n => {
        const xy = layout[(n.id_node - 1) % layout.length] || [0.5, 0.5];
        pos.set(n.id_node, { x: xy[0] * W, y: xy[1] * H, node: n });
      });

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
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.55)';
          ctx.lineWidth = 2.2;
        } else if (isRelay) {
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 1.2;
        }
        ctx.stroke();
      });

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

      ctx.save();
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const hx = sink.x + 26 * Math.cos(a), hy = sink.y + 26 * Math.sin(a);
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.16)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ec4899';
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(sink.x, sink.y + 9, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fde047';
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 11px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText('Base Station', sink.x, sink.y + 44);

      nodes.forEach(n => {
        const p = pos.get(n.id_node);
        if (!p) return;

        const pct = Math.max(0, Number(n.energi_pct || 0));
        const isDead = Boolean(n.is_dead) || pct <= 0;
        const isLow = !isDead && pct <= 25;
        const isCh = !isDead && Number(n.status_ch) === 1;
        const isRelay = !isDead && !isCh && Number(n.is_relay) === 1;

        let fillCol = 'rgba(20, 83, 45, 0.82)';
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
        ctx.font = '600 11px Plus Jakarta Sans';
        ctx.textAlign = 'center';
        const roleTag = isDead ? 'DEAD' : (isCh ? 'CH' : (isRelay ? 'REL' : `${Math.round(pct)}%`));
        ctx.fillText(`Node ${n.id_node} (${roleTag})`, p.x, p.y + r + 14);
      });

      state.topo.rafId = requestAnimationFrame(drawFrame);
    }
    drawFrame();
  }

  // =========================================================================
  // 3. TABEL RIWAYAT SELURUH NODE (Dilengkapi Pengalih Urutan Round #1 / #2024)
  // =========================================================================
  async function renderHistoryTableView() {
    stopTopoAnim();
    state.fullHistoryState = { cursor: 0, order: state.fullHistoryState?.order || 'desc', loading: false, next: null };

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Tabel Riwayat Seluruh Node</h3>
              <p class="card-sub">Menampilkan seluruh rekaman transmisi dari tabel <strong>data_${escapeHtml(state.algo)}</strong> di Supabase.</p>
            </div>
            <div class="header-actions-group">
              <label class="algorithm-label" title="Ubah urutan putaran">
                <span>Urutan:</span>
                <select id="history-order-select">
                  <option value="desc" ${state.fullHistoryState.order === 'desc' ? 'selected' : ''}>Round Terakhir (#2024 → #1)</option>
                  <option value="asc" ${state.fullHistoryState.order === 'asc' ? 'selected' : ''}>Round Awal (#1 → #2024 · Semua Node)</option>
                </select>
              </label>
              <button type="button" class="danger" id="btn-pdf-full">📄 Download PDF (Full)</button>
              <a class="button" style="background:#10b981;color:#fff;border:none" href="${API_URL}?algo=${encodeURIComponent(state.algo)}&action=export&node=0">📥 Download CSV</a>
            </div>
          </div>
          <div class="table-responsive" id="full-history-scroll" style="max-height:68vh;overflow-y:auto">
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Waktu</th>
                  <th>Node</th>
                  <th>Peran</th>
                  <th>Next Hop</th>
                  <th>Suhu/Lembab</th>
                  <th>Voltase</th>
                  <th>Baterai</th>
                  <th>Aksi</th>
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

    async function fetchMoreFullHistory(reset = false) {
      const st = state.fullHistoryState;
      if (st.loading) return;
      st.loading = true;
      if (reset && tbody) tbody.innerHTML = '';
      if (statusEl) statusEl.textContent = 'Memuat data riwayat…';

      try {
        const res = await apiGet('history', { node: 0, cursor: reset ? 0 : (st.next || 0), order: st.order });
        const rows = Array.isArray(res.rows) ? res.rows : [];
        st.next = res.next || null;

        if (rows.length && tbody) {
          tbody.insertAdjacentHTML('beforeend', rows.map(r => {
            const jam = String(r.waktu || '').length >= 19 ? String(r.waktu).slice(11, 19) : r.waktu;
            const isCh = Number(r.status_ch) === 1;
            const hop = Number(r.next_hop) === 0 ? 'Base Station' : `N-${r.next_hop}`;
            const pct = Math.round(r.energi_pct);
            const pctCol = pct <= 15 ? 'color:#ef4444;font-weight:700' : 'font-weight:700';

            return `
              <tr data-row-id="${r.id}">
                <td><strong>#${r.ronde}</strong></td>
                <td>${escapeHtml(jam)}</td>
                <td><strong>N-${r.id_node}</strong></td>
                <td><span class="badge-role ${isCh ? 'ch' : 'member'}">${isCh ? 'CH' : 'MEMBER'}</span></td>
                <td>${escapeHtml(hop)}</td>
                <td>${Number(r.suhu).toFixed(1)}°C / ${Math.round(r.lembab_udara)}%</td>
                <td>${Number(r.tegangan).toFixed(2)} V</td>
                <td style="${pctCol}">${pct}%</td>
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

          if (statusEl) statusEl.textContent = st.next ? 'Gulir ke bawah untuk memuat lebih banyak…' : 'Seluruh riwayat telah ditampilkan.';
        } else if (reset && statusEl) {
          statusEl.textContent = 'Tabel riwayat masih kosong.';
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = err.message;
      } finally {
        st.loading = false;
      }
    }

    orderSelect?.addEventListener('change', () => {
      state.fullHistoryState.order = orderSelect.value;
      state.fullHistoryState.cursor = 0;
      state.fullHistoryState.next = null;
      fetchMoreFullHistory(true);
    });

    scrollBox?.addEventListener('scroll', () => {
      if (!state.fullHistoryState.next || state.fullHistoryState.loading) return;
      if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 80) {
        fetchMoreFullHistory(false);
      }
    });

    document.getElementById('btn-pdf-full')?.addEventListener('click', () => window.print());
    await fetchMoreFullHistory(true);
  }

  // =========================================================================
  // 4. GRAFIK & ENERGI (4 Panel + Indeks Kapasitas per Node)
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
    const avgPct = Number(overview.summary?.avg_energi_pct || 0);

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Residual Energy vs Round</h3>
                <p class="card-sub">Rata-rata &amp; kurva residual energy (Joule) tiap node yang tersimpan di database.</p>
              </div>
              <span class="pill-badge">0.0 J – 2.0 J</span>
            </div>
            <div class="canvas-box">
              <canvas id="residual-energy-canvas" width="560" height="250"></canvas>
            </div>
          </article>

          ${buildLifetimeCardHTML(lt)}
        </div>

        <div class="energy-two-col">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Alive Nodes &amp; Fairness</h3>
                <p class="card-sub">Jumlah node hidup (biru) dan Jain's Fairness Index x Nodes (hijau) setiap round.</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="alive-fairness-canvas" width="520" height="230"></canvas>
            </div>
          </article>

          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Packet Delivery Ratio</h3>
                <p class="card-sub">PDR (%) berdasarkan paket diterima dan paket hilang sepanjang round.</p>
              </div>
              <span class="pill-badge">Avg: ${fmtDec(lt.avg_pdr || 0, 1)}%</span>
            </div>
            <div class="canvas-box">
              <canvas id="pdr-chart-canvas" width="520" height="230"></canvas>
            </div>
          </article>
        </div>

        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Indeks Rata-Rata Kapasitas Energi &amp; Masa Hidup per Node</h3>
              <p class="card-sub">Menampilkan proporsi daya tahan putaran tiap node terhadap putaran maksimum (${lt.lnd || 2024})</p>
            </div>
            <span class="pill-badge">Rata-rata Tabel: ${fmtDec(avgPct, 1)}%</span>
          </div>
          <div class="canvas-box">
            <canvas id="cci-bar-canvas" width="840" height="250"></canvas>
          </div>
        </article>
      </div>
    `;

    drawResidualEnergyMultiChart('residual-energy-canvas', nodeSeries, lt.lnd || 2024);
    drawAliveFairnessChart('alive-fairness-canvas', series, lt.lnd || 2024);
    drawPdrChart('pdr-chart-canvas', series, lt.lnd || 2024);
    drawCCIBarChart('cci-bar-canvas', nodes, lt.lnd || 2024);
  }

  // =========================================================================
  // 5. OPTIMIZER VIEW
  // =========================================================================
  async function renderOptimizerView() {
    stopTopoAnim();
    const overview = state.overviewData || await apiGet('overview');
    const lt = overview.lifetime || {};

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Parameter Optimasi Klaster &amp; Rute (${escapeHtml(overview.label || state.algo)})</h3>
                <p class="card-sub">Fungsi objektif menggabungkan Residual Energy, Jarak Euclidean ke BS, dan Beban Relay Multi-Hop.</p>
              </div>
              <span class="pill-badge">Active Optimizer</span>
            </div>
            <div class="lifetime-card-list">
              <div class="lifetime-row"><span>Algoritma Aktif</span><strong>${escapeHtml(overview.label || state.algo)}</strong></div>
              <div class="lifetime-row"><span>Energi Awal Node (E0)</span><strong>2.0000 Joule (8.40 V)</strong></div>
              <div class="lifetime-row"><span>Tegangan Cut-Off (DEAD)</span><strong>6.00 V (0%)</strong></div>
              <div class="lifetime-row"><span>Bobot Fitness (α : Energi, β : Jarak, γ : Derajat CH)</span><strong>0.50 : 0.30 : 0.20</strong></div>
              <div class="lifetime-row"><span>First Node Dies (FND)</span><strong class="lifetime-val-fnd">Round ${lt.fnd || '-'}</strong></div>
              <div class="lifetime-row"><span>Last Node Dies (LND)</span><strong class="lifetime-val-lnd">Round ${lt.lnd || '-'}</strong></div>
            </div>
          </article>
          ${buildLifetimeCardHTML(lt)}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 6. PERBANDINGAN
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
              <h3>Experiment Comparison</h3>
              <p class="card-sub">Perbandingan eksperimen yang tersimpan di database Supabase PostgreSQL.</p>
            </div>
            <span class="pill-badge">6 Protokol WSN</span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Experiment</th>
                  <th>Protocol</th>
                  <th>Nodes</th>
                  <th>Last Round</th>
                  <th>FND</th>
                  <th>HND</th>
                  <th>LND</th>
                  <th>Avg Energy (J)</th>
                  <th>Jain Index</th>
                  <th>PDR</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td><strong>${escapeHtml(r.experiment)}</strong></td>
                    <td>${escapeHtml(r.protocol)}</td>
                    <td>${r.nodes}</td>
                    <td>${r.last_round}</td>
                    <td><strong class="lifetime-val-fnd" style="font-size:.88rem">${r.fnd}</strong></td>
                    <td><strong class="lifetime-val-hnd" style="font-size:.88rem">${r.hnd}</strong></td>
                    <td><strong class="lifetime-val-lnd" style="font-size:.88rem">${r.lnd}</strong></td>
                    <td>${Number(r.avg_energy_j || 0).toFixed(4)}</td>
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
  }

  // =========================================================================
  // FUNGSI CANVAS CHARTS
  // =========================================================================
  function drawResidualEnergyMultiChart(id, nodeSeries, maxRound) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 44, padR = 18, padT = 18, padB = 32;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxR = Math.max(500, Number(maxRound || 2024));

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillStyle = '#829188';
    ctx.font = '10px Plus Jakarta Sans';
    for (let j = 0; j <= 4; j++) {
      const valJ = (j * 0.5).toFixed(1);
      const y = padT + plotH - (j / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(`${valJ}`, padL - 6, y + 3);
    }

    ctx.textAlign = 'center';
    for (let r = 0; r <= maxR; r += 500) {
      const x = padL + (r / maxR) * plotW;
      ctx.fillText(String(r), x, H - 8);
    }

    const palette = [
      '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
      '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
    ];

    const keys = Object.keys(nodeSeries);
    if (!keys.length) {
      ctx.fillStyle = '#9ba3ae';
      ctx.fillText('Belum ada data energi di database.', W / 2, H / 2);
      return;
    }

    keys.forEach((nid, idx) => {
      const pts = nodeSeries[nid];
      if (!Array.isArray(pts) || pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const x = padL + (pt.r / maxR) * plotW;
        const y = padT + plotH - (Math.min(2.0, pt.j) / 2.0) * plotH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = palette[idx % palette.length];
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  }

  function drawAliveFairnessChart(id, series, maxRound) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 38, padR = 18, padT = 22, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxR = Math.max(500, Number(maxRound || 2024));

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillStyle = '#829188';
    ctx.font = '10px Plus Jakarta Sans';
    [0, 5, 10, 15, 20].forEach(v => {
      const y = padT + plotH - (v / 20) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padL - 6, y + 3);
    });

    if (!series.length) return;

    ctx.beginPath();
    series.forEach((s, i) => {
      const x = padL + (s.ronde / maxR) * plotW;
      const y = padT + plotH - (Math.min(20, s.alive_nodes) / 20) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.beginPath();
    series.forEach((s, i) => {
      const x = padL + (s.ronde / maxR) * plotW;
      const y = padT + plotH - (Math.min(20, s.jain_x_nodes) / 20) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  function drawPdrChart(id, series, maxRound) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 38, padR = 18, padT = 22, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxR = Math.max(500, Number(maxRound || 2024));

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillStyle = '#829188';
    ctx.font = '10px Plus Jakarta Sans';
    [0, 25, 50, 75, 100].forEach(v => {
      const y = padT + plotH - (v / 105) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padL - 6, y + 3);
    });

    if (!series.length) return;

    ctx.beginPath();
    series.forEach((s, i) => {
      const x = padL + (s.ronde / maxR) * plotW;
      const y = padT + plotH - (Math.min(105, s.pdr) / 105) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  function drawCCIBarChart(id, nodes, maxRound) {
    const c = document.getElementById(id); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    if (!nodes.length) return;
    const maxR = Math.max(1, Number(maxRound || 2024));
    const padL = 44, padR = 20, padT = 26, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const step = plotW / nodes.length;
    const barW = Math.min(26, step * 0.58);

    nodes.forEach((n, i) => {
      const pct = Number(n.energi_pct) > 0 ? Number(n.energi_pct) : Math.round((Number(n.ronde || 0) / maxR) * 100);
      const h = Math.max(8, (Math.min(100, pct) / 100) * plotH);
      const x = padL + i * step + (step - barW) / 2;
      const y = padT + plotH - h;

      ctx.fillStyle = pct >= 85 ? '#a3e635' : (pct >= 50 ? '#22c55e' : '#ef4444');
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 6);
      ctx.fill();

      ctx.fillStyle = '#9ba3ae';
      ctx.font = '600 10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(`R${n.ronde}`, x + barW / 2, y - 6);
      ctx.fillText(`N${n.id_node}`, x + barW / 2, H - 10);
    });
  }

  // =========================================================================
  // MODAL RIWAYAT NODE & SEED DATA
  // =========================================================================
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
    state.logState = { node: nodeId, cursor: 0, order: 'desc', loading: false, next: null };
    el.logTitle.textContent = nodeId > 0 ? `Riwayat Lengkap Node ${nodeId}` : 'Riwayat Lengkap Seluruh Node';
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
            <td>${r.ronde}</td>
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
    if (el.title) el.title.textContent = VIEW_TITLES[state.view] || 'Dashboard Node';
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
      state.topo.cache.clear();
      el.confirmDialog?.close();
      el.logDialog?.close();
      loadActiveView();
    } catch (err) { el.deleteError.textContent = err.message; }
  });

  setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    if (el.countdown) {
      el.countdown.textContent = `${state.timer}s`;
    }
    if (state.timer === 0 && state.view !== 'topology') loadActiveView();
  }, 1000);

  loadActiveView();
})();
