# Twenty CRM GraphQL API Examples

Twenty CRM supports both REST and GraphQL APIs. GraphQL is especially useful for:
- Fetching nested/related data in one request
- Batch upserts (create or update)
- Complex filtering
- Reducing over-fetching

## GraphQL Endpoint

- **Cloud:** `https://api.twenty.com/graphql`
- **Self-Hosted:** `https://{your-domain}/graphql`

## Authentication

Same as REST API:
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

---

## Basic Queries

### Get All Companies

```graphql
query {
  companies {
    edges {
      node {
        id
        name
        domainName
        employees
        createdAt
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Get Company with Related People

```graphql
query {
  company(id: "company-uuid-here") {
    id
    name
    domainName
    people {
      edges {
        node {
          id
          name {
            firstName
            lastName
          }
          email
          jobTitle
        }
      }
    }
  }
}
```

### Get Person with Company

```graphql
query {
  person(id: "person-uuid-here") {
    id
    name {
      firstName
      lastName
    }
    email
    phone
    company {
      id
      name
      domainName
    }
  }
}
```

---

## Mutations

### Create Company

```graphql
mutation {
  createCompany(
    data: {
      name: "Acme Corporation"
      domainName: "acme.com"
      employees: 150
    }
  ) {
    id
    name
    domainName
    createdAt
  }
}
```

### Create Person

```graphql
mutation {
  createPerson(
    data: {
      name: {
        firstName: "John"
        lastName: "Doe"
      }
      email: "john@acme.com"
      jobTitle: "VP of Sales"
      companyId: "company-uuid-here"
    }
  ) {
    id
    name {
      firstName
      lastName
    }
    email
    company {
      id
      name
    }
  }
}
```

### Create Note

```graphql
mutation {
  createNote(
    data: {
      title: "Meeting Notes"
      body: "Discussed Q1 roadmap"
      personId: "person-uuid-here"
      companyId: "company-uuid-here"
    }
  ) {
    id
    title
    body
    createdAt
  }
}
```

### Update Company

```graphql
mutation {
  updateCompany(
    id: "company-uuid-here"
    data: {
      employees: 200
      annualRecurringRevenue: {
        amount: 2000000
        currency: "USD"
      }
    }
  ) {
    id
    name
    employees
    annualRecurringRevenue {
      amount
      currency
    }
  }
}
```

---

## Batch Operations (GraphQL Only)

### Batch Create Companies

```graphql
mutation {
  CreateCompanies(
    input: [
      { name: "Company A", domainName: "companya.com" }
      { name: "Company B", domainName: "companyb.com" }
      { name: "Company C", domainName: "companyc.com" }
    ]
  ) {
    id
    name
    domainName
  }
}
```

### Batch Upsert (Create or Update)

```graphql
mutation {
  UpsertCompanies(
    input: [
      { 
        id: "existing-company-id"  # If exists, update; if not, create
        name: "Updated Name"
        domainName: "updated.com"
      }
      {
        name: "New Company"
        domainName: "newcompany.com"
      }
    ]
  ) {
    id
    name
    domainName
  }
}
```

### Batch Create People

```graphql
mutation {
  CreatePeople(
    input: [
      {
        name: { firstName: "Alice", lastName: "Smith" }
        email: "alice@example.com"
      }
      {
        name: { firstName: "Bob", lastName: "Jones" }
        email: "bob@example.com"
      }
    ]
  ) {
    id
    name {
      firstName
      lastName
    }
    email
  }
}
```

---

## Filtering

### Filter Companies

```graphql
query {
  companies(
    filter: {
      employees: { gte: 100 }
      name: { like: "%Acme%" }
    }
  ) {
    edges {
      node {
        id
        name
        employees
      }
    }
  }
}
```

### Filter People by Company

```graphql
query {
  people(
    filter: {
      companyId: { eq: "company-uuid-here" }
    }
  ) {
    edges {
      node {
        id
        name {
          firstName
          lastName
        }
        email
      }
    }
  }
}
```

### Filter by Date Range

```graphql
query {
  companies(
    filter: {
      createdAt: { 
        gte: "2026-01-01T00:00:00Z"
        lte: "2026-12-31T23:59:59Z"
      }
    }
  ) {
    edges {
      node {
        id
        name
        createdAt
      }
    }
  }
}
```

---

## Pagination

### Cursor-based Pagination

```graphql
query {
  companies(first: 10) {
    edges {
      node {
        id
        name
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Get Next Page

```graphql
query {
  companies(first: 10, after: "end-cursor-from-previous") {
    edges {
      node {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

---

## n8n HTTP Request Node with GraphQL

### Credentials
Same as REST - use Header Auth with `Authorization: Bearer TOKEN`

### Configuration

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `https://api.twenty.com/graphql` |
| Authentication | Header Auth |
| Headers | `Content-Type: application/json` |
| Body Content Type | JSON |

### Example: Query Companies

**Body:**
```json
{
  "query": "query { companies { edges { node { id name domainName employees } } } }"
}
```

### Example: Create Company

**Body:**
```json
{
  "query": "mutation CreateCompany($data: CompanyCreateInput!) { createCompany(data: $data) { id name domainName createdAt } }",
  "variables": {
    "data": {
      "name": "Acme Corp",
      "domainName": "acme.com",
      "employees": 150
    }
  }
}
```

### Example with n8n Expressions

**Body:**
```json
{
  "query": "mutation { createPerson(data: { name: { firstName: \"{{ $json.firstName }}\", lastName: \"{{ $json.lastName }}\" }, email: \"{{ $json.email }}\", companyId: \"{{ $json.companyId }}\" }) { id email } }"
}
```

---

## Metadata Queries

### Get All Objects

```graphql
query {
  objects {
    edges {
      node {
        id
        nameSingular
        namePlural
        labelSingular
        labelPlural
        fields {
          edges {
            node {
              id
              name
              type
              label
            }
          }
        }
      }
    }
  }
}
```

### Get Object Schema

```graphql
query {
  object(nameSingular: "company") {
    id
    nameSingular
    namePlural
    fields {
      edges {
        node {
          id
          name
          type
          label
          isNullable
        }
      }
    }
  }
}
```

---

## Error Handling

### GraphQL Error Response

```json
{
  "errors": [
    {
      "message": "Record not found",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": null
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Record doesn't exist |
| `VALIDATION_ERROR` | Invalid field data |
| `UNAUTHENTICATED` | Invalid or missing API key |
| `FORBIDDEN` | Insufficient permissions |
| `INTERNAL_SERVER_ERROR` | Server error |

---

## When to Use GraphQL vs REST

| Use Case | Recommendation |
|----------|----------------|
| Simple CRUD | REST |
| Fetch related data | GraphQL |
| Batch operations | GraphQL |
| Batch upserts | GraphQL (only option) |
| Simple filtering | Either |
| Complex nested queries | GraphQL |
| File uploads | REST |
| Quick prototyping | REST |
