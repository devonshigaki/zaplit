# Twenty CRM Production Integration Patterns

> **Production Handoff Guide** - Comprehensive integration patterns for Twenty CRM in production environments

---

## Table of Contents

1. [GraphQL API Best Practices](#1-graphql-api-best-practices)
2. [Webhook to CRM Data Mapping](#2-webhook-to-crm-data-mapping-patterns)
3. [Contact vs Lead Creation Logic](#3-contact-vs-lead-creation-logic)
4. [Duplicate Prevention Strategies](#4-duplicate-prevention-strategies)
5. [Error Handling for Failed CRM Operations](#5-error-handling-for-failed-crm-operations)
6. [Data Validation Before CRM Insertion](#6-data-validation-before-crm-insertion)
7. [Audit Logging for CRM Operations](#7-audit-logging-for-crm-operations)
8. [Twenty CRM Deployment on Cloud Run](#8-twenty-crm-deployment-on-cloud-run)

---

## 1. GraphQL API Best Practices

### 1.1 Authentication & Security

Twenty CRM uses Bearer token authentication for all API requests:

```typescript
// Authentication header configuration
const TWENTY_API_KEY = process.env.TWENTY_API_KEY;
const TWENTY_BASE_URL = process.env.TWENTY_BASE_URL;

// GraphQL client with authentication
async function twentyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string
): Promise<T | null> {
  if (!TWENTY_API_KEY) {
    console.error('[CRM] TWENTY_API_KEY not configured');
    return null;
  }

  const response = await fetch(`${TWENTY_BASE_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}
```

**API Key Management:**
- Store API keys in environment variables (never commit to code)
- Use separate keys for development and production
- Set expiration dates on keys and rotate regularly
- Assign minimal required roles to API keys via Twenty's Role settings

### 1.2 Rate Limits & Throttling

Twenty CRM enforces the following rate limits:

| Limit | Value |
|-------|-------|
| Requests | 100 calls per minute |
| Batch size | 60 records per call |

**Implementation with exponential backoff:**

```typescript
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAttempts: number;
  baseDelayMs: number;
}

const defaultRateLimit: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  retryAttempts: 3,
  baseDelayMs: 1000,
};

class RateLimitedClient {
  private requestTimestamps: number[] = [];
  
  async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    config: RateLimitConfig = defaultRateLimit
  ): Promise<T> {
    // Clean old timestamps
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < config.windowMs
    );
    
    // Check rate limit
    if (this.requestTimestamps.length >= config.maxRequests) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = config.windowMs - (now - oldestTimestamp);
      console.log(`[RATE LIMIT] Waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Record this request
    this.requestTimestamps.push(Date.now());
    
    // Execute with retry logic
    return this.executeWithRetry(fn, config);
  }
  
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RateLimitConfig
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on client errors (4xx)
        if (lastError.message.includes('400') || lastError.message.includes('401')) {
          throw lastError;
        }
        
        if (attempt < config.retryAttempts) {
          const delay = config.baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`[RETRY] Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}
```

### 1.3 GraphQL Query Optimization

**Batch Operations (GraphQL-only feature):**

```typescript
// Batch create multiple companies
const BATCH_CREATE_COMPANIES = `
  mutation CreateCompanies($data: [CompanyCreateInput!]!) {
    createCompanies(data: $data) {
      id
      name
    }
  }
`;

// Batch upsert (create or update)
const BATCH_UPSERT_PEOPLE = `
  mutation UpsertPeople($data: [PersonUpsertInput!]!) {
    upsertPeople(data: $data) {
      id
      name { firstName lastName }
      emails { primaryEmail }
    }
  }
`;

async function batchCreateCompanies(companies: Array<{ name: string; employees?: number }>) {
  // Twenty supports up to 60 records per batch
  const batches = chunkArray(companies, 60);
  const results = [];
  
  for (const batch of batches) {
    const data = await twentyGraphQL(
      BATCH_CREATE_COMPANIES,
      { data: batch },
      'batchCreateCompanies'
    );
    results.push(...(data?.createCompanies || []));
  }
  
  return results;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

**Field Selection Best Practices:**

```typescript
// Good - Select only needed fields
const CREATE_PERSON_MINIMAL = `
  mutation CreatePerson($data: PersonCreateInput!) {
    createPerson(data: $data) {
      id
      name { firstName lastName }
      emails { primaryEmail }
    }
  }
`;

// Avoid - Over-fetching unused fields
const CREATE_PERSON_VERBOSE = `
  mutation CreatePerson($data: PersonCreateInput!) {
    createPerson(data: $data) {
      id
      name { firstName lastName }
      emails { primaryEmail additionalEmails }
      jobTitle
      company { id name domainName }
      phoneNumbers { primaryPhoneNumber }
      linkedinLink { primaryLink }
      createdAt
      updatedAt
      # ... many more fields
    }
  }
`;
```

---

## 2. Webhook to CRM Data Mapping Patterns

### 2.1 Standard Webhook Payload Structure

```typescript
interface WebhookPayload {
  formType: 'consultation' | 'contact' | 'newsletter';
  data: FormData;
  metadata: {
    submittedAt: string;
    source: string;
    ipHash: string;
    userAgent?: string;
  };
  crmData?: {
    companyId?: string;
    personId?: string;
    noteId?: string;
  };
}

interface FormData {
  name: string;
  email: string;
  company?: string;
  role?: string;
  teamSize?: string;
  message?: string;
  techStack?: Record<string, string>;
  securityLevel?: string;
  compliance?: string[];
}
```

### 2.2 Data Transformation Pipeline

```typescript
class CRMDataTransformer {
  // Split full name into first/last
  static parseName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
    };
  }
  
  // Normalize email
  static normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }
  
  // Map team size to employee count
  static mapTeamSizeToEmployees(teamSize: string): number | undefined {
    const mapping: Record<string, number> = {
      '1-10': 10,
      '11-50': 50,
      '51-200': 200,
      '201-500': 500,
      '501-1000': 1000,
      '1000+': 1000,
    };
    return mapping[teamSize];
  }
  
  // Transform form data to Twenty CRM format
  static toCompanyInput(data: FormData): CompanyCreateInput {
    return {
      name: data.company || 'Unknown Company',
      employees: data.teamSize ? this.mapTeamSizeToEmployees(data.teamSize) : undefined,
    };
  }
  
  static toPersonInput(data: FormData, companyId?: string): PersonCreateInput {
    const { firstName, lastName } = this.parseName(data.name);
    
    return {
      name: { firstName, lastName },
      emails: {
        primaryEmail: this.normalizeEmail(data.email),
        additionalEmails: [],
      },
      jobTitle: data.role,
      ...(companyId && { companyId }),
    };
  }
  
  static toNoteInput(
    data: FormData,
    formType: string,
    personId?: string,
    companyId?: string
  ): NoteCreateInput {
    const title = formType === 'consultation'
      ? `Consultation Request - ${data.company}`
      : `Contact Form - ${data.name}`;
    
    const body = this.formatNoteBody(data, formType);
    
    return {
      title,
      bodyV2: { markdown: body },
      ...(personId && { personId }),
      ...(companyId && { companyId }),
    };
  }
  
  private static formatNoteBody(data: FormData, formType: string): string {
    if (formType === 'consultation') {
      return `## Consultation Request

**Name:** ${data.name}
**Email:** ${data.email}
**Company:** ${data.company}
**Role:** ${data.role}
**Team Size:** ${data.teamSize}

### Technical Requirements
**Tech Stack:** ${JSON.stringify(data.techStack)}
**Security Level:** ${data.securityLevel}
**Compliance:** ${JSON.stringify(data.compliance)}

### Message
${data.message || 'No message provided'}

---
**Submitted:** ${new Date().toISOString()}`;
    }
    
    return `## Contact Form Submission

**From:** ${data.name} <${data.email}>

### Message
${data.message}

---
**Submitted:** ${new Date().toISOString()}`;
  }
}
```

### 2.3 n8n Webhook Workflow Pattern

```typescript
// n8n workflow structure for webhook-to-CRM processing
interface N8NWorkflow {
  name: 'Form to Twenty CRM';
  nodes: [
    // 1. Webhook Trigger
    {
      type: 'n8n-nodes-base.webhook';
      config: {
        path: 'form-submission';
        method: 'POST';
        responseMode: 'responseNode'; // Return immediate response
      };
    },
    // 2. Data Validation
    {
      type: 'n8n-nodes-base.function';
      code: `
        const payload = $input.first().json;
        
        // Validate required fields
        if (!payload.data?.email || !payload.data?.name) {
          return [{ json: { error: 'Missing required fields', payload } }];
        }
        
        // Generate idempotency key
        const idempotencyKey = \`form:\${payload.formType}:\${payload.data.email.toLowerCase().trim()}:\${payload.metadata.submittedAt.slice(0, 10)}\`;
        
        return [{ 
          json: { 
            ...payload, 
            idempotencyKey,
            normalizedEmail: payload.data.email.toLowerCase().trim()
          } 
        }];
      `;
    },
    // 3. Check for Duplicates (via HTTP to cache/DB)
    {
      type: 'n8n-nodes-base.httpRequest';
      config: {
        method: 'GET';
        url: '={{$env.CACHE_API_URL}}/check';
        queryParameters: {
          key: '={{ $json.idempotencyKey }}';
        };
      };
    },
    // 4. Conditional - Skip if duplicate
    {
      type: 'n8n-nodes-base.if';
      config: {
        conditions: {
          string: [
            {
              value1: '={{ $json.exists }}';
              operation: 'equal';
              value2: 'true';
            }
          ];
        };
      };
    },
    // 5. Transform Data
    {
      type: 'n8n-nodes-base.function';
      code: `
        const payload = $input.first().json;
        const nameParts = payload.data.name.split(' ');
        
        return [{
          json: {
            company: payload.data.company ? {
              name: payload.data.company,
              employees: { '1-10': 10, '11-50': 50, '51-200': 200 }[payload.data.teamSize]
            } : null,
            person: {
              name: {
                firstName: nameParts[0],
                lastName: nameParts.slice(1).join(' ')
              },
              emails: {
                primaryEmail: payload.normalizedEmail
              },
              jobTitle: payload.data.role
            },
            note: {
              title: \`Form: \${payload.formType} - \${payload.data.name}\`,
              body: JSON.stringify(payload.data, null, 2)
            }
          }
        }];
      `;
    },
    // 6. Create in Twenty CRM (HTTP Request)
    {
      type: 'n8n-nodes-base.httpRequest';
      config: {
        method: 'POST';
        url: '={{$env.TWENTY_BASE_URL}}/graphql';
        headers: {
          Authorization: '={{$env.TWENTY_API_KEY}}';
          'Content-Type': 'application/json';
        };
      };
    }
  ];
}
```

---

## 3. Contact vs Lead Creation Logic

### 3.1 Decision Framework

```typescript
enum ContactType {
  PROSPECT = 'PROSPECT',      // New lead from marketing
  QUALIFIED = 'QUALIFIED',    // Sales qualified lead
  CUSTOMER = 'CUSTOMER',      // Existing customer
  PARTNER = 'PARTNER',        // Partner contact
  CHURNED = 'CHURNED',        // Former customer
}

interface ContactClassification {
  type: ContactType;
  priority: 'high' | 'medium' | 'low';
  stage: string;
  assignee?: string;
}

class ContactClassifier {
  static classify(formData: FormData, formType: string): ContactClassification {
    // Consultation form = high intent
    if (formType === 'consultation') {
      return {
        type: ContactType.QUALIFIED,
        priority: 'high',
        stage: 'Qualification',
      };
    }
    
    // Contact form with company = potential B2B
    if (formType === 'contact' && formData.company) {
      return {
        type: ContactType.PROSPECT,
        priority: 'medium',
        stage: 'New Lead',
      };
    }
    
    // Generic contact = low priority
    return {
      type: ContactType.PROSPECT,
      priority: 'low',
      stage: 'Prospecting',
    };
  }
}
```

### 3.2 Entity Relationship Pattern

```typescript
interface CRMEntityGraph {
  company?: {
    id: string;
    name: string;
    domainName?: string;
    employees?: number;
  };
  person: {
    id: string;
    name: { firstName: string; lastName: string };
    emails: { primaryEmail: string };
    jobTitle?: string;
    companyId?: string;
  };
  opportunity?: {
    id: string;
    name: string;
    stage: string;
    amount?: number;
    companyId: string;
    personId: string;
  };
  note: {
    id: string;
    title: string;
    body: string;
    personId?: string;
    companyId?: string;
  };
}

class CRMEntityBuilder {
  async buildEntityGraph(
    formData: FormData,
    classification: ContactClassification
  ): Promise<CRMEntityGraph> {
    const graph: Partial<CRMEntityGraph> = {};
    
    // 1. Create Company first (if provided)
    if (formData.company) {
      graph.company = await this.findOrCreateCompany(formData.company, formData.teamSize);
    }
    
    // 2. Create Person (linked to company)
    graph.person = await this.createPerson(formData, graph.company?.id);
    
    // 3. Create Opportunity for qualified leads
    if (classification.type === ContactType.QUALIFIED) {
      graph.opportunity = await this.createOpportunity(
        formData,
        graph.company!.id,
        graph.person.id,
        classification
      );
    }
    
    // 4. Create Note with full context
    graph.note = await this.createNote(
      formData,
      graph.person.id,
      graph.company?.id
    );
    
    return graph as CRMEntityGraph;
  }
  
  private async findOrCreateCompany(name: string, teamSize?: string): Promise<CRMEntityGraph['company']> {
    // Check for existing company
    const existing = await this.searchCompanyByName(name);
    if (existing) {
      console.log(`[CRM] Found existing company: ${existing.name}`);
      return existing;
    }
    
    // Create new company
    return createCompany(name, teamSize ? mapTeamSize(teamSize) : undefined);
  }
  
  private async searchCompanyByName(name: string) {
    const query = `
      query SearchCompanies($filter: CompanyFilterInput) {
        companies(filter: $filter, first: 1) {
          edges {
            node {
              id
              name
              employees
            }
          }
        }
      }
    `;
    
    const result = await twentyGraphQL(query, {
      filter: { name: { eq: name } }
    }, 'searchCompany');
    
    return result?.companies?.edges[0]?.node;
  }
}
```

### 3.3 Person Creation with Duplicate Detection

```typescript
async function createPersonWithDedup(
  data: FormData,
  companyId?: string
): Promise<{ person: any; isNew: boolean }> {
  const normalizedEmail = data.email.toLowerCase().trim();
  
  // Check for existing person by email
  const existingPerson = await findPersonByEmail(normalizedEmail);
  
  if (existingPerson) {
    console.log(`[CRM] Person already exists: ${existingPerson.id}`);
    
    // Update with new information if provided
    if (companyId && !existingPerson.companyId) {
      await updatePersonCompany(existingPerson.id, companyId);
    }
    
    return { person: existingPerson, isNew: false };
  }
  
  // Create new person
  const { firstName, lastName } = parseName(data.name);
  const newPerson = await createPerson(
    firstName,
    lastName,
    normalizedEmail,
    data.role,
    companyId
  );
  
  return { person: newPerson, isNew: true };
}

async function findPersonByEmail(email: string) {
  const query = `
    query FindPersonByEmail($email: String!) {
      people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) {
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail }
            companyId
          }
        }
      }
    }
  `;
  
  const result = await twentyGraphQL(query, { email }, 'findPersonByEmail');
  return result?.people?.edges[0]?.node;
}
```

---

## 4. Duplicate Prevention Strategies

### 4.1 Idempotency Key Pattern

```typescript
interface IdempotencyStore {
  set(key: string, value: IdempotencyRecord, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<IdempotencyRecord | null>;
  delete(key: string): Promise<void>;
}

interface IdempotencyRecord {
  key: string;
  status: 'pending' | 'completed' | 'failed';
  result?: any;
  createdAt: string;
  expiresAt: string;
}

// Redis-based implementation
class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private redis: RedisClient) {}
  
  async set(key: string, value: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    await this.redis.setex(
      `idempotency:${key}`,
      ttlSeconds,
      JSON.stringify(value)
    );
  }
  
  async get(key: string): Promise<IdempotencyRecord | null> {
    const data = await this.redis.get(`idempotency:${key}`);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(key: string): Promise<void> {
    await this.redis.del(`idempotency:${key}`);
  }
}

// Idempotency service
class IdempotencyService {
  private readonly DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
  
  constructor(private store: IdempotencyStore) {}
  
  generateKey(formType: string, email: string, date: string): string {
    // Format: form:consultation:john@example.com:2025-01-15
    return `form:${formType}:${email.toLowerCase().trim()}:${date}`;
  }
  
  async checkAndLock(key: string): Promise<{ canProceed: boolean; existing?: IdempotencyRecord }> {
    const existing = await this.store.get(key);
    
    if (existing) {
      // If pending, another process is handling it
      if (existing.status === 'pending') {
        console.log(`[IDEMPOTENCY] Key ${key} is being processed by another worker`);
        return { canProceed: false, existing };
      }
      
      // If completed, return cached result
      if (existing.status === 'completed') {
        console.log(`[IDEMPOTENCY] Key ${key} already processed`);
        return { canProceed: false, existing };
      }
      
      // If failed, allow retry
      console.log(`[IDEMPOTENCY] Key ${key} previously failed, allowing retry`);
    }
    
    // Lock the key
    await this.store.set(
      key,
      {
        key,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.DEFAULT_TTL_SECONDS * 1000).toISOString(),
      },
      this.DEFAULT_TTL_SECONDS
    );
    
    return { canProceed: true };
  }
  
  async complete(key: string, result: any): Promise<void> {
    await this.store.set(
      key,
      {
        key,
        status: 'completed',
        result,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.DEFAULT_TTL_SECONDS * 1000).toISOString(),
      },
      this.DEFAULT_TTL_SECONDS
    );
  }
  
  async fail(key: string): Promise<void> {
    await this.store.set(
      key,
      {
        key,
        status: 'failed',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.DEFAULT_TTL_SECONDS * 1000).toISOString(),
      },
      this.DEFAULT_TTL_SECONDS
    );
  }
}
```

### 4.2 n8n Deduplication Workflow

```json
{
  "nodes": [
    {
      "parameters": {
        "jsCode": "// Generate idempotency key\nconst payload = $input.first().json;\nconst email = payload.data?.email?.toLowerCase()?.trim();\nconst date = payload.metadata?.submittedAt?.slice(0, 10);\nconst key = `form:${payload.formType}:${email}:${date}`;\n\nreturn [{\n  json: {\n    ...payload,\n    idempotencyKey: key\n  }\n}];"
      },
      "name": "Generate Idempotency Key",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $env.REDIS_API_URL }}/get",
        "queryParameters": {
          "key": "={{ $json.idempotencyKey }}"
        }
      },
      "name": "Check Redis Cache",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "check-exists",
              "leftValue": "={{ $json.exists }}",
              "rightValue": "true",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "name": "Is Duplicate?",
      "type": "n8n-nodes-base.if"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $env.REDIS_API_URL }}/set",
        "body": {
          "key": "={{ $('Generate Idempotency Key').item.json.idempotencyKey }}",
          "value": "pending",
          "ttl": 86400
        }
      },
      "name": "Lock Key",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "jsCode": "// Continue with CRM processing\nreturn $input.all();"
      },
      "name": "Process to CRM",
      "type": "n8n-nodes-base.code"
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={ \"status\": \"duplicate\", \"message\": \"This submission has already been processed\" }"
      },
      "name": "Return Duplicate Response",
      "type": "n8n-nodes-base.respondToWebhook"
    }
  ]
}
```

### 4.3 Database-Level Deduplication

```sql
-- Create deduplication table
CREATE TABLE submission_dedup (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  form_type VARCHAR(50) NOT NULL,
  submission_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  crm_company_id VARCHAR(100),
  crm_person_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  INDEX idx_email_date (email, submission_date),
  INDEX idx_status (status),
  INDEX idx_expires (expires_at)
);

