# n8n + Twenty CRM Integration Guide

Complete documentation for integrating n8n with Twenty CRM via official nodes (if available) or REST API using HTTP Request nodes.

---

## Table of Contents

1. [Overview](#overview)
2. [Official n8n Twenty CRM Nodes](#official-n8n-twenty-crm-nodes)
3. [Twenty CRM REST API Documentation](#twenty-crm-rest-api-documentation)
4. [Authentication](#authentication)
5. [Core API Operations](#core-api-operations)
   - [Creating a Company](#creating-a-company)
   - [Creating a Contact (Person)](#creating-a-contact-person)
   - [Adding Notes to a Contact](#adding-notes-to-a-contact)
   - [Searching for Existing Records](#searching-for-existing-records)
6. [n8n Workflow Examples](#n8n-workflow-examples)
   - [Using Community Node](#using-community-node)
   - [Using HTTP Request Node](#using-http-request-node)
7. [Webhooks](#webhooks)
8. [Rate Limits and Best Practices](#rate-limits-and-best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

**Twenty CRM** is a modern, open-source CRM with developer-friendly REST and GraphQL APIs. **n8n** is a workflow automation platform that can integrate with Twenty CRM to automate tasks like:

- Syncing contacts from forms/marketing tools
- Creating companies and associating contacts
- Adding notes and tasks automatically
- Building custom automations and notifications

### Integration Options

| Method | Description | Best For |
|--------|-------------|----------|
| **Community Node** (`n8n-nodes-twenty-dynamic`) | Dynamic node with auto-discovery of custom fields | Self-hosted n8n, complex operations |
| **HTTP Request Node** | Direct REST API calls | n8n Cloud, simple operations, full control |
| **Webhooks** | Real-time triggers from Twenty | Event-driven automations |

---

## Official n8n Twenty CRM Nodes

### Status: No Official Native Node

As of March 2026, **there is no official native n8n node** for Twenty CRM maintained by the n8n team.

### Available Community Node

The community has developed a comprehensive node:

**Package:** `n8n-nodes-twenty-dynamic`

**Features:**
- Dynamic schema discovery (auto-detects custom objects and fields)
- Full CRUD operations for Companies, People, Opportunities, Tasks, Notes
- Bulk operations (10-100x faster than sequential)
- Support for complex field types (FullName, Links, Currency, Address, Emails, Phones)
- System database access (Attachments, Metadata)

**Installation (Self-Hosted n8n):**
```
Settings → Community Nodes → Install → n8n-nodes-twenty-dynamic
```

**Requirements:**
- Twenty CRM v1.4.0+ (tested up to v1.11.0)
- n8n v1.0.0+ (supports n8n 2.0 Beta)

**Note:** Community nodes are not available on n8n Cloud. For n8n Cloud, use the HTTP Request node approach below.

---

## Twenty CRM REST API Documentation

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Cloud | `https://api.twenty.com/` |
| Self-Hosted | `https://{your-domain}/` |

### API Types

1. **Core API** (`/rest/` or `/graphql/`) - Work with records (Companies, People, etc.)
2. **Metadata API** (`/rest/metadata/` or `/metadata/`) - Manage workspace schema

### Available Endpoints

#### Core Objects

| Object | REST Endpoint | Description |
|--------|---------------|-------------|
| Companies | `/rest/companies` | Manage companies/accounts |
| People | `/rest/people` | Manage contacts/persons |
| Opportunities | `/rest/opportunities` | Manage deals |
| Notes | `/rest/notes` | Manage notes |
| Tasks | `/rest/tasks` | Manage tasks |

#### Metadata Endpoints

| Endpoint | Description |
|----------|-------------|
| `/rest/metadata/objects` | List all object schemas |
| `/rest/metadata/objects/{name}` | Get specific object schema |

---

## Authentication

Twenty CRM uses **API Key** authentication via Bearer token in the Authorization header.

### Creating an API Key

1. Log into your Twenty CRM instance
2. Go to **Settings → APIs & Webhooks** (or **Settings → Developers → API Keys**)
3. Click **+ Create key**
4. Enter a descriptive name (e.g., "n8n Integration")
5. Set an expiration date (optional but recommended)
6. Click **Save**
7. **Copy the key immediately** - it's only shown once

### Assigning Role Permissions

For better security, assign specific roles to API keys:

1. Go to **Settings → Roles**
2. Select the role to assign
3. Open the **Assignment** tab
4. Under **API Keys**, click **+ Assign to API key**
5. Select your API key

### Authentication Header

```
Authorization: Bearer YOUR_API_KEY
```

---

## Core API Operations

### Creating a Company

**Endpoint:** `POST /rest/companies`

**Request Body:**
```json
{
  "name": "Acme Corporation",
  "domainName": "acme.com",
  "employees": 150,
  "annualRecurringRevenue": {
    "amount": 1000000,
    "currency": "USD"
  },
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "country": "USA",
    "postalCode": "94105"
  }
}
```

**cURL Example:**
```bash
curl -X POST 'https://api.twenty.com/rest/companies' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Acme Corporation",
    "domainName": "acme.com",
    "employees": 150
  }'
```

**Response:**
```json
{
  "data": {
    "id": "comp-uuid-123",
    "name": "Acme Corporation",
    "domainName": "acme.com",
    "employees": 150,
    "createdAt": "2026-03-18T12:00:00Z",
    "updatedAt": "2026-03-18T12:00:00Z"
  }
}
```

---

### Creating a Contact (Person)

**Endpoint:** `POST /rest/people`

**Request Body:**
```json
{
  "name": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "email": "john.doe@acme.com",
  "phone": "+1-555-0123",
  "jobTitle": "VP of Sales",
  "companyId": "comp-uuid-123"
}
```

**cURL Example:**
```bash
curl -X POST 'https://api.twenty.com/rest/people' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john.doe@acme.com",
    "phone": "+1-555-0123",
    "jobTitle": "VP of Sales",
    "companyId": "comp-uuid-123"
  }'
```

**Response:**
```json
{
  "data": {
    "id": "person-uuid-456",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "john.doe@acme.com",
    "phone": "+1-555-0123",
    "jobTitle": "VP of Sales",
    "companyId": "comp-uuid-123",
    "createdAt": "2026-03-18T12:00:00Z"
  }
}
```

---

### Adding Notes to a Contact

In Twenty CRM, notes are related to multiple object types (Person, Company, Opportunity). To link a note to a contact:

**Endpoint:** `POST /rest/notes`

**Request Body:**
```json
{
  "title": "Initial Contact - Q1 Roadmap Discussion",
  "body": "Discussed Q1 roadmap and budget allocation. Client is interested in enterprise plan.",
  "personId": "person-uuid-456"
}
```

**cURL Example:**
```bash
curl -X POST 'https://api.twenty.com/rest/notes' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Initial Contact - Q1 Roadmap Discussion",
    "body": "Discussed Q1 roadmap and budget allocation. Client is interested in enterprise plan.",
    "personId": "person-uuid-456"
  }'
```

**Linking Note to Multiple Objects:**
```json
{
  "title": "Meeting Notes",
  "body": "Multi-object note content",
  "personId": "person-uuid-456",
  "companyId": "comp-uuid-123",
  "opportunityId": "opp-uuid-789"
}
```

---

### Searching for Existing Records

#### List All Records

**Companies:**
```bash
curl -X GET 'https://api.twenty.com/rest/companies' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**People:**
```bash
curl -X GET 'https://api.twenty.com/rest/people' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

#### Search with Filters

**Filter by Name (companies):**
```bash
curl -X GET 'https://api.twenty.com/rest/companies?filter={"name":{"like":"%Acme%"}}' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**Filter People by Company:**
```bash
curl -X GET 'https://api.twenty.com/rest/people?filter={"companyId":{"eq":"comp-uuid-123"}}' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**Filter by Email:**
```bash
curl -X GET 'https://api.twenty.com/rest/people?filter={"email":{"eq":"john.doe@acme.com"}}' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

#### Pagination

```bash
curl -X GET 'https://api.twenty.com/rest/companies?limit=10&offset=0' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**Query Parameters:**
- `limit`: Number of records to return (default: 20)
- `offset`: Number of records to skip
- `filter`: JSON filter conditions
- `orderBy`: Sort order

---

## n8n Workflow Examples

### Using Community Node (Self-Hosted Only)

#### Setup

1. Install the community node: `n8n-nodes-twenty-dynamic`
2. Create credentials:
   - **API Key**: Your Twenty API key
   - **Domain**: `https://app.twenty.com` (or your self-hosted domain)
   - ⚠️ Do NOT include `/graphql` in the domain

#### Example Workflow: Create Company and Contact

```
[Trigger] → [Twenty: Create Company] → [Twenty: Create Person] → [Twenty: Create Note]
```

**Twenty Node Configuration:**

1. **Create Company:**
   - Operation: Create
   - Database: Companies
   - Fields:
     - Name: `{{ $json.companyName }}`
     - Domain: `{{ $json.domain }}`

2. **Create Person:**
   - Operation: Create
   - Database: People
   - Fields:
     - First Name: `{{ $json.firstName }}`
     - Last Name: `{{ $json.lastName }}`
     - Email: `{{ $json.email }}`
     - Company ID: `{{ $prevNode.json.data.id }}`

3. **Create Note:**
   - Operation: Create
   - Database: Notes
   - Fields:
     - Title: "Contact from Website"
     - Body: `{{ $json.message }}`
     - Person ID: `{{ $prevNode.json.data.id }}`

---

### Using HTTP Request Node

For **n8n Cloud** or when you need full control, use the HTTP Request node with the REST API.

#### Credentials Setup

1. In n8n, go to **Credentials**
2. Click **New**
3. Select **Header Auth** (Generic Credential Type)
4. Configure:
   - **Name**: Twenty CRM API
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer YOUR_API_KEY`

#### Example 1: Create Company

**HTTP Request Node Configuration:**

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/rest/companies` |
| Authentication | Generic Credential Type |
| Generic Auth Type | Header Auth |
| Credential | Twenty CRM API |
| Body Content Type | JSON |

**JSON Body:**
```json
{
  "name": "{{ $json.companyName }}",
  "domainName": "{{ $json.domain }}",
  "employees": {{ $json.employees || 0 }}
}
```

#### Example 2: Search for Existing Company

**HTTP Request Node Configuration:**

| Setting | Value |
|---------|-------|
| Method | GET |
| URL | `https://api.twenty.com/rest/companies?filter={"domainName":{"eq":"{{ $json.domain }}"}}` |
| Authentication | Header Auth |
| Response Format | JSON |

#### Example 3: Create Person with Company Link

```
[Webhook Trigger] 
    → [HTTP Request: Search Company by Domain]
    → [IF: Company Exists?]
        → [Yes Path: Set Company ID]
        → [No Path: HTTP Request: Create Company]
    → [HTTP Request: Create Person]
    → [HTTP Request: Create Note]
```

**Create Person Node:**

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/rest/people` |
| Body Content Type | JSON |

**JSON Body:**
```json
{
  "name": {
    "firstName": "{{ $json.firstName }}",
    "lastName": "{{ $json.lastName }}"
  },
  "email": "{{ $json.email }}",
  "jobTitle": "{{ $json.jobTitle }}",
  "companyId": "{{ $companyId }}"
}
```

#### Example 4: Complete Workflow (Webhook → Create/Update)

**Workflow JSON Structure:**
```json
{
  "name": "Twenty CRM Lead Capture",
  "nodes": [
    {
      "type": "n8n-nodes-base.webhook",
      "name": "Lead Form Webhook",
      "webhookUrl": "https://your-n8n.app/webhook/twenty-lead"
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Search Company",
      "method": "GET",
      "url": "=https://api.twenty.com/rest/companies?filter={"domainName":{"eq":"{{ $json.domain }}"}}",
      "authentication": "genericCredentialType",
      "genericAuthType": "httpHeaderAuth"
    },
    {
      "type": "n8n-nodes-base.if",
      "name": "Company Exists?",
      "conditions": {
        "string": [
          {
            "value1": "={{ $json.data.companies.length }}",
            "operation": "gt",
            "value2": "0"
          }
        ]
      }
    }
  ]
}
```

---

## Webhooks

Twenty CRM supports webhooks for real-time event notifications.

### Creating a Webhook

1. Go to **Settings → APIs & Webhooks → Webhooks**
2. Click **+ Create webhook**
3. Enter your publicly accessible webhook URL (n8n webhook URL)
4. Click **Save**

### Supported Events

| Event Type | Example |
|------------|---------|
| Record Created | `person.created`, `company.created`, `note.created` |
| Record Updated | `person.updated`, `company.updated`, `opportunity.updated` |
| Record Deleted | `person.deleted`, `company.deleted` |

### Webhook Payload Format

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

### n8n Webhook Configuration

1. Add a **Webhook** node as trigger
2. Set method to **POST**
3. Copy the webhook URL
4. Paste it in Twenty CRM webhook configuration
5. Test with sample payload

---

## Rate Limits and Best Practices

### Rate Limits (Cloud)

| Limit | Value |
|-------|-------|
| Requests per minute | 100 calls |
| Batch size | 60 records per request |

### Best Practices

1. **Use Batch Operations**
   ```bash
   POST /rest/companies/batch
   {
     "records": [
       {"name": "Company A"},
       {"name": "Company B"}
     ]
   }
   ```

2. **Handle Rate Limit Errors**
   - Check for `429` status code
   - Implement exponential backoff
   - Check `retryAfter` header

3. **Use Webhooks Instead of Polling**
   - Webhooks = Real-time, no rate limit concerns
   - Polling = Inefficient, hits rate limits

4. **Filter on Server Side**
   - Use `filter` query parameter instead of fetching all records

5. **Store IDs for Relationships**
   - Save created record IDs for linking related records

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **401 Unauthorized** | Check API key is valid and not expired. Verify `Authorization: Bearer` prefix |
| **404 Not Found** | Check endpoint URL. Self-hosted: ensure domain is correct |
| **Rate Limit Exceeded** | Implement backoff. Batch operations. Use webhooks |
| **Field validation errors** | Check field names match API names (not display names). Check required fields |
| **Relation not found** | Ensure parent record exists before creating child. Check ID format |

### Debugging Tips

1. **Test in API Playground first**
   - Go to Settings → APIs & Webhooks → REST API (Playground)
   - Test queries with your actual data model

2. **Enable n8n execution logs**
   - Check the JSON output of each node
   - Verify data structure before sending

3. **Use cURL to test outside n8n**
   - Isolate whether issue is with API or n8n configuration

### Getting Help

- **Twenty CRM Docs:** https://docs.twenty.com/developers/extend/api
- **Community Node Issues:** https://github.com (search n8n-nodes-twenty-dynamic)
- **n8n Community:** https://community.n8n.io

---

## Reference: Complete API Endpoint Summary

### Companies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/companies` | List all companies |
| GET | `/rest/companies/{id}` | Get specific company |
| POST | `/rest/companies` | Create company |
| POST | `/rest/companies/batch` | Batch create companies |
| PATCH | `/rest/companies/{id}` | Update company |
| DELETE | `/rest/companies/{id}` | Delete company |

### People

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/people` | List all people |
| GET | `/rest/people/{id}` | Get specific person |
| POST | `/rest/people` | Create person |
| POST | `/rest/people/batch` | Batch create people |
| PATCH | `/rest/people/{id}` | Update person |
| DELETE | `/rest/people/{id}` | Delete person |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/notes` | List all notes |
| GET | `/rest/notes/{id}` | Get specific note |
| POST | `/rest/notes` | Create note |
| PATCH | `/rest/notes/{id}` | Update note |
| DELETE | `/rest/notes/{id}` | Delete note |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rest/tasks` | List all tasks |
| POST | `/rest/tasks` | Create task |
| PATCH | `/rest/tasks/{id}` | Update task |

---

## Field Type Reference

| Field Type | Example Usage |
|------------|---------------|
| `TEXT` | `"name": "Acme Corp"` |
| `NUMBER` | `"employees": 150` |
| `EMAIL` | `"email": "test@example.com"` |
| `PHONE` | `"phone": "+1-555-0123"` |
| `URL` | `"domainName": "acme.com"` |
| `CURRENCY` | `"annualRecurringRevenue": {"amount": 1000, "currency": "USD"}` |
| `ADDRESS` | `"address": {"street": "123 Main", "city": "SF", "state": "CA"}` |
| `FULL_NAME` | `"name": {"firstName": "John", "lastName": "Doe"}` |
| `RELATION` | `"companyId": "comp-uuid-123"` |
| `DATE` | `"dueAt": "2025-01-15T10:00:00Z"` |
| `BOOLEAN` | `"isActive": true` |

---

*Last Updated: March 2026*
