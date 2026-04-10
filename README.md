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

The server supports two modes: **local** (stdio) for desktop/CLI and **remote** (HTTP) for mobile/web.

#### Option A: Local mode (desktop / CLI)

Add this to your Claude Code MCP settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "dealcloud": {
      "command": "node",
      "args": ["/absolute/path/to/Claude-Skills/dist/index.js"],
      "env": {
        "DEALCLOUD_SITE_URL": "https://yourfirm.dealcloud.com",
        "DEALCLOUD_CLIENT_ID": "your-client-id",
        "DEALCLOUD_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

#### Option B: Remote mode (mobile / web)

Run the server as an HTTP service so Claude Code mobile can connect:

```bash
# Set credentials and start in HTTP mode
export DEALCLOUD_SITE_URL="https://yourfirm.dealcloud.com"
export DEALCLOUD_CLIENT_ID="your-client-id"
export DEALCLOUD_CLIENT_SECRET="your-client-secret"

npm run start:http
# → DealCloud MCP server (HTTP) listening on http://0.0.0.0:3000/mcp
```

You can change the port with `MCP_PORT=8080 npm run start:http`.

Then in Claude Code mobile/web, add a **remote MCP server** with the URL:

```
http://your-server-ip:3000/mcp
```

> **Important for remote mode**: Run behind a reverse proxy with HTTPS (e.g. nginx, Caddy) and restrict access with a firewall or VPN. Do not expose the HTTP endpoint directly to the public internet without authentication.

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
