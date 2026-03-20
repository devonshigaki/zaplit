# n8n → Twenty CRM Integration Fix

## Problem Statement

The current n8n workflow is **broken**: it receives form data via webhook but does NOT create records in Twenty CRM, causing data loss.

**Current Broken Flow:**
```
Webhook → [NO CRM NODES] → Response (data lost!)
```

**Required Flow:**
```
Webhook → Create Person → Create Company → Link Person to Company → Create Note → Response
```

---

## Recommendation: Store Extra Fields in Note (NOT Custom Attributes)

### Why Notes Are Better Than Custom Attributes

| Factor | Custom Attributes | Note Body |
|--------|------------------|-----------|
| **Setup Complexity** | Requires pre-creating fields in Twenty CRM UI | Zero setup required |
| **Flexibility** | Fixed schema, requires migration to change | Completely flexible, free-form text |
| **API Complexity** | Must reference field IDs/keys | Simple string body |
| **Visibility** | Scattered across entity fields | Consolidated view in timeline |
| **Searchability** | Limited (field-by-field) | Full-text search available |
| **Future-proofing** | Schema changes break integrations | Schema-independent |

### Recommended Approach

Store the core CRM fields (name, email, company, role) as structured data, and store all additional context (teamSize, techStack, securityLevel, compliance, message) in a **formatted Note** attached to the Person.

**Note Format Example:**
```
📋 CONSULTATION REQUEST

Team Size: 11-50
Security Level: Enterprise
Compliance: SOC 2, GDPR

🛠️ TECH STACK:
- CRM: Salesforce
- Communication: Slack
- Finance: Stripe
- Productivity: Notion
- Support: Zendesk
- Infrastructure: AWS

💬 MESSAGE:
Looking for AI agent teams to automate our customer support workflow.
Timeline: Q2 2026
```

---

## Twenty CRM API Reference

### Base Configuration

| Setting | Value |
|---------|-------|
| Base URL | `https://crm.zaplit.com/rest` (self-hosted) |
| Auth Header | `Authorization: Bearer {TWENTY_API_KEY}` |
| Content-Type | `application/json` |
| Rate Limit | 100 requests/minute |

### Entity Endpoints

#### 1. Create Person

```http
POST /rest/people
```

**Request Body:**
```json
{
  "name": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "emails": {
    "primaryEmail": "john@example.com"
  },
  "jobTitle": "CTO",
  "companyId": "{company-uuid}"  // Optional - set after company creation
}
```

**n8n HTTP Node Configuration:**
```json
{
  "name": "Create Person in Twenty CRM",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.1,
  "position": [800, 300],
  "parameters": {
    "method": "POST",
    "url": "=https://crm.zaplit.com/rest/people",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "contentType": "json",
    "body": {
      "name": {
        "firstName": "={{ $json.data.name.split(' ')[0] }}",
        "lastName": "={{ $json.data.name.split(' ').slice(1).join(' ') || '' }}"
      },
      "emails": {
        "primaryEmail": "={{ $json.data.email }}"
      },
      "jobTitle": "={{ $json.data.role }}"
    },
    "options": {}
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "twenty-api-key",
      "name": "Twenty CRM API Key"
    }
  }
}
```

#### 2. Create Company

```http
POST /rest/companies
```

**Request Body:**
```json
{
  "name": "Acme Corporation",
  "domainName": {
    "primaryLinkUrl": "https://acme.com",
    "primaryLinkLabel": "Website"
  }
}
```

**n8n HTTP Node Configuration:**
```json
{
  "name": "Create Company in Twenty CRM",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.1,
  "position": [1000, 300],
  "parameters": {
    "method": "POST",
    "url": "=https://crm.zaplit.com/rest/companies",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "contentType": "json",
    "body": {
      "name": "={{ $json.data.company }}"
    },
    "options": {}
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "twenty-api-key",
      "name": "Twenty CRM API Key"
    }
  }
}
```

#### 3. Link Person to Company (Update Person)

```http
PATCH /rest/people/{personId}
```

**Request Body:**
```json
{
  "companyId": "{company-uuid}"
}
```

