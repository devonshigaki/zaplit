# Twenty CRM API Reference

Complete REST API reference for Twenty CRM integration.

## Table of Contents

- [Base Configuration](#base-configuration)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Entity Schemas](#entity-schemas)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)
- [Custom Fields](#custom-fields)

---

## Base Configuration

| Setting | Cloud | Self-Hosted |
|---------|-------|-------------|
| Base URL | `https://api.twenty.com/` | `https://{your-domain}/` |
| REST API | `/rest/` | `/rest/` |
| GraphQL API | `/graphql/` | `/graphql/` |
| Metadata API | `/rest/metadata/` | `/rest/metadata/` |

**Current Environment:** `https://crm.zaplit.com/rest`

---

## Authentication

All API requests require an API key in the Authorization header:

```http
Authorization: Bearer YOUR_API_KEY
```

### Creating an API Key

1. Go to **Settings → APIs & Webhooks**
2. Click **+ Create key**
3. Configure name and expiration date
4. **Copy immediately** - key is shown only once

### API Key Characteristics

| Feature | Description |
|---------|-------------|
| Format | Long-lived API key (not JWT) |
| Expiration | Configurable (recommend 90 days) |
| Display | One-time only at creation |
| Rate Limit | 100 calls per minute per key |
| RBAC | Role-based access control available |

---

## API Endpoints

### People Endpoint

#### Create Person
```http
POST /rest/people
```

**Request Body:**
```json
{
  "name": {
    "firstName": "string (required)",
    "lastName": "string (required)"
  },
  "email": "string (optional) - Primary email address",
  "phone": "string (optional) - Phone number with country code",
  "jobTitle": "string (optional) - Job title",
  "company": "uuid (optional) - Company ID to link person to"
}
```

**Example Request:**
```bash
curl -X POST "https://crm.zaplit.com/rest/people" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john@example.com",
    "phone": "+1234567890"
  }'
```

**Example Response:**
```json
{
  "data": {
    "id": "abc12345-uuid",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john@example.com",
    "phone": "+1234567890",
    "jobTitle": null,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

#### List People
```http
GET /rest/people
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of records to return (default: 20) |
| `offset` | Number of records to skip |
| `filter` | Filter conditions (JSON format) |
| `orderBy` | Sort order |

**Example with Filter:**
```bash
curl -X GET "https://crm.zaplit.com/rest/people?filter={\"name\":{\"like\":\"%John%\"}}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

#### Get Person by ID
```http
GET /rest/people/{personId}
```

#### Update Person
```http
PATCH /rest/people/{personId}
```

**Example:**
```bash
curl -X PATCH "https://crm.zaplit.com/rest/people/{personId}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{"jobTitle": "Senior Engineer"}'
```

#### Delete Person
```http
DELETE /rest/people/{personId}
```

---

### Companies Endpoint

#### Create Company
```http
POST /rest/companies
```

**Request Body:**
```json
{
  "name": "string (required) - Company name",
  "domainName": "string (optional) - Website domain (e.g., acme.com)",
  "employees": "number (optional) - Number of employees",
  "address": {
    "addressStreet1": "string (optional)",
    "addressStreet2": "string (optional)",
    "addressCity": "string (optional)",
    "addressState": "string (optional)",
    "addressPostcode": "string (optional)",
    "addressCountry": "string (optional)",
    "addressLat": "number (optional)",
    "addressLng": "number (optional)"
  }
}
```

**⚠️ Important:** The `domainName` field has a **unique constraint** - duplicate domains will fail.

**Example Request:**
```bash
curl -X POST "https://crm.zaplit.com/rest/companies" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "domainName": "acme.com",
    "employees": 500
  }'
```

#### List Companies
```http
GET /rest/companies?limit=10&offset=0
```

#### Update Company
```http
PATCH /rest/companies/{companyId}
```

#### Delete Company
```http
DELETE /rest/companies/{companyId}
```

---

### Notes Endpoint

#### Create Note
```http
POST /rest/notes
```

**Request Body:**
```json
{
  "title": "string (optional) - Note title",
  "body": "string (required) - Note content/body",
  "person": "uuid (optional) - Person ID to link note to",
  "company": "uuid (optional) - Company ID to link note to",
  "opportunity": "uuid (optional) - Opportunity ID to link note to"
}
```

**Key Points:**
- Notes can be linked to **multiple entity types simultaneously**
- Notes support relations to multiple object types on one side

**Example Request:**
```bash
curl -X POST "https://crm.zaplit.com/rest/notes" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "title": "Meeting Notes",
    "body": "Discussed Q1 roadmap and budget allocation.",
    "person": "person-uuid-here",
    "company": "company-uuid-here"
  }'