-- Cleanup old records
CREATE EVENT cleanup_expired_dedup
ON SCHEDULE EVERY 1 HOUR
DO
  DELETE FROM submission_dedup WHERE expires_at < NOW();
```

---

## 5. Error Handling for Failed CRM Operations

### 5.1 Error Classification

```typescript
enum CRMErrorType {
  // Client errors (4xx) - Don't retry
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Server errors (5xx) - Retry with backoff
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Network errors - Retry
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
}

interface CRMError {
  type: CRMErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
  originalError: Error;
}

class CRMErrorClassifier {
  static classify(error: Error): CRMError {
    const message = error.message.toLowerCase();
    
    // Authentication errors
    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        type: CRMErrorType.AUTHENTICATION_ERROR,
        message: 'Authentication failed - check API key',
        statusCode: 401,
        retryable: false,
        originalError: error,
      };
    }
    
    // Rate limiting
    if (message.includes('429') || message.includes('rate limit')) {
      return {
        type: CRMErrorType.RATE_LIMITED,
        message: 'Rate limit exceeded',
        statusCode: 429,
        retryable: true,
        originalError: error,
      };
    }
    
    // Validation errors
    if (message.includes('400') || message.includes('validation')) {
      return {
        type: CRMErrorType.VALIDATION_ERROR,
        message: 'Invalid data provided',
        statusCode: 400,
        retryable: false,
        originalError: error,
      };
    }
    
    // Server errors - retryable
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return {
        type: CRMErrorType.SERVER_ERROR,
        message: 'CRM server error',
        statusCode: 500,
        retryable: true,
        originalError: error,
      };
    }
    
    // Network errors - retryable
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
      return {
        type: CRMErrorType.NETWORK_ERROR,
        message: 'Network error occurred',
        retryable: true,
        originalError: error,
      };
    }
    
    // Default
    return {
      type: CRMErrorType.SERVER_ERROR,
      message: error.message,
      retryable: true,
      originalError: error,
    };
  }
}
```

### 5.2 Retry Strategy with Circuit Breaker

```typescript
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: CRMErrorType[];
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(private config: CircuitBreakerConfig) {}
  
  canExecute(): boolean {
    if (this.state === 'closed') return true;
    
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return true; // half-open
  }
  
  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}