**n8n HTTP Node Configuration:**
```json
{
  "name": "Link Person to Company",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.1,
  "position": [1200, 300],
  "parameters": {
    "method": "PATCH",
    "url": "=https://crm.zaplit.com/rest/people/{{ $('Create Person in Twenty CRM').item.json.data.id }}",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "contentType": "json",
    "body": {
      "companyId": "={{ $('Create Company in Twenty CRM').item.json.data.id }}"
    },
    "options": {}
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "twenty-api-key",
      "name": "Twenty CRM API Key"
    }
  }
}
```

#### 4. Create Note

```http
POST /rest/notes
```

**Request Body:**
```json
{
  "title": "Consultation Request - {{name}}",
  "body": "Note content with all form details",
  "personId": "{person-uuid}",
  "companyId": "{company-uuid}"
}
```

**n8n HTTP Node Configuration:**
```json
{
  "name": "Create Note in Twenty CRM",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.1,
  "position": [1400, 300],
  "parameters": {
    "method": "POST",
    "url": "=https://crm.zaplit.com/rest/notes",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "Content-Type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "contentType": "json",
    "body": {
      "title": "={{ 'Consultation Request - ' + $('Webhook').item.json.body.data.name }}",
      "body": "={{ $json.noteBody }}",
      "personId": "={{ $('Create Person in Twenty CRM').item.json.data.id }}",
      "companyId": "={{ $('Create Company in Twenty CRM').item.json.data.id }}"
    },
    "options": {}
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "twenty-api-key",
      "name": "Twenty CRM API Key"
    }
  }
}
```

---

## Complete n8n Workflow JSON

```json
{
  "name": "Consultation Form → Twenty CRM",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [200, 300],
      "webhookId": "consultation",
      "parameters": {
        "httpMethod": "POST",
        "path": "consultation",
        "responseMode": "responseNode",
        "options": {}
      }
    },
    {
      "name": "Validate Webhook Secret",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [400, 300],
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "check-webhook-secret",
              "leftValue": "={{ $headers['x-webhook-secret'] }}",
              "rightValue": "={{ $env.N8N_WEBHOOK_SECRET }}",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      }
    },
    {
      "name": "Create Person",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [600, 200],
      "parameters": {
        "method": "POST",
        "url": "=https://crm.zaplit.com/rest/people",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": {
          "name": {
            "firstName": "={{ $json.body.data.name.split(' ')[0] }}",
            "lastName": "={{ $json.body.data.name.split(' ').slice(1).join(' ') || '' }}"
          },
          "emails": {
            "primaryEmail": "={{ $json.body.data.email }}"
          },
          "jobTitle": "={{ $json.body.data.role }}"
        }
      },
      "credentials": {
        "httpHeaderAuth": {
          "id": "YOUR_TWENTY_CREDENTIAL_ID"
        }
      },
      "onError": "continue"
    },
    {
      "name": "Create Company",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [800, 200],
      "parameters": {
        "method": "POST",
        "url": "=https://crm.zaplit.com/rest/companies",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": {
          "name": "={{ $json.body.data.company }}"
        }
      },
      "credentials": {
        "httpHeaderAuth": {
          "id": "YOUR_TWENTY_CREDENTIAL_ID"
        }
      },
      "onError": "continue"
    },
    {
      "name": "Link Person to Company",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1000, 200],
      "parameters": {
        "method": "PATCH",
        "url": "={{ 'https://crm.zaplit.com/rest/people/' + $items('Create Person')[0].json.data.id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": {
          "companyId": "={{ $items('Create Company')[0].json.data.id }}"
        }
      },
      "credentials": {
        "httpHeaderAuth": {
          "id": "YOUR_TWENTY_CREDENTIAL_ID"
        }
      },
      "onError": "continue"
    },
    {
      "name": "Build Note Content",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.2,
      "position": [1200, 200],
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "note-body",
              "name": "noteBody",
              "type": "string",
              "value": "={{ '📋 CONSULTATION REQUEST\\n\\n' + '👤 Contact: ' + $json.body.data.name + '\\n📧 Email: ' + $json.body.data.email + '\\n🏢 Company: ' + $json.body.data.company + '\\n💼 Role: ' + $json.body.data.role + '\\n👥 Team Size: ' + ($json.body.data.teamSize || 'Not specified') + '\\n🔒 Security Level: ' + ($json.body.data.securityLevel || 'Standard') + '\\n📋 Compliance: ' + ($json.body.data.compliance?.join(', ').toUpperCase() || 'None') + '\\n\\n🛠️ TECH STACK:\\n' + ($json.body.data.techStack || []).map(t => '• ' + t).join('\\n') + '\\n\\n💬 MESSAGE:\\n' + ($json.body.data.message || 'No additional message') + '\\n\\n---\\nSubmitted: ' + new Date().toISOString() }}"
            }
          ]
        },
        "options": {}
      }
    },
    {
      "name": "Create Note",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1400, 200],
      "parameters": {
        "method": "POST",
        "url": "=https://crm.zaplit.com/rest/notes",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "body": {
          "title": "={{ 'Consultation Request - ' + $json.body.data.name }}",
          "body": "={{ $json.noteBody }}",
          "personId": "={{ $items('Create Person')[0].json.data.id }}",
          "companyId": "={{ $items('Create Company')[0].json.data.id }}"
        }
      },
      "credentials": {
        "httpHeaderAuth": {
          "id": "YOUR_TWENTY_CREDENTIAL_ID"
        }
      }
    },
    {
      "name": "Success Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1600, 200],
      "parameters": {
        "options": {},
        "respondWith": "json",
        "responseBody": "={\"success\": true, \"message\": \"Form submitted successfully\", \"crmStatus\": \"created\"}"
      }
    },
    {
      "name": "Error Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [600, 400],
      "parameters": {
        "options": {},
        "respondWith": "json",
        "responseBody": "={\"success\": false, \"error\": \"Invalid webhook secret\"}",
        "statusCode": 401
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Validate Webhook Secret",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Validate Webhook Secret": {
      "main": [
        [
          {
            "node": "Create Person",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Error Response",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Person": {
      "main": [
        [
          {
            "node": "Create Company",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Company": {
      "main": [
        [
          {
            "node": "Link Person to Company",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Link Person to Company": {
      "main": [
        [
          {
            "node": "Build Note Content",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Build Note Content": {
      "main": [
        [
          {
            "node": "Create Note",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Create Note": {
      "main": [
        [
          {
            "node": "Success Response",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "errorWorkflow": ""
  }
}
```

