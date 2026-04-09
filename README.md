# DealCloud MCP Server

An MCP (Model Context Protocol) server that connects Claude to your DealCloud instance. Query deals, contacts, companies, and more — all through conversation.

## Setup

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Configure credentials

Copy `.env.example` to `.env` and fill in your DealCloud API credentials:

```bash
cp .env.example .env
```

You need:

| Variable | Description |
|---|---|
| `DEALCLOUD_SITE_URL` | Your DealCloud site URL (e.g. `https://yourfirm.dealcloud.com`) |
| `DEALCLOUD_CLIENT_ID` | OAuth2 client ID from DealCloud admin |
| `DEALCLOUD_CLIENT_SECRET` | OAuth2 client secret (API key) |

> **Security**: The `.env` file is gitignored. Credentials are only read from environment variables at startup — they are never logged or included in error messages.

### 3. Add to Claude Code

Add this to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or via the settings UI):

```json
{
  "mcpServers": {
    "dealcloud": {
      "command": "node",
      "args": ["/absolute/path/to/dealcloud-mcp-server/dist/index.js"],
      "env": {
        "DEALCLOUD_SITE_URL": "https://yourfirm.dealcloud.com",
        "DEALCLOUD_CLIENT_ID": "your-client-id",
        "DEALCLOUD_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Available Tools

### Schema Discovery
| Tool | Description |
|---|---|
| `list_entry_types` | List all objects (Companies, Deals, Contacts, etc.) |
| `get_entry_type` | Get details for a specific entry type |
| `get_fields` | List fields on an entry type (find field IDs) |

### Reading Data
| Tool | Description |
|---|---|
| `list_entries` | Browse entries by type (paginated) |
| `search_entries` | Query with MongoDB-style filters (`$eq`, `$contains`, `$gt`, `$in`, etc.) |
| `filter_entries` | Filter entries using the Cells API (fieldId + value conditions) |
| `get_cell_values` | Fetch specific field values for known entries |
| `list_views` | List saved views |
| `get_view_data` | Fetch data from a saved view |

### Writing Data
| Tool | Description |
|---|---|
| `create_entry` | Create a new record |
| `update_entry` | Update fields on an existing record |
| `delete_entries` | Delete entries by ID (irreversible) |

### Management & Audit
| Tool | Description |
|---|---|
| `list_users` | List all DealCloud users |
| `get_history` | View modification history (audit trail) |

## Example Conversation

> **You**: Show me all the deal entry types in DealCloud
>
> **Claude**: *uses `list_entry_types`* — Here are your configured objects...
>
> **You**: What fields does the Deal object have?
>
> **Claude**: *uses `get_fields`* — The Deal object has these fields...
>
> **You**: Find all deals where the status is "Active"
>
> **Claude**: *uses `search_entries` with a filter* — Found 42 active deals...

## Security Notes

- Credentials are loaded from environment variables only
- OAuth2 tokens are cached in memory and auto-refreshed before expiry
- No credentials are ever logged, serialised to disk, or included in error output
- Write operations (`create_entry`, `update_entry`, `delete_entries`) require explicit tool approval in Claude Code
- Delete operations are capped at 100 entries per call
- Pagination is capped at 1000 records per request to prevent accidental bulk reads
