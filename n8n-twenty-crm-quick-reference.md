# n8n + Twenty CRM Quick Reference

## Quick Start Checklist

- [ ] Create API Key in Twenty CRM (Settings → APIs & Webhooks)
- [ ] Note your Twenty instance URL
- [ ] Choose integration method (Community Node or HTTP Request)
- [ ] Create credentials in n8n
- [ ] Test with simple GET request first

---

## Authentication Quick Reference

```
Header Name:  Authorization
Header Value: Bearer YOUR_API_KEY
```

---

## Common API Calls

### Create Company
```bash
curl -X POST 'https://api.twenty.com/rest/companies' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Acme Corp",
    "domainName": "acme.com",
    "employees": 150
  }'
```

### Create Person
```bash
curl -X POST 'https://api.twenty.com/rest/people' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": {"firstName": "John", "lastName": "Doe"},
    "email": "john@example.com",
    "companyId": "COMPANY_UUID"
  }'
```

### Create Note
```bash
curl -X POST 'https://api.twenty.com/rest/notes' \
  -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Meeting Notes",
    "body": "Discussion details here",
    "personId": "PERSON_UUID"
  }'
```

### Search Company by Domain
```bash
curl -X GET 'https://api.twenty.com/rest/companies?filter={"domainName":{"eq":"acme.com"}}' \
  -H 'Authorization: Bearer TOKEN'
```

### Search Person by Email
```bash
curl -X GET 'https://api.twenty.com/rest/people?filter={"email":{"eq":"john@example.com"}}' \
  -H 'Authorization: Bearer TOKEN'
```

---

## n8n HTTP Request Node Configuration

### Credentials (Header Auth)
- **Name**: Twenty CRM API
- **Header Name**: `Authorization`
- **Header Value**: `Bearer YOUR_API_KEY`

### Create Company Node
| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/rest/companies` |
| Auth | Header Auth |
| Body Type | JSON |

### Create Person Node
| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/rest/people` |
| Auth | Header Auth |
| Body Type | JSON |

### Create Note Node
| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/rest/notes` |
| Auth | Header Auth |
| Body Type | JSON |

### Search Node
| Setting | Value |
|---------|-------|
| Method | GET |
| URL | `https://api.twenty.com/rest/{object}?filter={"field":{"eq":"value"}}` |
| Auth | Header Auth |
| Response | JSON |

---

## Response Structure

### Success Response (Create)
```json
{
  "data": {
    "id": "uuid-here",
    "name": "...",
    "createdAt": "2026-03-18T12:00:00Z",
    "updatedAt": "2026-03-18T12:00:00Z"
  }
}
```

### List Response
```json
{
  "data": {
    "companies": [
      {"id": "...", "name": "..."}
    ]
  },
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "..."
  }
}
```

---

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `{"email":{"eq":"test@example.com"}}` |
| `neq` | Not equal | `{"status":{"neq":"inactive"}}` |
| `like` | Contains | `{"name":{"like":"%Acme%"}}` |
| `gt` | Greater than | `{"employees":{"gt":100}}` |
| `gte` | Greater than or equal | `{"amount":{"gte":5000}}` |
| `lt` | Less than | `{"createdAt":{"lt":"2026-01-01"}}` |
| `lte` | Less than or equal | `{"updatedAt":{"lte":"2026-12-31"}}` |

---

## Common Field Names

### Company Fields
- `id` - UUID
- `name` - Company name
- `domainName` - Website domain
- `employees` - Number of employees
- `annualRecurringRevenue` - ARR object with `amount` and `currency`
- `address` - Address object
- `linkedinLink` - LinkedIn URL
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

### Person Fields
- `id` - UUID
- `name` - Name object with `firstName` and `lastName`
- `email` - Email address
- `phone` - Phone number
- `jobTitle` - Job title
- `companyId` - Related company UUID
- `linkedinLink` - LinkedIn URL
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

### Note Fields
- `id` - UUID
- `title` - Note title
- `body` - Note content
- `personId` - Related person UUID
- `companyId` - Related company UUID
- `opportunityId` - Related opportunity UUID
- `createdAt` - Creation timestamp

---

## Rate Limits

- **100 requests per minute** (Cloud)
- **60 records per batch** operation
- Self-hosted: Configurable

---

## Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 400 | Bad Request | Check JSON format and required fields |
| 401 | Unauthorized | Check API key is valid and header format |
| 403 | Forbidden | Check API key permissions/role |
| 404 | Not Found | Check endpoint URL and record ID |
| 429 | Rate Limited | Implement backoff, reduce request rate |
| 500 | Server Error | Retry with backoff, check Twenty status |

---

## Useful URLs

- Twenty Cloud: `https://app.twenty.com`
- Twenty API (Cloud): `https://api.twenty.com`
- API Docs: `https://docs.twenty.com/developers/extend/api`
- n8n Community: `https://community.n8n.io`
