# Consultation Form to Twenty CRM Data Mapping Specification

## Executive Summary

This document provides a comprehensive data mapping specification for integrating the Zaplit consultation form with Twenty CRM. It covers field mappings, transformation logic, entity relationships, and data quality considerations.

**Last Updated:** 2026-03-19  
**Form Version:** 1.0  
**CRM Version:** Twenty CRM (self-hosted)  

---

## 1. Data Mapping Analysis

### 1.1 Form Schema Overview

```typescript
interface ConsultationFormData {
  name: string;                    // Required, min 2 chars
  email: string;                   // Required, valid email format
  company: string;                 // Required, min 2 chars
  role: string;                    // Required, min 2 chars (job title)
  teamSize: "1–10" | "11–50" | "51–200" | "200+";  // Required enum
  techStack?: string[];            // Optional array of tech selections
  securityLevel?: "standard" | "high" | "enterprise";  // Optional enum
  compliance?: string[];           // Optional array: soc2, gdpr, hipaa, iso27001
  message?: string;                // Optional free text
  website?: string;                // Honeypot field (anti-bot)
}
```

### 1.2 Field-by-Field Mapping Table

| Form Field | CRM Entity | CRM Field | Field Type | Storage Strategy | Notes |
|------------|------------|-----------|------------|------------------|-------|
| **name** | Person | `name.firstName`, `name.lastName` | String (split) | Standard Field | Requires name splitting algorithm |
| **email** | Person | `emails.primaryEmail` | String | Standard Field | Primary identifier, must be unique |
| **company** | Company | `name` | String | Standard Field | Company name, not necessarily unique |
| **role** | Person | `jobTitle` | String | Standard Field | Maps directly to job title |
| **teamSize** | Note | `body` (formatted) | String | Note Storage | Stored as "Team Size: {value}" |
| **techStack[]** | Note | `body` (formatted) | Array → String | Note Storage | Formatted as bullet list |
| **securityLevel** | Note | `body` (formatted) | String | Note Storage | Stored as "Security Level: {value}" |
| **compliance[]** | Note | `body` (formatted) | Array → String | Note Storage | Joined with commas, uppercased |
| **message** | Note | `body` (formatted) | String | Note Storage | Main content section |

### 1.3 Alternative: Custom Fields Mapping

If custom fields are configured in Twenty CRM:

| Form Field | CRM Entity | Custom Field | Type | API Format |
|------------|------------|--------------|------|------------|
| teamSize | Company | `teamSize` | SELECT | `"teamSize": "11-50"` |
| techStack | Person | `techStack` | TEXT | `"techStack": "CRM: Salesforce, Communication: Slack"` |
| securityLevel | Person | `securityLevel` | SELECT | `"securityLevel": "high"` |
| compliance | Person | `compliance` | TEXT | `"compliance": "soc2, gdpr"` |

---

## 2. Field Transformation Requirements

### 2.1 Name Splitting Algorithm

**Problem:** Full name needs to be split into first and last name for Twenty CRM's structured name field.

**Algorithm:**

```javascript
function splitName(fullName) {
  // Normalize input
  const normalized = fullName.trim();
  
  // Edge case: Empty or single character
  if (!normalized || normalized.length < 2) {
    return { firstName: normalized || 'Unknown', lastName: '' };
  }
  
  // Split on whitespace
  const parts = normalized.split(/\s+/);
  
  // Edge case: Single name (mononym)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  // Standard case: First name + rest as last name
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  
  return { firstName, lastName };
}
```

**Edge Cases Handled:**

| Input | firstName | lastName | Reason |
|-------|-----------|----------|--------|
| `"John Smith"` | `John` | `Smith` | Standard case |
| `"John"` | `John` | `""` | Mononym (single name) |
| `""` | `Unknown` | `""` | Empty input |
| `"John Michael Smith"` | `John` | `Michael Smith` | Multiple middle names |
| `"  John   Smith  "` | `John` | `Smith` | Extra whitespace |
| `"John Smith-Jones"` | `John` | `Smith-Jones` | Hyphenated last name |
| `"Dr. John Smith"` | `Dr.` | `John Smith` | Title becomes first name (limitation) |

**Recommendation:** For better handling of titles, prefixes, and suffixes, consider using a library like `humanparser` or maintaining a lookup table of common titles.

### 2.2 Array to String Conversion

#### Tech Stack Transformation

**Input:** `["CRM: Salesforce", "Communication: Slack", "Finance: Stripe"]`

