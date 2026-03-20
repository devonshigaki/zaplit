#!/bin/bash
#==============================================================================
# Load Test Script for n8n Webhook
#==============================================================================

set -e

N8N_WEBHOOK="${N8N_WEBHOOK:-https://n8n.zaplit.com/webhook/consultation}"
CONCURRENT="${1:-10}"
TOTAL="${2:-100}"
TEST_ID="LOAD_$(date +%s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "Load Test"
echo "======================================"
echo "Webhook: $N8N_WEBHOOK"
echo "Concurrent: $CONCURRENT"
echo "Total Requests: $TOTAL"
echo "Test ID: $TEST_ID"
echo ""

# Create temp directory
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Generate payloads
echo "Generating test payloads..."
for i in $(seq 1 $TOTAL); do
    cat > "$TMPDIR/payload_$i.json" <<EOF
{
  "data": {
    "name": "$TEST_ID User $i",
    "email": "$TEST_ID_$i@test.com",
    "company": "$TEST_ID Corp $i",
    "role": "Tester",
    "teamSize": "11-50",
    "techStack": ["CRM: Salesforce", "Comm: Slack"],
    "securityLevel": "high",
    "compliance": ["soc2"],
    "message": "Load test submission $i"
  },
  "metadata": {
    "loadTestId": "$TEST_ID",
    "sequence": $i
  }
}
EOF
done

# Function to make request
make_request() {
    local i=$1
    local start_time=$(date +%s%N)
    
    RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
        -X POST "$N8N_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "@$TMPDIR/payload_$i.json" \
        2>/dev/null || echo -e "\n000\n0")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n2 | head -n1)
    TIME_TOTAL=$(echo "$RESPONSE" | tail -n1)
    
    echo "$i,$HTTP_CODE,$TIME_TOTAL" >> "$TMPDIR/results.csv"
}

export -f make_request
export N8N_WEBHOOK TMPDIR

# Run load test
echo "Running load test..."
echo "sequence,http_code,response_time" > "$TMPDIR/results.csv"

START_TIME=$(date +%s)
seq 1 $TOTAL | xargs -P $CONCURRENT -I {} bash -c 'make_request "$@"' _ {}
END_TIME=$(date +%s)

# Analyze results
echo ""
echo "======================================"
echo "Load Test Results"
echo "======================================"

TOTAL_TIME=$((END_TIME - START_TIME))
SUCCESS_COUNT=$(grep -c ',200,' "$TMPDIR/results.csv" 2>/dev/null || echo "0")
ERROR_COUNT=$((TOTAL - SUCCESS_COUNT))

# Calculate response times
AVG_TIME=$(awk -F',' 'NR>1 && $3 {sum+=$3; count++} END {if(count>0) printf "%.3f", sum/count; else print "N/A"}' "$TMPDIR/results.csv")
MAX_TIME=$(awk -F',' 'NR>1 && $3 {if($3>max) max=$3} END {printf "%.3f", max}' "$TMPDIR/results.csv")
MIN_TIME=$(awk -F',' 'NR>1 && $3 {if(min==0 || $3<min) min=$3} END {printf "%.3f", min}' "$TMPDIR/results.csv")

P95_TIME=$(awk -F',' 'NR>1 && $3 {print $3}' "$TMPDIR/results.csv" | sort -n | awk 'BEGIN{count=0} {a[count++]=$1} END{if(count>0) print a[int(count*0.95)]}')

echo "Duration: ${TOTAL_TIME}s"
echo "Throughput: $(echo "scale=2; $TOTAL / $TOTAL_TIME" | bc) req/s"
echo ""
echo "Response Counts:"
echo -e "  ${GREEN}Success (200): $SUCCESS_COUNT${NC}"
if [ $ERROR_COUNT -gt 0 ]; then
    echo -e "  ${RED}Failed: $ERROR_COUNT${NC}"
else
    echo "  Failed: $ERROR_COUNT"
fi
echo ""
echo "Response Times:"
echo "  Min: ${MIN_TIME}s"
echo "  Avg: ${AVG_TIME}s"
echo "  Max: ${MAX_TIME}s"
echo "  P95: ${P95_TIME}s"
echo ""

# Success rate
SUCCESS_RATE=$(echo "scale=2; $SUCCESS_COUNT * 100 / $TOTAL" | bc)
if (( $(echo "$SUCCESS_RATE >= 99" | bc -l) )); then
    echo -e "Success Rate: ${GREEN}${SUCCESS_RATE}%${NC}"
elif (( $(echo "$SUCCESS_RATE >= 95" | bc -l) )); then
    echo -e "Success Rate: ${YELLOW}${SUCCESS_RATE}%${NC}"
else
    echo -e "Success Rate: ${RED}${SUCCESS_RATE}%${NC}"
fi

# Show error breakdown if any
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo ""
    echo "Error Breakdown:"
    awk -F',' 'NR>1 && $2 != 200 {print $2}' "$TMPDIR/results.csv" | sort | uniq -c | sort -rn
fi

echo "======================================"
