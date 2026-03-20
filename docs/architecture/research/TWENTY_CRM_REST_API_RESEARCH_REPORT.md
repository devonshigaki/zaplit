# Twenty CRM REST API - Comprehensive Research Report

**Date:** March 19, 2026  
**Researcher:** Principal Engineer  
**Subject:** Twenty CRM REST API Schema, Best Practices, and Integration Guidelines

---

## Executive Summary

Twenty CRM provides a developer-friendly REST API for managing CRM data. This report documents the API endpoints for People, Companies, and Notes, including request/response schemas, entity relationships, error handling, and custom fields support.

**Key Findings:**
- REST API base URL: `https://api.twenty.com/rest/` (Cloud) or `https://{your-domain}/rest/` (Self-Hosted)
- Authentication: Bearer token via `Authorization: Bearer {API_KEY}` header
- Rate Limit: 100 calls per minute, 60 records per batch
- Dual API support: REST and GraphQL with same underlying data model

---

## 1. API Architecture Overview

### 1.1 API Types

Twenty provides **four distinct API types**:

| API Type | Endpoint | Purpose |
|----------|----------|---------|
| **Core API (REST)** | `/rest/` | CRUD operations on records |
| **Core API (GraphQL)** | `/graphql/` | Flexible queries, batch upserts |
| **Metadata API (REST)** | `/rest/metadata/` | Schema, custom fields, objects |
| **Metadata API (GraphQL)** | `/metadata/` | Workspace configuration |

### 1.2 Authentication

All API requests require an API key in the Authorization header:

```http
Authorization: Bearer YOUR_API_KEY
```

**Creating an API Key:**
1. Go to **Settings → APIs & Webhooks**
2. Click **+ Create key**
3. Configure name and expiration date
4. **Copy immediately** - key is shown only once

### 1.3 Rate Limits

| Limit | Value |
|-------|-------|
| Requests | 100 calls per minute |
| Batch size | 60 records per call |

---

## 2. REST API Endpoints

### 2.1 People Endpoint (`/rest/people`)

#### Create Person (POST /rest/people)

**Request Payload Schema:**

```json
{
  "name": {
    "firstName": "string (required)",
    "lastName": "string (required)"
  },
  "email": "string (optional) - Primary email address",
  "phone": "string (optional) - Phone number with country code",
  "jobTitle": "string (optional) - Job title",
  "company": "uuid (optional) - Company ID to link person to",
  "additionalProperties": "..."
}
```

**Example Request:**

```bash
curl -X POST "https://api.twenty.com/rest/people" \
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

#### List People (GET /rest/people)

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `limit` | Number of records to return (default: 20) |
| `offset` | Number of records to skip |
| `filter` | Filter conditions (JSON format) |
| `orderBy` | Sort order |

**Example with Filter:**

```bash
curl -X GET "https://api.twenty.com/rest/people?filter={\"name\":{\"like\":\"%John%\"}}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

#### Get Person by ID (GET /rest/people/{id})

```bash
curl -X GET "https://api.twenty.com/rest/people/{personId}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

#### Update Person (PATCH /rest/people/{id})

```bash
curl -X PATCH "https://api.twenty.com/rest/people/{personId}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "jobTitle": "Senior Engineer"
  }'
```

#### Delete Person (DELETE /rest/people/{id})

```bash
curl -X DELETE "https://api.twenty.com/rest/people/{personId}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

---

### 2.2 Companies Endpoint (`/rest/companies`)

#### Create Company (POST /rest/companies)

**Request Payload Schema:**

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
  },
  "additionalProperties": "..."
}
```

**Example Request:**

```bash
curl -X POST "https://api.twenty.com/rest/companies" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "domainName": "acme.com",
    "employees": 500,
    "address": {
      "addressStreet1": "123 Main St",
      "addressCity": "San Francisco",
      "addressState": "CA",
      "addressPostcode": "94102",
      "addressCountry": "US"
    }
  }'