class CRMOperationExecutor {
  private circuitBreaker: CircuitBreaker;
  
  constructor(
    private retryConfig: RetryConfig,
    circuitBreakerConfig: CircuitBreakerConfig
  ) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
  }
  
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ success: true; data: T } | { success: false; error: CRMError }> {
    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      return {
        success: false,
        error: {
          type: CRMErrorType.SERVICE_UNAVAILABLE,
          message: 'Circuit breaker is open',
          retryable: false,
          originalError: new Error('Circuit breaker open'),
        },
      };
    }
    
    let lastError: CRMError | null = null;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.circuitBreaker.recordSuccess();
        return { success: true, data: result };
      } catch (error) {
        const classifiedError = CRMErrorClassifier.classify(
          error instanceof Error ? error : new Error(String(error))
        );
        lastError = classifiedError;
        
        // Don't retry non-retryable errors
        if (!classifiedError.retryable) {
          console.error(`[CRM] Non-retryable error for ${operationName}:`, classifiedError.message);
          break;
        }
        
        // Check if this error type should be retried
        if (this.retryConfig.retryableErrors.length > 0 &&
            !this.retryConfig.retryableErrors.includes(classifiedError.type)) {
          break;
        }
        
        if (attempt < this.retryConfig.maxAttempts) {
          // Calculate exponential backoff with jitter
          const delay = Math.min(
            this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelayMs
          );
          const jitter = Math.random() * 1000;
          const totalDelay = delay + jitter;
          
          console.log(`[CRM] Retry ${attempt}/${this.retryConfig.maxAttempts} for ${operationName} in ${Math.round(totalDelay)}ms`);
          await new Promise(resolve => setTimeout(resolve, totalDelay));
        }
      }
    }
    
    this.circuitBreaker.recordFailure();
    return { success: false, error: lastError! };
  }
}
```

### 5.3 Dead Letter Queue Pattern

```typescript
interface DeadLetterMessage {
  id: string;
  timestamp: string;
  operation: string;
  payload: any;
  error: CRMError;
  retryCount: number;
  originalSubmissionId: string;
}