**Note Storage Format:**
```
🛠️ TECH STACK:
• CRM: Salesforce
• Communication: Slack
• Finance: Stripe
```

**Custom Field Format (if used):**
```
"CRM: Salesforce, Communication: Slack, Finance: Stripe"
```

**Implementation:**
```javascript
function formatTechStack(techStack) {
  if (!Array.isArray(techStack) || techStack.length === 0) {
    return 'None specified';
  }
  return techStack.map(item => `• ${item}`).join('\n');
}

function formatTechStackForCustomField(techStack) {
  if (!Array.isArray(techStack) || techStack.length === 0) {
    return '';
  }
  return techStack.join(', ');
}
```

#### Compliance Transformation

**Input:** `["soc2", "gdpr", "hipaa"]`

**Note Storage Format:**
```
📋 Compliance: SOC 2, GDPR, HIPAA
```

**Custom Field Format (if used):**
```
"soc2, gdpr, hipaa"
```

**Implementation:**
```javascript
function formatCompliance(compliance) {
  if (!Array.isArray(compliance) || compliance.length === 0) {
    return 'None';
  }
  // Map to uppercase labels
  const labelMap = {
    'soc2': 'SOC 2',
    'gdpr': 'GDPR',
    'hipaa': 'HIPAA',
    'iso27001': 'ISO 27001'
  };
  return compliance.map(c => labelMap[c] || c.toUpperCase()).join(', ');
}
```

### 2.3 Null/Empty Handling

| Form Field | Empty Value Handling | Default Value |
|------------|---------------------|---------------|
| `name` | Validation error (required) | N/A |
| `email` | Validation error (required) | N/A |
| `company` | Validation error (required) | N/A |
| `role` | Validation error (required) | N/A |
| `teamSize` | Validation error (required) | N/A |
| `techStack` | Empty array `[]` | `"None specified"` in note |
| `securityLevel` | `undefined` | `"Standard"` (implied) |
| `compliance` | Empty array `[]` | `"None"` in note |
| `message` | `undefined` or `""` | `"No additional message provided"` |
| `website` | Honeypot - silently drop | N/A |

### 2.4 Enum Value Normalization

**Team Size Mapping:**

| Form Value | Normalized Value | Display Value |
|------------|------------------|---------------|
| `"1–10"` | `"1-10"` | `1-10 employees` |
| `"11–50"` | `"11-50"` | `11-50 employees` |
| `"51–200"` | `"51-200"` | `51-200 employees` |
| `"200+"` | `"200+"` | `200+ employees` |

**Security Level Mapping:**

| Form Value | Normalized Value | Display Value |
|------------|------------------|---------------|
| `"standard"` | `"standard"` | `Standard` |
| `"high"` | `"high"` | `High` |
| `"enterprise"` | `"enterprise"` | `Enterprise` |

**Note:** Team size uses an en-dash (–) in the form but should be normalized to hyphen (-) for API compatibility.

---

## 3. Entity Creation Order

### 3.1 Recommended Creation Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│                     ENTITY CREATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CREATE PERSON                                               │
│     ├─ Input: firstName, lastName, email, jobTitle             │
│     ├─ Output: personId                                         │
│     └─ Error Handling: Duplicate email → Update existing       │
│                                                                 │
│  2. CREATE COMPANY                                              │
│     ├─ Input: name                                              │
│     ├─ Output: companyId                                        │
│     └─ Error Handling: Duplicate name → Use existing           │
│                                                                 │
│  3. LINK PERSON TO COMPANY                                      │
│     ├─ Input: personId, companyId                               │
│     ├─ Method: PATCH /people/{personId}                        │
│     └─ Error Handling: Log error, entities exist but unlinked  │
│                                                                 │
│  4. CREATE NOTE                                                 │
│     ├─ Input: All form data + personId + companyId             │
│     ├─ Output: noteId                                           │
│     └─ Relations: Attached to both Person and Company          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Rationale for Creation Order

**Why Create Person First?**
- Email is the primary unique identifier
- Easier to check for duplicates early
- Person can exist without a company (orphaned contacts)

**Why Create Company Second?**
- Company name is less strictly unique
- Multiple people can share a company
- Need companyId before linking

**Why Link Before Creating Note?**
- Ensures relationship integrity
- Note can reference both IDs
- Cleaner rollback if linking fails

### 3.3 Duplicate Detection Strategy

#### Person Duplicate Detection (by Email)