```

**Important Note on Companies:**
- The `domainName` field has a **unique constraint** - duplicate domains will fail
- Error response for duplicate domain:
```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["duplicate key value violates unique constraint \"IDX_UNIQUE_...\""]
}
```

#### List Companies (GET /rest/companies)

```bash
curl -X GET "https://api.twenty.com/rest/companies?limit=10&offset=0" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

#### Update Company (PATCH /rest/companies/{id})

```bash
curl -X PATCH "https://api.twenty.com/rest/companies/{companyId}" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "employees": 550
  }'
```

---

### 2.3 Notes Endpoint (`/rest/notes`)

#### Create Note (POST /rest/notes)

**Request Payload Schema:**

```json
{
  "title": "string (optional) - Note title",
  "body": "string (required) - Note content/body",
  "person": "uuid (optional) - Person ID to link note to",
  "company": "uuid (optional) - Company ID to link note to",
  "opportunity": "uuid (optional) - Opportunity ID to link note to"
}
```

**Example Request:**

```bash
curl -X POST "https://api.twenty.com/rest/notes" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}" \
  --header "Content-Type: application/json" \
  -d '{
    "title": "Meeting Notes",
    "body": "Discussed Q1 roadmap and budget allocation.",
    "person": "person-uuid-here",
    "company": "company-uuid-here"
  }'
```

**Key Points:**
- Notes can be linked to **multiple entity types simultaneously** (Person, Company, Opportunity)
- The `person`, `company`, and `opportunity` fields accept UUIDs of the respective entities
- Notes support relations to multiple object types on one side ("many" side connecting to multiple "one" sides)

#### List Notes (GET /rest/notes)

