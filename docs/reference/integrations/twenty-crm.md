# Twenty CRM Integration

## API

Base: `https://crm.zaplit.com/rest`
Auth: Bearer JWT

## Entities

- **Person**: Contact with name, email, job title
- **Company**: Organization with domain
- **Note**: Linked to person/company

## Key Endpoints

| Action | Endpoint |
|--------|----------|
| Create Person | POST `/people` |
| Create Company | POST `/companies` |
| Create Note | POST `/notes` |

## Environment

```bash
TWENTY_BASE_URL=https://crm.zaplit.com
TWENTY_API_KEY=<jwt-from-admin>
```