```javascript
// Strategy: Check before create, update if exists
async function createOrUpdatePerson(personData) {
  try {
    // Attempt create
    const response = await api.post('/people', personData);
    return { id: response.data.id, action: 'created' };
  } catch (error) {
    if (error.status === 409 || error.message.includes('already exists')) {
      // Find existing person by email
      const existing = await api.get(`/people?filter=email eq '${personData.email}'`);
      const personId = existing.data[0].id;
      
      // Update with new information (merge strategy)
      await api.patch(`/people/${personId}`, {
        jobTitle: personData.jobTitle || existing.data[0].jobTitle
      });
      
      return { id: personId, action: 'updated' };
    }
    throw error;
  }
}
```

#### Company Duplicate Detection (by Name)

```javascript
// Strategy: Search first, create only if not found
async function findOrCreateCompany(companyName) {
  // Search for existing company (case-insensitive)
  const search = await api.get(`/companies?filter=name eq '${companyName}'`);
  
  if (search.data && search.data.length > 0) {
    return { id: search.data[0].id, action: 'existing' };
  }
  
  // Create new company
  const response = await api.post('/companies', { name: companyName });
  return { id: response.data.id, action: 'created' };
}
```

### 3.4 Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────┐
│     Person      │         │     Company     │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │◄────────│ id (PK)         │
│ firstName       │    ┌────│ name            │
│ lastName        │    │    │ domainName      │
│ emails[]        │    │    └─────────────────┘
│ jobTitle        │    │
│ companyId (FK) ─┼────┘
└─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│      Note       │
├─────────────────┤
│ id (PK)         │
│ title           │
│ body            │
│ personId (FK)   │
│ companyId (FK)  │
└─────────────────┘
```

---

## 4. Custom Fields vs Note Storage Analysis

### 4.1 Comparison Matrix

| Factor | Custom Fields | Note Storage | Recommendation |
|--------|---------------|--------------|----------------|
| **Setup Complexity** | High - Requires pre-configuration in CRM UI | Low - Zero setup | Note Storage ✓ |
| **API Complexity** | High - Must reference field IDs/keys | Low - Simple string body | Note Storage ✓ |
| **Flexibility** | Low - Fixed schema, requires migration to change | High - Completely flexible | Note Storage ✓ |
| **Visibility** | Medium - Scattered across entity fields | High - Consolidated timeline view | Note Storage ✓ |
| **Searchability** | Medium - Field-by-field search | High - Full-text search available | Note Storage ✓ |
| **Reporting** | High - Can filter/sort by field values | Low - Text extraction required | Custom Fields ✓ |
| **Data Export** | High - Structured data | Medium - Requires parsing | Custom Fields ✓ |
| **Future-proofing** | Low - Schema changes break integrations | High - Schema-independent | Note Storage ✓ |
| **Performance** | High - Indexed fields | Low - Full-text search | Custom Fields ✓ |

### 4.2 Detailed Analysis

#### When to Use Custom Fields

**Pros:**
- Native filtering and sorting in CRM UI
- Can create views based on field values
- Structured data for exports and integrations
- Type validation enforced by CRM
- Better for automated workflows/triggers

**Cons:**
- Requires manual setup in Twenty CRM Settings → Data Model
- Schema changes require migration
- API calls must reference correct field keys
- Limited field types available
- Adds complexity to integration maintenance

**Best For:**
- Fields that need to be filtered/sorted regularly
- Data that feeds into automated workflows
- Long-term stable fields
- Fields used in reporting

#### When to Use Note Storage

**Pros:**
- Zero setup required
- Completely flexible format
- Human-readable in CRM timeline
- Full-text search available
- Schema-independent (won't break with changes)
- Easy to modify format without migration

**Cons:**
- Not filterable/sortable by content
- Requires text parsing for structured data extraction
- Less structured for programmatic access
- Can become cluttered if overused

**Best For:**
- One-time capture data (form submissions)
- Free-form content (messages)
- Data that doesn't need filtering
- Rapid prototyping and MVP

### 4.3 Hybrid Approach Recommendation

For the consultation form integration, a **hybrid approach** is recommended:

**Store as Standard Fields (Required):**
- `name` → Person.firstName, Person.lastName
- `email` → Person.emails.primaryEmail
- `company` → Company.name
- `role` → Person.jobTitle

**Store in Note Body (Recommended):**
- `teamSize`
- `techStack[]`
- `securityLevel`
- `compliance[]`
- `message`

**Optional Custom Fields (Future Enhancement):**
If reporting requirements emerge, consider creating:
- `Company.teamSize` (SELECT type)
- `Person.securityLevel` (SELECT type)

### 4.4 Note Format Template

```markdown
📋 CONSULTATION REQUEST