class DeadLetterQueue {
  constructor(
    private db: DatabaseConnection,
    private notificationService: NotificationService
  ) {}
  
  async enqueue(message: Omit<DeadLetterMessage, 'id' | 'timestamp'>): Promise<void> {
    const deadLetter: DeadLetterMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...message,
    };
    
    await this.db.query(
      `INSERT INTO crm_dead_letters 
       (id, timestamp, operation, payload, error, retry_count, original_submission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deadLetter.id,
        deadLetter.timestamp,
        deadLetter.operation,
        JSON.stringify(deadLetter.payload),
        JSON.stringify(deadLetter.error),
        deadLetter.retryCount,
        deadLetter.originalSubmissionId,
      ]
    );
    
    // Alert on failure
    await this.notificationService.sendAlert({
      type: 'crm_failure',
      message: `CRM operation failed after ${message.retryCount} retries`,
      details: {
        operation: message.operation,
        error: message.error.message,
        deadLetterId: deadLetter.id,
      },
    });
  }
  
  async processDeadLetters(): Promise<void> {
    const pending = await this.db.query(
      `SELECT * FROM crm_dead_letters 
       WHERE processed = false 
       AND retry_count < 10
       ORDER BY timestamp ASC 
       LIMIT 10`
    );
    
    for (const item of pending) {
      try {
        // Attempt to reprocess
        const payload = JSON.parse(item.payload);
        // ... reprocess logic
        
        // Mark as processed
        await this.db.query(
          'UPDATE crm_dead_letters SET processed = true, processed_at = ? WHERE id = ?',
          [new Date().toISOString(), item.id]
        );
      } catch (error) {
        // Increment retry count
        await this.db.query(
          'UPDATE crm_dead_letters SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
          [String(error), item.id]
        );
      }
    }
  }
}
```

---

## 6. Data Validation Before CRM Insertion

### 6.1 Schema Validation with Zod

```typescript
import { z } from 'zod';

// Twenty CRM field constraints
const CRM_CONSTRAINTS = {
  name: {
    firstName: { min: 1, max: 100 },
    lastName: { min: 1, max: 100 },
  },
  email: {
    max: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  company: {
    name: { min: 1, max: 255 },
    employees: { min: 1, max: 999999 },
  },
  note: {
    title: { min: 1, max: 255 },
    body: { max: 10000 },
  },
};

// Validation schemas
const PersonNameSchema = z.object({
  firstName: z.string()
    .min(CRM_CONSTRAINTS.name.firstName.min)
    .max(CRM_CONSTRAINTS.name.firstName.max)
    .transform(s => s.trim()),
  lastName: z.string()
    .min(CRM_CONSTRAINTS.name.lastName.min)
    .max(CRM_CONSTRAINTS.name.lastName.max)
    .transform(s => s.trim()),
});

const EmailsSchema = z.object({
  primaryEmail: z.string()
    .email('Invalid email format')
    .max(CRM_CONSTRAINTS.email.max)
    .transform(s => s.toLowerCase().trim()),
  additionalEmails: z.array(z.string().email()).optional(),
});

const PersonCreateInputSchema = z.object({
  name: PersonNameSchema,
  emails: EmailsSchema,
  jobTitle: z.string().max(100).optional(),
  companyId: z.string().uuid().optional(),
});

const CompanyCreateInputSchema = z.object({
  name: z.string()
    .min(CRM_CONSTRAINTS.company.name.min)
    .max(CRM_CONSTRAINTS.company.name.max)
    .transform(s => s.trim()),
  employees: z.number()
    .int()
    .min(CRM_CONSTRAINTS.company.employees.min)
    .max(CRM_CONSTRAINTS.company.employees.max)
    .optional(),
  domainName: z.string().url().optional(),
});

// Sanitization utilities
class DataSanitizer {
  static sanitizeString(input: string, maxLength: number): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove HTML tags
      .slice(0, maxLength);
  }
  
  static sanitizeMarkdown(input: string): string {
    // Remove potentially dangerous markdown
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .slice(0, CRM_CONSTRAINTS.note.body.max);
  }
  
  static normalizePhone(phone: string): string {
    // Remove all non-numeric characters
    return phone.replace(/\D/g, '').slice(0, 20);
  }
}
```

### 6.2 Pre-Submission Validation

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitized?: any;
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

class CRMDataValidator {
  validatePerson(data: unknown): ValidationResult {
    const result = PersonCreateInputSchema.safeParse(data);
    
    if (result.success) {
      return { valid: true, errors: [], sanitized: result.data };
    }
    
    const errors: ValidationError[] = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    
    return { valid: false, errors };
  }
  
  validateCompany(data: unknown): ValidationResult {
    const result = CompanyCreateInputSchema.safeParse(data);
    
    if (result.success) {
      return { valid: true, errors: [], sanitized: result.data };
    }
    
    const errors: ValidationError[] = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    
    return { valid: false, errors };
  }
  
  // Cross-field validation
  validateSubmission(formData: FormData): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Email domain validation
    const emailDomain = formData.email.split('@')[1];
    const blockedDomains = ['tempmail.com', 'throwaway.com'];
    if (blockedDomains.includes(emailDomain)) {
      errors.push({
        field: 'email',
        message: 'Temporary email addresses are not allowed',
        code: 'blocked_domain',
      });
    }
    
    // Company name validation for B2B
    if (formData.company) {
      const suspiciousPatterns = ['test', 'fake', 'example'];
      if (suspiciousPatterns.some(p => formData.company!.toLowerCase().includes(p))) {
        errors.push({
          field: 'company',
          message: 'Please provide a valid company name',
          code: 'suspicious_value',
        });
      }
    }
    
    // Name validation
    const nameParts = formData.name.trim().split(/\s+/);
    if (nameParts.length < 2) {
      errors.push({
        field: 'name',
        message: 'Please provide both first and last name',
        code: 'incomplete_name',
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      sanitized: {
        ...formData,
        name: DataSanitizer.sanitizeString(formData.name, 100),
        email: formData.email.toLowerCase().trim(),
        company: formData.company ? DataSanitizer.sanitizeString(formData.company, 255) : undefined,
      },
    };
  }
}
```

---

## 7. Audit Logging for CRM Operations

### 7.1 Structured Audit Events

```typescript
interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  level: 'info' | 'warn' | 'error';
  actor: {
    type: 'system' | 'user' | 'webhook';
    id: string;
    ipHash?: string;
  };
  resource: {
    type: 'person' | 'company' | 'note' | 'opportunity' | 'submission';
    id?: string;
  };
  action: {
    type: 'create' | 'update' | 'delete' | 'read' | 'error';
    status: 'success' | 'failure' | 'partial';
  };
  metadata: {
    formType?: string;
    email?: string;
    company?: string;
    [key: string]: any;
  };
  details?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

type AuditEventType = 
  | 'FORM_SUBMITTED'
  | 'CRM_COMPANY_CREATED'
  | 'CRM_PERSON_CREATED'
  | 'CRM_NOTE_CREATED'
  | 'CRM_OPPORTUNITY_CREATED'
  | 'CRM_DUPLICATE_DETECTED'
  | 'CRM_ERROR'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SHEETS_BACKUP'
  | 'N8N_WEBHOOK_SENT';

class AuditLogger {
  constructor(
    private db: DatabaseConnection,
    private logger: Console // Could be Winston, Pino, etc.
  ) {}
  
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    
    // Console output for development
    this.logger.log(`[AUDIT] ${JSON.stringify(auditEntry)}`);
    
    // Database persistence
    try {
      await this.db.query(
        `INSERT INTO audit_log 
         (id, timestamp, event_type, level, actor_type, actor_id, 
          resource_type, resource_id, action_type, action_status, 
          metadata, details, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditEntry.id,
          auditEntry.timestamp,
          auditEntry.eventType,
          auditEntry.level,
          auditEntry.actor.type,
          auditEntry.actor.id,
          auditEntry.resource.type,
          auditEntry.resource.id,
          auditEntry.action.type,
          auditEntry.action.status,
          JSON.stringify(auditEntry.metadata),
          JSON.stringify(auditEntry.details),
          auditEntry.error ? JSON.stringify(auditEntry.error) : null,
        ]
      );
    } catch (dbError) {
      // Fallback to file logging if DB fails
      this.logger.error('[AUDIT] Failed to persist to database:', dbError);
    }
  }
  
  // Convenience methods
  async logFormSubmission(
    formType: string,
    email: string,
    ipHash: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType: 'FORM_SUBMITTED',
      level: 'info',
      actor: { type: 'webhook', id: ipHash, ipHash },
      resource: { type: 'submission' },
      action: { type: 'create', status: 'success' },
      metadata: { formType, email, ...metadata },
    });
  }
  
  async logCRMError(
    operation: string,
    email: string,
    error: Error,
    ipHash: string
  ): Promise<void> {
    await this.log({
      eventType: 'CRM_ERROR',
      level: 'error',
      actor: { type: 'system', id: 'crm-service' },
      resource: { type: operation.includes('company') ? 'company' : 'person' },
      action: { type: 'create', status: 'failure' },
      metadata: { email, operation },
      error: {
        code: error.name,
        message: error.message,
      },
    });
  }
}
```

### 7.2 Audit Log Database Schema

```sql
CREATE TABLE audit_log (
  id VARCHAR(36) PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  level ENUM('info', 'warn', 'error') NOT NULL,
  actor_type VARCHAR(20) NOT NULL,
  actor_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(20) NOT NULL,
  resource_id VARCHAR(100),
  action_type VARCHAR(20) NOT NULL,
  action_status VARCHAR(20) NOT NULL,
  metadata JSON,
  details JSON,
  error JSON,
  
  INDEX idx_timestamp (timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_actor (actor_type, actor_id),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_level_timestamp (level, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Partition by month for large volumes
ALTER TABLE audit_log 
PARTITION BY RANGE (YEAR(timestamp) * 100 + MONTH(timestamp)) (
  PARTITION p202501 VALUES LESS THAN (202502),
  PARTITION p202502 VALUES LESS THAN (202503),
  PARTITION p202503 VALUES LESS THAN (202504),
  PARTITION pfuture VALUES LESS THAN MAXVALUE
);
```

### 7.3 Audit Query Interface

```typescript
interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  actorId?: string;
  resourceId?: string;
  status?: 'success' | 'failure';
  limit?: number;
  offset?: number;
}

class AuditQueryService {
  constructor(private db: DatabaseConnection) {}
  
  async query(params: AuditQuery): Promise<{ events: AuditEvent[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    
    if (params.startDate) {
      conditions.push('timestamp >= ?');
      values.push(params.startDate.toISOString());
    }
    
    if (params.endDate) {
      conditions.push('timestamp <= ?');
      values.push(params.endDate.toISOString());
    }
    
    if (params.eventTypes?.length) {
      conditions.push(`event_type IN (${params.eventTypes.map(() => '?').join(',')})`);
      values.push(...params.eventTypes);
    }
    
    if (params.actorId) {
      conditions.push('actor_id = ?');
      values.push(params.actorId);
    }
    
    if (params.resourceId) {
      conditions.push('resource_id = ?');
      values.push(params.resourceId);
    }
    
    if (params.status) {
      conditions.push('action_status = ?');
      values.push(params.status);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Get total count
    const [countResult] = await this.db.query(
      `SELECT COUNT(*) as total FROM audit_log WHERE ${whereClause}`,
      values
    );
    
    // Get events
    const limit = params.limit || 100;
    const offset = params.offset || 0;
    
    const events = await this.db.query(
      `SELECT * FROM audit_log 
       WHERE ${whereClause}
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    
    return {
      events: events.map(this.mapToAuditEvent),
      total: countResult.total,
    };
  }
  
  async getFailureReport(startDate: Date, endDate: Date): Promise<any> {
    return this.db.query(
      `SELECT 
        event_type,
        COUNT(*) as count,
        COUNT(DISTINCT actor_id) as unique_actors
       FROM audit_log
       WHERE action_status = 'failure'
       AND timestamp BETWEEN ? AND ?
       GROUP BY event_type
       ORDER BY count DESC`,
      [startDate.toISOString(), endDate.toISOString()]
    );
  }
  
  private mapToAuditEvent(row: any): AuditEvent {
    return {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type,
      level: row.level,
      actor: {
        type: row.actor_type,
        id: row.actor_id,
      },
      resource: {
        type: row.resource_type,
        id: row.resource_id,
      },
      action: {
        type: row.action_type,
        status: row.action_status,
      },
      metadata: JSON.parse(row.metadata || '{}'),
      details: JSON.parse(row.details || '{}'),
      error: row.error ? JSON.parse(row.error) : undefined,
    };
  }
}
```

---

## 8. Twenty CRM Deployment on Cloud Run

### 8.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloud Run Services                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐         ┌─────────────┐         ┌───────────┐  │
│  │  zaplit-com │────────▶│    n8n      │────────▶│  Twenty   │  │
│  │  (Next.js)  │         │  Workflow   │         │   CRM     │  │
│  └─────────────┘         └─────────────┘         └───────────┘  │
│         │                       │                      │         │
│         ▼                       ▼                      ▼         │
│  ┌─────────────┐         ┌─────────────┐         ┌───────────┐  │
│  │ Google      │         │  Google     │         │  Cloud    │  │
│  │ Sheets      │         │  Pub/Sub    │         │  SQL      │  │
│  └─────────────┘         └─────────────┘         └───────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Cloud Run Deployment Configuration

```yaml
# twenty-crm-cloud-run.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: twenty-crm
  annotations:
    run.googleapis.com/ingress: all
    run.googleapis.com/execution-environment: gen2
spec:
  template:
    metadata:
      annotations:
        # Scaling configuration
        autoscaling.knative.dev/minScale: "1"  # Keep warm instance
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"  # For background processing
        # Resource allocation
        run.googleapis.com/memory: "2Gi"
        run.googleapis.com/cpu: "2"
    spec:
      containerConcurrency: 100
      timeoutSeconds: 300
      containers:
        - image: twentycrm/twenty:latest
          ports:
            - containerPort: 3000
          env:
            # Database configuration
            - name: PG_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: twenty-db-url
                  key: latest
            # Security
            - name: APP_SECRET
              valueFrom:
                secretKeyRef:
                  name: twenty-app-secret
                  key: latest
            # Storage
            - name: STORAGE_TYPE
              value: "s3"
            - name: STORAGE_S3_REGION
              value: "us-central1"
            # Server URL
            - name: SERVER_URL
              value: "https://crm.yourdomain.com"
          resources:
            limits:
              memory: "2Gi"
              cpu: "2000m"
          startupProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 12
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            periodSeconds: 10
            failureThreshold: 3
```

### 8.3 Terraform Configuration

```hcl
# terraform/twenty-crm.tf

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "vpcaccess.googleapis.com",
  ])
  service = each.value
}

# Cloud SQL for PostgreSQL
resource "google_sql_database_instance" "twenty_db" {
  name             = "twenty-crm-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-custom-2-7680"  # 2 vCPU, 7.5GB RAM
    availability_type = "REGIONAL"           # High availability
    
    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
    }
    
    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "twenty" {
  name     = "twenty"
  instance = google_sql_database_instance.twenty_db.name
}

# Secrets
resource "google_secret_manager_secret" "app_secret" {
  secret_id = "twenty-app-secret"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "app_secret" {
  secret      = google_secret_manager_secret.app_secret.id
  secret_data = random_password.app_secret.result
}

resource "random_password" "app_secret" {
  length  = 64
  special = true
}

# Cloud Run Service
resource "google_cloud_run_service" "twenty_crm" {
  name     = "twenty-crm"
  location = var.region

  template {
    spec {
      container_concurrency = 100
      timeout_seconds       = 300
      
      containers {
        image = "twentycrm/twenty:${var.twenty_version}"
        
        ports {
          container_port = 3000
        }
        
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        
        env {
          name = "APP_SECRET"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.app_secret.secret_id
              key  = "latest"
            }
          }
        }
        
        env {
          name  = "PG_DATABASE_URL"
          value = "postgresql://${google_sql_user.twenty.name}:${google_sql_user.twenty.password}@${google_sql_database_instance.twenty_db.private_ip_address}:5432/${google_sql_database.twenty.name}"
        }
        
        env {
          name  = "SERVER_URL"
          value = "https://${var.crm_domain}"
        }
        
        resources {
          limits = {
            cpu    = "2000m"
            memory = "2Gi"
          }
        }
      }
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = "1"
        "autoscaling.knative.dev/maxScale" = "10"
        "run.googleapis.com/cpu-throttling" = "false"
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.connector.id
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# VPC Connector for private Cloud SQL
resource "google_vpc_access_connector" "connector" {
  name          = "twenty-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = "default"
}

# Domain mapping
resource "google_cloud_run_domain_mapping" "crm_domain" {
  location = var.region
  name     = var.crm_domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.twenty_crm.name
  }
}

# Service account for Cloud Run
resource "google_service_account" "twenty_crm" {
  account_id   = "twenty-crm"
  display_name = "Twenty CRM Service Account"
}

resource "google_project_iam_member" "twenty_secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.twenty_crm.email}"
}

resource "google_project_iam_member" "twenty_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.twenty_crm.email}"
}
```

### 8.4 Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Set to `production` | Yes |
| `APP_SECRET` | Random string for encryption | Yes |
| `PG_DATABASE_URL` | PostgreSQL connection string | Yes |
| `SERVER_URL` | Public URL of the instance | Yes |
| `FRONT_AUTH_CALLBACK_URL` | Frontend auth callback URL | Yes |
| `IS_SIGN_UP_DISABLED` | Disable public signup | Recommended |
| `IS_MULTIWORKSPACE_ENABLED` | Enable multi-workspace mode | Optional |
| `STORAGE_TYPE` | `local` or `s3` | Yes |
| `STORAGE_S3_REGION` | S3 bucket region | If using S3 |
| `STORAGE_S3_NAME` | S3 bucket name | If using S3 |

### 8.5 Health Checks & Monitoring

```typescript
// health-check.ts
import { NextRequest, NextResponse } from 'next/server';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: boolean;
    crm_api: boolean;
    storage: boolean;
  };
  latency: {
    database_ms: number;
    crm_api_ms: number;
  };
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const checks: HealthStatus['checks'] = {
    database: false,
    crm_api: false,
    storage: false,
  };
  const latency: HealthStatus['latency'] = {
    database_ms: 0,
    crm_api_ms: 0,
  };
  
  // Check database
  try {
    const dbStart = Date.now();
    await checkDatabaseConnection();
    checks.database = true;
    latency.database_ms = Date.now() - dbStart;
  } catch (error) {
    console.error('[HEALTH] Database check failed:', error);
  }
  
  // Check CRM API
  try {
    const crmStart = Date.now();
    await checkCRMAPI();
    checks.crm_api = true;
    latency.crm_api_ms = Date.now() - crmStart;
  } catch (error) {
    console.error('[HEALTH] CRM API check failed:', error);
  }
  
  // Determine overall status
  let status: HealthStatus['status'] = 'healthy';
  if (!checks.database || !checks.crm_api) {
    status = 'unhealthy';
  } else if (latency.database_ms > 1000 || latency.crm_api_ms > 2000) {
    status = 'degraded';
  }
  
  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    latency,
  };
  
  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}

