# SMTP Integration Best Practices - Comprehensive Guide

> **Author:** Senior Backend Engineer  
> **Date:** March 2026  
> **Purpose:** Production-grade SMTP integration patterns for enterprise applications

---

## Table of Contents

1. [SMTP Integration Patterns](#1-smtp-integration-patterns)
2. [Application Integration](#2-application-integration)
3. [Security Considerations](#3-security-considerations)
4. [Monitoring & Troubleshooting](#4-monitoring--troubleshooting)
5. [Quick Reference](#5-quick-reference)

---

## 1. SMTP Integration Patterns

### 1.1 Authentication Methods

#### AUTH PLAIN

The simplest authentication method. Username and password are combined and Base64-encoded, then sent to the server in a single command.

```
AUTH PLAIN <base64(\0username\0password)>
```

**Security Characteristics:**
- ⚠️ **Requires TLS** - Base64 is encoding, NOT encryption
- ✅ Simple and widely supported
- ✅ Single round-trip authentication
- ❌ Credentials easily decoded if intercepted without TLS

**When to Use:**
- When connecting over TLS/SSL (mandatory)
- Most modern SMTP servers require TLS before allowing AUTH PLAIN
- Default choice for most email clients

```php
// PHPMailer AUTH PLAIN example with TLS
$mail->SMTPSecure = 'tls';  // Enable TLS encryption
$mail->Port = 587;          // TLS port
$mail->SMTPAuth = true;
$mail->AuthType = 'PLAIN';  // Explicitly set (or let auto-negotiate)
```

#### AUTH LOGIN

Similar to PLAIN, but credentials are sent in separate steps:

```
Server: 334 VXNlcm5hbWU6  (Base64 for "Username:")
Client: <base64(username)>
Server: 334 UGFzc3dvcmQ6  (Base64 for "Password:")
Client: <base64(password)>
```

**Security Characteristics:**
- ⚠️ **Requires TLS** - Same Base64 encoding issues as PLAIN
- Similar security to PLAIN
- Legacy design from before PLAIN was standardized
- More "chatty" protocol

**When to Use:**
- Legacy system compatibility only
- Prefer AUTH PLAIN for new implementations

#### CRAM-MD5 (Challenge-Response Authentication Mechanism)

Uses a challenge-response mechanism with MD5 hashing:

```
Server: 334 <challenge> (random data)
Client: <username> <hmac_md5(password, challenge)>
```

**Security Characteristics:**
- ✅ Password never crosses the network in plaintext
- ⚠️ Server must store passwords in plaintext or reversibly encrypted
- ⚠️ MD5 is cryptographically broken (collision attacks)
- ❌ Deprecated by major providers (Google disabled in 2014, Microsoft ~same time)

**When to Use:**
- Generally **AVOID** - legacy systems only
- Most modern services have disabled CRAM-MD5

#### OAuth 2.0 (XOAUTH2)

Modern token-based authentication - the gold standard for security:

**Security Characteristics:**
- ✅ No passwords stored in application
- ✅ Short-lived access tokens (typically 1 hour)
- ✅ Refresh tokens for continuous access
- ✅ Granular permission scopes (e.g., `SMTP.Send`)
- ✅ Centralized revocation through identity provider

**When to Use:**
- **RECOMMENDED** for all new production systems
- Required by Microsoft 365 (basic auth deprecated)
- Gmail API integration
- Any enterprise environment

```php
// OAuth2 with PHPMailer (using League OAuth2)
use League\OAuth2\Client\Provider\Google;

// Get access token via OAuth flow
$provider = new Google([
    'clientId'     => $clientId,
    'clientSecret' => $clientSecret,
    'redirectUri'  => $redirectUri,
]);

$accessToken = $provider->getAccessToken('authorization_code', [
    'code' => $_GET['code']
]);

// Configure PHPMailer with OAuth
$mail->AuthType = 'XOAUTH2';
$mail->AccessToken = $accessToken->getToken();
```

### 1.2 Secure Connection Methods

#### STARTTLS (Port 587) - RECOMMENDED

**How it works:**
1. Connection starts unencrypted (plaintext)
2. Client sends `EHLO` command
3. Server responds with capabilities including `STARTTLS`
4. Client sends `STARTTLS` command
5. TLS handshake upgrades connection to encrypted
6. Authentication and email transmission occur over TLS

**Advantages:**
- ✅ IETF standard (RFC 6409)
- ✅ Graceful fallback handling
- ✅ More compatible with firewalls/proxies
- ✅ Better interoperability
- ✅ Current industry standard

**Disadvantages:**
- ⚠️ Brief plaintext phase before TLS upgrade (vulnerable to STARTTLS stripping attacks)
- ⚠️ Requires proper server capability advertisement

```php
// PHPMailer STARTTLS configuration
$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;  // or 'tls'
$mail->Port = 587;
```

#### Implicit TLS/SMTPS (Port 465)

**How it works:**
1. Connection opens with immediate TLS handshake
2. All communication encrypted from first packet
3. No plaintext phase exists

**Advantages:**
- ✅ No plaintext exposure ever
- ✅ Simpler mental model
- ✅ Protected from STARTTLS stripping

**Disadvantages:**
- ⚠️ Less flexible (no fallback possible)
- ⚠️ Was deprecated by IETF (1998), then restored (RFC 8314, 2018)
- ⚠️ Can cause issues with some firewalls/proxies
- ⚠️ Confusion due to complicated history

```php
// PHPMailer Implicit TLS configuration
$mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;  // or 'ssl'
$mail->Port = 465;
```

#### Security Comparison

| Aspect | STARTTLS (587) | Implicit TLS (465) |
|--------|----------------|-------------------|
| Standard | RFC 6409 | RFC 8314 (restored) |
| Encryption | Upgrade after connection | Immediate |
| Fallback | Possible | None (hard fail) |
| Firewall Friendly | Better | Some issues |
| Vulnerability | STARTTLS stripping | None specific |
| Recommendation | ✅ **Primary choice** | ✅ Valid alternative |

### 1.3 Port Selection

#### Port 25 - SMTP Relay

**Purpose:** Server-to-server email relay
**Security:** Usually no encryption or authentication
**Status:** Original standard, now restricted

**When to Use:**
- Mail server-to-server relay ONLY
- NEVER for client email submission

**⚠️ WARNING:** Most ISPs and cloud providers block outbound port 25 to prevent spam. Do NOT use for application email sending.

#### Port 587 - Message Submission (STARTTLS) ⭐ RECOMMENDED

**Purpose:** Client-to-server email submission with STARTTLS
**Security:** Authentication required + TLS support
**Status:** Current IETF standard (RFC 6409)

**When to Use:**
- ✅ **DEFAULT CHOICE** for all application email
- Transactional emails
- Marketing emails
- WordPress/automated systems

**Configuration:**
```php
$mail->Host = 'smtp.provider.com';
$mail->Port = 587;
$mail->SMTPSecure = 'tls';  // STARTTLS
$mail->SMTPAuth = true;
```

#### Port 465 - SMTPS (Implicit TLS)

**Purpose:** Client-to-server with immediate TLS
**Security:** Always encrypted
**Status:** Was deprecated, restored by RFC 8314 (2018)

**When to Use:**
- When port 587 is blocked
- Legacy system requirements
- Specific provider recommendations

#### Port 2525 - Alternative Submission

**Purpose:** Alternative to port 587
**Security:** Same as port 587 (STARTTLS)
**Status:** Unofficial but widely supported

**When to Use:**
- When ISP blocks ports 587 and 465
- Fallback option

### 1.4 Rate Limiting and Throttling Best Practices

#### Why Rate Limiting Matters

Email providers monitor volume patterns, error rates, and complaints. Proper throttling:
- Prevents spam filter triggers
- Reduces temporary deferrals (4xx errors)
- Maintains sender reputation
- Complies with provider policies (Gmail/Yahoo require <0.3% spam rate for bulk senders)

#### Rate Limiting by Sender Size

**Small Senders (few thousand/day):**
```php
// Configuration for low-volume sending
$rateLimit = [
    'messages_per_minute' => 30,
    'messages_per_hour' => 500,
    'messages_per_day' => 2000,
    'delay_between_sends_ms' => 2000,  // 2 seconds
    'per_domain_limit' => 50,  // per hour per recipient domain
];
```

**Medium Senders (tens of thousands/day):**
```php
$rateLimit = [
    'messages_per_minute' => 100,
    'messages_per_hour' => 3000,
    'max_concurrent_connections' => 5,
    'per_domain_limits' => [
        'gmail.com' => 1000,  // per hour during warm-up
        'outlook.com' => 800,
        'yahoo.com' => 600,
    ],
    'backoff_strategy' => 'exponential',
];
```

**Large Senders (hundreds of thousands+/day):**
```php
$rateLimit = [
    'distribute_across_ips' => true,
    'ip_pool_size' => 5,
    'separate_transactional_marketing' => true,
    'dynamic_throttling' => true,  // Based on bounce rates
    'real_time_adjustment' => true,
];
```

#### IP Warm-Up Strategy

New IPs have no reputation. ISPs throttle unknown senders until trust is established.

**Warm-Up Schedule (Typical 4-week plan):**

| Week | Daily Volume | Gmail/Hour | Yahoo/Hour | Notes |
|------|-------------|------------|------------|-------|
| 1 | 50-100 | 20 | 15 | Consistent daily sending |
| 2 | 200-500 | 100 | 75 | Monitor bounce/complaint rates |
| 3 | 1,000-2,000 | 300 | 200 | Increase if metrics good |
| 4 | 5,000+ | 1,000+ | 500+ | Full volume if reputation positive |

```php
// IP warm-up implementation
class IPWarmUpManager {
    private $warmUpSchedule = [
        1 => ['daily_max' => 100, 'hourly_max' => 20],
        2 => ['daily_max' => 500, 'hourly_max' => 100],
        3 => ['daily_max' => 2000, 'hourly_max' => 300],
        4 => ['daily_max' => 5000, 'hourly_max' => 1000],
    ];
    
    public function getCurrentLimits(): array {
        $weeksSinceStart = $this->calculateWeeks();
        return $this->warmUpSchedule[min($weeksSinceStart, 4)] ?? 
               $this->warmUpSchedule[4];
    }
    
    public function canSend(string $recipient): bool {
        $limits = $this->getCurrentLimits();
        $domain = $this->extractDomain($recipient);
        
        // Check hourly limits
        $sentThisHour = $this->getSentCountLastHour($domain);
        return $sentThisHour < $limits['hourly_max'];
    }
}
```

#### Backoff and Retry Strategy

```php
class SMTPRetryManager {
    private $maxRetries = 3;
    private $baseDelay = 60;  // seconds
    
    public function sendWithRetry(Email $email): Result {
        $attempt = 0;
        
        while ($attempt < $this->maxRetries) {
            try {
                return $this->send($email);
            } catch (SMTPException $e) {
                $attempt++;
                
                if (!$this->shouldRetry($e)) {
                    throw $e;  // Hard bounce, don't retry
                }
                
                if ($attempt >= $this->maxRetries) {
                    throw new MaxRetriesExceededException($e);
                }
                
                // Exponential backoff with jitter
                $delay = $this->calculateDelay($attempt);
                usleep($delay * 1000000);
            }
        }
    }
    
    private function shouldRetry(SMTPException $e): bool {
        $code = $e->getCode();
        
        // 4xx = temporary failure, retry
        // 5xx = permanent failure, don't retry
        return $code >= 400 && $code < 500;
    }
    
    private function calculateDelay(int $attempt): float {
        // Exponential backoff: 60s, 120s, 240s
        $delay = $this->baseDelay * pow(2, $attempt - 1);
        
        // Add jitter (±25%) to prevent thundering herd
        $jitter = $delay * 0.25 * (mt_rand() / mt_getrandmax() - 0.5);
        
        return min($delay + $jitter, 3600);  // Cap at 1 hour
    }
}
```

---

## 2. Application Integration

### 2.1 WordPress SMTP Configuration

#### Method 1: wp-config.php Constants + Must-Use Plugin (RECOMMENDED)

**Step 1: Define constants in wp-config.php**
```php
// wp-config.php - Above "That's all, stop editing!"

// SMTP Configuration
define('SMTP_HOST', 'smtp.sendgrid.net');
define('SMTP_PORT', 587);
define('SMTP_USER', 'apikey');  // For SendGrid
define('SMTP_PASS', $_ENV['SENDGRID_API_KEY']);  // From environment
define('SMTP_SECURE', 'tls');
define('SMTP_AUTH', true);
define('SMTP_FROM', 'noreply@yourdomain.com');
define('SMTP_NAME', 'Your Company Name');

// Additional security headers
define('SMTP_AUTO_TLS', true);
define('SMTP_DEBUG', 0);  // 0 = off, 1 = client, 2 = server, 3 = connection, 4 = low-level
```

**Step 2: Create must-use plugin**
```php
// wp-content/mu-plugins/smtp-config.php

<?php
/**
 * Plugin Name: SMTP Configuration
 * Description: Configures WordPress to use SMTP for all email
 * Version: 1.0.0
 * Author: Engineering Team
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Configure PHPMailer for SMTP
 */
add_action('phpmailer_init', function (PHPMailer $phpmailer): void {
    // Force SMTP
    $phpmailer->isSMTP();
    
    // Server settings
    $phpmailer->Host = defined('SMTP_HOST') ? SMTP_HOST : 'localhost';
    $phpmailer->Port = defined('SMTP_PORT') ? (int) SMTP_PORT : 587;
    $phpmailer->SMTPAuth = defined('SMTP_AUTH') ? SMTP_AUTH : true;
    $phpmailer->Username = defined('SMTP_USER') ? SMTP_USER : '';
    $phpmailer->Password = defined('SMTP_PASS') ? SMTP_PASS : '';
    
    // Encryption
    $phpmailer->SMTPSecure = defined('SMTP_SECURE') ? SMTP_SECURE : 'tls';
    
    // Auto-TLS behavior
    if (empty($phpmailer->SMTPSecure)) {
        $phpmailer->SMTPAutoTLS = false;
    } else {
        $phpmailer->SMTPAutoTLS = defined('SMTP_AUTO_TLS') ? SMTP_AUTO_TLS : true;
    }
    
    // Timeout settings
    $phpmailer->Timeout = 30;
    $phpmailer->SMTPKeepAlive = true;  // Keep connection open for multiple sends
    
    // Debug output (development only)
    if (defined('SMTP_DEBUG') && SMTP_DEBUG > 0 && defined('WP_DEBUG') && WP_DEBUG) {
        $phpmailer->SMTPDebug = SMTP_DEBUG;
        $phpmailer->Debugoutput = function ($str, $level): void {
            error_log("SMTP [{$level}]: {$str}");
        };
    }
    
    // From settings
    $from_email = defined('SMTP_FROM') ? SMTP_FROM : get_bloginfo('admin_email');
    $from_name = defined('SMTP_NAME') ? SMTP_NAME : get_bloginfo('name');
    $phpmailer->setFrom($from_email, $from_name, false);
});

/**
 * Override default from email
 */
add_filter('wp_mail_from', function (string $email): string {
    return defined('SMTP_FROM') ? SMTP_FROM : $email;
});

/**
 * Override default from name
 */
add_filter('wp_mail_from_name', function (string $name): string {
    return defined('SMTP_NAME') ? SMTP_NAME : $name;
});

/**
 * Add custom headers for better deliverability
 */
add_filter('wp_mail', function (array $args): array {
    $headers = isset($args['headers']) ? $args['headers'] : [];
    
    if (!is_array($headers)) {
        $headers = explode("\n", str_replace("\r\n", "\n", $headers));
    }
    
    // Add Message-ID with domain
    $domain = parse_url(home_url(), PHP_URL_HOST);
    $message_id = '<' . uniqid('', true) . '@' . $domain . '>';
    $headers[] = 'Message-ID: ' . $message_id;
    
    // Add X-Mailer header
    $headers[] = 'X-Mailer: WordPress/' . get_bloginfo('version');
    
    $args['headers'] = $headers;
    return $args;
});
```

#### Method 2: Environment-Based Configuration (Docker/Cloud Native)

```php
// wp-config.php
$env = $_ENV['WP_ENV'] ?? 'production';

$smtp_configs = [
    'production' => [
        'host' => $_ENV['SMTP_HOST'] ?? 'smtp.sendgrid.net',
        'port' => (int) ($_ENV['SMTP_PORT'] ?? 587),
        'user' => $_ENV['SMTP_USER'] ?? 'apikey',
        'pass' => $_ENV['SMTP_PASS'] ?? '',
        'secure' => $_ENV['SMTP_SECURE'] ?? 'tls',
    ],
    'staging' => [
        'host' => $_ENV['SMTP_HOST'] ?? 'smtp.mailtrap.io',
        'port' => (int) ($_ENV['SMTP_PORT'] ?? 2525),
        'user' => $_ENV['SMTP_USER'] ?? '',
        'pass' => $_ENV['SMTP_PASS'] ?? '',
        'secure' => $_ENV['SMTP_SECURE'] ?? '',
    ],
    'development' => [
        'host' => $_ENV['SMTP_HOST'] ?? 'mailhog',
        'port' => (int) ($_ENV['SMTP_PORT'] ?? 1025),
        'user' => '',
        'pass' => '',
        'secure' => '',
    ],
];

$config = $smtp_configs[$env] ?? $smtp_configs['production'];

define('SMTP_HOST', $config['host']);
define('SMTP_PORT', $config['port']);
define('SMTP_USER', $config['user']);
define('SMTP_PASS', $config['pass']);
define('SMTP_SECURE', $config['secure']);
```

### 2.2 PHPMailer Configuration Patterns

#### Production-Grade PHPMailer Setup

```php
<?php
/**
 * Production SMTP Mailer Class
 */
class ProductionMailer {
    private PHPMailer $mailer;
    private Logger $logger;
    private array $config;
    
    public function __construct(array $config, Logger $logger) {
        $this->config = $config;
        $this->logger = $logger;
        $this->mailer = new PHPMailer(true);
        $this->configure();
    }
    
    private function configure(): void {
        // Server settings
        $this->mailer->isSMTP();
        $this->mailer->Host = $this->config['host'];
        $this->mailer->Port = $this->config['port'];
        $this->mailer->SMTPAuth = true;
        $this->mailer->Username = $this->config['username'];
        $this->mailer->Password = $this->config['password'];
        
        // Security
        $this->mailer->SMTPSecure = $this->config['encryption'] ?? PHPMailer::ENCRYPTION_STARTTLS;
        $this->mailer->SMTPAutoTLS = true;
        
        // SSL/TLS options for production
        $this->mailer->SMTPOptions = [
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
                'cafile' => $this->config['ca_bundle'] ?? '/etc/ssl/certs/ca-certificates.crt',
                'ciphers' => 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
            ],
        ];
        
        // Timeouts
        $this->mailer->Timeout = 30;
        $this->mailer->SMTPKeepAlive = true;
        
        // Charset
        $this->mailer->CharSet = PHPMailer::CHARSET_UTF8;
        $this->mailer->Encoding = PHPMailer::ENCODING_BASE64;
        
        // Debugging (disabled in production)
        $this->mailer->SMTPDebug = $this->config['debug'] ?? 0;
        if ($this->mailer->SMTPDebug > 0) {
            $this->mailer->Debugoutput = [$this, 'logDebug'];
        }
    }
    
    public function send(EmailMessage $message): bool {
        try {
            $this->mailer->clearAddresses();
            $this->mailer->clearAttachments();
            $this->mailer->clearCustomHeaders();
            
            // Recipients
            $this->mailer->setFrom($message->from, $message->fromName);
            $this->mailer->addAddress($message->to, $message->toName);
            
            if ($message->replyTo) {
                $this->mailer->addReplyTo($message->replyTo);
            }
            
            // Content
            $this->mailer->isHTML($message->isHtml);
            $this->mailer->Subject = $message->subject;
            $this->mailer->Body = $message->body;
            
            if ($message->isHtml && $message->altBody) {
                $this->mailer->AltBody = $message->altBody;
            }
            
            // Custom headers
            foreach ($message->headers as $name => $value) {
                $this->mailer->addCustomHeader($name, $value);
            }
            
            // DKIM signing (if configured)
            if (isset($this->config['dkim'])) {
                $this->mailer->DKIM_domain = $this->config['dkim']['domain'];
                $this->mailer->DKIM_private = $this->config['dkim']['private_key'];
                $this->mailer->DKIM_selector = $this->config['dkim']['selector'];
                $this->mailer->DKIM_passphrase = $this->config['dkim']['passphrase'] ?? '';
            }
            
            $result = $this->mailer->send();
            
            $this->logger->info('Email sent successfully', [
                'to' => $message->to,
                'subject' => $message->subject,
                'message_id' => $this->mailer->getLastMessageID(),
            ]);
            
            return $result;
            
        } catch (Exception $e) {
            $this->logger->error('Email sending failed', [
                'to' => $message->to,
                'subject' => $message->subject,
                'error' => $e->getMessage(),
                'smtp_error' => $this->mailer->ErrorInfo,
            ]);
            
            throw new MailException(
                'Failed to send email: ' . $e->getMessage(),
                0,
                $e
            );
        }
    }
    
    public function close(): void {
        $this->mailer->smtpClose();
    }
    
    private function logDebug(string $str, int $level): void {
        $this->logger->debug('SMTP Debug', ['level' => $level, 'message' => $str]);
    }
}
```

### 2.3 Testing SMTP Connectivity

#### Telnet/Netcat SMTP Test

```bash
#!/bin/bash
# smtp-test.sh - Test SMTP connectivity

HOST=${1:-smtp.gmail.com}
PORT=${2:-587}
USER=${3:-}
PASS=${4:-}

echo "Testing SMTP connection to ${HOST}:${PORT}..."

# Test 1: Basic connectivity
echo "=== Test 1: Basic Connectivity ==="
nc -zv ${HOST} ${PORT}

# Test 2: SMTP handshake
echo -e "\n=== Test 2: SMTP Handshake ==="
{
    echo "EHLO test.example.com"
    sleep 1
    echo "QUIT"
} | nc ${HOST} ${PORT}

# Test 3: STARTTLS test (port 587)
if [ "$PORT" = "587" ]; then
    echo -e "\n=== Test 3: STARTTLS Capability ==="
    {
        echo "EHLO test.example.com"
        sleep 1
    } | openssl s_client -starttls smtp -crlf -connect ${HOST}:${PORT} 2>/dev/null | head -20
fi

# Test 4: TLS connection (port 465)
if [ "$PORT" = "465" ]; then
    echo -e "\n=== Test 4: Implicit TLS Connection ==="
    openssl s_client -crlf -connect ${HOST}:${PORT} 2>/dev/null | head -20
fi
```

#### PHP SMTP Connectivity Test

```php
<?php
/**
 * SMTP Connectivity Test Script
 * Usage: php smtp-test.php [host] [port] [user] [pass]
 */

require 'vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

function testSMTPConnection($host, $port, $user = null, $pass = null) {
    echo "SMTP Connectivity Test\n";
    echo "======================\n";
    echo "Host: {$host}\n";
    echo "Port: {$port}\n";
    echo "User: " . ($user ?: '(none)') . "\n";
    echo "\n";
    
    $mail = new PHPMailer(true);
    
    try {
        // Enable debug output
        $mail->SMTPDebug = SMTP::DEBUG_CONNECTION;
        $mail->Debugoutput = 'echo';
        
        $mail->isSMTP();
        $mail->Host = $host;
        $mail->Port = $port;
        
        // Determine encryption based on port
        if ($port == 465) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            echo "Using: Implicit TLS (SMTPS)\n";
        } elseif ($port == 587) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            echo "Using: STARTTLS\n";
        } else {
            $mail->SMTPAutoTLS = false;
            echo "Using: No encryption\n";
        }
        
        // Authentication
        if ($user && $pass) {
            $mail->SMTPAuth = true;
            $mail->Username = $user;
            $mail->Password = $pass;
            echo "Auth: Enabled\n";
        } else {
            $mail->SMTPAuth = false;
            echo "Auth: Disabled\n";
        }
        
        // Test connection
        echo "\n--- Connecting... ---\n";
        $mail->smtpConnect();
        
        echo "\n--- Connection successful! ---\n";
        
        // Get server capabilities
        $capabilities = $mail->getSMTPInstance()->getServerExtList();
        echo "\n--- Server Capabilities ---\n";
        foreach ($capabilities as $cap => $value) {
            echo "  {$cap}: " . ($value ?: 'Yes') . "\n";
        }
        
        // Test authentication if credentials provided
        if ($user && $pass) {
            echo "\n--- Testing Authentication ---\n";
            if ($mail->smtpAuthenticate()) {
                echo "Authentication: SUCCESS\n";
            } else {
                echo "Authentication: FAILED\n";
            }
        }
        
        $mail->smtpClose();
        echo "\n--- Test Complete ---\n";
        
        return true;
        
    } catch (Exception $e) {
        echo "\n--- Connection Failed ---\n";
        echo "Error: " . $e->getMessage() . "\n";
        echo "PHPMailer Error: " . $mail->ErrorInfo . "\n";
        return false;
    }
}

// CLI usage
if (PHP_SAPI === 'cli') {
    $host = $argv[1] ?? 'smtp.gmail.com';
    $port = $argv[2] ?? 587;
    $user = $argv[3] ?? null;
    $pass = $argv[4] ?? null;
    
    testSMTPConnection($host, $port, $user, $pass);
}
```

### 2.4 Error Handling and Logging

#### SMTP Error Handler Class

```php
<?php
/**
 * SMTP Error Handler with Structured Logging
 */
class SMTPErrorHandler {
    private LoggerInterface $logger;
    private AlertManager $alerts;
    private array $errorStats = [];
    
    public function __construct(LoggerInterface $logger, AlertManager $alerts) {
        $this->logger = $logger;
        $this->alerts = $alerts;
    }
    
    /**
     * Handle SMTP exceptions with appropriate action
     */
    public function handle(Exception $e, EmailContext $context): ErrorResult {
        $smtpCode = $this->extractSMTPCode($e->getMessage());
        $category = $this->categorizeError($smtpCode);
        
        // Log structured error
        $this->logger->error('SMTP Error', [
            'smtp_code' => $smtpCode,
            'category' => $category,
            'message' => $e->getMessage(),
            'recipient' => $context->recipient,
            'subject' => $context->subject,
            'attempt' => $context->attemptNumber,
            'timestamp' => date('c'),
        ]);
        
        // Update statistics
        $this->updateErrorStats($smtpCode, $category);
        
        // Check for alert conditions
        if ($this->shouldAlert($category)) {
            $this->sendAlert($e, $context, $category);
        }
        
        return new ErrorResult(
            code: $smtpCode,
            category: $category,
            isRetryable: $this->isRetryable($category),
            retryAfter: $this->getRetryDelay($category, $context->attemptNumber)
        );
    }
    
    /**
     * Categorize SMTP errors
     */
    private function categorizeError(?int $code): string {
        if ($code === null) {
            return 'UNKNOWN';
        }
        
        return match (true) {
            $code >= 200 && $code < 300 => 'SUCCESS',
            $code >= 400 && $code < 500 => 'TEMPORARY',
            $code >= 500 && $code < 600 => 'PERMANENT',
            default => 'UNKNOWN',
        };
    }
    
    /**
     * Determine if error is retryable
     */
    private function isRetryable(string $category): bool {
        return $category === 'TEMPORARY';
    }
    
    /**
     * Calculate retry delay with exponential backoff
     */
    private function getRetryDelay(string $category, int $attempt): ?int {
        if (!$this->isRetryable($category)) {
            return null;
        }
        
        // Exponential backoff: 1min, 5min, 15min, 30min, 1hour
        $delays = [60, 300, 900, 1800, 3600];
        return $delays[min($attempt - 1, count($delays) - 1)];
    }
    
    /**
     * Extract SMTP code from error message
     */
    private function extractSMTPCode(string $message): ?int {
        if (preg_match('/\b([45]\d{2})\b/', $message, $matches)) {
            return (int) $matches[1];
        }
        return null;
    }
    
    /**
     * Check if alert should be sent
     */
    private function shouldAlert(string $category): bool {
        // Alert on high permanent error rates
        if ($category === 'PERMANENT') {
            $key = date('Y-m-d-H');  // Hourly window
            $count = $this->errorStats[$key]['PERMANENT'] ?? 0;
            return $count > 100;  // Alert if >100 permanent errors/hour
        }
        
        return false;
    }
    
    private function updateErrorStats(int $code, string $category): void {
        $key = date('Y-m-d-H');
        $this->errorStats[$key][$category] = 
            ($this->errorStats[$key][$category] ?? 0) + 1;
    }
}
```

---

## 3. Security Considerations

### 3.1 Credential Storage Best Practices

#### Environment Variables Pattern

```php
<?php
/**
 * Secure SMTP Configuration Loader
 * Loads credentials from environment, never from code
 */
class SecureSMTPConfig {
    private array $config;
    
    public function __construct() {
        $this->config = $this->loadFromEnvironment();
        $this->validate();
    }
    
    private function loadFromEnvironment(): array {
        return [
            'host' => $_ENV['SMTP_HOST'] ?? throw new \RuntimeException('SMTP_HOST not set'),
            'port' => (int) ($_ENV['SMTP_PORT'] ?? 587),
            'username' => $_ENV['SMTP_USER'] ?? throw new \RuntimeException('SMTP_USER not set'),
            'password' => $_ENV['SMTP_PASS'] ?? throw new \RuntimeException('SMTP_PASS not set'),
            'encryption' => $_ENV['SMTP_ENCRYPTION'] ?? 'tls',
            'from_email' => $_ENV['SMTP_FROM_EMAIL'] ?? $_ENV['SMTP_USER'],
            'from_name' => $_ENV['SMTP_FROM_NAME'] ?? 'Application',
        ];
    }
    
    private function validate(): void {
        // Ensure no empty critical values
        foreach (['host', 'username', 'password'] as $key) {
            if (empty($this->config[$key])) {
                throw new \RuntimeException("SMTP config '{$key}' cannot be empty");
            }
        }
        
        // Validate encryption type
        $validEncryption = ['tls', 'ssl', ''];
        if (!in_array($this->config['encryption'], $validEncryption, true)) {
            throw new \RuntimeException(
                "Invalid SMTP_ENCRYPTION. Must be: " . implode(', ', $validEncryption)
            );
        }
    }
    
    public function get(string $key): mixed {
        return $this->config[$key] ?? null;
    }
    
    public function all(): array {
        return $this->config;
    }
    
    /**
     * Mask sensitive data for logging
     */
    public function forLogging(): array {
        $masked = $this->config;
        $masked['password'] = str_repeat('*', 12);
        return $masked;
    }
}
```

#### Secret Management with HashiCorp Vault

```php
<?php
/**
 * Vault-backed SMTP Credentials
 */
class VaultSMTPProvider {
    private Client $vaultClient;
    private string $secretPath;
    private ?array $cachedCredentials = null;
    private int $cacheExpiry;
    
    public function __construct(Client $vaultClient, string $secretPath) {
        $this->vaultClient = $vaultClient;
        $this->secretPath = $secretPath;
        $this->cacheExpiry = 0;
    }
    
    /**
     * Get SMTP credentials from Vault
     */
    public function getCredentials(): array {
        // Return cached credentials if valid
        if ($this->cachedCredentials && time() < $this->cacheExpiry) {
            return $this->cachedCredentials;
        }
        
        try {
            $response = $this->vaultClient->read($this->secretPath);
            $data = $response['data']['data'];
            
            $this->cachedCredentials = [
                'host' => $data['smtp_host'],
                'port' => (int) $data['smtp_port'],
                'username' => $data['smtp_username'],
                'password' => $data['smtp_password'],
                'encryption' => $data['smtp_encryption'] ?? 'tls',
            ];
            
            // Cache for 5 minutes (Vault leases typically short)
            $this->cacheExpiry = time() + 300;
            
            return $this->cachedCredentials;
            
        } catch (\Exception $e) {
            throw new \RuntimeException(
                'Failed to retrieve SMTP credentials from Vault: ' . $e->getMessage()
            );
        }
    }
    
    /**
     * Force credential refresh
     */
    public function refresh(): void {
        $this->cachedCredentials = null;
        $this->cacheExpiry = 0;
    }
}
```

#### Kubernetes Secrets Pattern

```yaml
# smtp-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: smtp-credentials
  namespace: production
type: Opaque
stringData:
  SMTP_HOST: "smtp.sendgrid.net"
  SMTP_PORT: "587"
  SMTP_USER: "apikey"
  SMTP_PASS: "SG.xxxxxxxxxxxxxxxxx"
  SMTP_ENCRYPTION: "tls"
  SMTP_FROM_EMAIL: "noreply@example.com"
  SMTP_FROM_NAME: "Example App"
```

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
        envFrom:
        - secretRef:
            name: smtp-credentials
```

### 3.2 TLS/SSL Certificate Validation

#### Strict TLS Configuration

```php
<?php
/**
 * Strict TLS Configuration for Maximum Security
 */
class StrictTLSConfig {
    /**
     * Get production-grade TLS options
     */
    public static function getStrictOptions(): array {
        return [
            'ssl' => [
                // Certificate verification
                'verify_peer' => true,
                'verify_peer_name' => true,
                'verify_host' => true,
                
                // Disallow self-signed certificates
                'allow_self_signed' => false,
                
                // CA bundle path
                'cafile' => self::getCAFile(),
                'capath' => self::getCAPath(),
                
                // Minimum TLS version
                'crypto_method' => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT |
                                   STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT,
                
                // Secure cipher suites (ordered by preference)
                'ciphers' => implode(':', [
                    'TLS_AES_128_GCM_SHA256',
                    'TLS_AES_256_GCM_SHA384',
                    'TLS_CHACHA20_POLY1305_SHA256',
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-ECDSA-AES128-GCM-SHA256',
                    'ECDHE-ECDSA-AES256-GCM-SHA384',
                ]),
                
                // Disable compression (CRIME attack)
                'disable_compression' => true,
                
                // SNI (Server Name Indication)
                'SNI_enabled' => true,
            ],
        ];
    }
    
    /**
     * Get CA bundle path
     */
    private static function getCAFile(): string {
        $possiblePaths = [
            '/etc/ssl/certs/ca-certificates.crt',  // Debian/Ubuntu
            '/etc/pki/tls/certs/ca-bundle.crt',    // RHEL/CentOS
            '/etc/ssl/ca-bundle.pem',              // OpenSUSE
            '/usr/local/etc/openssl/cert.pem',     // macOS (Homebrew)
            '/etc/ssl/cert.pem',                   // macOS (system)
        ];
        
        foreach ($possiblePaths as $path) {
            if (file_exists($path)) {
                return $path;
            }
        }
        
        throw new \RuntimeException('CA bundle not found');
    }
    
    private static function getCAPath(): ?string {
        $possiblePaths = [
            '/etc/ssl/certs',     // Debian/Ubuntu
            '/etc/pki/tls/certs', // RHEL/CentOS
        ];
        
        foreach ($possiblePaths as $path) {
            if (is_dir($path)) {
                return $path;
            }
        }
        
        return null;
    }
}

// Usage in PHPMailer
$mail->SMTPOptions = StrictTLSConfig::getStrictOptions();
```

#### Certificate Pinning (Advanced)

```php
<?php
/**
 * Certificate Pinning for SMTP
 * Useful for high-security environments
 */
class CertificatePinning {
    private array $pinnedFingerprints;
    
    public function __construct(array $fingerprints) {
        $this->pinnedFingerprints = array_map('strtoupper', $fingerprints);
    }
    
    /**
     * Verify certificate against pinned fingerprints
     */
    public function verify(string $host, int $port): bool {
        $context = stream_context_create([
            'ssl' => [
                'capture_peer_cert' => true,
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        
        $socket = @stream_socket_client(
            "ssl://{$host}:{$port}",
            $errno,
            $errstr,
            30,
            STREAM_CLIENT_CONNECT,
            $context
        );
        
        if (!$socket) {
            throw new \RuntimeException("Connection failed: {$errstr}");
        }
        
        $contextParams = stream_context_get_params($socket);
        $certificate = $contextParams['options']['ssl']['peer_certificate'];
        
        fclose($socket);
        
        // Get SHA-256 fingerprint
        $fingerprint = openssl_x509_fingerprint($certificate, 'sha256');
        
        return in_array(strtoupper($fingerprint), $this->pinnedFingerprints, true);
    }
}
```

### 3.3 Preventing Email Spoofing

#### SPF (Sender Policy Framework)

```dns
; DNS TXT Record for SPF
; v=spf1 [mechanisms] [modifiers]

; Basic SPF - allow mail from MX and A records
example.com. IN TXT "v=spf1 mx a -all"

; Include third-party providers
example.com. IN TXT "v=spf1 mx include:sendgrid.net include:mailgun.org -all"

; Detailed SPF with IP ranges
example.com. IN TXT "v=spf1 ip4:192.168.1.0/24 ip6:2001:db8::/32 include:_spf.google.com -all"
```

**SPF Mechanisms:**
| Mechanism | Description |
|-----------|-------------|
| `v=spf1` | SPF version |
| `a` | Allow A record IPs |
| `mx` | Allow MX record IPs |
| `ip4:1.2.3.4` | Allow specific IPv4 |
| `ip6:xxxx` | Allow specific IPv6 |
| `include:domain` | Include another domain's SPF |
| `~all` | Soft fail (mark spam) |
| `-all` | Hard fail (reject) |

#### DKIM (DomainKeys Identified Mail)

```php
<?php
/**
 * DKIM Key Generation and Configuration
 */
class DKIMSetup {
    /**
     * Generate DKIM key pair
     */
    public static function generateKeys(int $keySize = 2048): array {
        $config = [
            'private_key_bits' => $keySize,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ];
        
        $keyPair = openssl_pkey_new($config);
        
        // Export private key
        openssl_pkey_export($keyPair, $privateKey);
        
        // Get public key
        $keyDetails = openssl_pkey_get_details($keyPair);
        $publicKey = $keyDetails['key'];
        
        return [
            'private' => $privateKey,
            'public' => $publicKey,
            'dns_record' => self::formatDNSRecord($publicKey),
        ];
    }
    
    /**
     * Format public key for DNS TXT record
     */
    private static function formatDNSRecord(string $publicKey): string {
        // Remove headers and line breaks
        $key = str_replace([
            '-----BEGIN PUBLIC KEY-----',
            '-----END PUBLIC KEY-----',
            "\n",
            "\r",
        ], '', $publicKey);
        
        // Split into chunks of 255 characters for DNS
        $chunks = str_split($key, 255);
        
        return 'v=DKIM1; k=rsa; p=' . implode('', $chunks);
    }
    
    /**
     * Generate DNS record name
     */
    public static function getSelector(string $selector = 'default'): string {
        return "{$selector}._domainkey";
    }
}

// Usage
$keys = DKIMSetup::generateKeys();
echo "DNS Record Name: " . DKIMSetup::getSelector('2024') . "\n";
echo "DNS Record Value: " . $keys['dns_record'] . "\n";
```

**DNS Configuration:**
```dns
; DKIM TXT Record
2024._domainkey.example.com. IN TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB"
```

#### DMARC (Domain-based Message Authentication)

```dns
; DMARC TXT Record
; _dmarc.domain.com

; Basic DMARC - monitor only
_dmarc.example.com. IN TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"

; Recommended production DMARC
_dmarc.example.com. IN TXT "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@example.com; ruf=mailto:dmarc-forensic@example.com; fo=1; adkim=r; aspf=r"

; Strict DMARC - reject failures
_dmarc.example.com. IN TXT "v=DMARC1; p=reject; rua=mailto:dmarc@example.com; pct=100; adkim=s; aspf=s"
```

**DMARC Tags:**
| Tag | Description | Values |
|-----|-------------|--------|
| `v` | Version | DMARC1 |
| `p` | Policy | none, quarantine, reject |
| `pct` | Percentage | 0-100 |
| `rua` | Aggregate reports | mailto:address |
| `ruf` | Forensic reports | mailto:address |
| `adkim` | DKIM alignment | r (relaxed), s (strict) |
| `aspf` | SPF alignment | r (relaxed), s (strict) |

### 3.4 OAuth2 vs Password Authentication

#### OAuth2 Implementation for Gmail

```php
<?php
/**
 * Gmail OAuth2 SMTP Authentication
 */
class GmailOAuth2Provider {
    private string $clientId;
    private string $clientSecret;
    private string $redirectUri;
    private TokenStorage $tokenStorage;
    
    public function __construct(
        string $clientId,
        string $clientSecret,
        string $redirectUri,
        TokenStorage $tokenStorage
    ) {
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
        $this->redirectUri = $redirectUri;
        $this->tokenStorage = $tokenStorage;
    }
    
    /**
     * Get authorization URL
     */
    public function getAuthorizationUrl(string $state): string {
        $params = [
            'client_id' => $this->clientId,
            'redirect_uri' => $this->redirectUri,
            'scope' => 'https://mail.google.com/',
            'response_type' => 'code',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ];
        
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params);
    }
    
    /**
     * Exchange authorization code for tokens
     */
    public function exchangeCode(string $code): array {
        $response = $this->httpPost('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'redirect_uri' => $this->redirectUri,
            'grant_type' => 'authorization_code',
        ]);
        
        $tokens = json_decode($response, true);
        
        if (!isset($tokens['access_token'])) {
            throw new \RuntimeException('Failed to obtain access token');
        }
        
        // Store tokens securely
        $this->tokenStorage->store([
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'] ?? null,
            'expires_at' => time() + ($tokens['expires_in'] ?? 3600),
        ]);
        
        return $tokens;
    }
    
    /**
     * Refresh access token
     */
    public function refreshToken(): string {
        $stored = $this->tokenStorage->get();
        
        if (empty($stored['refresh_token'])) {
            throw new \RuntimeException('No refresh token available');
        }
        
        $response = $this->httpPost('https://oauth2.googleapis.com/token', [
            'refresh_token' => $stored['refresh_token'],
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'grant_type' => 'refresh_token',
        ]);
        
        $tokens = json_decode($response, true);
        
        $this->tokenStorage->store([
            'access_token' => $tokens['access_token'],
            'refresh_token' => $stored['refresh_token'],  // Keep original
            'expires_at' => time() + ($tokens['expires_in'] ?? 3600),
        ]);
        
        return $tokens['access_token'];
    }
    
    /**
     * Get valid access token (refresh if needed)
     */
    public function getAccessToken(): string {
        $stored = $this->tokenStorage->get();
        
        // Refresh if expires in less than 5 minutes
        if ($stored['expires_at'] - time() < 300) {
            return $this->refreshToken();
        }
        
        return $stored['access_token'];
    }
}
```

#### Microsoft 365 OAuth2

```php
<?php
/**
 * Microsoft 365 OAuth2 SMTP Authentication
 * Required for SMTP AUTH deprecation
 */
class Microsoft365OAuth2Provider {
    private string $tenantId;
    private string $clientId;
    private string $clientSecret;
    
    public function __construct(
        string $tenantId,
        string $clientId,
        string $clientSecret
    ) {
        $this->tenantId = $tenantId;
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;
    }
    
    /**
     * Get access token for application permissions
     */
    public function getApplicationToken(): string {
        $url = "https://login.microsoftonline.com/{$this->tenantId}/oauth2/v2.0/token";
        
        $response = $this->httpPost($url, [
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'scope' => 'https://outlook.office365.com/.default',
            'grant_type' => 'client_credentials',
        ]);
        
        $tokens = json_decode($response, true);
        
        return $tokens['access_token'];
    }
    
    /**
     * Configure PHPMailer for XOAUTH2
     */
    public function configureMailer(PHPMailer $mailer, string $email): void {
        $token = $this->getApplicationToken();
        
        $mailer->AuthType = 'XOAUTH2';
        $mailer->AccessToken = $this->buildXOAuth2String($email, $token);
    }
    
    /**
     * Build XOAUTH2 authentication string
     */
    private function buildXOAuth2String(string $email, string $token): string {
        return base64_encode(implode('', [
            "user=", $email, "\x01",
            "auth=Bearer ", $token, "\x01", "\x01"
        ]));
    }
}
```

---

## 4. Monitoring & Troubleshooting

### 4.1 Common SMTP Error Codes

#### Error Code Reference

| Code | Category | Meaning | Action |
|------|----------|---------|--------|
| **2xx Success** ||||
| 220 | Success | Service ready | Continue |
| 250 | Success | Request completed | Continue |
| 354 | Success | Start mail input | Send message |
| **4xx Temporary Failures** ||||
| 421 | Transient | Service not available | Retry later |
| 450 | Transient | Mailbox unavailable | Retry later |
| 451 | Transient | Local error | Retry later |
| 452 | Transient | Insufficient storage | Retry later |
| 454 | Transient | TLS temporarily unavailable | Retry later |
| 4.7.0 | Transient | Greylisting/throttling | Backoff retry |
| **5xx Permanent Failures** ||||
| 500 | Permanent | Syntax error | Fix and retry |
| 501 | Permanent | Syntax error in parameters | Fix and retry |
| 550 | Permanent | Mailbox unavailable | Remove address |
| 551 | Permanent | User not local | Check address |
| 552 | Permanent | Mailbox full | Contact user |
| 553 | Permanent | Mailbox name not allowed | Fix address |
| 554 | Permanent | Transaction failed | Investigate |
| 5.1.1 | Permanent | User unknown | Remove address |
| 5.7.1 | Permanent | Relay access denied | Check auth |
| 5.7.26 | Permanent | DMARC/SPF/DKIM fail | Fix DNS |

#### Enhanced Status Codes (RFC 3463)

```
5.1.1 - Bad destination mailbox address
5.1.2 - Bad destination system address
5.1.3 - Bad destination mailbox address syntax
5.2.1 - Mailbox disabled
5.2.2 - Mailbox full
5.3.4 - Message too big
5.4.1 - No answer from host
5.7.1 - Delivery not authorized
5.7.26 - Unauthenticated email not accepted
```

### 4.2 Email Delivery Tracking

#### Message-ID Tracking

```php
<?php
/**
 * Email Delivery Tracker
 */
class DeliveryTracker {
    private Database $db;
    
    public function trackSend(Email $email, string $messageId): void {
        $this->db->insert('email_tracking', [
            'message_id' => $messageId,
            'recipient' => $email->to,
            'subject' => $email->subject,
            'status' => 'sent',
            'sent_at' => date('Y-m-d H:i:s'),
            'metadata' => json_encode([
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]),
        ]);
    }
    
    public function processBounce(string $bounceMessage): void {
        $parsed = $this->parseBounce($bounceMessage);
        
        $this->db->update('email_tracking', 
            [
                'status' => $parsed['isHard'] ? 'bounced_hard' : 'bounced_soft',
                'bounce_code' => $parsed['code'],
                'bounce_reason' => $parsed['reason'],
                'bounced_at' => date('Y-m-d H:i:s'),
            ],
            ['message_id' => $parsed['originalMessageId']]
        );
    }
    
    private function parseBounce(string $message): array {
        // Extract original Message-ID
        preg_match('/Original-Message-ID:\s*<([^>]+)>/i', $message, $msgIdMatch);
        
        // Extract SMTP code
        preg_match('/\b([45]\d{2})\b/', $message, $codeMatch);
        
        // Extract reason
        preg_match('/Diagnostic-Code:\s*(.+?)(?:\r?\n|\r)/i', $message, $reasonMatch);
        
        $code = (int) ($codeMatch[1] ?? 0);
        
        return [
            'originalMessageId' => $msgIdMatch[1] ?? null,
            'code' => $code,
            'reason' => trim($reasonMatch[1] ?? 'Unknown'),
            'isHard' => $code >= 500,
        ];
    }
}
```

### 4.3 Bounce Handling

#### Bounce Processor

```php
<?php
/**
 * Bounce Processing System
 */
class BounceProcessor {
    private DeliveryTracker $tracker;
    private SuppressionList $suppressionList;
    private Logger $logger;
    
    public function processInbox(string $mailbox): void {
        $imap = imap_open($mailbox, $user, $pass);
        
        $emails = imap_search($imap, 'UNSEEN SUBJECT "Delivery Status Notification"');
        
        foreach ($emails as $emailNum) {
            $body = imap_fetchbody($imap, $emailNum, '');
            
            if ($this->isBounce($body)) {
                $this->handleBounce($body);
            }
            
            imap_delete($imap, $emailNum);
        }
        
        imap_expunge($imap);
        imap_close($imap);
    }
    
    private function isBounce(string $body): bool {
        $indicators = [
            'Delivery Status Notification',
            'Mail Delivery Subsystem',
            'MAILER-DAEMON',
            'postmaster@',
            'X-Failed-Recipients:',
        ];
        
        foreach ($indicators as $indicator) {
            if (stripos($body, $indicator) !== false) {
                return true;
            }
        }
        
        return false;
    }
    
    private function handleBounce(string $body): void {
        $bounce = $this->parseBounce($body);
        
        // Log the bounce
        $this->logger->info('Bounce received', $bounce);
        
        // Track in delivery system
        $this->tracker->processBounce($body);
        
        // Handle based on type
        if ($bounce['isHard']) {
            // Hard bounce - suppress immediately
            $this->suppressionList->add($bounce['recipient'], $bounce['reason']);
            
            // Alert if high hard bounce rate
            if ($this->getHardBounceRate() > 0.05) {
                $this->alert('High hard bounce rate detected');
            }
        } else {
            // Soft bounce - track for retry
            $this->trackSoftBounce($bounce);
        }
    }
    
    private function getHardBounceRate(): float {
        // Calculate hard bounce rate for last hour
        // Implementation...
        return 0.0;
    }
}
```

### 4.4 SMTP Debugging Techniques

#### Debug Logger

```php
<?php
/**
 * SMTP Debug Logger
 */
class SMTPDebugger {
    private array $logs = [];
    private bool $captureTraffic;
    
    public function capture(callable $smtpOperation): array {
        $this->logs = [];
        
        ob_start();
        
        try {
            $result = $smtpOperation();
            $output = ob_get_clean();
            
            $this->parseDebugOutput($output);
            
            return [
                'success' => true,
                'result' => $result,
                'logs' => $this->logs,
            ];
        } catch (Exception $e) {
            $output = ob_get_clean();
            $this->parseDebugOutput($output);
            
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'logs' => $this->logs,
            ];
        }
    }
    
    private function parseDebugOutput(string $output): void {
        $lines = explode("\n", $output);
        
        foreach ($lines as $line) {
            if (preg_match('/^(\d{3})\s(.+)$/', $line, $matches)) {
                $this->logs[] = [
                    'type' => 'server',
                    'code' => (int) $matches[1],
                    'message' => $matches[2],
                ];
            } elseif (preg_match('/^CLIENT:\s*(.+)$/', $line, $matches)) {
                $this->logs[] = [
                    'type' => 'client',
                    'message' => $matches[1],
                ];
            }
        }
    }
}
```

#### SMTP Traffic Analyzer

```bash
#!/bin/bash
# smtp-analyzer.sh - Analyze SMTP traffic with tcpdump

INTERFACE=${1:-eth0}
PORT=${2:-587}

echo "Capturing SMTP traffic on ${INTERFACE}:${PORT}..."
echo "Press Ctrl+C to stop"

sudo tcpdump -i ${INTERFACE} port ${PORT} -A -nn -l | \
    grep -E '(EHLO|MAIL FROM|RCPT TO|DATA|QUIT|250|354|5\d{2}|4\d{2})' | \
    while read line; do
        timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[${timestamp}] ${line}"
    done
```

---

## 5. Quick Reference

### 5.1 Provider-Specific Settings

| Provider | Host | Port | Encryption | Auth | Notes |
|----------|------|------|------------|------|-------|
| **Gmail** | smtp.gmail.com | 587 | STARTTLS | OAuth2/Password | App password required if 2FA |
| | smtp.gmail.com | 465 | Implicit TLS | OAuth2/Password | Alternative port |
| **Outlook/Microsoft 365** | smtp.office365.com | 587 | STARTTLS | OAuth2 | Basic auth deprecated 2026 |
| **SendGrid** | smtp.sendgrid.net | 587 | STARTTLS | API Key | Username: "apikey" |
| **Mailgun** | smtp.mailgun.org | 587 | STARTTLS | Username/Password | Domain-specific credentials |
| **Amazon SES** | email-smtp.us-east-1.amazonaws.com | 587 | STARTTLS | Username/Password | SMTP credentials from IAM |
| **Postmark** | smtp.postmarkapp.com | 587 | STARTTLS | Server Token | Username: Server token |

### 5.2 Security Checklist

- [ ] Use OAuth2 instead of password auth where possible
- [ ] Store credentials in environment variables or secret manager
- [ ] Enable TLS/STARTTLS for all connections
- [ ] Verify peer certificates (don't use `verify_peer => false`)
- [ ] Configure SPF records
- [ ] Configure DKIM signing
- [ ] Configure DMARC policy
- [ ] Use dedicated IP for high volume
- [ ] Implement rate limiting
- [ ] Monitor bounce rates (<5% hard bounce threshold)
- [ ] Log all SMTP transactions
- [ ] Set up alerts for high error rates

### 5.3 PHP Code Template

```php
<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'vendor/autoload.php';

// Load from environment
$config = [
    'host' => $_ENV['SMTP_HOST'],
    'port' => (int) $_ENV['SMTP_PORT'],
    'user' => $_ENV['SMTP_USER'],
    'pass' => $_ENV['SMTP_PASS'],
    'from' => $_ENV['SMTP_FROM'],
    'from_name' => $_ENV['SMTP_FROM_NAME'],
];

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host = $config['host'];
    $mail->Port = $config['port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['user'];
    $mail->Password = $config['pass'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    
    // Strict TLS
    $mail->SMTPOptions = [
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
        ],
    ];
    
    // Recipients
    $mail->setFrom($config['from'], $config['from_name']);
    $mail->addAddress('recipient@example.com');
    
    // Content
    $mail->isHTML(true);
    $mail->Subject = 'Test Email';
    $mail->Body = '<h1>Hello World</h1>';
    $mail->AltBody = 'Hello World';
    
    $mail->send();
    echo 'Message sent!';
} catch (Exception $e) {
    echo "Message could not be sent. Error: {$mail->ErrorInfo}";
}
```

---

## Appendix: RFC References

- **RFC 5321** - Simple Mail Transfer Protocol
- **RFC 6409** - Message Submission for Mail (port 587)
- **RFC 8314** - Cleartext Considered Obsolete: Use of TLS for Email Submission (port 465)
- **RFC 4954** - SMTP Service Extension for Authentication
- **RFC 3463** - Enhanced Status Codes for SMTP
- **RFC 7208** - Sender Policy Framework (SPF)
- **RFC 6376** - DomainKeys Identified Mail (DKIM)
- **RFC 7489** - Domain-based Message Authentication (DMARC)

---

*Document Version: 1.0*  
*Last Updated: March 2026*
