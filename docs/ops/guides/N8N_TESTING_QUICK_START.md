# n8n Webhook Testing - Quick Start Guide

## 🚀 Quick Testing Commands

### 1. Health Check
```bash
./scripts/tests/health-check.sh
```

### 2. Run Integration Test
```bash
export TWENTY_TOKEN="your_token_here"
./scripts/tests/run-integration-test.sh
```

### 3. Quick API Test (One-liner)
```bash
curl -s -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Test User","email":"test@example.com","company":"Test Corp","role":"CTO"}}' \
  | jq .
```

### 4. Load Test
```bash
./scripts/tests/load-test.sh 10 100  # 10 concurrent, 100 total
```

### 5. Verify CRM Records
```bash
./scripts/tests/verify-crm-records.sh TEST_1742412345
```

### 6. Cleanup Test Data
```bash
./scripts/tests/cleanup-test-data.sh TEST_1742412345
```

---

## 📋 Test Case Quick Reference

### Happy Path
```json
{
  "data": {
    "name": "John Smith",
    "email": "john@example.com",
    "company": "Acme Corp",
    "role": "CTO",
    "teamSize": "11-50",
    "techStack": ["CRM: Salesforce", "Comm: Slack"],
    "securityLevel": "high",
    "compliance": ["soc2"],
    "message": "Looking for AI solutions"
  }
}
```

### Validation Error (Missing Email)
```json
{
  "data": {
    "name": "Test User",
    "company": "Test Corp"
  }
}
```

### Edge Case (Unicode)
```json
{
  "data": {
    "name": "José García 姓名测试",
    "email": "jose@example.com",
    "company": "Café & Co.",
    "role": "CEO",
    "message": "Unicode test: 你好世界 🎉"
  }
}
```

---

## 🔧 Environment Variables

```bash
export N8N_WEBHOOK="https://n8n.zaplit.com/webhook/consultation"
export TWENTY_CRM_URL="https://crm.zaplit.com"
export TWENTY_TOKEN="your_api_token_here"
```

---

## 📊 Test Matrix Summary

| Test Type | Command | Duration |
|-----------|---------|----------|
| Health Check | `./health-check.sh` | ~5s |
| Integration Test | `./run-integration-test.sh` | ~10s |
| Load Test (light) | `./load-test.sh 5 50` | ~15s |
| Load Test (full) | `./load-test.sh 20 500` | ~2min |
| Verify Records | `./verify-crm-records.sh <id>` | ~3s |
| Cleanup | `./cleanup-test-data.sh <id>` | ~5s |

---

## 🎯 Test Priorities

### P0 - Critical (Must Pass)
- Happy path - complete submission
- Validation - missing required fields
- CRM API failures handled gracefully
- Duplicate handling

### P1 - High (Should Pass)
- Edge cases (special chars, unicode)
- Error responses correct
- Rate limiting
- Concurrent submissions

### P2 - Medium (Nice to Have)
- Long message handling
- XSS prevention
- SQL injection prevention
- Performance benchmarks

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| 404 from webhook | Check webhook path is `/consultation` |
| 401 from CRM | Refresh JWT token in credentials |
| Test data left in CRM | Run cleanup script with test ID |
| Timeout errors | Check CRM API health |
| Rate limited | Reduce concurrent requests |

---

## 📁 File Structure

```
scripts/tests/
├── health-check.sh          # Quick health check
├── run-integration-test.sh  # Full integration test
├── load-test.sh             # Performance testing
├── verify-crm-records.sh    # Verify created records
├── cleanup-test-data.sh     # Remove test data
├── test-data-factory.js     # Generate test data
└── run-complete-test-suite.sh # Run all tests
```

---

## 🔗 Additional Resources

- **Full Testing Guide**: `N8N_WEBHOOK_E2E_TESTING_GUIDE.md`
- **Test Strategy**: `docs/development/N8N_TWENTY_CRM_TESTING_STRATEGY.md`
- **Implementation Guide**: `docs/development/N8N_TESTING_IMPLEMENTATION_GUIDE.md`
- **Workflow JSON**: `n8n-workflow-consultation-to-crm-complete.json`
