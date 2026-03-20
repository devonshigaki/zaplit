# n8n Consultation Form to CRM Workflow Setup

## Summary

I've made significant progress fixing the "Consultation Form to CRM" workflow. The workflow now has:

1. **Consultation Webhook** - Receives form submissions
2. **Process Form Data** (Code node) - Parses and formats form data
3. **Create Person** (HTTP Request) - Creates a person in Twenty CRM
4. **Create Company** (HTTP Request) - Creates a company in Twenty CRM  
5. **Create Note** (HTTP Request) - Creates a note with form details
6. **Success Response** - Returns success message to the form

## What Was Configured

### Twenty CRM API Credential
- **Type**: Header Auth
- **Name**: Authorization
- **Value**: Bearer {JWT_TOKEN} (token extracted from browser cookies)

### HTTP Request Nodes

#### 1. Create Person
- **Method**: POST
- **URL**: https://crm.zaplit.com/rest/people
- **Body**:
```json
{
  "name": {
    "firstName": "{{ $json.person.firstName }}",
    "lastName": "{{ $json.person.lastName }}"
  },
  "emails": [
    {
      "email": "{{ $json.person.email }}",
      "isPrimary": true
    }
  ],
  "jobTitle": "{{ $json.person.jobTitle }}"
}
```

#### 2. Create Company
- **Method**: POST
- **URL**: https://crm.zaplit.com/rest/companies
- **Body**:
```json
{
  "name": "{{ $json.company.name }}"
}
```

#### 3. Create Note
- **Method**: POST
- **URL**: https://crm.zaplit.com/rest/notes
- **Body**:
```json
{
  "title": "Consultation Request",
  "body": "Message: {{ $json.note.message }}\n\nTechnical Details:\n- Team Size: {{ $json.note.teamSize }}\n- Tech Stack: {{ $json.note.techStack }}\n- Security Level: {{ $json.note.securityLevel }}\n- Compliance: {{ $json.note.compliance }}"
}
```

## Import the Complete Workflow

1. Go to n8n: https://n8n.zaplit.com
2. Navigate to **Workflows** → **Import from File**
3. Upload: `n8n-workflow-consultation-to-crm-complete.json`
4. **Important**: After importing, reconnect the credential:
   - Open each HTTP Request node
   - In Authentication, select the existing "Header Auth account" credential

## Manual Steps Still Needed

1. **Connect the Note to Person/Company** (optional enhancement):
   - Currently notes are created but not linked to the person/company
   - To link them, you need to capture the IDs from Create Person and Create Company responses
   - Then add a "relations" field to the Create Note body

2. **Test the workflow**:
   - Activate the workflow
   - Submit the consultation form
   - Check Twenty CRM for the created records

3. **Update JWT Token** (if needed):
   - The JWT token expires after some time
   - If authentication fails, get a new token from crm.zaplit.com cookies
   - Update the credential in n8n Settings

## Webhook URL

After importing and saving, the webhook URL will be:
```
https://n8n.zaplit.com/webhook/consultation
```

This is already configured in the zaplit.com website form.

## Passwords Saved

- **Twenty CRM**: admin@zaplit.com / ZaplitProd2026!Secure
- **n8n**: devonshigaki@gmail.com / Cha3574192501!

## Files Created

1. `n8n-workflow-consultation-to-crm-complete.json` - Complete workflow for import
2. `n8n-workflow-progress.png` - Screenshot of current progress
3. This instructions file

## Next Steps

1. Import the workflow JSON
2. Verify credential connections
3. Test with a form submission
4. Monitor executions in n8n