<!doctype html>
<html lang="id" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0d1512">
  <title>GSO-NetSense Studio — Sistem Monitoring &amp; Analitik WSN Multi-Hop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css?v=<?= time() ?>">
  <script src="app.js?v=<?= time() ?>" defer></script>
</head>
<body>
  <div class="app-shell">
    <header class="masthead">
      <div class="brand-box">
        <div class="brand-logo" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div>
          <h1>NETSENSE WSN</h1>
          <small class="brand-sub">TELEMETRY &amp; ROUTING STUDIO</small>
        </div>
      </div>

      <div class="workspace-card">
        <div class="workspace-icon" aria-hidden="true">🌱</div>
        <div class="workspace-info">
          <span class="workspace-label">Multi-Hop IoT Environment</span>
          <strong class="workspace-name">WSN Research Telemetry</strong>
        </div>
      </div>

      <div class="nav-section-label">MODUL ANALITIK</div>
      <nav aria-label="Menu utama">
        <button data-view="nodes" class="selected">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"/></svg>
          <span>Status &amp; Kartu Node</span>
        </button>
        <button data-view="topology">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-7 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10.5 8.5 6.5 15m7-6.5 4 6.5" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          <span>Simulator Rute &amp; Topologi</span>
        </button>
        <button data-view="history">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span>Log Rekaman Transmisi</span>
        </button>
        <button data-view="energy">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 14l4-4 4 3 5-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Analisis Energi &amp; Lifetime</span>
        </button>
        <button data-view="optimizer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6L12 2z" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
          <span>Parameter Optimasi GSO</span>
        </button>
        <button data-view="compare">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m6-18h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-3-18v18" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          <span>Komparasi Multi-Protokol</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="theme-switcher">
          <span class="nav-section-label">TEMA ANTARMUKA</span>
          <div class="theme-buttons">
            <button type="button" id="theme-light" class="theme-btn">Emerald Light</button>
            <button type="button" id="theme-dark" class="theme-btn active">Cyber Dark</button>
          </div>
        </div>

        <div class="system-status">
          <span class="status-dot"></span>
          <div>
            <strong>HKI Edition · Cloud Sync</strong>
            <small>PostgreSQL Cluster · Online</small>
          </div>
        </div>
      </div>
    </header>

    <main>
      <div class="controls">
        <div class="topbar-left">
          <span class="breadcrumb-pill">ESP32 WSN TELEMETRY</span>
          <span id="title" class="page-title">Status &amp; Kartu Node</span>
        </div>

        <div class="topbar-right">
          <label class="algorithm-label">
            <span>Protokol:</span>
            <select id="algorithm">
              <option value="multihop_gso" selected>Multihop-GSO</option>
              <option value="multihop_pso">Multihop-PSO</option>
              <option value="multihop_murni">Multihop Murni</option>
              <option value="leach_gso">LEACH-GSO</option>
              <option value="leach_pso">LEACH-PSO</option>
              <option value="leach_murni">LEACH Murni</option>
            </select>
          </label>

          <div class="countdown" title="Interval sinkronisasi otomatis">
            <span>Sync:</span>
            <strong id="countdown">60s</strong>
          </div>

          <button id="refresh" class="btn-icon" type="button">↻ Segarkan</button>

          <details class="log-menu">
            <summary>⚙ Kelola Data</summary>
            <div>
              <button id="seed-demo" type="button">+ Injeksi Paket Uji</button>
              <button id="all-log" type="button">📋 Buka Jendela Log</button>
              <button id="delete-all" type="button" class="danger-text">🗑 Kosongkan Tabel</button>
            </div>
          </details>
        </div>
      </div>

      <div id="feedback" role="status" aria-live="polite"></div>

      <section id="content" aria-busy="true">
        <p>Menghubungkan ke basis data telemetri WSN…</p>
      </section>

      <footer>
        <strong>GSO-NetSense Studio — Sistem Monitoring Klaster &amp; Rute Multi-Hop WSN</strong>
        <span>Karya Orisinal Terdaftar · Cloud PostgreSQL Telemetry Engine</span>
      </footer>
    </main>
  </div>

  <dialog id="log-dialog" aria-labelledby="log-title">
    <div class="modal-head">
      <div>
        <h2 id="log-title">Rekam Jejak Transmisi Node</h2>
        <p id="log-context" class="muted"></p>
      </div>
      <div class="modal-actions">
        <button id="print-pdf-log" type="button" class="danger">📄 Cetak PDF</button>
        <a id="download-log" class="button" href="#">📥 Ekspor CSV</a>
        <button id="delete-log" class="danger" type="button">Hapus Log</button>
        <button id="close-log" type="button">✕</button>
      </div>
    </div>
    <div id="log-scroll" tabindex="0">
      <table>
        <thead id="log-head"></thead>
        <tbody id="log-body"></tbody>
      </table>
      <p id="log-status" role="status">Memuat…</p>
    </div>
  </dialog>

  <dialog id="confirm-dialog" aria-labelledby="confirm-title">
    <h2 id="confirm-title">Konfirmasi Penghapusan Data</h2>
    <p id="confirm-text"></p>
    <p>Tindakan ini bersifat permanen. Ketik <strong>HAPUS</strong> untuk melanjutkan.</p>
    <form id="delete-form">
      <label>Verifikasi
        <input id="delete-word" autocomplete="off" required pattern="HAPUS" placeholder="Ketik HAPUS">
      </label>
      <p id="delete-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" id="cancel-delete">Batal</button>
        <button class="danger" type="submit">Hapus Data</button>
      </div>
    </form>
  </dialog>
</body>
</html>
