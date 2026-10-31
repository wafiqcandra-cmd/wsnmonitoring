<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

header('Cache-Control: no-store');

try {
    $a = algo((string)($_GET['algo'] ?? $_POST['algo'] ?? 'multihop_gso'));
    $t = dataTable($a);
    $action = (string)($_GET['action'] ?? $_POST['action'] ?? 'overview');

    // =========================================================================
    // HANDLER POST: HAPUS LOG, ISI DATA DEMO, ATAU INPUT DARI ESP32
    // =========================================================================
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $rawInput = file_get_contents('php://input');
        $body = json_decode($rawInput ?: '{}', true) ?: $_POST;

        // 1. Hapus Rekaman Log
        if ($action === 'delete') {
            if (($body['confirm'] ?? '') !== 'HAPUS') {
                jsonResponse(['error' => 'Konfirmasi HAPUS tidak valid.'], 422);
            }
            $node = integer($body['node'] ?? 0, 0, 1000000);
            if ($node > 0) {
                $deleted = execSql("DELETE FROM \"$t\" WHERE id_node = ?", [$node]);
            } else {
                $deleted = execSql("DELETE FROM \"$t\"");
            }
            jsonResponse(['ok' => true, 'deleted' => $deleted]);
        }

        // 2. Isi Data Sampel (Demo) untuk Pengujian Koneksi Supabase
        if ($action === 'seed') {
            $maxR = (int)(rows("SELECT COALESCE(MAX(ronde), 0) AS r FROM \"$t\"")[0]['r'] ?? 0);
            $nextRound = $maxR + 1;
            $now = date('Y-m-d H:i:s');

            for ($n = 1; $n <= 15; $n++) {
                $isCh = ($n % 4 === 0) ? 1 : 0;
                $nextHop = $isCh ? 0 : (($n % 3) + 1) * 4;
                if ($nextHop > 15) $nextHop = 0;

                $suhu = round(29.5 + mt_rand(0, 85) / 10, 1);
                $udara = round(45 + mt_rand(0, 35), 0);
                $tanah = round(65 + mt_rand(0, 35), 0);
                $tegangan = round(7.4 + mt_rand(0, 85) / 100, 2);
                $energiPct = round(min(100, max(15, (($tegangan - 6.8) / 1.6) * 100)), 0);

                execSql(
                    "INSERT INTO \"$t\" (algoritma, id_node, ronde, status_ch, next_hop, suhu, lembab_udara, lembab_tanah, tegangan, energi_pct, waktu)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [$a, $n, $nextRound, $isCh, $nextHop, $suhu, $udara, $tanah, $tegangan, $energiPct, $now]
                );
            }
            jsonResponse(['ok' => true, 'message' => "Berhasil menambahkan data uji Ronde #{$nextRound} (15 Node) ke tabel {$t}."]);
        }

        // 3. Endpoint Ingest Data dari Mikrokontroler ESP32
        if ($action === 'ingest') {
            $idNode    = integer($body['id_node'] ?? 1, 1, 10000);
            $ronde     = integer($body['ronde'] ?? 1, 1, 10000000);
            $statusCh  = integer($body['status_ch'] ?? 0, 0, 1);
            $nextHop   = integer($body['next_hop'] ?? 0, 0, 10000);
            $suhu      = (float)($body['suhu'] ?? 0);
            $udara     = (float)($body['lembab_udara'] ?? 0);
            $tanah     = (float)($body['lembab_tanah'] ?? 0);
            $tegangan  = (float)($body['tegangan'] ?? 0);
            $energiPct = (float)($body['energi_pct'] ?? 0);
            $waktu     = (string)($body['waktu'] ?? date('Y-m-d H:i:s'));

            execSql(
                "INSERT INTO \"$t\" (algoritma, id_node, ronde, status_ch, next_hop, suhu, lembab_udara, lembab_tanah, tegangan, energi_pct, waktu)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [$a, $idNode, $ronde, $statusCh, $nextHop, $suhu, $udara, $tanah, $tegangan, $energiPct, $waktu]
            );
            jsonResponse(['ok' => true]);
        }

        jsonResponse(['error' => 'Aksi POST tidak dikenali.'], 400);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(['error' => 'Gunakan GET atau POST.'], 405);
    }

    // =========================================================================
    // HANDLER GET: UNDUH CSV
    // =========================================================================
    if ($action === 'export') {
        $node = integer($_GET['node'] ?? 0, 0, 1000000);
        $where = 'id_node > 0';
        $p = [];
        if ($node > 0) {
            $where .= ' AND id_node = ?';
            $p[] = $node;
        }
        $data = rows("SELECT * FROM \"$t\" WHERE $where ORDER BY id DESC LIMIT 5000", $p);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="log_' . $a . ($node ? "_node{$node}" : '') . '.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'algoritma', 'id_node', 'ronde', 'status_ch', 'next_hop', 'suhu', 'lembab_udara', 'lembab_tanah', 'tegangan', 'energi_pct', 'waktu']);
        foreach ($data as $row) {
            fputcsv($out, normalizeRow($row));
        }
        fclose($out);
        exit;
    }

    // =========================================================================
    // 1. OVERVIEW (Data terbaru tiap node + ringkasan sensor & energi)
    // =========================================================================
    if ($action === 'overview') {
        // Ambil rekaman terbaru untuk masing-masing id_node menggunakan DISTINCT ON PostgreSQL
        $latestNodes = rows("
            SELECT DISTINCT ON (id_node)
                id, algoritma, id_node, ronde, status_ch, next_hop,
                suhu, lembab_udara, lembab_tanah, tegangan, energi_pct, waktu
            FROM \"$t\"
            WHERE id_node > 0
            ORDER BY id_node ASC, id DESC
        ");

        $agg = rows("
            SELECT
                COUNT(*) AS total_records,
                COUNT(DISTINCT id_node) AS total_nodes,
                COALESCE(MAX(ronde), 0) AS max_round,
                COALESCE(AVG(suhu), 0) AS avg_suhu,
                COALESCE(AVG(lembab_udara), 0) AS avg_udara,
                COALESCE(AVG(lembab_tanah), 0) AS avg_tanah,
                COALESCE(AVG(tegangan), 0) AS avg_tegangan,
                COALESCE(AVG(energi_pct), 0) AS avg_energi_pct
            FROM \"$t\"
            WHERE id_node > 0
        ")[0] ?? [];

        jsonResponse([
            'algorithm' => $a,
            'label'     => ALGOS[$a] ?? $a,
            'nodes'     => array_map(fn($r) => normalizeRow($r), $latestNodes),
            'summary'   => [
                'total_records'  => (int)($agg['total_records'] ?? 0),
                'total_nodes'    => (int)($agg['total_nodes'] ?? 0),
                'max_round'      => (int)($agg['max_round'] ?? 0),
                'avg_suhu'       => round((float)($agg['avg_suhu'] ?? 0), 2),
                'avg_udara'      => round((float)($agg['avg_udara'] ?? 0), 2),
                'avg_tanah'      => round((float)($agg['avg_tanah'] ?? 0), 2),
                'avg_tegangan'   => round((float)($agg['avg_tegangan'] ?? 0), 2),
                'avg_energi_pct' => round((float)($agg['avg_energi_pct'] ?? 0), 2),
            ],
        ]);
    }

    // =========================================================================
    // 2. HISTORY (Riwayat Tabel Log dengan Paginasi Cursor)
    // =========================================================================
    if ($action === 'history') {
        $node   = integer($_GET['node'] ?? 0, 0, 1000000);
        $cursor = integer($_GET['cursor'] ?? 0, 0, PHP_INT_MAX);
        $round  = integer($_GET['round'] ?? 0, 0, 100000000);
        $order  = (string)($_GET['order'] ?? 'desc');
        if (!in_array($order, ['asc', 'desc'], true)) {
            throw new InvalidArgumentException('Urutan tidak valid.');
        }

        $where = 'id_node > 0';
        $p = [];
        if ($node)  { $where .= ' AND id_node = ?'; $p[] = $node; }
        if ($round) { $where .= ' AND ronde = ?';   $p[] = $round; }
        if ($cursor) {
            $where .= $order === 'asc' ? ' AND id > ?' : ' AND id < ?';
            $p[] = $cursor;
        }

        $direction = $order === 'asc' ? 'ASC' : 'DESC';
        $data = rows("SELECT * FROM \"$t\" WHERE $where ORDER BY id $direction LIMIT 51", $p);
        $more = count($data) > 50;
        $data = array_slice($data, 0, 50);

        jsonResponse([
            'rows'  => array_map(fn($r) => normalizeRow($r), $data),
            'next'  => $more ? (int)end($data)['id'] : null,
            'order' => $order,
            'round' => $round,
        ]);
    }

    // =========================================================================
    // 3. LIVE & REPLAY (Aliran Paket & Topologi)
    // =========================================================================
    if ($action === 'live' || $action === 'replay') {
        $since = integer($_GET['since'] ?? 0, 0, PHP_INT_MAX);
        $rawEvents = rows("SELECT * FROM \"$t\" WHERE id_node > 0 ORDER BY id DESC LIMIT 200");
        $events = array_map(fn($r) => normalizeRow($r), array_reverse($rawEvents));
        $maxCursor = !empty($events) ? (int)end($events)['id'] : 0;

        if ($action === 'replay') {
            jsonResponse([
                'events'      => $events,
                'snapshot_at' => date('c'),
                'limit'       => 200,
            ]);
        }

        $reset = $since > $maxCursor;
        $filtered = ($since > 0 && !$reset)
            ? array_values(array_filter($events, fn($r) => $r['id'] > $since))
            : $events;

        jsonResponse([
            'cursor'      => $maxCursor,
            'reset'       => $reset,
            'gap'         => $since > 0 && count($events) === 200 && $since < (int)$events[0]['id'],
            'events'      => $filtered,
            'server_time' => date('c'),
        ]);
    }

    // =========================================================================
    // 4. ENERGY_ALL & ENERGY_METRICS (Grafik Energi & Sensor Tanaman)
    // =========================================================================
    if ($action === 'energy_all') {
        $perRound = rows("
            SELECT
                ronde,
                ROUND(AVG(energi_pct)::numeric, 2) AS avg_energi_pct,
                ROUND(AVG(tegangan)::numeric, 2) AS avg_tegangan,
                ROUND(AVG(suhu)::numeric, 2) AS avg_suhu,
                ROUND(AVG(lembab_tanah)::numeric, 2) AS avg_tanah,
                ROUND(AVG(lembab_udara)::numeric, 2) AS avg_udara
            FROM \"$t\"
            WHERE id_node > 0
            GROUP BY ronde
            ORDER BY ronde ASC
            LIMIT 100
        ");

        jsonResponse([
            'algorithm' => $a,
            'series'    => $perRound,
        ]);
    }

    if ($action === 'energy_metrics') {
        $m = rows("
            SELECT
                COALESCE(MIN(energi_pct), 0) AS min_energi_pct,
                COALESCE(MAX(energi_pct), 0) AS max_energi_pct,
                COALESCE(AVG(energi_pct), 0) AS avg_energi_pct,
                COALESCE(MIN(tegangan), 0) AS min_tegangan,
                COALESCE(MAX(tegangan), 0) AS max_tegangan,
                COALESCE(AVG(tegangan), 0) AS avg_tegangan
            FROM \"$t\"
            WHERE id_node > 0
        ")[0] ?? [];

        jsonResponse(['metrics' => $m]);
    }

    // =========================================================================
    // 5. COMPARE (Perbandingan 6 Tabel Algoritma)
    // =========================================================================
    if ($action === 'compare') {
        $out = [];
        foreach (ALGOS as $key => $label) {
            $tbl = dataTable($key);
            $r = rows("
                SELECT
                    COUNT(*) AS records,
                    COUNT(DISTINCT id_node) AS nodes,
                    MIN(waktu) AS start,
                    MAX(waktu) AS \"end\",
                    COALESCE(MAX(ronde), 0) AS max_round,
                    COALESCE(AVG(energi_pct), 0) AS avg_energi_pct,
                    COALESCE(AVG(tegangan), 0) AS avg_tegangan,
                    COALESCE(AVG(lembab_tanah), 0) AS avg_tanah
                FROM \"$tbl\"
                WHERE id_node > 0
            ")[0] ?? [];

            $r['key'] = $key;
            $r['algorithm'] = $label;
            $out[] = $r;
        }

        jsonResponse([
            'rows' => $out,
            'note' => 'Rentang seluruh rekaman pada database Supabase PostgreSQL. Metrik mencakup rata-rata energi (%), tegangan (V), dan kelembapan tanah (%).',
        ]);
    }

    jsonResponse(['error' => 'Endpoint tidak ditemukan. Muat ulang halaman jika baru diperbarui.'], 404);
} catch (InvalidArgumentException $e) {
    jsonResponse(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    error_log('WSN API Error: ' . $e->getMessage());
    jsonResponse([
        'error'  => 'Data belum dapat dimuat dari Supabase: ' . $e->getMessage(),
    ], 503);
}
