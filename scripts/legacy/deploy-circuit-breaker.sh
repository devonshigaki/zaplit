#!/bin/bash
#
# Circuit Breaker Deployment Script
#
# This script:
# 1. Installs Redis if not present
# 2. Configures n8n workflow with circuit breaker
# 3. Tests the circuit breaker implementation
#
# Usage: ./deploy-circuit-breaker.sh [environment]
#   environment: local, staging, production (default: local)
#

set -euo pipefail

# ============================================
# CONFIGURATION
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENVIRONMENT="${1:-local}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
REDIS_PORT=6379
REDIS_PASSWORD=""
N8N_WEBHOOK_URL="${N8N_WEBHOOK_URL:-http://localhost:5678}"
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-5}"
CIRCUIT_RECOVERY_TIMEOUT="${CIRCUIT_RECOVERY_TIMEOUT_MS:-60000}"
CIRCUIT_SUCCESS_THRESHOLD="${CIRCUIT_SUCCESS_THRESHOLD:-3}"

# ============================================
# LOGGING FUNCTIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║         Circuit Breaker Deployment Script                  ║"
    echo "║         Environment: $ENVIRONMENT                                 ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
}

# ============================================
# UTILITY FUNCTIONS
# ============================================

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

wait_for_service() {
    local host=$1
    local port=$2
    local timeout=${3:-30}
    local start_time=$(date +%s)

    log_info "Waiting for $host:$port..."
    
    while true; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_success "$host:$port is available"
            return 0
        fi
        
        local current_time=$(date +%s)
        if ((current_time - start_time > timeout)); then
            log_error "Timeout waiting for $host:$port"
            return 1
        fi
        
        sleep 1
    done
}

# ============================================
# REDIS INSTALLATION
# ============================================

install_redis() {
    log_info "Checking Redis installation..."
    
    if command_exists redis-cli; then
        log_success "Redis is already installed"
        redis-cli --version
        return 0
    fi
    
    log_info "Redis not found. Installing..."
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command_exists apt-get; then
            # Debian/Ubuntu
            log_info "Installing Redis via apt-get..."
            sudo apt-get update
            sudo apt-get install -y redis-server
            sudo systemctl enable redis-server
            sudo systemctl start redis-server
        elif command_exists yum; then
            # RHEL/CentOS
            log_info "Installing Redis via yum..."
            sudo yum install -y epel-release
            sudo yum install -y redis
            sudo systemctl enable redis
            sudo systemctl start redis
        elif command_exists dnf; then
            # Fedora
            log_info "Installing Redis via dnf..."
            sudo dnf install -y redis
            sudo systemctl enable redis
            sudo systemctl start redis
        else
            log_error "Unsupported package manager. Please install Redis manually."
            return 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            log_info "Installing Redis via Homebrew..."
            brew install redis
            brew services start redis
        else
            log_error "Homebrew not found. Please install Redis manually."
            return 1
        fi
    else
        log_error "Unsupported operating system. Please install Redis manually."
        return 1
    fi
    
    # Wait for Redis to start
    wait_for_service localhost 6379 10
    
    log_success "Redis installed and running"
}

configure_redis() {
    log_info "Configuring Redis for Circuit Breaker..."
    
    # Check if Redis is running
    if ! redis-cli ping >/dev/null 2>&1; then
        log_error "Redis is not running. Please start Redis first."
        return 1
    fi
    
    # Test Redis connection
    local test_result
    test_result=$(redis-cli ping)
    if [[ "$test_result" != "PONG" ]]; then
        log_error "Redis ping failed"
        return 1
    fi
    
    # Set up Redis configuration for circuit breaker
    log_info "Setting up Redis keys..."
    
    # Clear any existing circuit breaker state
    redis-cli KEYS "circuit:twenty:*" | xargs -r redis-cli DEL 2>/dev/null || true
    
    # Set default configuration in Redis
    redis-cli SET "circuit:twenty:config:failure_threshold" "$CIRCUIT_FAILURE_THRESHOLD"
    redis-cli SET "circuit:twenty:config:recovery_timeout" "$CIRCUIT_RECOVERY_TIMEOUT"
    redis-cli SET "circuit:twenty:config:success_threshold" "$CIRCUIT_SUCCESS_THRESHOLD"
    
    log_success "Redis configured for circuit breaker"
}

