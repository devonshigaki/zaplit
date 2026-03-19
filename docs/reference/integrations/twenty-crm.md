# Twenty CRM Integration

> **Contact and lead management**

## Overview

Twenty CRM receives form submissions from n8n for:
- Contact creation
- Company tracking
- Opportunity management
- Sales pipeline

## Architecture

```
n8n Workflow → Twenty GraphQL API
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌────────┐ ┌──────────┐ ┌────────────┐
   │Company │ │  Person  │ │Opportunity │
   └────────┘ └──────────┘ └────────────┘
```

## Production Deployment

Twenty runs on **Cloud Run**.

```bash
gcloud run deploy twenty-crm \
  --image=twentycrm/twenty:latest \
  --region=us-central1 \
  --memory=1Gi \
  --max-instances=10
```

## GraphQL API

### Authentication

```bash
# Get JWT token
curl -X POST https://crm.zaplit.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@zaplit.com","password":"your-password"}'

# Use in requests
-H "Authorization: Bearer ${TOKEN}"
```

### Create Company

```graphql
mutation CreateCompany($data: CompanyCreateInput!) {
  createCompany(data: $data) {
    id
    name
    domainName
  }
}
```

### Create Person (Contact)

```graphql
mutation CreatePerson($data: PersonCreateInput!) {
  createPerson(data: $data) {
    id
    name {
      firstName
      lastName
    }
    emails {
      primaryEmail
    }
  }
}
```

### Create Opportunity

```graphql
mutation CreateOpportunity($data: OpportunityCreateInput!) {
  createOpportunity(data: $data) {
    id
    name
    amount
    stage
  }
}
```

## Data Mapping

| Form Field | Twenty Entity | Field |
|------------|---------------|-------|
| `company` | Company | `name` |
| `name` | Person | `name.firstName`, `name.lastName` |
| `email` | Person | `emails.primaryEmail` |
| `role` | Person | `jobTitle` |
| `teamSize` | Company | `employees` |
| `message` | Note | `content` |

## Duplicate Prevention

Use email as unique identifier:

```graphql
# Check if person exists
query FindPerson($email: String!) {
  people(filter: { emails: { primaryEmail: { eq: $email } } }) {
    edges {
      node {
        id
      }
    }
  }
}
```

## n8n Integration

Example workflow node:

```json
{
  "name": "Create Person",
  "type": "n8n-nodes-base.httpRequest",
  "method": "POST",
  "url": "https://crm.zaplit.com/graphql",
  "headers": {
    "Authorization": "Bearer {{$credentials.twentyApiKey}}",
    "Content-Type": "application/json"
  },
  "body": {
    "query": "mutation CreatePerson($data: PersonCreateInput!) { createPerson(data: $data) { id } }",
    "variables": {
      "data": {
        "name": {
          "firstName": "{{$json.firstName}}",
          "lastName": "{{$json.lastName}}"
        },
        "emails": {
          "primaryEmail": "{{$json.email}}"
        }
      }
    }
  }
}
```

## Error Handling

| Error | Action |
|-------|--------|
| 401 Unauthorized | Refresh token, retry |
| 409 Conflict | Person exists, update instead |
| 429 Rate Limited | Backoff 1s, retry |
| 5xx Server Error | Retry with exponential backoff |

## Security

- API tokens stored in n8n credentials
- IP allowlist in Twenty settings
- HTTPS only

---

**Related**: [n8n Integration](./n8n.md)