---

## Step-by-Step Workflow Rebuild Instructions

### Step 1: Create Twenty CRM Credential in n8n

1. Go to **Settings → Credentials**
2. Click **Add Credential**
3. Select **HTTP Header Auth**
4. Configure:
   - **Name**: `Twenty CRM API Key`
   - **Name (Header)**: `Authorization`
   - **Value**: `Bearer YOUR_TWENTY_JWT_TOKEN`

### Step 2: Backup Current Workflow

1. Open the current broken workflow
2. Click **Download** (top right)
3. Save as `consultation-form-backup-{date}.json`

### Step 3: Create New Workflow

1. Click **Add Workflow**
2. Name it: `Consultation Form → Twenty CRM`
3. Set **Execution Order**: Sequential (default)

### Step 4: Add Webhook Node

1. Add **Webhook** trigger node
2. Configure:
   - **Method**: POST
   - **Path**: `consultation`
   - **Response Mode**: Using 'Respond to Webhook' node
   - **Authentication**: None (we'll validate manually for flexibility)

### Step 5: Add Validation Node

1. Add **IF** node after Webhook
2. Condition: `$headers["x-webhook-secret"] = $env.N8N_WEBHOOK_SECRET`
3. True → Continue to Create Person
4. False → Return Error Response

### Step 6: Add CRM Integration Nodes

Add the following nodes in sequence (see JSON above for exact configuration):

1. **Create Person** (HTTP Request)
2. **Create Company** (HTTP Request)
3. **Link Person to Company** (HTTP Request)
4. **Build Note Content** (Set node - formats all extra data)
5. **Create Note** (HTTP Request)

### Step 7: Add Response Nodes

1. **Success Response** → Returns `{success: true}`
2. **Error Response** → Returns `{success: false, error: "..."}`

### Step 8: Configure Error Handling

For each HTTP Request node:
1. Open node settings
2. Set **On Error**: Continue
3. Add **No Operation, do nothing** node for error aggregation
4. Connect error outputs to error logging

### Step 9: Test the Workflow

1. Save the workflow
2. Click **Test Workflow**
3. Send test payload:
```json
{
  "formType": "consultation",
  "data": {
    "name": "Test User",
    "email": "test@example.com",
    "company": "Test Corp",
    "role": "CTO",
    "teamSize": "11-50",
    "techStack": ["CRM: Salesforce", "Communication: Slack"],
    "securityLevel": "enterprise",
    "compliance": ["soc2", "gdpr"],
    "message": "Testing the integration"
  }
}
```
4. Verify records created in Twenty CRM

### Step 10: Activate Workflow

1. Toggle workflow to **Active**
2. Update zaplit-com environment variables to point to new webhook URL

---

## Error Handling Requirements

### Required Error Handling Logic

| Node | Error Type | Action |
|------|------------|--------|
| Webhook | Invalid secret | Return 401, log attempt |
| Create Person | Duplicate email | Update existing person, continue |
| Create Person | API failure | Log error, return 500 |
| Create Company | Duplicate name | Use existing company, continue |
| Create Company | API failure | Log error, person created but unlinked |
| Link Person | API failure | Log error, entities exist but unlinked |
| Create Note | API failure | Log error, entities created but no note |

### Error Response Format

```json
{
  "success": false,
  "error": "CRM integration failed",
  "details": {
    "step": "create_person",
    "message": "HTTP 400: Email already exists"
  }
}
```

### n8n Error Handling Pattern

For each HTTP Request node:

1. Set **On Error**: Continue (Outputs extra items on error)
2. Add **IF** node after to check `$json.error`
3. True branch → Error logging → Error Response
4. False branch → Continue to next step

---

## Field Mapping Reference

### Form Data → CRM Mapping

| Form Field | CRM Entity | CRM Field | Notes |
|------------|------------|-----------|-------|
| name | Person | name.firstName, name.lastName | Split on space |
| email | Person | emails.primaryEmail | |
| company | Company | name | |
| role | Person | jobTitle | |
| teamSize | Note | body | Included in note text |
| techStack | Note | body | Formatted as bullet list |
| securityLevel | Note | body | Included in note text |
| compliance | Note | body | Joined array |
| message | Note | body | Main content |

### Data Transformations Required

**Name Splitting:**
```javascript
// n8n expression
firstName: {{ $json.body.data.name.split(' ')[0] }}
lastName: {{ $json.body.data.name.split(' ').slice(1).join(' ') || '' }}
```

**Tech Stack Formatting:**
```javascript
// n8n expression
{{ $json.body.data.techStack.map(t => '• ' + t).join('\n') }}
```

**Compliance Formatting:**
```javascript
// n8n expression
{{ $json.body.data.compliance?.join(', ').toUpperCase() || 'None' }}
```

---

## Verification Checklist

- [ ] Webhook receives form data from zaplit-com
- [ ] Person created in Twenty CRM with correct name/email
- [ ] Company created in Twenty CRM with correct name
- [ ] Person linked to Company (visible in person detail)
- [ ] Note created with all form fields formatted
- [ ] Note attached to both Person and Company
- [ ] Success response returned to zaplit-com within 10 seconds
- [ ] Error responses include meaningful messages
- [ ] Duplicate email handling works correctly
- [ ] Rate limiting (100 req/min) not exceeded
- [ ] Credentials stored securely in n8n

---

## Troubleshooting

### Common Issues

**Issue**: Person creation fails with "Email already exists"
**Fix**: Add duplicate check before create, use UPDATE instead

**Issue**: Company already exists
**Fix**: Query company first, create only if not found

**Issue**: Link Person fails with "Invalid companyId"
**Fix**: Verify Company node output before linking

**Issue**: Note not appearing
**Fix**: Check personId and companyId are valid UUIDs

**Issue**: Timeout from zaplit-com
**Fix**: Twenty CRM may be slow; consider async processing

---

## Security Considerations

1. **API Key**: Store in n8n credentials, never in workflow JSON
2. **Webhook Secret**: Validate all incoming requests
3. **Rate Limiting**: Twenty CRM has 100 req/min limit
4. **Data Logging**: Don't log sensitive data (PII) in n8n executions
5. **HTTPS**: All API calls use HTTPS (enforced by n8n)