```bash
curl -X GET "https://api.twenty.com/rest/notes" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

---

## 3. Entity Relationships

### 3.1 Standard Relations (Pre-built)

Twenty comes with pre-built relations between standard objects:

| From Object | To Object | Relation Type | Field Name |
|-------------|-----------|---------------|------------|
| People | Companies | Many-to-One | `company` |
| Opportunities | Companies | Many-to-One | `company` |
| Opportunities | People | Many-to-One | `person` |
| Notes | People | Many-to-One | `person` |
| Notes | Companies | Many-to-One | `company` |
| Notes | Opportunities | Many-to-One | `opportunity` |

### 3.2 Linking Entities via API

#### Link Person to Company

When creating or updating a Person, use the `company` field with the Company ID:

```json
{
  "name": {
    "firstName": "Jane",
    "lastName": "Smith"
  },
  "company": "company-uuid-here"
}
```

#### Link Note to Person

```json
{
  "title": "Follow-up Notes",
  "body": "Client expressed interest in enterprise plan.",
  "person": "person-uuid-here"
}
```

#### Link Note to Company

```json
{
  "title": "Company Overview",
  "body": "Enterprise client with 500+ employees.",
  "company": "company-uuid-here"
}
```

#### Link Note to Both Person and Company

```json
{
  "title": "Meeting Summary",
  "body": "Quarterly review meeting.",
  "person": "person-uuid-here",
  "company": "company-uuid-here"
}
```

### 3.3 Relation Types Explained

| Relation Type | Description | Example |
|---------------|-------------|---------|
| **One-to-Many** | One record in Object A links to many in Object B | One Company has many People |
| **Many-to-One** | Many records in Object A link to one in Object B | Many People belong to one Company |
| **Many-to-Many** | Many records in Object A link to many in Object B | Many People linked to many Projects |

### 3.4 Creating Custom Relations

Via the UI (Settings → Data Model):
1. Select the object where you want the relation (typically the "many" side)
2. Click **+ Add Field**
3. Select **Relation** as the field type
4. Choose the target object
5. Select relation type (One-to-Many or Many-to-One)
6. Enter field names for both sides
7. Click Save

---

## 4. Error Handling

### 4.1 Common Error Response Format

```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["Error message details here"]
}
```

### 4.2 HTTP Status Codes

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

### 4.3 Duplicate Handling

#### Company Domain Uniqueness

Companies have a unique constraint on `domainName`. Attempting to create a company with an existing domain returns:

```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["duplicate key value violates unique constraint \"IDX_UNIQUE_...\""]
}
```

**Recommendation:** Check for existing companies before creation, or handle this error gracefully.

#### Person Email Uniqueness

Email fields can be configured as unique. If duplicates are found:

1. Query existing person by email first
2. Update existing person if found
3. Create new person only if not found

### 4.4 Validation Errors

Required field missing:
```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["name.firstName should not be empty"]
}
```

Invalid field type:
```json
{
  "statusCode": 400,
  "error": "BadRequestException",
  "messages": ["employees must be a number"]
}
```

### 4.5 Error Handling Best Practices

1. **Always check status codes** before parsing response
2. **Implement retry logic** for 429 (rate limit) and 500 (server error) responses
3. **Handle duplicate errors** by querying existing records first
4. **Log error messages** for debugging purposes
5. **Validate payloads** client-side before sending to reduce 400 errors

---

## 5. Custom Fields

### 5.1 Custom Fields Support

**Yes, Twenty CRM fully supports custom fields.**

Custom fields can be added to any object and are accessible via the API just like standard fields.

### 5.2 Field Types Available

| Field Type | Description | API Data Type |
|------------|-------------|---------------|
| Text | Single line text | `string` |
| Long Text | Multi-line text | `string` |
| Number | Numeric values | `number` |
| Boolean | True/false checkbox | `boolean` |
| Date | Date values | `string (ISO 8601)` |
| Date & Time | Date with time | `string (ISO 8601)` |
| Email | Email addresses | `string` |
| Phone | Phone numbers | `string` |
| Currency | Monetary value | `object` |
| Select | Single choice dropdown | `string` |
| Multi-Select | Multiple choices | `array[string]` |
| Relation | Link to other objects | `uuid` |
| Address | Structured address | `object` |
| Links | URLs with labels | `object` |
| Domain | Website domain | `string` |
| Rating | Star rating (1-5) | `number` |
| JSON | Structured JSON data | `object` |
| Array | List of text values | `array[string]` |

### 5.3 Accessing Custom Fields via API

Custom fields are accessed using their **field name** directly in the API payload:

```json
{
  "name": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "email": "john@example.com",
  "customFieldName": "custom value",
  "anotherCustomField": 123
}
```

### 5.4 Creating Custom Fields

Via UI:
1. Go to **Settings → Data Model**
2. Select the object to customize
3. Click **Add Field**
4. Choose field name and type
5. Save

Via Metadata API:
```bash
POST /rest/metadata/fields
{
  "objectMetadataId": "object-uuid",
  "name": "customFieldName",
  "type": "TEXT",
  "label": "Custom Field Label"
}
```

### 5.5 Discovering Custom Fields

Use the Metadata API to discover all fields (including custom):

```bash
# List all objects and their metadata
GET /rest/metadata/objects

# Get metadata for specific object
GET /rest/metadata/objects/people
```

---

## 6. Batch Operations

### 6.1 REST Batch Operations

Create multiple records in one call:

```bash
POST /rest/people/batch
[
  {"name": {"firstName": "John", "lastName": "Doe"}, "email": "john@example.com"},
  {"name": {"firstName": "Jane", "lastName": "Smith"}, "email": "jane@example.com"}
]
```

**Limit:** 60 records per batch

### 6.2 GraphQL Batch Operations (Recommended)

GraphQL supports batch upserts (create or update):

```graphql
mutation {
  CreateCompanies(data: [
    {name: "Company A", domainName: "company-a.com"},
    {name: "Company B", domainName: "company-b.com"}
  ]) {
    id
    name
  }
}
```

---

## 7. Metadata API

### 7.1 Discovering Schema

```bash
# List all objects
GET /rest/metadata/objects

# Get specific object schema
GET /rest/metadata/objects/{objectName}

# Get picklist options
GET /rest/metadata/picklists
```

### 7.2 Example: Get People Object Schema

```bash
curl -X GET "https://api.twenty.com/rest/metadata/objects/people" \
  --header "Authorization: Bearer ${TWENTY_API_KEY}"
