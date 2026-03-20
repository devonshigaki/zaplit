#!/bin/bash
#==============================================================================
# Health Check Script for n8n-Twenty CRM Integration
#==============================================================================

set -e

N8N_URL="${N8N_URL:-https://n8n.zaplit.com}"
TWENTY_URL="${TWENTY_URL:-https://crm.zaplit.com}"
WEBHOOK_PATH="${WEBHOOK_PATH:-/webhook/consultation}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "Health Check: n8n-Twenty CRM Integration"
echo "======================================"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

EXIT_CODE=0

#==============================================================================
# Check 1: n8n Health
#==============================================================================

echo -n "1. n8n instance health: "
N8N_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$N8N_URL/healthz" 2>/dev/null || echo "000")

if [ "$N8N_HEALTH" = "200" ]; then
    echo -e "${GREEN}✓ Healthy (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Unhealthy (HTTP $N8N_HEALTH)${NC}"
    EXIT_CODE=1
fi

#==============================================================================
# Check 2: Twenty CRM Health
#==============================================================================

echo -n "2. Twenty CRM health:   "
TWENTY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$TWENTY_URL/healthz" 2>/dev/null || echo "000")

if [ "$TWENTY_HEALTH" = "200" ]; then
    echo -e "${GREEN}✓ Healthy (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Unhealthy (HTTP $TWENTY_HEALTH)${NC}"
    EXIT_CODE=1
fi

#==============================================================================
# Check 3: Webhook Endpoint
#==============================================================================

echo -n "3. Webhook endpoint:    "
WEBHOOK_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$N8N_URL$WEBHOOK_PATH" 2>/dev/null || echo "000")

if [ "$WEBHOOK_HEALTH" = "204" ] || [ "$WEBHOOK_HEALTH" = "200" ]; then
    echo -e "${GREEN}✓ Available (HTTP $WEBHOOK_HEALTH)${NC}"
else
    echo -e "${RED}✗ Unavailable (HTTP $WEBHOOK_HEALTH)${NC}"
    EXIT_CODE=1
fi

#==============================================================================
# Check 4: Test Submission
#==============================================================================

echo -n "4. Test submission:     "
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$N8N_URL$WEBHOOK_PATH" \
    -H "Content-Type: application/json" \
    -d '{"data":{"name":"Health Check","email":"health_'$(date +%s)'@test.com","company":"Health Corp","role":"Test"}}' \
    2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Working (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Failed (HTTP $HTTP_CODE)${NC}"
    EXIT_CODE=1
fi

echo ""
echo "======================================"

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}All health checks passed!${NC}"
else
    echo -e "${RED}Some health checks failed!${NC}"
fi

echo "======================================"

exit $EXIT_CODE