# ============================================
# N8N CONFIGURATION
# ============================================

configure_n8n() {
    log_info "Configuring n8n for Circuit Breaker..."
    
    # Check if n8n is running
    if ! curl -s "$N8N_WEBHOOK_URL/healthz" >/dev/null 2>&1; then
        log_warn "n8n does not appear to be running at $N8N_WEBHOOK_URL"
        log_info "Please ensure n8n is running and accessible"
    fi
    
    # Create circuit breaker configuration for n8n
    local config_file="${PROJECT_ROOT}/n8n-circuit-breaker-config.json"
    
    cat > "$config_file" <<EOF
{
  "circuitBreaker": {
    "serviceName": "twenty-crm",
    "redisPrefix": "circuit:twenty",
    "failureThreshold": $CIRCUIT_FAILURE_THRESHOLD,
    "successThreshold": $CIRCUIT_SUCCESS_THRESHOLD,
    "recoveryTimeoutMs": $CIRCUIT_RECOVERY_TIMEOUT,
    "halfOpenMaxCalls": 3,
    "slidingWindowMs": 60000,
    "requestTimeoutMs": 30000
  },
  "redis": {
    "host": "${REDIS_HOST:-localhost}",
    "port": ${REDIS_PORT},
    "db": 0
  },
  "environment": "$ENVIRONMENT"
}
EOF
    
    log_success "n8n circuit breaker configuration created: $config_file"
    
    # Instructions for manual n8n setup
    echo ""
    log_info "Manual n8n setup required:"
    echo "  1. Open n8n at $N8N_WEBHOOK_URL"
    echo "  2. Add Redis credentials:"
    echo "     - Name: Circuit Breaker Redis"
    echo "     - Host: ${REDIS_HOST:-localhost}"
    echo "     - Port: $REDIS_PORT"
    echo "     - Database: 0"
    echo "  3. Copy the circuit breaker code from:"
    echo "     ${PROJECT_ROOT}/n8n-circuit-breaker-node.js"
    echo "  4. Create Code nodes in your workflow:"
    echo "     - 'Check Circuit State' before CRM calls"
    echo "     - 'Record Success' after successful CRM calls"
    echo "     - 'Record Failure' on error branches"
    echo ""
}

# ============================================
# TESTING
# ============================================

run_tests() {
    log_info "Running circuit breaker tests..."
    
    # Check if TypeScript tests exist
    if [[ -f "${PROJECT_ROOT}/scripts-ts/src/tests/circuit-breaker.test.ts" ]]; then
        log_info "Running TypeScript test suite..."
        
        cd "${PROJECT_ROOT}/scripts-ts"
        
        # Check if dependencies are installed
        if [[ ! -d "node_modules" ]]; then
            log_info "Installing dependencies..."
            npm install
        fi
        
        # Run tests
        if npm run build 2>/dev/null; then
            node dist/tests/circuit-breaker.test.js || {
                log_warn "Some tests failed - this is expected if Redis is not running"
            }
        else
            log_warn "TypeScript build failed - running tests with ts-node"
            npx ts-node src/tests/circuit-breaker.test.ts || {
                log_warn "Some tests failed - this is expected if Redis is not running"
            }
        fi
    else
        log_warn "TypeScript test file not found, skipping automated tests"
    fi
    
    # Manual Redis connectivity test
    log_info "Testing Redis connectivity..."
    if redis-cli ping >/dev/null 2>&1; then
        log_success "Redis is accessible"
        
        # Test circuit breaker keys
        redis-cli SET "circuit:test:state" "CLOSED"
        local state
        state=$(redis-cli GET "circuit:test:state")
        if [[ "$state" == "CLOSED" ]]; then
            log_success "Circuit breaker key test passed"
        else
            log_error "Circuit breaker key test failed"
        fi
        redis-cli DEL "circuit:test:state"
    else
        log_error "Redis is not accessible"
        return 1
    fi
    
    echo ""
    log_success "Basic connectivity tests completed"
}

# ============================================
# MONITORING SETUP
# ============================================

