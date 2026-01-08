# @payloadcms/plugin-hubspot

HubSpot lead capture plugin for Praxis CMS. Capture leads from your website forms and automatically sync them to HubSpot CRM.

## Features

- Capture leads from frontend forms via REST API
- Automatic sync to HubSpot CRM
- Local lead storage for backup and reporting
- UTM parameter tracking
- Custom field mapping to HubSpot properties
- Rate limiting and spam protection (honeypot)
- CORS support for cross-origin requests
- Bulk sync for pending/failed leads
- Connection status monitoring

## Installation

```bash
pnpm add @payloadcms/plugin-hubspot
```

## Setup

### 1. Get a HubSpot Access Token

1. Go to your HubSpot account settings
2. Navigate to Integrations > Private Apps
3. Create a new private app with the following scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.lists.read`
   - `crm.lists.write` (if using list features)
4. Copy the access token

### 2. Configure the Plugin

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { hubspotPlugin } from '@payloadcms/plugin-hubspot'

export default buildConfig({
  plugins: [
    hubspotPlugin({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN!,

      // Optional: HubSpot portal ID
      portalId: process.env.HUBSPOT_PORTAL_ID,

      // Optional: Default lifecycle stage for new contacts
      defaultLifecycleStage: 'lead',

      // Optional: Add contacts to specific HubSpot lists
      listIds: [123, 456],

      // Optional: Custom property mappings
      propertyMappings: [
        { formField: 'industry', hubspotProperty: 'industry' },
        { formField: 'company_size', hubspotProperty: 'numberofemployees' },
      ],

      // Optional: Callback when a lead is captured
      onLeadCaptured: async ({ lead, hubspotId, req }) => {
        console.log(`Lead captured: ${lead.email}`)
      },
    }),
  ],
})
```

## Configuration Options

| Option                  | Type       | Default                 | Description                               |
| ----------------------- | ---------- | ----------------------- | ----------------------------------------- |
| `accessToken`           | `string`   | Required                | HubSpot Private App access token          |
| `portalId`              | `string`   | -                       | HubSpot portal ID (optional)              |
| `enabled`               | `boolean`  | `true`                  | Enable/disable the plugin                 |
| `collectionSlug`        | `string`   | `'hubspot-leads'`       | Collection slug for local lead storage    |
| `basePath`              | `string`   | `'/api/hubspot'`        | Base path for API endpoints               |
| `storeLocally`          | `boolean`  | `true`                  | Store leads locally before syncing        |
| `syncImmediately`       | `boolean`  | `true`                  | Sync to HubSpot immediately on submission |
| `propertyMappings`      | `array`    | -                       | Custom field-to-property mappings         |
| `defaultLifecycleStage` | `string`   | `'lead'`                | Default lifecycle stage                   |
| `defaultLeadStatus`     | `string`   | -                       | Default lead status                       |
| `listIds`               | `number[]` | -                       | HubSpot list IDs to add contacts to       |
| `updateExisting`        | `boolean`  | `true`                  | Update existing contacts by email         |
| `captureUtmParams`      | `boolean`  | `true`                  | Capture UTM parameters                    |
| `capturePageMetadata`   | `boolean`  | `true`                  | Capture page URL and referrer             |
| `allowedOrigins`        | `string[]` | `[]`                    | CORS allowed origins (empty = all)        |
| `rateLimit`             | `number`   | `60`                    | Max requests per minute per IP            |
| `honeypotField`         | `string`   | `'website_url_confirm'` | Honeypot field name for spam protection   |
| `requiredFields`        | `string[]` | `['email']`             | Required fields for submission            |
| `validateLead`          | `function` | -                       | Custom validation function                |
| `onLeadCaptured`        | `function` | -                       | Callback after lead capture               |
| `onSyncFailed`          | `function` | -                       | Callback when sync fails                  |

## API Endpoints

### Submit a Lead

```
POST /api/hubspot/submit
```

Submit a new lead from a frontend form.

**Request Body:**

```json
{
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "company": "Acme Inc",
  "jobTitle": "CEO",
  "message": "Interested in your product",
  "source": "contact-form",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "brand"
}
```

**Response:**

```json
{
  "success": true,
  "leadId": "abc123",
  "hubspotId": "12345678"
}
```

### Sync a Single Lead

```
POST /api/hubspot/sync/:id
```

Manually sync a specific lead to HubSpot. Requires authentication.

### Sync All Pending Leads

```
POST /api/hubspot/sync-all
```

Sync all pending and failed leads to HubSpot. Requires authentication.

### Check Connection Status

```
GET /api/hubspot/status
```

Check HubSpot connection status. Requires authentication.

### Get Statistics

```
GET /api/hubspot/stats
```

Get lead capture statistics. Requires authentication.

## Frontend Integration

### React Example

```tsx
async function submitLead(formData: FormData) {
  const response = await fetch('/api/hubspot/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: formData.get('email'),
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      company: formData.get('company'),
      message: formData.get('message'),
      source: 'contact-form',
      pageUrl: window.location.href,
      referrer: document.referrer,
      // Include UTM params from URL
      ...getUtmParams(),
    }),
  })

  const result = await response.json()

  if (result.success) {
    // Handle success
  } else {
    // Handle error
  }
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search)
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmTerm: params.get('utm_term') || undefined,
    utmContent: params.get('utm_content') || undefined,
  }
}
```

### Spam Protection

The plugin includes a honeypot field for spam protection. Add a hidden field to your form:

```html
<input
  type="text"
  name="website_url_confirm"
  style="display: none;"
  tabindex="-1"
  autocomplete="off"
/>
```

Submissions with this field filled will be silently rejected.

## Custom Property Mappings

Map custom form fields to HubSpot properties:

```ts
hubspotPlugin({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN!,
  propertyMappings: [
    { formField: 'industry', hubspotProperty: 'industry' },
    { formField: 'employees', hubspotProperty: 'numberofemployees' },
    {
      formField: 'budget',
      hubspotProperty: 'budget_range',
      transform: (value) => String(value).toUpperCase(),
    },
  ],
})
```

## Accessing the HubSpot Client

You can access the HubSpot client directly for custom operations:

```ts
import { getHubSpotClient } from '@payloadcms/plugin-hubspot'

const client = getHubSpotClient()

if (client) {
  // Search for contacts
  const results = await client.searchContacts({
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'company',
            operator: 'EQ',
            value: 'Acme Inc',
          },
        ],
      },
    ],
    properties: ['email', 'firstname', 'lastname'],
  })

  // Create or update a contact
  const { contact, isNew } = await client.upsertContact('john@example.com', {
    firstname: 'John',
    lastname: 'Doe',
    company: 'Acme Inc',
  })
}
```

## License

MIT
