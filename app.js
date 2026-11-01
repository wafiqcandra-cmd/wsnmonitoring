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
    timerId: null,
    liveCursor: 0,
    overviewData: null,
    logState: { node: 0, cursor: 0, round: 0, order: 'desc', loading: false, next: null },
    pendingDelete: null
  };

  const VIEW_TITLES = {
    nodes: 'Dashboard Tanaman & Sensor WSN',
    topology: 'Topologi Klaster & Multi-Hop',
    energy: 'Grafik Energi & Lingkungan Tanaman',
    compare: 'Perbandingan Algoritma WSN'
  };

  // Pengaturan Tema (Aeux Light Gambar 1 & Arounda Dark Gambar 2)
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

  // =========================================================================
  // 1. DASHBOARD UTAMA (Sensor Tanaman & Energi Node)
  // =========================================================================
  async function renderNodesView() {
    const data = await apiGet('overview');
    state.overviewData = data;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const s = data.summary || {};

    const optimalCount = nodes.filter(n => n.energi_pct >= 70).length;
    const warningCount = nodes.filter(n => n.energi_pct >= 35 && n.energi_pct < 70).length;
    const criticalCount = nodes.filter(n => n.energi_pct < 35).length;

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- BARIS 1: 4 KARTU KPI TANAMAN & ENERGI (Gambar 1 & Gambar 2) -->
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

        <!-- BARIS 2: DONUT CHART (Gambar 2) & SAGE CARD (Gambar 1) -->
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

        <!-- BARIS 3: TABEL TELEMETRI NODE SENSOR -->
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Tabel Telemetri Node Sensor Tanaman</h3>
              <p class="card-sub">Menampilkan rekaman terakhir tiap node dari database Supabase</p>
            </div>
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Tambah Data Uji</button>
          </div>
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
                ${nodes.length ? nodes.map(n => {
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
                }).join('') : `
                  <tr>
                    <td colspan="8">Database tabel <strong>data_${escapeHtml(state.algo)}</strong> masih kosong. Klik tombol <strong>"+ Tambah Data Uji"</strong> di kanan atas tabel untuk mengisi sampel data otomatis.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </article>
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

    el.content.querySelector('#btn-quick-seed')?.addEventListener('click', seedDemoData);
  }

  // =========================================================================
  // 2. TOPOLOGI JARINGAN WSN
  // =========================================================================
  async function renderTopologyView() {
    const overview = state.overviewData || await apiGet('overview');
    const nodes = Array.isArray(overview.nodes) ? overview.nodes : [];
    const live = await apiGet('live', { since: state.liveCursor }).catch(() => ({ events: [] }));
    const events = Array.isArray(live.events) ? live.events : [];

    el.content.innerHTML = `
      <div class="topology-bento-layout">
        <article class="bento-card dark-topology-card">
          <div class="card-head">
            <div>
              <h3>Peta Rute Multi-Hop &amp; Cluster Head (next_hop)</h3>
              <p class="card-sub">Garis menghubungkan setiap id_node menuju next_hop hingga ke Base Station (Sink #0)</p>
            </div>
            <span class="pill-badge">${nodes.length} Node Aktif</span>
          </div>
          <div class="topology-canvas-wrap">
            <canvas id="topology-canvas" width="780" height="430"></canvas>
          </div>
        </article>

        <aside class="bento-card">
          <div class="card-head">
            <h3>Log Paket Terkini</h3>
            <span class="pill-badge">${events.length} Paket</span>
          </div>
          <div class="activity-list">
            ${events.slice(-8).reverse().map(ev => `
              <div class="activity-item">
                <span class="activity-avatar">N${ev.id_node}</span>
                <div>
                  <strong>Node #${ev.id_node} → Hop #${ev.next_hop} (Ronde #${ev.ronde})</strong>
                  <small style="display:block;color:var(--text-secondary)">
                    Tanah: ${ev.lembab_tanah}% · Suhu: ${ev.suhu}°C · ${ev.tegangan}V (${ev.energi_pct}%)
                  </small>
                </div>
              </div>
            `).join('') || '<p>Belum ada aktivitas transmisi.</p>'}
          </div>
        </aside>
      </div>
    `;

    drawTopologyCanvas('topology-canvas', nodes);
  }

  // =========================================================================
  // 3. GRAFIK ENERGI & SENSOR TANAMAN (Gambar 1 Climate Change Index)
  // =========================================================================
  async function renderEnergyView() {
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
              <h3>Tren Rata-rata Tegangan (V) &amp; Kelembapan Tanah (%) per Ronde</h3>
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
                ${rows.map((r, i) => `
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
  // FUNGSI CANVAS CHART
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

  function drawTopologyCanvas(id, nodes) {
    const c = document.getElementById(id);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const sink = { x: W / 2, y: H / 2 };
    const list = nodes.length ? nodes : Array.from({ length: 15 }, (_, i) => ({
      id_node: i + 1, next_hop: 0, energi_pct: 85, status_ch: i % 4 === 0 ? 1 : 0
    }));

    const pos = new Map();
    pos.set(0, sink);
    list.forEach((n, idx) => {
      const ring = n.status_ch === 1 ? 110 : 180;
      const a = (idx / list.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id_node, {
        x: sink.x + Math.cos(a) * ring * 1.4,
        y: sink.y + Math.sin(a) * ring * 0.9
      });
    });

    list.forEach(n => {
      const p1 = pos.get(n.id_node);
      const p2 = pos.get(Number(n.next_hop)) || sink;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = 'rgba(163, 230, 53, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    list.forEach(n => {
      const p = pos.get(n.id_node);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = n.status_ch === 1 ? '#22c55e' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(`N${n.id_node}`, p.x, p.y + 3.5);
    });

    ctx.beginPath();
    ctx.arc(sink.x, sink.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#a3e635';
    ctx.fill();
    ctx.fillStyle = '#0f170a';
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.fillText('SINK', sink.x, sink.y + 4);
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
    if (state.timer === 0) loadActiveView();
  }, 1000);

  loadActiveView();
})();
