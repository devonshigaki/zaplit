#!/bin/bash
# test-logging.sh - Test logging pipeline from application to Loki
# 
# This script generates test logs and verifies they appear in Loki

set -euo pipefail

# Configuration
GRAFANA_CLOUD_URL="${GRAFANA_CLOUD_URL:-}"
GRAFANA_CLOUD_USER="${GRAFANA_CLOUD_USER:-}"
GRAFANA_CLOUD_API_KEY="${GRAFANA_CLOUD_API_KEY:-}"
TEST_TIMEOUT="${TEST_TIMEOUT:-60}"

echo "=============================================="
echo "  Loki Logging Pipeline Test"
echo "=============================================="
echo ""

# Check environment
check_env() {
    if [[ -z "$GRAFANA_CLOUD_URL" || -z "$GRAFANA_CLOUD_USER" || -z "$GRAFANA_CLOUD_API_KEY" ]]; then
        echo "ERROR: Missing required environment variables"
        echo "Please set: GRAFANA_CLOUD_URL, GRAFANA_CLOUD_USER, GRAFANA_CLOUD_API_KEY"
        exit 1
    fi
}

# Check Promtail status
check_promtail() {
    echo "Checking Promtail status..."
    
    if ! systemctl is-active --quiet promtail 2>/dev/null; then
        echo "ERROR: Promtail service is not running"
        echo "Start it with: sudo systemctl start promtail"
        return 1
    fi
    
    echo "  ✓ Promtail service is running"
    
    # Check metrics endpoint
    if curl -s http://localhost:9080/metrics > /dev/null 2>&1; then
        echo "  ✓ Promtail metrics endpoint responding"
    else
        echo "  ✗ Promtail metrics endpoint not responding"
        return 1
    fi
}

# Generate test log
generate_test_log() {
    local test_id="$1"
    echo "Generating test log (ID: $test_id)..."
    
    # Write to system log
    logger -t "n8n-test" "TEST_LOG_ID=$test_id This is a test log entry for Loki validation"
    
    # Also write to a file that promtail may be tailing
    echo "$(date -Iseconds) level=info service=n8n TEST_LOG_ID=$test_id Test log entry" | sudo tee -a /var/log/syslog > /dev/null
    
    echo "  ✓ Test log generated"
}

# Query Loki for test log
query_loki() {
    local test_id="$1"
    local query="{job=\"system\"} |= \"$test_id\""
    local encoded_query=$(printf '%s' "$query" | python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read()))' 2>/dev/null || echo "")
    
    if [[ -z "$encoded_query" ]]; then
        # Fallback without python
        encoded_query=$(echo "$query" | sed 's/ /%20/g; s/=/%3D/g; s/"/%22/g; s/{/%7B/g; s/}/%7D/g; s/|/%7C/g')
    fi
    
    local url="https://${GRAFANA_CLOUD_URL}/loki/api/v1/query?query=${encoded_query}&limit=10"
    
    # Query with timeout
    response=$(curl -s -u "${GRAFANA_CLOUD_USER}:${GRAFANA_CLOUD_API_KEY}" \
        --max-time 10 \
        "$url" 2>/dev/null || echo "{}")
    
    # Check if we got results
    if echo "$response" | grep -q "$test_id"; then
        return 0
    else
        return 1
    fi
}

# Wait for log to appear in Loki
wait_for_log() {
    local test_id="$1"
    local max_attempts=$((TEST_TIMEOUT / 5))
    local attempt=1
    
    echo "Waiting for log to appear in Loki (timeout: ${TEST_TIMEOUT}s)..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if query_loki "$test_id"; then
            echo "  ✓ Test log found in Loki (attempt $attempt)"
            return 0
        fi
        
        echo "  ... attempt $attempt/$max_attempts, waiting 5s"
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "  ✗ Test log not found in Loki after ${TEST_TIMEOUT}s"
    return 1
}

# Check log volume
check_volume() {
    echo ""
    echo "Checking recent log volume..."
    
    local url="https://${GRAFANA_CLOUD_URL}/loki/api/v1/query?query=sum(rate({}[1h]))"
    
    response=$(curl -s -u "${GRAFANA_CLOUD_USER}:${GRAFANA_CLOUD_API_KEY}" \
        --max-time 10 \
        "$url" 2>/dev/null || echo "{}")
    
    echo "  Response: $response"
}

# Test specific service logs
test_service_logs() {
    echo ""
    echo "Testing service label queries..."
    
    local services=("n8n" "nginx" "system")
    
    for service in "${services[@]}"; do
        local url="https://${GRAFANA_CLOUD_URL}/loki/api/v1/query?query=%7Bservice%3D%22${service}%22%7D&limit=1"
        
        response=$(curl -s -u "${GRAFANA_CLOUD_USER}:${GRAFANA_CLOUD_API_KEY}" \
            --max-time 10 \
            "$url" 2>/dev/null || echo "{}")
        
        if echo "$response" | grep -q '"result"'; then
            echo "  ✓ Service '$service' has logs in Loki"
        else
            echo "  ✗ Service '$service' - no logs found (may be normal if service not running)"
        fi
    done
}

# Main test
main() {
    check_env
    
    # Generate unique test ID
    TEST_ID="test-$(date +%s)-$RANDOM"
    
    check_promtail
    generate_test_log "$TEST_ID"
    
    if wait_for_log "$TEST_ID"; then
        echo ""
        echo "=============================================="
        echo "  ✓ All tests passed!"
        echo "=============================================="
        echo ""
        echo "Logs are successfully flowing to Loki."
        echo "Test log ID: $TEST_ID"
    else
        echo ""
        echo "=============================================="
        echo "  ✗ Tests failed"
        echo "=============================================="
        echo ""
        echo "Troubleshooting:"
        echo "  1. Check Promtail logs: sudo journalctl -u promtail -f"
        echo "  2. Verify API credentials"
        echo "  3. Check network connectivity to Grafana Cloud"
        echo "  4. Review Promtail configuration"
        exit 1
    fi
    
    test_service_logs
    check_volume
    
    echo ""
    echo "To explore logs in Grafana:"
    echo "  https://${GRAFANA_CLOUD_URL}/explore"
}

main "$@"