```

Response includes:
- All standard fields
- All custom fields
- Field types and validation rules
- Relation fields

---

## 8. Webhooks

### 8.1 Webhook Events

Twenty supports real-time notifications for:

| Event | Description |
|-------|-------------|
| `person.created` | New person added |
| `person.updated` | Person record modified |
| `person.deleted` | Person record deleted |
| `company.created` | New company added |
| `company.updated` | Company record modified |
| `company.deleted` | Company record deleted |
| `note.created` | New note added |
| `note.updated` | Note modified |
| `note.deleted` | Note deleted |

### 8.2 Webhook Payload Format

```json
{
  "event": "person.created",
  "data": {
    "id": "abc12345",
    "firstName": "Alice",
    "lastName": "Doe",
    "email": "alice@example.com",
    "createdAt": "2025-02-10T15:30:45Z",
    "createdBy": "user_123"
  },
  "timestamp": "2025-02-10T15:30:50Z"
}
```

---

## 9. API Playground

Twenty provides an interactive API Playground for testing:

**Access:**
1. Go to **Settings → APIs & Webhooks**
2. Create an API key (required)
3. Click on **REST API** or **GraphQL API** to open the playground

**Features:**
- Interactive documentation generated for your specific data model
- Live testing against your workspace
- Schema explorer
- Request builder with autocomplete
- Reflects custom objects and fields

---

## 10. Integration Best Practices

### 10.1 Recommended Workflow for Form Submissions

1. **Check for existing Company** by domain name
2. **Create Company** if not exists (handle duplicate domain error)
3. **Check for existing Person** by email
4. **Create Person** linked to Company (or update existing)
5. **Create Note** linked to both Person and Company

### 10.2 Handling Duplicates

```javascript
// Pseudo-code for duplicate handling
async function createOrUpdateCompany(companyData) {
  try {
    // Try to create new company
    return await api.post('/rest/companies', companyData);
  } catch (error) {
    if (error.statusCode === 400 && error.messages[0].includes('duplicate')) {
      // Company with this domain exists, query and return it
      const existing = await api.get(`/rest/companies?filter={"domainName":{"eq":"${companyData.domainName}"}}`);
      return existing.data[0];
    }
    throw error;
  }
}
```

### 10.3 Rate Limiting Strategy

- Implement exponential backoff for 429 responses
- Batch operations when possible (up to 60 records)
- Use GraphQL for complex queries to reduce round trips

---

## 11. Gaps and Issues Identified

### 11.1 Known Limitations

1. **Error Messages:** Duplicate constraint errors don't specify which field caused the issue (GitHub issue #13567)
   - Current: `"duplicate key value violates unique constraint \"IDX_UNIQUE_...\""`
   - Expected: `"Domain Names must be unique for Companies. Duplicate key value..."`

2. **REST API Filter Limitations:** Relation field filtering may not work consistently in REST API; GraphQL recommended for complex filters

3. **Batch Upsert:** Only available in GraphQL, not REST

### 11.2 Missing Documentation

- Exact field validation rules (max length, patterns)
- Complete list of required vs optional fields for each object
- Detailed error code reference

### 11.3 Recommendations

1. **Use GraphQL for complex integrations** requiring:
   - Batch upserts
   - Relationship queries in one call
   - Complex filtering

2. **Use REST for simple CRUD** operations

3. **Always implement error handling** for:
   - Duplicate domain errors (Companies)
   - Rate limiting (429)
   - Validation errors (400)

---

## 12. Quick Reference

### Base URLs

| Environment | URL |
|-------------|-----|
| Cloud | `https://api.twenty.com/` |
| Self-Hosted | `https://{your-domain}/` |

### Common Endpoints

| Operation | Endpoint |
|-----------|----------|
| Create Person | `POST /rest/people` |
| Create Company | `POST /rest/companies` |
| Create Note | `POST /rest/notes` |
| Get Schema | `GET /rest/metadata/objects/{objectName}` |

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

---

## 13. Resources

- **Official Docs:** https://docs.twenty.com/developers/extend/api
- **API Playground:** Available in-app at Settings → APIs & Webhooks
- **GitHub:** https://github.com/twentyhq/twenty
- **Discord:** https://discord.gg/cx5n4Jzs57

---

**End of Report**