👤 Contact: {firstName} {lastName}
📧 Email: {email}
🏢 Company: {company}
💼 Role: {role}
👥 Team Size: {teamSize}
🔒 Security Level: {securityLevel}
📋 Compliance: {compliance}

🛠️ TECH STACK:
• {techStack[0]}
• {techStack[1]}
• ...

💬 MESSAGE:
{message}

---
Submitted: {timestamp}
Source: zaplit.com/consultation
```

---

## 5. Data Quality Considerations

### 5.1 Email Validation

#### Client-Side Validation (Zod Schema)
```typescript
const emailSchema = z.string()
  .email("Valid email required")
  .min(5, "Email too short")
  .max(254, "Email too long");  // RFC 5321 limit
```

#### Server-Side Validation
```typescript
function validateEmail(email: string): { valid: boolean; error?: string } {
  // RFC 5322 compliant regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Invalid email format" };
  }
  
  // Check for disposable email domains
  const disposableDomains = new Set([
    'tempmail.com', 'throwaway.com', 'mailinator.com',
    'guerrillamail.com', 'yopmail.com', 'fakeemail.com'
  ]);
  
  const domain = email.split('@')[1]?.toLowerCase();
  if (disposableDomains.has(domain)) {
    return { valid: false, error: "Disposable email addresses are not allowed" };
  }
  
  // MX record validation (optional, async)
  // const hasMX = await checkMXRecord(domain);
  
  return { valid: true };
}
```

### 5.2 Required Field Validation

| Field | Required | Validation Rule | Error Message |
|-------|----------|-----------------|---------------|
| `name` | Yes | `length >= 2` | "Name is required" |
| `email` | Yes | Valid email format | "Valid email required" |
| `company` | Yes | `length >= 2` | "Company is required" |
| `role` | Yes | `length >= 2` | "Role is required" |
| `teamSize` | Yes | Enum match | "Team size is required" |
| `techStack` | No | Array of strings | N/A |
| `securityLevel` | No | Enum match | N/A |
| `compliance` | No | Array of valid values | N/A |
| `message` | No | Any string | N/A |

### 5.3 Sanitization Requirements

#### Input Sanitization
```typescript
function sanitizeInput(input: string): string {
  return input
    .trim()                           // Remove leading/trailing whitespace
    .replace(/[<>]/g, '')             // Basic XSS prevention
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // Remove control chars
    .slice(0, 1000);                  // Limit length
}
```

#### Output Encoding (for Note Body)
```javascript
function escapeForNote(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')     // Escape backslashes
    .replace(/"/g, '\\"')       // Escape quotes for JSON
    .replace(/\n/g, '\\n')      // Normalize newlines
    .replace(/\r/g, '');        // Remove carriage returns
}
```

### 5.4 Data Type Validation Matrix

| Field | Expected Type | Validation | Coercion |
|-------|--------------|------------|----------|
| `name` | String | Non-empty, trimmed | N/A |
| `email` | String | Valid format, domain check | Lowercase |
| `company` | String | Non-empty, trimmed | N/A |
| `role` | String | Non-empty, trimmed | N/A |
| `teamSize` | Enum | One of 4 values | N/A |
| `techStack` | String[] | Array of strings | Filter empty |
| `securityLevel` | Enum | One of 3 values | N/A |
| `compliance` | String[] | Valid compliance values | Filter invalid |
| `message` | String | Any text | Trim, limit length |

### 5.5 Compliance Value Validation

```typescript
const VALID_COMPLIANCE_VALUES = ['soc2', 'gdpr', 'hipaa', 'iso27001'];

function validateCompliance(values: string[]): string[] {
  if (!Array.isArray(values)) return [];
  
  return values
    .map(v => v.toLowerCase().trim())
    .filter(v => VALID_COMPLIANCE_VALUES.includes(v));
}
```

### 5.6 Data Quality Scorecard

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email validity rate | >99% | Valid format + non-disposable |
| Required field completion | 100% | Form validation enforces |
| Name split accuracy | >95% | Manual spot-checks |
| Duplicate person rate | <5% | Same email submissions |
| Duplicate company rate | <20% | Same company name, different formatting |
| Data sanitization coverage | 100% | All text fields processed |

---

## 6. Error Handling Specification

### 6.1 CRM API Error Responses

| Step | Error Type | Response Code | Action |
|------|-----------|---------------|--------|
| Create Person | Duplicate email | 409 | Update existing, continue |
| Create Person | Invalid email | 400 | Log error, return 400 |
| Create Person | Rate limit | 429 | Retry with backoff |
| Create Company | Duplicate name | 409 | Use existing, continue |
| Create Company | Invalid name | 400 | Log error, skip company |
| Link Person | Invalid IDs | 404 | Log error, entities unlinked |
| Create Note | Invalid relations | 400 | Create note without relations |

### 6.2 Fallback Strategies

```javascript
// Fallback cascade for person creation
async function createPersonWithFallback(personData) {
  try {
    return await api.post('/people', personData);
  } catch (error) {
    if (error.code === 'DUPLICATE_EMAIL') {
      // Fallback 1: Update existing
      return await updateExistingPerson(personData);
    }
    if (error.code === 'RATE_LIMIT') {
      // Fallback 2: Queue for retry
      await queueForRetry('createPerson', personData);
      return { queued: true };
    }
    // Fallback 3: Log and alert
    await alertAdmin('Person creation failed', error);
    throw error;
  }
}
```

---

## 7. Implementation Checklist

### 7.1 Pre-Implementation

- [ ] Review and approve data mapping specification
- [ ] Decide on custom fields vs note storage approach
- [ ] Configure custom fields in Twenty CRM (if applicable)
- [ ] Set up API credentials and test connectivity
- [ ] Create error handling and monitoring plan

### 7.2 Implementation

- [ ] Implement name splitting algorithm
- [ ] Implement array-to-string transformations
- [ ] Build entity creation sequence
- [ ] Add duplicate detection logic
- [ ] Implement error handling and fallbacks
- [ ] Add data sanitization
- [ ] Create note formatting template

### 7.3 Testing

- [ ] Test with all edge cases from Section 2.1
- [ ] Test duplicate person handling
- [ ] Test duplicate company handling
- [ ] Test with empty optional fields
- [ ] Test with maximum length inputs
- [ ] Test error scenarios and fallbacks
- [ ] Verify data quality in CRM

### 7.4 Post-Implementation

- [ ] Set up monitoring for data quality metrics
- [ ] Document any deviations from specification
- [ ] Create runbook for common issues
- [ ] Schedule periodic data quality audits

---

## 8. Appendix

### 8.1 Complete n8n Code Node

```javascript
// Parse form data and prepare for CRM
const input = $input.first().json.body;

// Name splitting with edge case handling
const nameParts = input.data.name?.trim().split(/\s+/) || ['Unknown'];
const firstName = nameParts[0];
const lastName = nameParts.slice(1).join(' ') || '';

// Array field formatting
const techStack = Array.isArray(input.data.techStack) 
  ? input.data.techStack.join(', ') 
  : input.data.techStack || 'None specified';
  
const compliance = Array.isArray(input.data.compliance) 
  ? input.data.compliance.join(', ').toUpperCase() 
  : 'None';

// Build formatted note body
const noteBody = `📋 CONSULTATION REQUEST

👤 Contact: ${firstName} ${lastName}
📧 Email: ${input.data.email}
🏢 Company: ${input.data.company}
💼 Role: ${input.data.role}
👥 Team Size: ${input.data.teamSize}
🔒 Security Level: ${input.data.securityLevel || 'Standard'}
📋 Compliance: ${compliance}

🛠️ TECH STACK:
${Array.isArray(input.data.techStack) 
  ? input.data.techStack.map(t => `• ${t}`).join('\n') 
  : '• None specified'}

💬 MESSAGE:
${input.data.message || 'No additional message provided'}

---
Submitted: ${new Date().toISOString()}
Source: zaplit.com/consultation`;

return [{
  json: {
    person: {
      firstName,
      lastName,
      email: input.data.email,
      jobTitle: input.data.role
    },
    company: {
      name: input.data.company
    },
    note: {
      title: `Consultation Request - ${firstName} ${lastName}`,
      body: noteBody
    }
  }
}];
```

### 8.2 Glossary

| Term | Definition |
|------|------------|
| **CRM** | Customer Relationship Management system (Twenty CRM) |
| **Entity** | A record type in the CRM (Person, Company, Note) |
| **Custom Field** | User-defined field added to a standard entity |
| **Note** | A free-form text entry attached to an entity |
| **Honeypot** | Hidden field to detect bot submissions |
| **En-dash** | Unicode character '–' (U+2013) |
| **Mononym** | A person known by a single name |
| **Foreign Key (FK)** | A field that references another entity's primary key |

---

*End of Document*
