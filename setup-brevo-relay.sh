#!/bin/bash
# Brevo SMTP Relay Setup Script for Hestia
# Run this on your Hestia server (34.132.198.35)

set -e

echo "=== Brevo SMTP Relay Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get Brevo credentials from user
echo "Enter your Brevo SMTP credentials:"
echo ""
read -p "Brevo Email Address (username): " BREVO_EMAIL
read -sp "Brevo SMTP Key (password): " BREVO_KEY
echo ""

# Create SMTP relay configuration
SMTP_RELAY_CONF="/etc/exim4/smtp_relay.conf"

echo "Creating SMTP relay configuration..."
cat > $SMTP_RELAY_CONF << EOF
host=smtp-relay.brevo.com
port=587
user=$BREVO_EMAIL
pass=$BREVO_KEY
EOF

chmod 640 $SMTP_RELAY_CONF
chown root:Debian-exim $SMTP_RELAY_CONF

echo "✓ SMTP relay config created at $SMTP_RELAY_CONF"

# Also configure per-domain for zaplit.com
DOMAIN_RELAY_DIR="/etc/exim4/domains/zaplit.com"
if [ -d "$DOMAIN_RELAY_DIR" ]; then
    echo "Setting up domain-specific relay..."
    cat > $DOMAIN_RELAY_DIR/smtp_relay.conf << EOF
host=smtp-relay.brevo.com
port=587
user=$BREVO_EMAIL
pass=$BREVO_KEY
EOF
    chmod 640 $DOMAIN_RELAY_DIR/smtp_relay.conf
    chown root:Debian-exim $DOMAIN_RELAY_DIR/smtp_relay.conf
    echo "✓ Domain relay config created"
fi

# Restart Exim
echo "Restarting Exim mail server..."
systemctl restart exim4

# Test configuration
echo ""
echo "Testing configuration..."
if systemctl is-active --quiet exim4; then
    echo "✓ Exim is running"
else
    echo "✗ Exim failed to start"
    exit 1
fi

# Show current config
echo ""
echo "=== Current SMTP Relay Configuration ==="
cat $SMTP_RELAY_CONF | grep -v "pass=" | sed 's/pass=.*/pass=*****/'

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Create mail domain in Hestia: https://34.132.198.35:8083"
echo "2. Enable DKIM and copy the DKIM key"
echo "3. Add DKIM DNS record: TXT mail._domainkey.zaplit.com"
echo "4. Create email account"
echo "5. Test sending via Roundcube: https://webmail.zaplit.com"
echo ""
echo "To verify it's working:"
echo "  tail -f /var/log/exim4/mainlog"