async function checkDatabaseConnection(): Promise<void> {
  // Simple query to verify connectivity
  // Implementation depends on your database client
}

async function checkCRMAPI(): Promise<void> {
  const response = await fetch(`${process.env.TWENTY_BASE_URL}/healthz`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.TWENTY_API_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`CRM API returned ${response.status}`);
  }
}
```

### 8.6 Backup & Disaster Recovery

```yaml
# cloud-scheduler-backup.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: twenty-crm-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: gcr.io/cloudsql-docker/gce-proxy:1.33.0
              command:
                - /bin/sh
                - -c
                - |
                  # Export database
                  pg_dump \
                    --host=$DB_HOST \
                    --username=$DB_USER \
                    --dbname=twenty \
                    --format=custom \
                    --file=/backup/twenty-$(date +%Y%m%d).dump
                  
                  # Upload to GCS
                  gsutil cp /backup/twenty-*.dump gs://twenty-crm-backups/
                  
                  # Cleanup old backups (keep 30 days)
                  gsutil ls gs://twenty-crm-backups/ | \
                    head -n -30 | \
                    xargs -I {} gsutil rm {}
              env:
                - name: DB_HOST
                  valueFrom:
                    secretKeyRef:
                      name: twenty-db-host
                      key: latest
                - name: DB_USER
                  value: twenty
              volumeMounts:
                - name: backup
                  mountPath: /backup
          volumes:
            - name: backup
              emptyDir: {}
          restartPolicy: OnFailure
```

---

## 9. Production Checklist

### Pre-deployment

- [ ] API keys created with minimal required permissions
- [ ] Rate limiting configured (100 req/min)
- [ ] Idempotency store provisioned (Redis/Database)
- [ ] Dead letter queue configured
- [ ] Audit logging database created
- [ ] Health check endpoints implemented
- [ ] Circuit breaker configured
- [ ] Error alerting configured

### Security

- [ ] All secrets stored in Secret Manager
- [ ] API keys rotated regularly
- [ ] Webhook secrets verified
- [ ] Input sanitization implemented
- [ ] SQL injection prevention verified
- [ ] XSS prevention in notes/body fields

### Monitoring

- [ ] CRM operation success rate > 99%
- [ ] Average latency < 2s for CRM operations
- [ ] Error rate < 0.1%
- [ ] Dead letter queue monitored
- [ ] Audit log storage capacity monitored

### Disaster Recovery

- [ ] Daily database backups scheduled
- [ ] Backup restoration tested monthly
- [ ] RTO (Recovery Time Objective) documented
- [ ] RPO (Recovery Point Objective) documented
- [ ] Runbooks created for common failures

---

**© 2026 Zaplit. All Rights Reserved.**
