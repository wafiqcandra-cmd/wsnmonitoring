(() => {
  'use strict';

  const API_URL = 'api.php';
  const REFRESH_INTERVAL = 60; // 60 detik sesuai footer index.php

  // Referensi Elemen DOM sesuai index.php
  const el = {
    navButtons: document.querySelectorAll('header.masthead nav button[data-view]'),
    algoSelect: document.getElementById('algorithm'),
    countdown: document.getElementById('countdown'),
    refreshBtn: document.getElementById('refresh'),
    title: document.getElementById('title'),
    feedback: document.getElementById('feedback'),
    content: document.getElementById('content'),
    allLogBtn: document.getElementById('all-log'),
    deleteAllBtn: document.getElementById('delete-all'),

    // Modal Log Riwayat Node
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

    // Modal Konfirmasi Hapus
    confirmDialog: document.getElementById('confirm-dialog'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmText: document.getElementById('confirm-text'),
    deleteForm: document.getElementById('delete-form'),
    deleteWord: document.getElementById('delete-word'),
    deleteError: document.getElementById('delete-error'),
    cancelDeleteBtn: document.getElementById('cancel-delete')
  };

  // State Aplikasi
  const state = {
    view: 'nodes',
    algo: el.algoSelect ? el.algoSelect.value : 'multihop_gso',
    timer: REFRESH_INTERVAL,
    timerId: null,
    liveCursor: 0,
    liveMode: 'live', // 'live' atau 'replay'
    overviewData: null,
    logState: {
      node: 0,
      cursor: 0,
      round: 0,
      order: 'desc',
      loading: false,
      next: null
    },
    pendingDelete: null
  };

  const VIEW_TITLES = {
    nodes: 'Dashboard',
    topology: 'Topologi Jaringan',
    energy: 'Analisis Energi & Grafik',
    compare: 'Perbandingan Algoritma'
  };

  // =========================================================================
  // UTILITAS FORMAT & HELPER DATA
  // =========================================================================
  const fmtInt = (n) => Number(n || 0).toLocaleString('id-ID');
  const fmtDec = (n, d = 2) => Number(n || 0).toLocaleString('id-ID', {
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
    el.feedback.style.background = isError ? 'var(--danger-soft)' : 'var(--accent-soft)';
  }

  async function apiGet(action, params = {}) {
    const query = new URLSearchParams({
      algo: state.algo,
      action,
      ...params
    });
    const res = await fetch(`${API_URL}?${query.toString()}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Normalisasi fleksibel untuk struktur data node dari api.php
  function extractNodes(raw) {
    if (!raw) return [];
    const list = Array.isArray(raw)
      ? raw
      : (raw.nodes || raw.rows || raw.devices || raw.data || []);
    if (!Array.isArray(list)) return [];

    return list.map((item, idx) => {
      const id = Number(item.id_node ?? item.node_id ?? item.node ?? item.id ?? (idx + 1));
      const energy = Number(item.energi ?? item.energy ?? item.sisa_energi ?? item.battery ?? item.tegangan ?? 0);
      const maxEnergy = Number(item.energi_awal ?? item.initial_energy ?? item.max_energy ?? (energy > 5 ? 100 : 2.0));
      const pct = item.persentase ?? item.battery_pct ?? (maxEnergy > 0 ? Math.min(100, Math.max(0, (energy / maxEnergy) * 100)) : 0);
      const round = Number(item.ronde ?? item.round ?? item.max_round ?? 0);
      const parent = item.parent ?? item.id_parent ?? item.next_hop ?? item.ch ?? item.cluster_head ?? 0;
      const role = item.peran ?? item.role ?? item.status_ch ?? (Number(parent) === 0 ? 'Cluster Head / Relay' : 'Sensor Node');
      const rssi = item.rssi ?? item.snr ?? item.sinyal ?? null;
      const time = item.waktu ?? item.updated_at ?? item.time ?? '-';
      const records = Number(item.records ?? item.total_paket ?? item.packets ?? round);

      return { id, energy, maxEnergy, pct, round, parent, role, rssi, time, records, raw: item };
    });
  }

  // Generator SVG Sparkline (seperti kolom "Dynamic" pada Gambar 1)
  function renderSparklineSVG(seed = 1, isHealthy = true) {
    const stroke = isHealthy ? '#22c55e' : '#ef4444';
    const fill = isHealthy ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)';
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const y = 22 - ((Math.sin(seed * 1.7 + i * 0.9) + 1) * 7 + (isHealthy ? 4 : 1));
      pts.push(`${i * 18},${Math.round(y)}`);
    }
    const pathD = `M ${pts.join(' L ')}`;
    const areaD = `${pathD} L 108,28 L 0,28 Z`;
    return `
      <svg class="sparkline-svg" viewBox="0 0 108 28" aria-hidden="true">
        <path d="${areaD}" fill="${fill}"></path>
        <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    `;
  }

  // Generator Mini Bar Chart (seperti kartu KPI atas pada Gambar 1)
  function renderMiniBarsHTML(values = [45, 80, 35, 60, 90], isAlert = false) {
    const cls = isAlert ? 'mini-bars alert' : 'mini-bars';
    return `
      <div class="${cls}" aria-hidden="true">
        ${values.map(v => `<span style="height:${Math.max(18, Math.min(100, v))}%"></span>`).join('')}
      </div>
    `;
  }

  // =========================================================================
  // 1. VIEW: DASHBOARD NODES (Adaptasi Bento Grid Gambar 1 & Gambar 2)
  // =========================================================================
  async function renderNodesView() {
    const data = await apiGet('overview');
    state.overviewData = data;
    const nodes = extractNodes(data);

    const summary = data.summary || data.stats || data.meta || {};
    const totalNodes = Number(summary.total_nodes ?? summary.nodes ?? nodes.length ?? 0);
    const activeNodes = nodes.filter(n => n.energy > 0).length || totalNodes;
    const avgPct = nodes.length
      ? nodes.reduce((acc, n) => acc + n.pct, 0) / nodes.length
      : Number(summary.avg_battery ?? 85.5);
    const avgEnergy = nodes.length
      ? nodes.reduce((acc, n) => acc + n.energy, 0) / nodes.length
      : Number(summary.avg_energy ?? 1.65);
    const maxRound = Number(
      summary.max_round ?? summary.ronde ??
      (nodes.length ? Math.max(...nodes.map(n => n.round)) : 0)
    );
    const totalRecords = Number(
      summary.records ?? summary.total_records ??
      (nodes.reduce((acc, n) => acc + n.records, 0) || maxRound * Math.max(1, totalNodes))
    );

    const aliveRatio = totalNodes > 0 ? Math.round((activeNodes / totalNodes) * 100) : 100;
    const optimalCount = nodes.filter(n => n.pct >= 60).length;
    const warningCount = nodes.filter(n => n.pct >= 25 && n.pct < 60).length;
    const criticalCount = nodes.filter(n => n.pct < 25).length;

    const algoLabel = el.algoSelect?.selectedOptions?.[0]?.textContent || state.algo.toUpperCase();

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- BARIS 1: 4 KARTU KPI (Kombinasi Gambar 1 & Gambar 2) -->
        <div class="kpi-grid">
          <!-- Kartu 1: Highlight Card Gelap/Hijau dengan Mini Bar (Gambar 1) -->
          <article class="bento-card kpi-card featured-kpi">
            <div class="kpi-info">
              <span class="kpi-label">Rata-rata Energi Node</span>
              <strong class="kpi-value">${fmtDec(avgEnergy, 3)} <small>J</small></strong>
              <span class="kpi-trend positive">↗ ${fmtDec(avgPct, 1)}% kapasitas rata-rata</span>
            </div>
            ${renderMiniBarsHTML([65, 40, 82, 55, 92])}
          </article>

          <!-- Kartu 2: Indeks Kualitas Jaringan (Gambar 1: 75.50/100%) -->
          <article class="bento-card kpi-card">
            <div class="kpi-info">
              <span class="kpi-label">Ketersediaan Node Aktif</span>
              <strong class="kpi-value">${activeNodes}<span class="kpi-denom">/${totalNodes || 15}</span></strong>
              <span class="kpi-trend ${aliveRatio >= 80 ? 'positive' : 'negative'}">
                ↗ ${aliveRatio}% beroperasi normal
              </span>
            </div>
            ${renderMiniBarsHTML([85, 50, 30, 75, 60], aliveRatio < 75)}
          </article>

          <!-- Kartu 3: Semi-Circle Gauge (Gambar 2: Quarterly revenue goal 71%) -->
          <article class="bento-card kpi-card gauge-kpi">
            <div class="kpi-info">
              <span class="kpi-label">Stabilitas E-Kesehatan WSN</span>
              <strong class="kpi-value">${fmtDec(avgPct, 0)}%</strong>
              <span class="kpi-trend muted">Target: &gt; 75% Efisiensi</span>
            </div>
            <div class="semi-gauge" style="--gauge-pct: ${Math.round(avgPct)}">
              <div class="semi-gauge-needle"></div>
            </div>
          </article>

          <!-- Kartu 4: Total Siklus & Rekaman (Gambar 2: New orders 18,221) -->
          <article class="bento-card kpi-card">
            <div class="kpi-info">
              <span class="kpi-label">Ronde &amp; Transmisi Paket</span>
              <strong class="kpi-value">${fmtInt(maxRound)} <small>ronde</small></strong>
              <span class="kpi-trend positive">↗ ${fmtInt(totalRecords)} total rekaman log</span>
            </div>
            ${renderMiniBarsHTML([45, 70, 60, 88, 72])}
          </article>
        </div>

        <!-- BARIS 2: DONUT OVERVIEW (Gambar 2) & KARTU SAGE GREEN (Gambar 1) -->
        <div class="middle-bento-grid">
          <!-- Kartu Distribusi Energi Node (Adaptasi "Sales Overview" Gambar 2) -->
          <article class="bento-card overview-donut-card">
            <div class="card-head">
              <h3>Distribusi Kesehatan Baterai Node</h3>
              <span class="pill-badge">${escapeHtml(algoLabel)}</span>
            </div>
            <div class="donut-layout">
              <div class="donut-chart-wrap">
                <canvas id="health-donut-canvas" width="180" height="180"></canvas>
                <div class="donut-center">
                  <strong>${totalNodes}</strong>
                  <span>Total Node</span>
                </div>
              </div>
              <div class="donut-legend-box">
                <div class="legend-highlight">
                  <span class="badge-icon">⚡</span>
                  <div>
                    <small>Total Paket Diterima Sink</small>
                    <strong>${fmtInt(totalRecords)} Paket</strong>
                  </div>
                </div>
                <div class="legend-grid">
                  <div class="legend-item">
                    <span class="dot dot-optimal"></span>
                    <div>
                      <small>Optimal (&ge;60%)</small>
                      <strong>${optimalCount} Node</strong>
                    </div>
                  </div>
                  <div class="legend-item">
                    <span class="dot dot-warning"></span>
                    <div>
                      <small>Siaga (25–59%)</small>
                      <strong>${warningCount} Node</strong>
                    </div>
                  </div>
                  <div class="legend-item">
                    <span class="dot dot-critical"></span>
                    <div>
                      <small>Kritis (&lt;25%)</small>
                      <strong>${criticalCount} Node</strong>
                    </div>
                  </div>
                  <div class="legend-item">
                    <span class="dot dot-ch"></span>
                    <div>
                      <small>Ronde Tertinggi</small>
                      <strong>#${fmtInt(maxRound)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <!-- Kartu Sage Green (Adaptasi "99,681m TONS" Gambar 1) -->
          <article class="bento-card sage-summary-card">
            <div class="sage-big-number">
              <strong>${fmtInt(totalRecords)}</strong>
              <span>PAKET</span>
            </div>
            <p class="sage-subtitle">↗ Optimasi penghematan daya aktif pada ${escapeHtml(algoLabel)}</p>
            <div class="sage-Breakdown">
              <div class="sage-item">
                <span class="sage-icon">♻</span>
                <div>
                  <strong>Routing &amp; Agregasi Klaster</strong>
                  <small>${activeNodes} Node berpartisipasi pada ronde #${fmtInt(maxRound)}</small>
                </div>
              </div>
              <div class="sage-item">
                <span class="sage-icon">❖</span>
                <div>
                  <strong>Manajemen Daya Multi-Hop</strong>
                  <small>Rata-rata baterai ${fmtDec(avgPct, 1)}% (${fmtDec(avgEnergy, 3)} J)</small>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- BARIS 3: TABEL NODE (Adaptasi "Plastic Recycling by Region" Gambar 1 & "Customer list" Gambar 2) -->
        <article class="bento-card table-bento-card">
          <div class="card-head">
            <div>
              <h3>Status Telemetri Node Sensor</h3>
              <p class="card-sub">Klik tombol riwayat pada baris node untuk membuka rekaman log mendalam</p>
            </div>
            <button type="button" class="pill-action-btn" id="open-all-history">Lihat Semua Rekaman</button>
          </div>
          <div class="table-responsive">
            <table class="modern-table">
              <thead>
                <tr>
                  <th>Node Sensor</th>
                  <th>Ronde</th>
                  <th>Kapasitas</th>
                  <th>Dinamika Energi</th>
                  <th>Peran / Parent</th>
                  <th>Energi Aktual</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${nodes.length ? nodes.map(n => {
                  const healthy = n.pct >= 30;
                  return `
                    <tr>
                      <td>
                        <div class="node-ident">
                          <span class="node-avatar ${healthy ? 'ok' : 'low'}">N${n.id}</span>
                          <div>
                            <strong>Node #${n.id}</strong>
                            <small>${escapeHtml(n.time)}</small>
                          </div>
                        </div>
                      </td>
                      <td><strong>#${fmtInt(n.round)}</strong></td>
                      <td>
                        <div class="pct-cell">
                          <strong>${fmtDec(n.pct, 1)}%</strong>
                          <div class="mini-progress"><span style="width:${Math.min(100, n.pct)}%"></span></div>
                        </div>
                      </td>
                      <td>${renderSparklineSVG(n.id, healthy)}</td>
                      <td>
                        <span class="tech-tag ${Number(n.parent) === 0 ? 'ch' : ''}">
                          ${Number(n.parent) === 0 ? 'Sink / CH' : `Hop → N${escapeHtml(n.parent)}`}
                        </span>
                      </td>
                      <td><strong>${fmtDec(n.energy, 4)} J</strong></td>
                      <td>
                        <button type="button" class="row-action-btn" data-node-log="${n.id}" title="Lihat Riwayat Node ${n.id}">
                          Riwayat ⋯
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="7" class="empty-cell">Belum ada data node untuk algoritma ini.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;

    // Gambar Donut Chart pada Canvas
    drawDonutChart('health-donut-canvas', [
      { value: optimalCount || 1, color: '#a3e635' },
      { value: warningCount, color: '#22c55e' },
      { value: criticalCount, color: '#ef4444' }
    ]);

    // Bind klik tombol riwayat per node
    el.content.querySelectorAll('[data-node-log]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeId = Number(btn.getAttribute('data-node-log'));
        openLogModal(nodeId);
      });
    });

    el.content.querySelector('#open-all-history')?.addEventListener('click', () => {
      openLogModal(0);
    });
  }

  // =========================================================================
  // 2. VIEW: TOPOLOGI JARINGAN (Adaptasi Peta Gelap "Global pollution" Gambar 1)
  // =========================================================================
  async function renderTopologyView() {
    const overview = state.overviewData || await apiGet('overview');
    const nodes = extractNodes(overview);

    let liveData = { events: [], snapshot_at: '-' };
    try {
      liveData = await apiGet('live', { since: state.liveCursor });
      state.liveMode = 'live';
    } catch (err) {
      // Sesuai api.php: jika kode 409 ("Dataset historis; gunakan Replay."), panggil action=replay
      if (err.status === 409) {
        liveData = await apiGet('replay');
        state.liveMode = 'replay';
      }
    }

    const events = Array.isArray(liveData.events) ? liveData.events : [];
    if (liveData.cursor) state.liveCursor = liveData.cursor;

    el.content.innerHTML = `
      <div class="topology-bento-layout">
        <!-- Peta Topologi Utama (Gaya Kartu Gelap Gambar 1) -->
        <article class="bento-card dark-topology-card">
          <div class="card-head">
            <div>
              <h3>Topologi Multi-Hop &amp; Klaster WSN</h3>
              <p class="card-sub">Mode: <strong>${state.liveMode === 'replay' ? 'Replay Historis (200 Rekaman)' : 'Live Stream Telemetry'}</strong></p>
            </div>
            <div class="topo-actions">
              <span class="pill-badge">${nodes.length || 15} Node Terdeteksi</span>
              <button type="button" id="btn-replay-step" class="pill-action-btn">Animasikan Paket</button>
            </div>
          </div>
          <div class="topology-canvas-wrap">
            <canvas id="topology-canvas" width="820" height="440"></canvas>
          </div>
        </article>

        <!-- Panel Samping Aktivitas Transmisi (Adaptasi "Notifications / Activities" Gambar 2) -->
        <aside class="bento-card activity-feed-card">
          <div class="card-head">
            <h3>Aktivitas Paket Terkini</h3>
            <span class="pill-badge">${events.length} event</span>
          </div>
          <div class="activity-list">
            ${events.slice(0, 8).map(ev => {
              const nid = ev.id_node ?? ev.node ?? '?';
              const rnd = ev.ronde ?? ev.round ?? '-';
              const nrg = ev.energi ?? ev.energy ?? null;
              return `
                <div class="activity-item">
                  <span class="activity-avatar">N${escapeHtml(nid)}</span>
                  <div class="activity-body">
                    <strong>Node #${escapeHtml(nid)} → Ronde #${escapeHtml(rnd)}</strong>
                    <small>${nrg !== null ? `Energi: ${fmtDec(nrg, 4)} J · ` : ''}${escapeHtml(ev.waktu || '')}</small>
                  </div>
                </div>
              `;
            }).join('') || `<p class="muted">Menunggu aliran paket atau pilih Replay untuk simulasi.</p>`}
          </div>
        </aside>
      </div>
    `;

    drawTopologyCanvas('topology-canvas', nodes);
    el.content.querySelector('#btn-replay-step')?.addEventListener('click', () => {
      drawTopologyCanvas('topology-canvas', nodes, true);
    });
  }

  // =========================================================================
  // 3. VIEW: GRAFIK ENERGI (Adaptasi "Climate Change Index" Gambar 1 & Area Chart Gambar 2)
  // =========================================================================
  async function renderEnergyView() {
    const [energyAll, energyMetrics, overview] = await Promise.all([
      apiGet('energy_all').catch(() => ({})),
      apiGet('energy_metrics').catch(() => ({})),
      state.overviewData ? Promise.resolve(state.overviewData) : apiGet('overview').catch(() => ({}))
    ]);

    const nodes = extractNodes(overview.nodes ? overview : energyAll);
    const metrics = energyMetrics.metrics || energyMetrics.summary || energyMetrics || {};

    const avgEnergy = nodes.length
      ? nodes.reduce((s, n) => s + n.energy, 0) / nodes.length
      : Number(metrics.avg_energy ?? 1.42);
    const minEnergy = nodes.length
      ? Math.min(...nodes.map(n => n.energy))
      : Number(metrics.min_energy ?? 0.45);
    const maxEnergy = nodes.length
      ? Math.max(...nodes.map(n => n.energy))
      : Number(metrics.max_energy ?? 2.0);

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- Grafik Batang Indeks Energi Node (Adaptasi "Climate Change Index" Gambar 1) -->
        <article class="bento-card chart-bento-card">
          <div class="card-head">
            <div>
              <h3>Indeks Kapasitas Energi per Node (Energy Decay Index)</h3>
              <p class="card-sub">Garis putus-putus menunjukkan ambang batas rata-rata energi jaringan (${fmtDec(avgEnergy, 3)} J)</p>
            </div>
            <span class="pill-badge">Rata-rata: ${fmtDec(avgEnergy, 3)} J</span>
          </div>
          <div class="canvas-box">
            <canvas id="cci-bar-canvas" width="860" height="280"></canvas>
          </div>
        </article>

        <!-- Baris Bawah: Kurva Area (Gambar 2 "Total Profit") + Ringkasan Metrik -->
        <div class="middle-bento-grid">
          <article class="bento-card">
            <div class="card-head">
              <div>
                <h3>Kurva Degradasi Energi terhadap Ronde</h3>
                <p class="card-sub">Tren penurunan daya baterai sepanjang ronde transmisi</p>
              </div>
            </div>
            <div class="canvas-box">
              <canvas id="area-energy-canvas" width="540" height="230"></canvas>
            </div>
          </article>

          <article class="bento-card sage-summary-card">
            <div class="sage-big-number">
              <strong>${fmtDec(avgEnergy, 3)}</strong>
              <span>JOULE (AVG)</span>
            </div>
            <p class="sage-subtitle">↗ Rentang Energi: ${fmtDec(minEnergy, 3)} J s/d ${fmtDec(maxEnergy, 3)} J</p>
            <div class="sage-Breakdown">
              <div class="sage-item">
                <span class="sage-icon">🔋</span>
                <div>
                  <strong>Energi Maksimum Terukur</strong>
                  <small>${fmtDec(maxEnergy, 4)} Joule</small>
                </div>
              </div>
              <div class="sage-item">
                <span class="sage-icon">⚠️</span>
                <div>
                  <strong>Energi Minimum Node</strong>
                  <small>${fmtDec(minEnergy, 4)} Joule</small>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    `;

    drawCCIBarChart('cci-bar-canvas', nodes, avgEnergy);
    drawAreaEnergyChart('area-energy-canvas', energyAll, nodes);
  }

  // =========================================================================
  // 4. VIEW: PERBANDINGAN ALGORITMA (Endpoint action=compare di api.php)
  // =========================================================================
  async function renderCompareView() {
    const data = await apiGet('compare');
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const note = data.note || '';

    const maxRecords = Math.max(1, ...rows.map(r => Number(r.records || 0)));

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <!-- Grafik Perbandingan Ronde & Rekaman -->
        <article class="bento-card">
          <div class="card-head">
            <div>
              <h3>Perbandingan Kinerja 6 Protokol Routing WSN</h3>
              <p class="card-sub">Membandingkan jumlah rekaman transmisi dan ronde maksimum antar algoritma</p>
            </div>
          </div>
          <div class="canvas-box">
            <canvas id="compare-bar-canvas" width="860" height="250"></canvas>
          </div>
        </article>

        <!-- Tabel Perbandingan (Adaptasi Tabel Gambar 1 & Gambar 2) -->
        <article class="bento-card table-bento-card">
          <div class="card-head">
            <h3>Tabel Komparasi Dataset Algoritma</h3>
            <span class="pill-badge">${rows.length} Algoritma</span>
          </div>
          <div class="table-responsive">
            <table class="modern-table">
              <thead>
                <tr>
                  <th>Algoritma Routing</th>
                  <th>Node Terlibat</th>
                  <th>Ronde Maksimum</th>
                  <th>Dinamika Transmisi</th>
                  <th>Rentang Waktu Eksperimen</th>
                  <th>Total Rekaman</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r, i) => {
                  const rec = Number(r.records || 0);
                  const pct = Math.round((rec / maxRecords) * 100);
                  return `
                    <tr>
                      <td>
                        <div class="node-ident">
                          <span class="node-avatar ok">A${i + 1}</span>
                          <strong>${escapeHtml(r.algorithm || '-')}</strong>
                        </div>
                      </td>
                      <td><strong>${fmtInt(r.nodes)} Node</strong></td>
                      <td><span class="tech-tag ch">Ronde #${fmtInt(r.max_round)}</span></td>
                      <td>${renderSparklineSVG(i + 2, pct > 30)}</td>
                      <td>
                        <small>${escapeHtml(r.start || '-')} <br>s/d ${escapeHtml(r.end || '-')}</small>
                      </td>
                      <td><strong>${fmtInt(rec)} rekaman</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${note ? `<p class="compare-note">ℹ️ ${escapeHtml(note)}</p>` : ''}
        </article>
      </div>
    `;

    drawCompareChart('compare-bar-canvas', rows);
  }

  // =========================================================================
  // RENDERER GRAFIK CANVAS (Bawaan Tanpa Library Eksternal)
  // =========================================================================
  function drawDonutChart(canvasId, segments) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
    let startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    segments.forEach(seg => {
      if (seg.value <= 0) return;
      const slice = (seg.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(90, 90, 68, startAngle, startAngle + slice);
      ctx.lineWidth = 22;
      ctx.strokeStyle = seg.color;
      ctx.stroke();
      startAngle += slice;
    });
  }

  // Grafik Batang bergaya "Climate Change Index" (Gambar 1)
  function drawCCIBarChart(canvasId, nodes, avgEnergy) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const list = nodes.length ? nodes : Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      energy: 1.1 + Math.sin(i) * 0.5
    }));
    const maxVal = Math.max(2.0, ...list.map(n => n.energy)) * 1.15;
    const padL = 48, padR = 24, padT = 30, padB = 38;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // Garis Grid Horizontal
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();

      const val = ((4 - i) / 4) * maxVal;
      ctx.fillStyle = '#829188';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText(val.toFixed(1), 10, y + 4);
    }

    // Batang Vertikal
    const step = plotW / list.length;
    const barW = Math.min(24, step * 0.55);

    list.forEach((n, idx) => {
      const x = padL + idx * step + (step - barW) / 2;
      const h = Math.max(6, (n.energy / maxVal) * plotH);
      const y = padT + plotH - h;

      const grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
      grad.addColorStop(0, n.energy >= avgEnergy ? '#a3e635' : '#22c55e');
      grad.addColorStop(1, '#15803d');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 5);
      ctx.fill();

      ctx.fillStyle = '#829188';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`N${n.id}`, x + barW / 2, H - 12);
    });

    // Garis Putus-putus Ambang Batas & Pill Callout Hitam seperti "82.6 CCI" (Gambar 1)
    const avgY = padT + plotH - (Math.min(maxVal, avgEnergy) / maxVal) * plotH;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(W - padR, avgY);
    ctx.stroke();

    // Label Pill di tengah garis
    const badgeText = `${avgEnergy.toFixed(2)} J AVG`;
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    const bw = ctx.measureText(badgeText).width + 20;
    ctx.fillStyle = '#111915';
    ctx.beginPath();
    ctx.roundRect(W / 2 - bw / 2, avgY - 24, bw, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#a3e635';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, W / 2, avgY - 9);
    ctx.restore();
  }

  // Kurva Area Hijau bergaya "Total Profit" (Gambar 2)
  function drawAreaEnergyChart(canvasId, energyAll, nodes) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const rawPoints = Array.isArray(energyAll?.series)
      ? energyAll.series
      : (Array.isArray(energyAll?.rows) ? energyAll.rows : nodes.map(n => n.energy));
    const values = rawPoints.length >= 2
      ? rawPoints.slice(0, 30).map(v => Number(v.energi ?? v.energy ?? v.avg ?? v) || 1)
      : [2.0, 1.92, 1.85, 1.76, 1.70, 1.61, 1.54, 1.48, 1.41, 1.35];

    const maxV = Math.max(...values, 1) * 1.1;
    const pad = 28;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const coords = values.map((v, i) => ({
      x: pad + (i / (values.length - 1)) * plotW,
      y: pad + plotH - (v / maxV) * plotH
    }));

    const grad = ctx.createLinearGradient(0, pad, 0, H - pad);
    grad.addColorStop(0, 'rgba(34, 197, 94, 0.45)');
    grad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

    ctx.beginPath();
    ctx.moveTo(coords[0].x, H - pad);
    coords.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(coords[coords.length - 1].x, H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    coords.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Visualisasi Topologi Jaringan
  function drawTopologyCanvas(canvasId, nodes, highlightPulse = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const sink = { x: W / 2, y: H / 2 };
    const list = nodes.length ? nodes : Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      pct: 75,
      parent: i % 4 === 0 ? 0 : ((i % 4) * 4 + 1)
    }));

    const posMap = new Map();
    posMap.set(0, sink);

    list.forEach((n, idx) => {
      const ring = idx < 5 ? 115 : 185;
      const angle = (idx / list.length) * Math.PI * 2 - Math.PI / 2;
      posMap.set(n.id, {
        x: sink.x + Math.cos(angle) * ring * 1.35,
        y: sink.y + Math.sin(angle) * ring * 0.9
      });
    });

    // Garis Link Antar Node
    list.forEach(n => {
      const from = posMap.get(n.id);
      const to = posMap.get(Number(n.parent)) || sink;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = highlightPulse ? 'rgba(163, 230, 53, 0.65)' : 'rgba(34, 197, 94, 0.32)';
      ctx.lineWidth = Number(n.parent) === 0 ? 2 : 1.2;
      ctx.stroke();
    });

    // Gambar Node Sensor
    list.forEach(n => {
      const p = posMap.get(n.id);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = n.pct >= 30 ? '#15803d' : '#dc2626';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#a3e635';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`N${n.id}`, p.x, p.y + 3.5);
    });

    // Gambar Sink / Base Station di Tengah
    ctx.beginPath();
    ctx.arc(sink.x, sink.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#a3e635';
    ctx.fill();
    ctx.fillStyle = '#0f170a';
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SINK', sink.x, sink.y + 4);
  }

  function drawCompareChart(canvasId, rows) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !rows.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const maxRound = Math.max(1, ...rows.map(r => Number(r.max_round || 0))) * 1.15;
    const padL = 50, padR = 24, padT = 24, padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const step = plotW / rows.length;
    const barW = Math.min(48, step * 0.45);

    rows.forEach((r, idx) => {
      const val = Number(r.max_round || 0);
      const h = Math.max(8, (val / maxRound) * plotH);
      const x = padL + idx * step + (step - barW) / 2;
      const y = padT + plotH - h;

      ctx.fillStyle = idx % 2 === 0 ? '#a3e635' : '#22c55e';
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 8);
      ctx.fill();

      ctx.fillStyle = '#f3f5f7';
      ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fmtInt(val), x + barW / 2, y - 6);

      ctx.fillStyle = '#829188';
      ctx.font = '11px Plus Jakarta Sans, sans-serif';
      ctx.fillText(String(r.algorithm || '').slice(0, 14), x + barW / 2, H - 14);
    });
  }

  // =========================================================================
  // MODAL RIWAYAT LOG (#log-dialog) & KONFIRMASI HAPUS (#confirm-dialog)
  // =========================================================================
  async function openLogModal(nodeId = 0) {
    if (!el.logDialog) return;
    state.logState = { node: nodeId, cursor: 0, round: 0, order: 'desc', loading: false, next: null };

    el.logTitle.textContent = nodeId > 0 ? `Riwayat Node #${nodeId}` : 'Seluruh Riwayat Rekaman WSN';
    el.logContext.textContent = `Algoritma: ${state.algo.toUpperCase()}`;
    el.logHead.innerHTML = '';
    el.logBody.innerHTML = '';
    el.logStatus.textContent = 'Memuat…';

    if (el.downloadLog) {
      const dlParams = new URLSearchParams({ algo: state.algo, action: 'export', node: nodeId });
      el.downloadLog.href = `${API_URL}?${dlParams.toString()}`;
    }

    if (!el.logDialog.open) el.logDialog.showModal();
    await loadMoreHistory(true);
  }

  async function loadMoreHistory(reset = false) {
    const st = state.logState;
    if (st.loading) return;
    st.loading = true;
    el.logStatus.textContent = 'Memuat rekaman…';

    try {
      const res = await apiGet('history', {
        node: st.node,
        cursor: reset ? 0 : (st.next || 0),
        round: st.round,
        order: st.order
      });

      const rows = Array.isArray(res.rows) ? res.rows : [];
      st.next = res.next || null;

      if (reset && rows.length > 0) {
        const cols = Object.keys(rows[0]);
        el.logHead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      }

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        const html = rows.map(r => `
          <tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>
        `).join('');
        el.logBody.insertAdjacentHTML('beforeend', html);
        el.logStatus.textContent = st.next ? 'Gulir ke bawah untuk memuat lebih banyak…' : 'Seluruh rekaman telah ditampilkan.';
      } else if (reset) {
        el.logStatus.textContent = 'Tidak ada rekaman ditemukan.';
      }
    } catch (err) {
      el.logStatus.textContent = `Gagal memuat log: ${err.message}`;
    } finally {
      st.loading = false;
    }
  }

  function openConfirmDelete(scope = 'all') {
    if (!el.confirmDialog) return;
    state.pendingDelete = scope;
    el.deleteWord.value = '';
    el.deleteError.textContent = '';
    el.confirmText.textContent = scope === 'node' && state.logState.node > 0
      ? `Anda akan menghapus rekaman log untuk Node #${state.logState.node} pada algoritma ${state.algo}.`
      : `Anda akan menghapus seluruh rekaman log pada algoritma ${state.algo}.`;
    el.confirmDialog.showModal();
  }

  // =========================================================================
  // ROUTER VIEW & TIMER COUNTDOWN
  // =========================================================================
  async function loadActiveView() {
    if (!el.content) return;
    el.content.setAttribute('aria-busy', 'true');
    showFeedback('');

    if (el.title) {
      el.title.textContent = VIEW_TITLES[state.view] || 'Dashboard';
    }

    try {
      if (state.view === 'nodes') await renderNodesView();
      else if (state.view === 'topology') await renderTopologyView();
      else if (state.view === 'energy') await renderEnergyView();
      else if (state.view === 'compare') await renderCompareView();
    } catch (err) {
      showFeedback(err.message || 'Gagal memuat data dari server.', true);
    } finally {
      el.content.setAttribute('aria-busy', 'false');
      state.timer = REFRESH_INTERVAL;
    }
  }

  function startCountdown() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      state.timer = Math.max(0, state.timer - 1);
      if (el.countdown) {
        const m = String(Math.floor(state.timer / 60)).padStart(2, '0');
        const s = String(state.timer % 60).padStart(2, '0');
        el.countdown.textContent = `${m}:${s}`;
      }
      if (state.timer === 0) {
        loadActiveView();
      }
    }, 1000);
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================
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
    state.liveCursor = 0;
    loadActiveView();
  });

  el.refreshBtn?.addEventListener('click', () => loadActiveView());
  el.allLogBtn?.addEventListener('click', () => openLogModal(0));
  el.deleteAllBtn?.addEventListener('click', () => openConfirmDelete('all'));
  el.deleteLogBtn?.addEventListener('click', () => openConfirmDelete('node'));
  el.closeLogBtn?.addEventListener('click', () => el.logDialog?.close());
  el.cancelDeleteBtn?.addEventListener('click', () => el.confirmDialog?.close());

  el.logScroll?.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = el.logScroll;
    if (scrollTop + clientHeight >= scrollHeight - 36 && state.logState.next) {
      loadMoreHistory(false);
    }
  });

  el.deleteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (el.deleteWord.value.trim() !== 'HAPUS') {
      el.deleteError.textContent = 'Ketik HAPUS dengan huruf kapital.';
      return;
    }
    try {
      const res = await fetch(`${API_URL}?algo=${encodeURIComponent(state.algo)}&action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algo: state.algo,
          node: state.pendingDelete === 'node' ? state.logState.node : 0,
          confirm: 'HAPUS'
        })
      });
      if (!res.ok) throw new Error('Endpoint penghapusan menolak permintaan.');
      el.confirmDialog?.close();
      el.logDialog?.close();
      showFeedback('Rekaman log berhasil dihapus.');
      loadActiveView();
    } catch (err) {
      el.deleteError.textContent = err.message;
    }
  });

  // Inisialisasi Awal
  loadActiveView();
  startCountdown();
})();