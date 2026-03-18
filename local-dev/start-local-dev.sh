#!/bin/bash

# Zaplit Local Development Environment Setup Script
# This script starts n8n and provides instructions for testing

set -e

echo "🚀 Starting Zaplit Local Development Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start n8n
echo "📦 Starting n8n..."
docker-compose up -d

echo ""
echo -e "${GREEN}✅ n8n is starting up...${NC}"
echo ""
echo -e "${BLUE}📋 n8n Details:${NC}"
echo "   URL:      http://localhost:5678"
echo "   Username: admin"
echo "   Password: zaplit-local-dev"
echo ""

# Wait for n8n to be ready
echo "⏳ Waiting for n8n to be ready..."
attempt=0
max_attempts=30
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
        echo ""
        echo -e "${GREEN}✅ n8n is ready!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo -n "."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo ""
    echo -e "${YELLOW}⚠️  n8n may still be starting. Check logs with: docker-compose logs -f n8n${NC}"
fi

echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo ""
echo "1. Open n8n: http://localhost:5678"
echo "   Login with: admin / zaplit-local-dev"
echo ""
echo "2. Import the test workflows:"
echo "   - Go to Workflows → Import from File"
echo "   - Import: n8n-workflows/consultation-form-workflow.json"
echo "   - Import: n8n-workflows/contact-form-workflow.json"
echo ""
echo "3. Activate the workflows by clicking 'Active' toggle"
echo ""
echo "4. In a new terminal, start the Next.js dev server:"
echo "   cd ../zaplit-com && pnpm dev"
echo ""
echo "5. Test the forms:"
echo "   - Consultation: http://localhost:3000/#book-demo"
echo "   - Contact:      http://localhost:3000/contact"
echo ""
echo -e "${YELLOW}💡 Useful Commands:${NC}"
echo "   View n8n logs:     docker-compose logs -f n8n"
echo "   Stop n8n:          docker-compose down"
echo "   Reset n8n data:    docker-compose down -v"
echo ""
echo -e "${GREEN}🎉 Happy testing!${NC}"