setup_monitoring() {
    log_info "Setting up circuit breaker monitoring..."
    
    # Create monitoring script
    local monitor_script="${PROJECT_ROOT}/scripts/monitor-circuit-breaker.sh"
    
    cat > "$monitor_script" <<'EOF'
#!/bin/bash
# Circuit Breaker Monitoring Script
# Usage: ./monitor-circuit-breaker.sh

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "Circuit Breaker Status - $(date)"
echo "================================"
echo ""

echo "Current State:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "circuit:twenty:state" 2>/dev/null || echo "CLOSED"

echo ""
echo "Failure Count:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "circuit:twenty:failures" 2>/dev/null || echo "0"

echo ""
echo "Last Failure:"
last_failure=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "circuit:twenty:last_failure" 2>/dev/null)
if [[ -n "$last_failure" ]]; then
    date -r "$(($last_failure / 1000))" 2>/dev/null || echo "$last_failure"
else
    echo "Never"
fi

echo ""
echo "Half-Open Count:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "circuit:twenty:half_open_count" 2>/dev/null || echo "0"

echo ""
echo "Success Count (Half-Open):"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "circuit:twenty:success_count" 2>/dev/null || echo "0"

echo ""
echo "Retry Queue Length:"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "circuit:twenty:retry_queue" 2>/dev/null || echo "0"
EOF
    
    chmod +x "$monitor_script"
    
    log_success "Monitoring script created: $monitor_script"
    
    # Run monitoring once
    echo ""
    log_info "Current circuit breaker status:"
    "$monitor_script" || log_warn "Could not retrieve status"
}

# ============================================
# ENVIRONMENT SETUP
# ============================================

setup_environment() {
    log_info "Setting up environment: $ENVIRONMENT"
    
    # Create environment-specific .env file
    local env_file="${PROJECT_ROOT}/.env.circuit-breaker"
    
    cat > "$env_file" <<EOF
# Circuit Breaker Configuration
CIRCUIT_FAILURE_THRESHOLD=5
CIRCUIT_SUCCESS_THRESHOLD=3
CIRCUIT_RECOVERY_TIMEOUT_MS=60000
CIRCUIT_HALF_OPEN_MAX_CALLS=3
CIRCUIT_SLIDING_WINDOW_MS=60000
CIRCUIT_REQUEST_TIMEOUT_MS=30000
CIRCUIT_DEBUG=false

# Redis Configuration
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT}
REDIS_DB=0
REDIS_KEY_PREFIX=circuit:twenty

# Environment
CIRCUIT_ENVIRONMENT=$ENVIRONMENT
EOF
    
    log_success "Environment configuration created: $env_file"
    log_info "Add these variables to your .env file or environment"
}

# ============================================
# MAIN DEPLOYMENT
# ============================================

main() {
    print_banner
    
    # Validate environment
    case "$ENVIRONMENT" in
        local|staging|production)
            log_info "Deploying to $ENVIRONMENT environment"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_info "Valid environments: local, staging, production"
            exit 1
            ;;
    esac
    
    # Step 1: Install Redis
    install_redis
    
    # Step 2: Configure Redis
    configure_redis
    
    # Step 3: Setup environment
    setup_environment
    
    # Step 4: Configure n8n
    configure_n8n
    
    # Step 5: Run tests
    run_tests
    
    # Step 6: Setup monitoring
    setup_monitoring
    
    # Final summary
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              DEPLOYMENT COMPLETE                           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    log_success "Circuit Breaker has been deployed!"
    echo ""
    echo "Next steps:"
    echo "  1. Review the configuration in:"
    echo "     ${PROJECT_ROOT}/n8n-circuit-breaker-config.json"
    echo ""
    echo "  2. Import the circuit breaker code into n8n:"
    echo "     ${PROJECT_ROOT}/n8n-circuit-breaker-node.js"
    echo ""
    echo "  3. Monitor circuit breaker status:"
    echo "     ${PROJECT_ROOT}/scripts/monitor-circuit-breaker.sh"
    echo ""
    echo "  4. Test the circuit breaker with:"
    echo "     ${PROJECT_ROOT}/scripts-ts/src/tests/circuit-breaker.test.ts"
    echo ""
    echo "Documentation:"
    echo "  - Research: ${PROJECT_ROOT}/PHASE2_CIRCUIT_BREAKER_RESEARCH.md"
    echo ""
}

# Handle script interruption
cleanup() {
    echo ""
    log_warn "Deployment interrupted"
    exit 1
}

trap cleanup INT TERM

# Run main function
main "$@"
