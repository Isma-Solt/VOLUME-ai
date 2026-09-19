<?php
/**
 * Обработчик заявки с формы сайта VOLUME.
 * Копируется на сервер как /var/www/volume/api/send.php
 *
 * Токен бота ЗДЕСЬ НЕ ХРАНИТСЯ. Он лежит в /etc/volume/bot.env —
 * вне папки сайта, поэтому его нельзя случайно закоммитить в GitHub
 * и нельзя скачать через браузер.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// Принимаем только POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['ok' => false, 'error' => 'method not allowed']));
}

// dev-версия сайта шлёт заявки в свой конфиг (nginx передаёт VOLUME_ENV=dev)
$envFile = ($_SERVER['VOLUME_ENV'] ?? '') === 'dev'
    ? '/etc/volume/bot-dev.env'
    : '/etc/volume/bot.env';

$config = @parse_ini_file($envFile);
if (!$config || empty($config['BOT_TOKEN']) || empty($config['CHAT_ID'])) {
    error_log("VOLUME: не читается конфиг $envFile");
    http_response_code(500);
    exit(json_encode(['ok' => false, 'error' => 'server misconfigured']));
}

// Простая защита от спама: не чаще одной заявки в 10 секунд с одного IP
$ip   = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lock = sys_get_temp_dir() . '/volume-lead-' . md5($ip);
if (file_exists($lock) && (time() - filemtime($lock)) < 10) {
    http_response_code(429);
    exit(json_encode(['ok' => false, 'error' => 'too many requests']));
}
touch($lock);

// Читаем JSON, который прислал js/main.js
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    exit(json_encode(['ok' => false, 'error' => 'bad json']));
}

$clean = static function (?string $value, int $max): string {
    $value = trim((string) $value);
    $value = preg_replace('/[[:cntrl:]]/u', ' ', $value);
    return mb_substr($value, 0, $max);
};

$name    = $clean($data['name']    ?? '', 40);
$phone   = $clean($data['phone']   ?? '', 20);
$type    = $clean($data['type']    ?? '', 40);
$message = $clean($data['message'] ?? '', 1000);

// Телефон обязателен и должен содержать хотя бы 10 цифр
if ($name === '' || strlen(preg_replace('/\D/', '', $phone)) < 10) {
    http_response_code(422);
    exit(json_encode(['ok' => false, 'error' => 'validation failed']));
}

$e = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');

$text = "🏠 <b>Новая заявка с сайта VOLUME</b>\n\n"
      . "👤 Имя: " . $e($name) . "\n"
      . "📞 Телефон: " . $e($phone) . "\n"
      . "🏗 Тип объекта: " . $e($type ?: '—') . "\n";

if ($message !== '') {
    $text .= "\n💬 О проекте:\n" . $e($message) . "\n";
}

$text .= "\n🕒 " . (new DateTime('now', new DateTimeZone('Europe/Moscow')))->format('d.m.Y, H:i');

// Отправляем в Telegram
$ch = curl_init("https://api.telegram.org/bot{$config['BOT_TOKEN']}/sendMessage");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'chat_id'    => $config['CHAT_ID'],
        'text'       => $text,
        'parse_mode' => 'HTML',
    ]),
]);

$response = curl_exec($ch);
$status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($status !== 200) {
    // Заявку не теряем: пишем в файл, чтобы можно было поднять руками
    error_log('VOLUME: Telegram вернул ' . $status . ' ' . $curlErr . ' ' . (string) $response);
    @file_put_contents(
        '/var/log/volume-leads-failed.log',
        date('c') . ' ' . json_encode(compact('name', 'phone', 'type', 'message'), JSON_UNESCAPED_UNICODE) . PHP_EOL,
        FILE_APPEND
    );
    http_response_code(502);
    exit(json_encode(['ok' => false, 'error' => 'telegram unavailable']));
}

echo json_encode(['ok' => true]);
