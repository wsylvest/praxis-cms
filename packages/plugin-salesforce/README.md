# @praxiscms/plugin-salesforce

Salesforce lead capture integration plugin for Praxis CMS.

## Features

- Automatic lead synchronization to Salesforce
- OAuth 2.0 authentication (password flow and refresh token)
- Configurable field mappings
- Sync status tracking and error logging
- Automatic retry for failed syncs
- Custom callbacks for sync lifecycle

## Installation

```bash
pnpm add @praxiscms/plugin-salesforce
```

## Configuration

### Salesforce Connected App Setup

1. Log in to Salesforce Setup
2. Navigate to **Apps > App Manager**
3. Click **New Connected App**
4. Configure the app:
   - Enable OAuth Settings
   - Add **Full access (full)** or **Manage user data via APIs (api)** scope
   - Set callback URL (can be any URL for password flow)
5. Note the **Consumer Key** and **Consumer Secret**

### Plugin Configuration

```typescript
import { buildConfig } from 'praxis'
import { salesforcePlugin } from '@praxiscms/plugin-salesforce'

export default buildConfig({
  plugins: [
    salesforcePlugin({
      credentials: {
        clientId: process.env.SF_CLIENT_ID!,
        clientSecret: process.env.SF_CLIENT_SECRET!,
        username: process.env.SF_USERNAME!,
        password: process.env.SF_PASSWORD!, // password + security token
        // Optional: use sandbox
        // loginUrl: 'https://test.salesforce.com',
      },

      // Optional configuration
      defaultLeadSource: 'Website',
      syncOnCreate: true, // default: true
      syncOnUpdate: false, // default: false
      maxRetryAttempts: 3, // default: 3
      retryDelay: 5000, // default: 5000ms

      // Custom collection slugs
      leadsCollectionSlug: 'leads',
      syncLogsCollectionSlug: 'salesforce-sync-logs',
    }),
  ],
})
```

## Environment Variables

```env
SF_CLIENT_ID=your_consumer_key
SF_CLIENT_SECRET=your_consumer_secret
SF_USERNAME=your_salesforce_username
SF_PASSWORD=your_password_plus_security_token
```

## Usage

### Creating Leads

Leads are automatically synced to Salesforce when created through the admin panel or API:

```typescript
import { getPayload } from 'praxis'
import config from '@payload-config'

const payload = await getPayload({ config })

await payload.create({
  collection: 'leads',
  data: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    company: 'Acme Corp',
    phone: '+1-555-123-4567',
    leadSource: 'Website Contact Form',
  },
})
```

### Custom Field Mappings

Map Praxis fields to Salesforce Lead fields:

```typescript
salesforcePlugin({
  credentials: {
    /* ... */
  },
  fieldMappings: [
    { source: 'firstName', target: 'FirstName' },
    { source: 'lastName', target: 'LastName' },
    { source: 'email', target: 'Email' },
    { source: 'company', target: 'Company' },
    { source: 'customField', target: 'Custom_Field__c' },
    {
      source: 'revenue',
      target: 'AnnualRevenue',
      transform: (value) => Number(value) * 100, // Convert to cents
    },
  ],
})
```

### Lifecycle Callbacks

```typescript
salesforcePlugin({
  credentials: {
    /* ... */
  },

  // Called before syncing - return null to skip
  beforeSync: async (lead) => {
    if (!lead.email) {
      return null // Skip leads without email
    }
    return lead
  },

  // Called after successful sync
  afterSync: async (lead, salesforceId) => {
    console.log(`Lead ${lead.id} synced as ${salesforceId}`)
  },

  // Called on sync error
  onSyncError: async (lead, error) => {
    console.error(`Failed to sync lead ${lead.id}:`, error.message)
  },
})
```

### Retry Failed Syncs

Manually retry failed syncs:

```typescript
import { retrySyncFailedLeads } from '@praxiscms/plugin-salesforce'
import { getPayload } from 'praxis'
import config from '@payload-config'

const payload = await getPayload({ config })

const results = await retrySyncFailedLeads(payload, {
  credentials: {
    clientId: process.env.SF_CLIENT_ID!,
    clientSecret: process.env.SF_CLIENT_SECRET!,
    username: process.env.SF_USERNAME!,
    password: process.env.SF_PASSWORD!,
  },
})

console.log(results)
// { retried: 10, succeeded: 8, failed: 2 }
```

### Using the Salesforce Client Directly

```typescript
import { createSalesforceClient } from '@praxiscms/plugin-salesforce'

const client = createSalesforceClient({
  clientId: process.env.SF_CLIENT_ID!,
  clientSecret: process.env.SF_CLIENT_SECRET!,
  username: process.env.SF_USERNAME!,
  password: process.env.SF_PASSWORD!,
})

// Authenticate
await client.authenticate()

// Create a lead
const response = await client.createLead({
  FirstName: 'Jane',
  LastName: 'Smith',
  Company: 'Tech Corp',
  Email: 'jane@techcorp.com',
})

// Query leads
const leads = await client.queryLeads(
  "SELECT Id, FirstName, LastName FROM Lead WHERE Email = 'jane@techcorp.com'",
)
```

## Collections

The plugin creates two collections:

### Leads Collection (`leads`)

| Field             | Type     | Description                   |
| ----------------- | -------- | ----------------------------- |
| firstName         | text     | Lead's first name             |
| lastName          | text     | Lead's last name (required)   |
| email             | email    | Lead's email address          |
| phone             | text     | Phone number                  |
| company           | text     | Company name (required)       |
| title             | text     | Job title                     |
| street            | text     | Street address                |
| city              | text     | City                          |
| state             | text     | State/Province                |
| postalCode        | text     | Postal/ZIP code               |
| country           | text     | Country                       |
| website           | text     | Company website               |
| description       | textarea | Additional notes              |
| leadSource        | text     | Source of the lead            |
| industry          | text     | Industry                      |
| numberOfEmployees | number   | Company size                  |
| annualRevenue     | number   | Annual revenue                |
| salesforceId      | text     | Salesforce Lead ID            |
| syncStatus        | select   | pending/synced/failed/skipped |
| lastSyncAttempt   | date     | Last sync attempt timestamp   |
| lastSyncError     | text     | Last error message            |
| syncAttempts      | number   | Number of sync attempts       |

### Sync Logs Collection (`salesforce-sync-logs`)

| Field           | Type         | Description              |
| --------------- | ------------ | ------------------------ |
| lead            | relationship | Reference to the lead    |
| salesforceId    | text         | Salesforce Lead ID       |
| status          | select       | Sync status              |
| operation       | select       | create/update/delete     |
| error           | textarea     | Error message            |
| errorCode       | text         | Salesforce error code    |
| requestPayload  | json         | Data sent to Salesforce  |
| responsePayload | json         | Response from Salesforce |
| duration        | number       | Sync duration in ms      |

## API Reference

### `salesforcePlugin(config)`

Main plugin function.

### `createSalesforceClient(credentials)`

Creates a Salesforce API client instance.

### `retrySyncFailedLeads(payload, config)`

Retries syncing all failed leads.

## License

MIT
