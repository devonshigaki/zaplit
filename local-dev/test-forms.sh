#!/bin/bash

# Test script for form submissions to local n8n
# Usage: ./test-forms.sh [consultation|contact|newsletter]

set -e

N8N_URL="http://localhost:5678"
WEBSITE_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🧪 Testing Form Submissions"
echo "==========================="
echo ""

# Check if n8n is running
if ! curl -s ${N8N_URL}/healthz > /dev/null 2>&1; then
    echo "❌ n8n is not running at ${N8N_URL}"
    echo "   Start it with: docker-compose up -d"
    exit 1
fi

echo -e "${GREEN}✅ n8n is running${NC}"
echo ""

# Test consultation form
test_consultation() {
    echo "Testing Consultation Form..."
    echo "----------------------------"
    
    response=$(curl -s -w "\n%{http_code}" -X POST ${WEBSITE_URL}/api/submit-form \
        -H "Content-Type: application/json" \
        -d '{
            "formType": "consultation",
            "data": {
                "name": "Test User",
                "email": "test@example.com",
                "company": "Test Company",
                "role": "CTO",
                "teamSize": "11-50",
                "securityLevel": "high",
                "techStack": {
                    "CRM": "Salesforce",
                    "Communication": "Slack",
                    "Finance": "Stripe"
                },
                "compliance": ["soc2", "gdpr"],
                "message": "This is a test submission from the test script."
            },
            "metadata": {
                "url": "http://localhost:3000/#book-demo"
            }
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Consultation form submitted successfully${NC}"
        echo "   Response: $body"
    else
        echo -e "${RED}❌ Consultation form failed (HTTP $http_code)${NC}"
        echo "   Response: $body"
    fi
    echo ""
}

# Test contact form
test_contact() {
    echo "Testing Contact Form..."
    echo "-----------------------"
    
    response=$(curl -s -w "\n%{http_code}" -X POST ${WEBSITE_URL}/api/submit-form \
        -H "Content-Type: application/json" \
        -d '{
            "formType": "contact",
            "data": {
                "name": "Test Contact",
                "email": "contact@example.com",
                "company": "Test Co",
                "message": "This is a test contact form submission."
            },
            "metadata": {
                "url": "http://localhost:3000/contact"
            }
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Contact form submitted successfully${NC}"
        echo "   Response: $body"
    else
        echo -e "${RED}❌ Contact form failed (HTTP $http_code)${NC}"
        echo "   Response: $body"
    fi
    echo ""
}

# Test newsletter form
test_newsletter() {
    echo "Testing Newsletter Form..."
    echo "--------------------------"
    
    response=$(curl -s -w "\n%{http_code}" -X POST ${WEBSITE_URL}/api/submit-form \
        -H "Content-Type: application/json" \
        -d '{
            "formType": "newsletter",
            "data": {
                "email": "newsletter@example.com"
            },
            "metadata": {
                "url": "http://localhost:3000/blog"
            }
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ Newsletter form submitted successfully${NC}"
        echo "   Response: $body"
    else
        echo -e "${RED}❌ Newsletter form failed (HTTP $http_code)${NC}"
        echo "   Response: $body"
    fi
    echo ""
}

# Test error handling - invalid email
test_validation_error() {
    echo "Testing Validation (Invalid Email)..."
    echo "-------------------------------------"
    
    response=$(curl -s -w "\n%{http_code}" -X POST ${WEBSITE_URL}/api/submit-form \
        -H "Content-Type: application/json" \
        -d '{
            "formType": "contact",
            "data": {
                "name": "Test",
                "email": "invalid-email",
                "message": "Test message"
            },
            "metadata": {
                "url": "http://localhost:3000/contact"
            }
        }')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "400" ]; then
        echo -e "${GREEN}✅ Validation working correctly (rejected invalid email)${NC}"
        echo "   Response: $body"
    else
        echo -e "${RED}❌ Validation failed (expected 400, got $http_code)${NC}"
        echo "   Response: $body"
    fi
    echo ""
}

# Test API health
test_health() {
    echo "Testing API Health..."
    echo "---------------------"
    
    response=$(curl -s -w "\n%{http_code}" ${WEBSITE_URL}/api/submit-form)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ API is healthy${NC}"
        echo "   Response: $body"
    else
        echo -e "${RED}❌ API health check failed${NC}"
    fi
    echo ""
}

# Run tests based on argument
case "${1:-all}" in
    consultation)
        test_consultation
        ;;
    contact)
        test_contact
        ;;
    newsletter)
        test_newsletter
        ;;
    validation)
        test_validation_error
        ;;
    health)
        test_health
        ;;
    all)
        test_health
        test_consultation
        test_contact
        test_newsletter
        test_validation_error
        ;;
    *)
        echo "Usage: $0 [consultation|contact|newsletter|validation|health|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}📊 Check n8n executions at: ${N8N_URL}${NC}"
echo ""
