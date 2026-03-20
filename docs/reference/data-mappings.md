# Data Mapping Reference

Complete field mapping specifications for form-to-CRM integration.

## Table of Contents

- [Form Schema](#form-schema)
- [Field Mappings](#field-mappings)
- [Data Transformations](#data-transformations)
- [Entity Creation Order](#entity-creation-order)
- [Note Format Template](#note-format-template)

---

## Form Schema

### Consultation Form Data Structure

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

---

## Field Mappings

### Primary Mapping (Recommended)

| Form Field | CRM Entity | CRM Field | Field Type | Storage Strategy |
|------------|------------|-----------|------------|------------------|
| **name** | Person | `name.firstName`, `name.lastName` | String (split) | Standard Field |
| **email** | Person | `emails.primaryEmail` | String | Standard Field |
| **company** | Company | `name` | String | Standard Field |
| **role** | Person | `jobTitle` | String | Standard Field |
| **teamSize** | Note | `body` (formatted) | String | Note Storage |
| **techStack[]** | Note | `body` (formatted) | Array → String | Note Storage |
| **securityLevel** | Note | `body` (formatted) | String | Note Storage |
| **compliance[]** | Note | `body` (formatted) | Array → String | Note Storage |
| **message** | Note | `body` (formatted) | String | Note Storage |

### Alternative: Custom Fields Mapping

If custom fields are configured in Twenty CRM:

| Form Field | CRM Entity | Custom Field | Type | API Format |
|------------|------------|--------------|------|------------|
| teamSize | Company | `teamSize` | SELECT | `"teamSize": "11-50"` |
| techStack | Person | `techStack` | TEXT | `"techStack": "CRM: Salesforce, Communication: Slack"` |
| securityLevel | Person | `securityLevel` | SELECT | `"securityLevel": "high"` |
| compliance | Person | `compliance` | TEXT | `"compliance": "soc2, gdpr"` |

---

## Data Transformations

### Name Splitting

**Problem:** Full name needs to be split into first and last name.

**Algorithm:**
```javascript
function splitName(fullName) {
  const normalized = fullName?.trim() || 'Unknown';
  const parts = normalized.split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}
```

**Edge Cases:**

| Input | firstName | lastName |
|-------|-----------|----------|
| `"John Smith"` | `John` | `Smith` |
| `"John"` | `John` | `""` |
| `""` | `Unknown` | `""` |
| `"John Michael Smith"` | `John` | `Michael Smith` |
| `"  John   Smith  "` | `John` | `Smith` |
| `"John Smith-Jones"` | `John` | `Smith-Jones` |

**n8n Expression:**
```javascript
firstName: {{ $json.body.data.name.split(' ')[0] }}
lastName: {{ $json.body.data.name.split(' ').slice(1).join(' ') || '' }}
```

### Array to String Conversion

#### Tech Stack

**Input:** `["CRM: Salesforce", "Communication: Slack", "Finance: Stripe"]`

**Note Storage Format:**
```
🛠️ TECH STACK:
• CRM: Salesforce
• Communication: Slack
• Finance: Stripe
```

**n8n Expression:**
```javascript
{{ ($json.body.data.techStack || []).map(t => '• ' + t).join('\n') }}
```

**Custom Field Format:**
```
"CRM: Salesforce, Communication: Slack, Finance: Stripe"
```

#### Compliance

**Input:** `["soc2", "gdpr", "hipaa"]`

**Note Storage Format:**
```
📋 Compliance: SOC 2, GDPR, HIPAA
```

**Label Mapping:**
```javascript
const labelMap = {
  'soc2': 'SOC 2',
  'gdpr': 'GDPR',
  'hipaa': 'HIPAA',
  'iso27001': 'ISO 27001'
};
```

**n8n Expression:**
```javascript
{{ $json.body.data.compliance?.join(', ').toUpperCase() || 'None' }}
```

### Enum Value Normalization

#### Team Size

| Form Value | Normalized Value | Display Value |
|------------|------------------|---------------|
| `"1–10"` | `"1-10"` | `1-10 employees` |
| `"11–50"` | `"11-50"` | `11-50 employees` |
| `"51–200"` | `"51-200"` | `51-200 employees` |
| `"200+"` | `"200+"` | `200+ employees` |

**Note:** Form uses en-dash (–), API uses hyphen (-).

#### Security Level

| Form Value | Normalized Value | Display Value |
|------------|------------------|---------------|
| `"standard"` | `"standard"` | `Standard` |
| `"high"` | `"high"` | `High` |
| `"enterprise"` | `"enterprise"` | `Enterprise` |

### Null/Empty Handling

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

---

## Entity Creation Order

### Recommended Sequence

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

### Rationale

**Why Create Person First?**
- Email is the primary unique identifier
- Easier to check for duplicates early
- Person can exist without a company

**Why Create Company Second?**
- Company name is less strictly unique
- Multiple people can share a company
- Need companyId before linking

**Why Link Before Creating Note?**
- Ensures relationship integrity
- Note can reference both IDs
- Cleaner rollback if linking fails

---

## Note Format Template

### Standard Note Format

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

### n8n Code Node Implementation

```javascript
// Parse form data
const input = $input.first().json.body;

// Name splitting
const nameParts = input.data.name?.trim().split(/\s+/) || ['Unknown'];
const firstName = nameParts[0];
const lastName = nameParts.slice(1).join(' ') || '';

// Array formatting
const techStack = Array.isArray(input.data.techStack) 
  ? input.data.techStack.join(', ') 
  : input.data.techStack || 'None specified';
  
const compliance = Array.isArray(input.data.compliance) 
  ? input.data.compliance.join(', ').toUpperCase() 
  : 'None';

// Build note body
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

---

## Storage Strategy Comparison

### Custom Fields vs Note Storage

| Factor | Custom Fields | Note Storage | Recommendation |
|--------|---------------|--------------|----------------|
| **Setup Complexity** | High - Requires pre-configuration | Low - Zero setup | Note Storage ✓ |
| **API Complexity** | High - Must reference field IDs | Low - Simple string body | Note Storage ✓ |
| **Flexibility** | Low - Fixed schema | High - Completely flexible | Note Storage ✓ |
| **Visibility** | Medium - Scattered fields | High - Consolidated timeline | Note Storage ✓ |
| **Searchability** | Medium - Field-by-field | High - Full-text search | Note Storage ✓ |
| **Reporting** | High - Can filter/sort | Low - Text extraction | Custom Fields ✓ |
| **Data Export** | High - Structured data | Medium - Requires parsing | Custom Fields ✓ |
| **Future-proofing** | Low - Schema changes break | High - Schema-independent | Note Storage ✓ |

### Recommended Hybrid Approach

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
- `Company.teamSize` (SELECT type)
- `Person.securityLevel` (SELECT type)

---

## Data Quality Considerations

### Validation Requirements

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

### Sanitization

```javascript
function sanitizeInput(input) {
  return input
    .trim()                           // Remove whitespace
    .replace(/[<>]/g, '')             // Basic XSS prevention
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // Remove control chars
    .slice(0, 1000);                  // Limit length
}
```

### Compliance Value Validation

```javascript
const VALID_COMPLIANCE_VALUES = ['soc2', 'gdpr', 'hipaa', 'iso27001'];

function validateCompliance(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(v => v.toLowerCase().trim())
    .filter(v => VALID_COMPLIANCE_VALUES.includes(v));
}
```

---

## Related Documentation

- [n8n-integration.md](n8n-integration.md) - Workflow configuration
- [twenty-crm-api.md](twenty-crm-api.md) - API endpoints
- [troubleshooting.md](troubleshooting.md) - Common issues
