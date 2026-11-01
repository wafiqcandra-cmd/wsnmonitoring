<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

header('Cache-Control: no-store');

try {
    $a = algo((string)($_GET['algo'] ?? $_POST['algo'] ?? 'multihop_gso'));
    $t = dataTable($a);
    $action = (string)($_GET['action'] ?? $_POST['action'] ?? 'overview');

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $rawInput = file_get_contents('php://input');
        $body = json_decode($rawInput ?: '{}', true) ?: $_POST;

        if ($action === 'delete') {
            if (($body['confirm'] ?? '') !== 'HAPUS') {
                jsonResponse(['error' => 'Konfirmasi HAPUS tidak valid.'], 422);
            }
            $node = integer($body['node'] ?? 0, 0, 1000000);
            $deleted = $node > 0
                ? execSql("DELETE FROM \"$t\" WHERE id_node = ?", [$node])
                : execSql("DELETE FROM \"$t\"");
            jsonResponse(['ok' => true, 'deleted' => $deleted]);
        }

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

        if ($action === 'ingest') {
            execSql(
                "INSERT INTO \"$t\" (algoritma, id_node, ronde, status_ch, next_hop, suhu, lembab_udara, lembab_tanah, tegangan, energi_pct, waktu)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    $a,
                    integer($body['id_node'] ?? 1, 1, 10000),
                    integer($body['ronde'] ?? 1, 1, 10000000),
                    integer($body['status_ch'] ?? 0, 0, 1),
                    integer($body['next_hop'] ?? 0, 0, 10000),
                    (float)($body['suhu'] ?? 0),
                    (float)($body['lembab_udara'] ?? 0),
                    (float)($body['lembab_tanah'] ?? 0),
                    (float)($body['tegangan'] ?? 0),
                    (float)($body['energi_pct'] ?? 0),
                    (string)($body['waktu'] ?? date('Y-m-d H:i:s'))
                ]
            );
            jsonResponse(['ok' => true]);
        }

        jsonResponse(['error' => 'Aksi POST tidak dikenali.'], 400);
    }

    if ($action === 'export') {
        $node = integer($_GET['node'] ?? 0, 0, 1000000);
        $where = 'id_node > 0';
        $p = [];
        if ($node > 0) { $where .= ' AND id_node = ?'; $p[] = $node; }
        $data = rows("SELECT * FROM \"$t\" WHERE $where ORDER BY id DESC LIMIT 5000", $p);

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="log_' . $a . ($node ? "_node{$node}" : '') . '.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'algoritma', 'id_node', 'ronde', 'status_ch', 'next_hop', 'suhu', 'lembab_udara', 'lembab_tanah', 'tegangan', 'energi_pct', 'waktu']);
        foreach ($data as $row) fputcsv($out, normalizeRow($row));
        fclose($out);
        exit;
    }

    if ($action === 'overview') {
        $roundFilter = integer($_GET['round'] ?? 0, 0, 100000000);
        $whereNode = 'id_node > 0';
        $paramsNode = [];
        if ($roundFilter > 0) {
            $whereNode .= ' AND ronde <= ?';
            $paramsNode[] = $roundFilter;
        }

        $latestNodes = rows("
            SELECT DISTINCT ON (id_node)
                id, algoritma, id_node, ronde, status_ch, next_hop,
                suhu, lembab_udara, lembab_tanah, tegangan, energi_pct, waktu
            FROM \"$t\"
            WHERE $whereNode
            ORDER BY id_node ASC, ronde DESC, id DESC
        ", $paramsNode);

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

    if ($action === 'history') {
        $node = integer($_GET['node'] ?? 0, 0, 1000000);
        $cursor = integer($_GET['cursor'] ?? 0, 0, PHP_INT_MAX);
        $order = (string)($_GET['order'] ?? 'desc') === 'asc' ? 'ASC' : 'DESC';
        $where = 'id_node > 0';
        $p = [];
        if ($node) { $where .= ' AND id_node = ?'; $p[] = $node; }
        if ($cursor) { $where .= ($order === 'ASC' ? ' AND id > ?' : ' AND id < ?'); $p[] = $cursor; }

        $data = rows("SELECT * FROM \"$t\" WHERE $where ORDER BY id $order LIMIT 51", $p);
        $more = count($data) > 50;
        $data = array_slice($data, 0, 50);
        jsonResponse(['rows' => array_map(fn($r) => normalizeRow($r), $data), 'next' => $more ? (int)end($data)['id'] : null]);
    }

    if ($action === 'live' || $action === 'replay') {
        $rawEvents = rows("SELECT * FROM \"$t\" WHERE id_node > 0 ORDER BY id DESC LIMIT 200");
        $events = array_map(fn($r) => normalizeRow($r), array_reverse($rawEvents));
        jsonResponse(['cursor' => !empty($events) ? (int)end($events)['id'] : 0, 'events' => $events]);
    }

    if ($action === 'energy_all') {
        $perRound = rows("
            SELECT ronde,
                ROUND(AVG(energi_pct)::numeric, 2) AS avg_energi_pct,
                ROUND(AVG(tegangan)::numeric, 2) AS avg_tegangan,
                ROUND(AVG(suhu)::numeric, 2) AS avg_suhu,
                ROUND(AVG(lembab_tanah)::numeric, 2) AS avg_tanah,
                ROUND(AVG(lembab_udara)::numeric, 2) AS avg_udara
            FROM \"$t\" WHERE id_node > 0 GROUP BY ronde ORDER BY ronde ASC LIMIT 200
        ");
        jsonResponse(['algorithm' => $a, 'series' => $perRound]);
    }

    if ($action === 'compare') {
        $out = [];
        foreach (ALGOS as $key => $label) {
            $tbl = dataTable($key);
            $r = rows("SELECT COUNT(*) AS records, COUNT(DISTINCT id_node) AS nodes, COALESCE(MAX(ronde), 0) AS max_round, COALESCE(AVG(energi_pct), 0) AS avg_energi_pct, COALESCE(AVG(tegangan), 0) AS avg_tegangan FROM \"$tbl\" WHERE id_node > 0")[0] ?? [];
            $r['algorithm'] = $label;
            $out[] = $r;
        }
        jsonResponse(['rows' => $out]);
    }

    jsonResponse(['error' => 'Endpoint tidak ditemukan.'], 404);
} catch (Throwable $e) {
    jsonResponse(['error' => 'Supabase Error: ' . $e->getMessage()], 503);
}
