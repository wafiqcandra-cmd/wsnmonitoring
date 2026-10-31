<?php
declare(strict_types=1);

// Daftar algoritma sesuai pilihan pada aplikasi
const ALGOS = [
    'multihop_murni' => 'Multihop Murni',
    'multihop_pso'   => 'Multihop-PSO',
    'multihop_gso'   => 'Multihop-GSO',
    'leach_murni'    => 'LEACH Murni',
    'leach_pso'      => 'LEACH-PSO',
    'leach_gso'      => 'LEACH-GSO',
];

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Kredensial Supabase PostgreSQL (Proyek: orxrgdovcjpjgbkzqntr)
    $host     = getenv('DB_HOST') ?: 'aws-0-ap-southeast-1.pooler.supabase.com';
    $port     = getenv('DB_PORT') ?: '6543';
    $dbname   = getenv('DB_NAME') ?: 'postgres';
    $user     = getenv('DB_USER') ?: 'postgres.orxrgdovcjpjgbkzqntr';
    $password = getenv('DB_PASS') ?: 'ajiningdiri123';

    // Dukungan jika DATABASE_URL disetel dari Environment Variable hosting
    $dbUrl = getenv('DATABASE_URL');
    if ($dbUrl) {
        $parts = parse_url($dbUrl);
        $host = $parts['host'] ?? $host;
        $port = (string)($parts['port'] ?? $port);
        $user = $parts['user'] ?? $user;
        $password = $parts['pass'] ?? $password;
        $dbname = isset($parts['path']) ? ltrim($parts['path'], '/') : $dbname;
    }

    $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};sslmode=require";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => true, // Kompatibel dengan PgBouncer Transaction Pooler port 6543
    ]);

    return $pdo;
}

function jsonResponse(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function algo(string $input): string {
    $clean = strtolower(trim($input));
    return array_key_exists($clean, ALGOS) ? $clean : 'multihop_gso';
}

function dataTable(string $algo): string {
    $a = algo($algo);
    return 'data_' . $a;
}

function processedAlgo(string $algo): bool {
    return false;
}

function integer(mixed $val, int $min = 0, int $max = PHP_INT_MAX): int {
    $v = filter_var($val, FILTER_VALIDATE_INT);
    if ($v === false) return $min;
    return max($min, min($max, (int)$v));
}

function rows(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function execSql(string $sql, array $params = []): int {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function normalizeRow(array $r): array {
    return [
        'id'           => (int)($r['id'] ?? 0),
        'algoritma'    => (string)($r['algoritma'] ?? ''),
        'id_node'      => (int)($r['id_node'] ?? 0),
        'ronde'        => (int)($r['ronde'] ?? 0),
        'status_ch'    => (int)($r['status_ch'] ?? 0),
        'next_hop'     => (int)($r['next_hop'] ?? 0),
        'suhu'         => round((float)($r['suhu'] ?? 0), 2),
        'lembab_udara' => round((float)($r['lembab_udara'] ?? 0), 2),
        'lembab_tanah' => round((float)($r['lembab_tanah'] ?? 0), 2),
        'tegangan'     => round((float)($r['tegangan'] ?? 0), 2),
        'energi_pct'   => round((float)($r['energi_pct'] ?? 0), 2),
        'waktu'        => (string)($r['waktu'] ?? ''),
    ];
}