```

---

## Entity Schemas

### Person Entity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Auto | Primary key |
| `name.firstName` | String | Yes | First name |
| `name.lastName` | String | Yes | Last name |
| `emails.primaryEmail` | String | No | Primary email address |
| `jobTitle` | String | No | Job/position title |
| `companyId` | UUID | No | Linked company |
| `createdAt` | DateTime | Auto | Creation timestamp |
| `updatedAt` | DateTime | Auto | Last update timestamp |

### Company Entity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Auto | Primary key |
| `name` | String | Yes | Company name |
| `domainName` | String | No | Website domain (unique) |
| `employees` | Number | No | Employee count |
| `address` | Object | No | Structured address |
| `createdAt` | DateTime | Auto | Creation timestamp |
| `updatedAt` | DateTime | Auto | Last update timestamp |

### Note Entity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Auto | Primary key |
| `title` | String | No | Note title |
| `body` | String | Yes | Note content |
| `personId` | UUID | No | Linked person |
| `companyId` | UUID | No | Linked company |
| `createdAt` | DateTime | Auto | Creation timestamp |

---

## Entity Relationships

### Standard Relations

| From Object | To Object | Relation Type | Field Name |
|-------------|-----------|---------------|------------|
| People | Companies | Many-to-One | `company` |
| Opportunities | Companies | Many-to-One | `company` |
| Opportunities | People | Many-to-One | `person` |
| Notes | People | Many-to-One | `person` |
| Notes | Companies | Many-to-One | `company` |
| Notes | Opportunities | Many-to-One | `opportunity` |

### Linking Examples

**Link Person to Company:**
```json
{
  "name": { "firstName": "Jane", "lastName": "Smith" },
  "company": "company-uuid-here"
}
```

**Link Note to Both Person and Company:**
```json
{
  "title": "Meeting Summary",
  "body": "Quarterly review meeting.",
  "person": "person-uuid-here",
  "company": "company-uuid-here"
}
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 200 | OK | Successful GET, PATCH, DELETE |
| 201 | Created | Successful POST (create) |
| 400 | Bad Request | Invalid payload, missing required fields |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

### Error Response Format

```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["Error message details here"]
}
```

### Common Errors

**Duplicate Company Domain:**
```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["duplicate key value violates unique constraint \"IDX_UNIQUE_...\""]
}
```

**Missing Required Field:**
```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["name.firstName should not be empty"]
}
```

### Error Handling Best Practices

1. **Always check status codes** before parsing response
2. **Implement retry logic** for 429 (rate limit) and 500 (server error)
3. **Handle duplicate errors** by querying existing records first
4. **Log error messages** for debugging purposes
5. **Validate payloads** client-side before sending

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Requests | 100 calls per minute |
| Batch size | 60 records per call |

**Rate Limiting Strategy:**
- Implement exponential backoff for 429 responses
- Batch operations when possible (up to 60 records)
- Use GraphQL for complex queries to reduce round trips

---

## Custom Fields

### Supported Field Types

| Field Type | API Data Type | Description |
|------------|---------------|-------------|
| Text | `string` | Single line text |
| Long Text | `string` | Multi-line text |
| Number | `number` | Numeric values |
| Boolean | `boolean` | True/false checkbox |
| Date | `string (ISO 8601)` | Date values |
| Email | `string` | Email addresses |
| Phone | `string` | Phone numbers |
| Select | `string` | Single choice dropdown |
| Multi-Select | `array[string]` | Multiple choices |
| Relation | `uuid` | Link to other objects |

### Accessing Custom Fields

Custom fields are accessed using their field name directly:

```json
{
  "name": { "firstName": "John", "lastName": "Doe" },
  "email": "john@example.com",
  "customFieldName": "custom value",
  "anotherCustomField": 123
}
```

### Discovering Schema

```bash
# List all objects
GET /rest/metadata/objects

# Get specific object schema
GET /rest/metadata/objects/people
```

---

## Quick Reference

### Required Fields Summary

| Object | Required Fields |
|--------|-----------------|
| Person | `name.firstName`, `name.lastName` |
| Company | `name` |
| Note | `body` |

### Relation Fields Summary

| Object | Relation Field | Accepts |
|--------|----------------|---------|
| Person | `company` | Company UUID |
| Note | `person` | Person UUID |
| Note | `company` | Company UUID |
| Note | `opportunity` | Opportunity UUID |

### Common Endpoints

| Operation | Endpoint |
|-----------|----------|
| Create Person | `POST /rest/people` |
| Create Company | `POST /rest/companies` |
| Create Note | `POST /rest/notes` |
| Get Schema | `GET /rest/metadata/objects/{objectName}` |

---

## Resources

- **Official Docs:** https://docs.twenty.com/developers/extend/api
- **API Playground:** Available in-app at Settings → APIs & Webhooks
- **GitHub:** https://github.com/twentyhq/twenty
