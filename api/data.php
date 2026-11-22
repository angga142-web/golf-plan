<?php
/* Parkutut user data (temporary, before Firebase).
   POST JSON {action:"get"|"put", id:<sha256 hex>, data:{...}}.
   The id is a hash made in the browser from the phone number or Gmail, so the raw number/address never reaches the server.
   No password yet: anyone who knows a number can read that number's data. Files live outside public_html. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function out($code, $body) { http_response_code($code); echo $body; exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, '{"ok":false,"error":"method"}');
$raw = file_get_contents('php://input', false, null, 0, 800001);
if ($raw === false || strlen($raw) > 800000) out(413, '{"ok":false,"error":"too large"}');
$in = json_decode($raw, true);
if (!is_array($in)) out(400, '{"ok":false,"error":"json"}');
$id = isset($in['id']) ? $in['id'] : '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/', $id)) out(400, '{"ok":false,"error":"id"}');
$dir = dirname(__DIR__, 2) . '/parkutut-data';
if (!is_dir($dir) && !mkdir($dir, 0700, true)) out(500, '{"ok":false,"error":"storage"}');
$file = $dir . '/' . $id . '.json';
$action = isset($in['action']) ? $in['action'] : '';
if ($action === 'get') {
  $s = is_file($file) ? file_get_contents($file) : '';
  out(200, '{"ok":true,"data":' . ($s !== '' && $s !== false ? $s : '{}') . '}');
}
if ($action === 'put') {
  $data = isset($in['data']) ? $in['data'] : null;
  if (!is_array($data)) out(400, '{"ok":false,"error":"data"}');
  $data['updated'] = time();
  $json = json_encode($data, JSON_UNESCAPED_UNICODE);
  if ($json === false || file_put_contents($file, $json, LOCK_EX) === false) out(500, '{"ok":false,"error":"write"}');
  out(200, '{"ok":true}');
}
out(400, '{"ok":false,"error":"action"}');
