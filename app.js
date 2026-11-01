(() => {
  'use strict';

  // =========================================================================
  // KONFIGURASI SUPABASE (Proyek: orxrgdovcjpjgbkzqntr)
  // Tempelkan anon public key Anda di DEFAULT_SUPABASE_KEY, atau masukkan
  // langsung melalui tombol "🔑 Koneksi Supabase" di tampilan web.
  // =========================================================================
  const DEFAULT_SUPABASE_URL = 'https://orxrgdovcjpjgbkzqntr.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yeHJnZG92Y2pwamdia3pxbnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDA4MDgsImV4cCI6MjEwODk3NjgwOH0.pe2BVeOvhN-ItXiZ3J5iIMlLO164I6kZzI0_eF2rzQc';

  const ALGOS = {
    multihop_murni: 'Multihop Murni',
    multihop_pso:   'Multihop-PSO',
    multihop_gso:   'Multihop-GSO',
    leach_murni:    'LEACH Murni',
    leach_pso:      'LEACH-PSO',
    leach_gso:      'LEACH-GSO'
  };

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

    connDot: document.getElementById('conn-dot'),
    connStatusText: document.getElementById('conn-status-text'),

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

    keyDialog: document.getElementById('key-dialog'),
    openKeyModalBtn: document.getElementById('open-key-modal'),
    closeKeyModalBtn: document.getElementById('close-key-modal'),
    keyForm: document.getElementById('key-form'),
    sbUrlInput: document.getElementById('sb-url-input'),
    sbKeyInput: document.getElementById('sb-key-input'),

    btnLight: document.getElementById('theme-light'),
    btnDark: document.getElementById('theme-dark')
  };

  const state = {
    view: 'nodes',
    algo: el.algoSelect ? el.algoSelect.value : 'multihop_gso',
    timer: REFRESH_INTERVAL,
    overviewData: null,
    logState: { node: 0, offset: 0, loading: false, hasMore: false, rowsCache: [] },
    pendingDelete: null,
    supabase: null
  };

  const VIEW_TITLES = {
    nodes: 'Dashboard Tanaman & Sensor WSN',
    topology: 'Topologi Klaster & Multi-Hop',
    energy: 'Grafik Energi & Lingkungan Tanaman',
    compare: 'Perbandingan Algoritma WSN'
  };

  // =========================================================================
  // INISIALISASI CLIENT SUPABASE JS
  // =========================================================================
  function getSupabaseConfig() {
    const savedUrl = localStorage.getItem('wsn_sb_url') || DEFAULT_SUPABASE_URL;
    const savedKey = localStorage.getItem('wsn_sb_key') || DEFAULT_SUPABASE_KEY;
    return { url: savedUrl.trim(), key: savedKey.trim() };
  }

  function initSupabaseClient() {
    const { url, key } = getSupabaseConfig();
    if (el.sbUrlInput) el.sbUrlInput.value = url;
    if (el.sbKeyInput && key !== 'MASUKKAN_ANON_KEY_SUPABASE_DI_SINI') {
      el.sbKeyInput.value = key;
    }

    if (!key || key === 'MASUKKAN_ANON_KEY_SUPABASE_DI_SINI') {
      state.supabase = null;
      if (el.connDot) el.connDot.style.background = '#f59e0b';
      if (el.connStatusText) el.connStatusText.textContent = 'Menunggu Anon Key';
      return false;
    }

    try {
      state.supabase = window.supabase.createClient(url, key);
      if (el.connDot) el.connDot.style.background = '#22c55e';
      if (el.connStatusText) el.connStatusText.textContent = 'ap-southeast-1 · Terhubung';
      return true;
    } catch (err) {
      state.supabase = null;
      showFeedback('Gagal menginisialisasi Supabase: ' + err.message, true);
      return false;
    }
  }

  function tableName(algoKey) {
    const clean = String(algoKey || state.algo).toLowerCase().trim();
    return 'data_' + (ALGOS[clean] ? clean : 'multihop_gso');
  }

  function normalizeRow(r) {
    return {
      id:           Number(r.id ?? 0),
      algoritma:    String(r.algoritma ?? state.algo),
      id_node:      Number(r.id_node ?? 0),
      ronde:        Number(r.ronde ?? 0),
      status_ch:    Number(r.status_ch ?? 0),
      next_hop:     Number(r.next_hop ?? 0),
      suhu:         Number(Number(r.suhu ?? 0).toFixed(2)),
      lembab_udara: Number(Number(r.lembab_udara ?? 0).toFixed(2)),
      lembab_tanah: Number(Number(r.lembab_tanah ?? 0).toFixed(2)),
      tegangan:     Number(Number(r.tegangan ?? 0).toFixed(2)),
      energi_pct:   Number(Number(r.energi_pct ?? 0).toFixed(2)),
      waktu:        String(r.waktu ?? '').replace('T', ' ').slice(0, 19)
    };
  }

  // =========================================================================
  // PENGATURAN TEMA & UTILITAS FORMAT
  // =========================================================================
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
    el.feedback.style.background = isError ? 'var(--danger-soft)' : 'var(--accent-soft)';
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
  // QUERY DATA KE SUPABASE (Menggantikan fungsi api.php)
  // =========================================================================
  async function fetchOverviewFromSupabase(algoKey = state.algo) {
    const tbl = tableName(algoKey);

    const [rowsRes, countRes] = await Promise.all([
      state.supabase
        .from(tbl)
        .select('*')
        .gt('id_node', 0)
        .order('id', { ascending: false })
        .limit(1000),
      state.supabase
        .from(tbl)
        .select('*', { count: 'exact', head: true })
        .gt('id_node', 0)
    ]);

    if (rowsRes.error) throw new Error(rowsRes.error.message);

    const rawRows = (rowsRes.data || []).map(normalizeRow);
    const totalRecords = countRes.count ?? rawRows.length;

    // Ambil rekaman terbaru untuk setiap id_node
    const latestMap = new Map();
    let maxRound = 0;
    let sumSuhu = 0, sumUdara = 0, sumTanah = 0, sumTegangan = 0, sumEnergi = 0;

    rawRows.forEach(r => {
      if (!latestMap.has(r.id_node)) {
        latestMap.set(r.id_node, r);
      }
      if (r.ronde > maxRound) maxRound = r.ronde;
      sumSuhu += r.suhu;
      sumUdara += r.lembab_udara;
      sumTanah += r.lembab_tanah;
      sumTegangan += r.tegangan;
      sumEnergi += r.energi_pct;
    });

    const nodes = Array.from(latestMap.values()).sort((a, b) => a.id_node - b.id_node);
    const divisor = rawRows.length || 1;

    return {
      algorithm: algoKey,
      label: ALGOS[algoKey] || algoKey,
      nodes,
      recentEvents: rawRows.slice(0, 200).reverse(),
      allSampledRows: rawRows,
      summary: {
        total_records: totalRecords,
        total_nodes: nodes.length,
        max_round: maxRound,
        avg_suhu: rawRows.length ? +(sumSuhu / divisor).toFixed(2) : 0,
        avg_udara: rawRows.length ? +(sumUdara / divisor).toFixed(2) : 0,
        avg_tanah: rawRows.length ? +(sumTanah / divisor).toFixed(2) : 0,
        avg_tegangan: rawRows.length ? +(sumTegangan / divisor).toFixed(2) : 0,
        avg_energi_pct: rawRows.length ? +(sumEnergi / divisor).toFixed(2) : 0
      }
    };
  }

  // =========================================================================
  // 1. DASHBOARD UTAMA (Sensor Tanaman & Energi Node)
  // =========================================================================
  async function renderNodesView() {
    const data = await fetchOverviewFromSupabase(state.algo);
    state.overviewData = data;
    const nodes = data.nodes;
    const s = data.summary;

    const optimalCount = nodes.filter(n => n.energi_pct >= 70).length;
    const warningCount = nodes.filter(n => n.energi_pct >= 35 && n.energi_pct < 70).length;
    const criticalCount = nodes.filter(n => n.energi_pct < 35).length;

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
              <span class="pill-badge">${escapeHtml(data.label)}</span>
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
              <p class="card-sub">Menampilkan rekaman terakhir tiap node langsung dari database Supabase</p>
            </div>
            <button type="button" class="pill-action-btn" id="btn-quick-seed">+ Tambah Data Uji (15 Node)</button>
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
                    <td colspan="8">Tabel <strong>${escapeHtml(tableName(state.algo))}</strong> di Supabase masih kosong. Klik tombol <strong>"+ Tambah Data Uji (15 Node)"</strong> di kanan atas tabel untuk mengisi sampel data otomatis.</td>
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
    const overview = state.overviewData || await fetchOverviewFromSupabase(state.algo);
    const nodes = overview.nodes || [];
    const events = overview.recentEvents || [];

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
  // 3. GRAFIK ENERGI & SENSOR TANAMAN
  // =========================================================================
  async function renderEnergyView() {
    const overview = state.overviewData || await fetchOverviewFromSupabase(state.algo);
    const nodes = overview.nodes || [];
    const avgPct = Number(overview.summary?.avg_energi_pct || 80);

    // Hitung rata-rata per ronde dari data yang diambil
    const roundMap = new Map();
    (overview.allSampledRows || []).forEach(r => {
      if (!roundMap.has(r.ronde)) {
        roundMap.set(r.ronde, { count: 0, sumPct: 0 });
      }
      const item = roundMap.get(r.ronde);
      item.count++;
      item.sumPct += r.energi_pct;
    });

    const series = Array.from(roundMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ronde, val]) => ({
        ronde,
        avg_energi_pct: +(val.sumPct / val.count).toFixed(2)
      }));

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
              <h3>Tren Rata-rata Kapasitas Energi (%) per Ronde</h3>
              <p class="card-sub">Kurva hijau menunjukkan rata-rata persentase energi sepanjang ronde transmisi</p>
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
  // 4. PERBANDINGAN 6 ALGORITMA WSN
  // =========================================================================
  async function renderCompareView() {
    const keys = Object.keys(ALGOS);
    const results = await Promise.all(
      keys.map(async (k) => {
        try {
          const ov = await fetchOverviewFromSupabase(k);
          return {
            algorithm: ALGOS[k],
            nodes: ov.summary.total_nodes,
            max_round: ov.summary.max_round,
            avg_energi_pct: ov.summary.avg_energi_pct,
            avg_tegangan: ov.summary.avg_tegangan,
            records: ov.summary.total_records
          };
        } catch {
          return { algorithm: ALGOS[k], nodes: 0, max_round: 0, avg_energi_pct: 0, avg_tegangan: 0, records: 0 };
        }
      })
    );

    el.content.innerHTML = `
      <div class="bento-dashboard">
        <article class="bento-card">
          <div class="card-head">
            <h3>Tabel Perbandingan 6 Protokol Routing WSN</h3>
            <span class="pill-badge">Supabase Cloud DB</span>
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
                ${results.map(r => `
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
  // FUNGSI PENGGAMBAR GRAFIK CANVAS
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
  // FITUR TAMBAH DATA UJI, RIWAYAT LOG, UNDUH CSV, & HAPUS REKAMAN
  // =========================================================================
  async function seedDemoData() {
    if (!state.supabase) {
      el.keyDialog?.showModal();
      return;
    }
    try {
      const tbl = tableName(state.algo);
      showFeedback(`Menambahkan 15 rekaman node uji ke tabel ${tbl} di Supabase…`);

      const { data: maxRow } = await state.supabase
        .from(tbl)
        .select('ronde')
        .order('ronde', { ascending: false })
        .limit(1);

      const nextRound = ((maxRow && maxRow[0]?.ronde) ? Number(maxRow[0].ronde) : 0) + 1;
      const now = new Date().toISOString();
      const batch = [];

      for (let n = 1; n <= 15; n++) {
        const isCh = (n % 4 === 0) ? 1 : 0;
        let nextHop = isCh ? 0 : ((n % 3) + 1) * 4;
        if (nextHop > 15) nextHop = 0;

        const suhu = +(29.5 + Math.random() * 6.5).toFixed(1);
        const udara = Math.round(48 + Math.random() * 32);
        const tanah = Math.round(65 + Math.random() * 32);
        const tegangan = +(7.45 + Math.random() * 0.8).toFixed(2);
        const energiPct = Math.round(Math.min(100, Math.max(18, ((tegangan - 6.8) / 1.6) * 100)));

        batch.push({
          algoritma: state.algo,
          id_node: n,
          ronde: nextRound,
          status_ch: isCh,
          next_hop: nextHop,
          suhu,
          lembab_udara: udara,
          lembab_tanah: tanah,
          tegangan,
          energi_pct: energiPct,
          waktu: now
        });
      }

      const { error } = await state.supabase.from(tbl).insert(batch);
      if (error) throw new Error(error.message);

      showFeedback(`Berhasil menambahkan data uji Ronde #${nextRound} (15 Node) ke Supabase!`);
      await loadActiveView();
    } catch (err) {
      showFeedback('Gagal mengisi data uji: ' + err.message, true);
    }
  }

  async function openLogModal(nodeId = 0) {
    if (!el.logDialog || !state.supabase) return;
    state.logState = { node: nodeId, offset: 0, loading: false, hasMore: false, rowsCache: [] };
    el.logTitle.textContent = nodeId > 0 ? `Riwayat Node #${nodeId}` : 'Seluruh Riwayat Rekaman WSN';
    el.logContext.textContent = `Tabel Supabase: ${tableName(state.algo)}`;
    el.logHead.innerHTML = '';
    el.logBody.innerHTML = '';
    if (!el.logDialog.open) el.logDialog.showModal();
    await loadMoreHistory(true);
  }

  async function loadMoreHistory(reset = false) {
    const st = state.logState;
    if (st.loading || !state.supabase) return;
    st.loading = true;
    el.logStatus.textContent = 'Memuat dari Supabase…';

    try {
      const tbl = tableName(state.algo);
      const from = reset ? 0 : st.offset;
      const to = from + 49;

      let query = state.supabase
        .from(tbl)
        .select('*')
        .gt('id_node', 0)
        .order('id', { ascending: false })
        .range(from, to);

      if (st.node > 0) {
        query = query.eq('id_node', st.node);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data || []).map(normalizeRow);
      if (reset) st.rowsCache = [];
      st.rowsCache.push(...rows);
      st.offset = from + rows.length;
      st.hasMore = rows.length === 50;

      if (reset && rows.length) {
        const cols = Object.keys(rows[0]);
        el.logHead.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      }
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        el.logBody.insertAdjacentHTML('beforeend', rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}</tr>`).join(''));
        el.logStatus.textContent = st.hasMore ? 'Gulir ke bawah untuk memuat lagi…' : 'Semua data ditampilkan.';
      } else if (reset) {
        el.logStatus.textContent = 'Belum ada rekaman log pada tabel ini.';
      }
    } catch (err) {
      el.logStatus.textContent = 'Error: ' + err.message;
    } finally {
      st.loading = false;
    }
  }

  function downloadCsvFromBrowser() {
    const rows = state.logState.rowsCache.length
      ? state.logState.rowsCache
      : (state.overviewData?.allSampledRows || []);

    if (!rows.length) {
      showFeedback('Tidak ada data untuk diunduh.', true);
      return;
    }
    const headers = ['id', 'algoritma', 'id_node', 'ronde', 'status_ch', 'next_hop', 'suhu', 'lembab_udara', 'lembab_tanah', 'tegangan', 'energi_pct', 'waktu'];
    const csvLines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_${state.algo}${state.logState.node ? '_node' + state.logState.node : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // ROUTER TAMPILAN UTAMA
  // =========================================================================
  async function loadActiveView() {
    if (!initSupabaseClient()) {
      el.content.innerHTML = `
        <article class="bento-card">
          <h3>🔑 Masukkan Anon Public Key Supabase Anda</h3>
          <p class="card-sub" style="margin:8px 0 16px">
            Agar GitHub Pages dapat membaca database Supabase secara langsung, klik tombol di bawah untuk menempelkan <strong>anon public key</strong> dari menu <em>Project Settings &rarr; API Keys</em> di Supabase.
          </p>
          <button type="button" class="pill-action-btn" id="btn-prompt-key">Atur Kunci Koneksi Supabase</button>
        </article>
      `;
      el.content.querySelector('#btn-prompt-key')?.addEventListener('click', () => el.keyDialog?.showModal());
      return;
    }

    el.content?.setAttribute('aria-busy', 'true');
    if (el.title) el.title.textContent = VIEW_TITLES[state.view] || 'Dashboard';

    try {
      if (state.view === 'nodes') await renderNodesView();
      else if (state.view === 'topology') await renderTopologyView();
      else if (state.view === 'energy') await renderEnergyView();
      else if (state.view === 'compare') await renderCompareView();
    } catch (err) {
      showFeedback('Supabase Error: ' + err.message, true);
    } finally {
      el.content?.setAttribute('aria-busy', 'false');
      state.timer = REFRESH_INTERVAL;
    }
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
    loadActiveView();
  });

  el.refreshBtn?.addEventListener('click', loadActiveView);
  el.seedBtn?.addEventListener('click', seedDemoData);
  el.allLogBtn?.addEventListener('click', () => openLogModal(0));
  el.downloadLog?.addEventListener('click', downloadCsvFromBrowser);
  el.closeLogBtn?.addEventListener('click', () => el.logDialog?.close());
  el.cancelDeleteBtn?.addEventListener('click', () => el.confirmDialog?.close());

  el.openKeyModalBtn?.addEventListener('click', () => el.keyDialog?.showModal());
  el.closeKeyModalBtn?.addEventListener('click', () => el.keyDialog?.close());

  el.keyForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('wsn_sb_url', el.sbUrlInput.value.trim());
    localStorage.setItem('wsn_sb_key', el.sbKeyInput.value.trim());
    el.keyDialog?.close();
    showFeedback('Kunci koneksi Supabase berhasil disimpan!');
    loadActiveView();
  });

  el.logScroll?.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = el.logScroll;
    if (scrollTop + clientHeight >= scrollHeight - 36 && state.logState.hasMore) {
      loadMoreHistory(false);
    }
  });

  el.deleteAllBtn?.addEventListener('click', () => {
    state.pendingDelete = 'all';
    el.confirmText.textContent = `Hapus seluruh rekaman pada tabel ${tableName(state.algo)}?`;
    el.confirmDialog?.showModal();
  });

  el.deleteLogBtn?.addEventListener('click', () => {
    state.pendingDelete = 'node';
    el.confirmText.textContent = `Hapus rekaman log untuk Node #${state.logState.node}?`;
    el.confirmDialog?.showModal();
  });

  el.deleteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (el.deleteWord.value.trim() !== 'HAPUS') {
      el.deleteError.textContent = 'Ketik HAPUS dengan huruf kapital.';
      return;
    }
    try {
      const tbl = tableName(state.algo);
      let q = state.supabase.from(tbl).delete();
      if (state.pendingDelete === 'node' && state.logState.node > 0) {
        q = q.eq('id_node', state.logState.node);
      } else {
        q = q.gt('id', 0);
      }
      const { error } = await q;
      if (error) throw new Error(error.message);

      el.confirmDialog?.close();
      el.logDialog?.close();
      showFeedback('Rekaman log berhasil dihapus dari Supabase.');
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