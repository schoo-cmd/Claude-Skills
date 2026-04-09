#!/usr/bin/env node

/**
 * DealCloud MCP Server
 *
 * Exposes DealCloud REST API v4 operations as MCP tools so Claude (or any
 * MCP‑compatible client) can query and manage DealCloud data conversationally.
 *
 * Credentials are loaded from environment variables — never hard‑coded.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DealCloudClient } from "./dealcloud-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap tool handlers so unhandled errors become user‑friendly messages. */
function safeResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "dealcloud",
  version: "1.0.0",
});

let client: DealCloudClient;

try {
  client = DealCloudClient.fromEnv();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Schema tools
// ---------------------------------------------------------------------------

server.tool(
  "list_entry_types",
  "List all entry types (objects) configured in DealCloud — Companies, Deals, Contacts, etc.",
  {},
  async () => {
    try {
      const types = await client.getEntryTypes();
      return safeResult(types);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_entry_type",
  "Get details for a specific entry type by its ID.",
  {
    entryTypeId: z.number().int().describe("The numeric ID of the entry type"),
  },
  async ({ entryTypeId }) => {
    try {
      const entryType = await client.getEntryType(entryTypeId);
      return safeResult(entryType);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_fields",
  "List all fields defined on an entry type. Useful for discovering field IDs needed by other tools.",
  {
    entryTypeId: z
      .number()
      .int()
      .describe("The entry type ID to list fields for"),
  },
  async ({ entryTypeId }) => {
    try {
      const fields = await client.getFields(entryTypeId);
      return safeResult(fields);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Data tools — reading
// ---------------------------------------------------------------------------

server.tool(
  "list_entries",
  "List entry IDs and names for an entry type (paginated). Good for browsing data.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    skip: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Number of records to skip (default 0)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Max records to return (default 100, max 1000)"),
  },
  async ({ entryTypeId, skip, limit }) => {
    try {
      const entries = await client.listEntries(entryTypeId, skip, limit);
      return safeResult(entries);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "search_entries",
  "Search / query entries of a given type with optional filters, field selection, sorting, and pagination. " +
    "Use get_fields first to discover available field IDs.",
  {
    entryTypeId: z.number().int().describe("The entry type ID to query"),
    fieldIds: z
      .array(z.number().int())
      .optional()
      .describe("Field IDs to include in results. Omit for all fields."),
    query: z
      .array(
        z.object({
          fieldId: z.number().int(),
          value: z.unknown(),
          operator: z
            .string()
            .optional()
            .describe(
              "Filter operator: $eq, $contains, $gt, $lt, $gte, $lte, $in, $between, $or, $and"
            ),
        })
      )
      .optional()
      .describe("Filter conditions"),
    orderBy: z
      .array(
        z.object({
          fieldId: z.number().int(),
          direction: z.enum(["asc", "desc"]),
        })
      )
      .optional()
      .describe("Sort order"),
    skip: z.number().int().min(0).default(0).describe("Records to skip"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Max records (default 100, max 1000)"),
  },
  async ({ entryTypeId, fieldIds, query, orderBy, skip, limit }) => {
    try {
      const result = await client.queryEntries(entryTypeId, {
        fieldIds,
        query,
        orderBy,
        skip,
        limit,
      });
      return safeResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_cell_values",
  "Retrieve specific cell values by entry ID + field ID pairs. Efficient for fetching a few fields from known entries.",
  {
    cells: z
      .array(
        z.object({
          entryId: z.number().int().describe("The entry (record) ID"),
          fieldId: z.number().int().describe("The field ID"),
        })
      )
      .min(1)
      .max(500)
      .describe("Array of {entryId, fieldId} pairs to fetch (max 500)"),
  },
  async ({ cells }) => {
    try {
      const values = await client.getCellValues(cells);
      return safeResult(values);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "list_views",
  "List saved views for an entry type. Views can be used with get_view_data.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
  },
  async ({ entryTypeId }) => {
    try {
      const views = await client.listViews(entryTypeId);
      return safeResult(views);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_view_data",
  "Fetch data from a saved DealCloud view (paginated).",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    viewId: z.number().int().describe("The view ID (from list_views)"),
    skip: z.number().int().min(0).default(0).describe("Records to skip"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Max records (default 100, max 1000)"),
  },
  async ({ entryTypeId, viewId, skip, limit }) => {
    try {
      const data = await client.getEntriesByView(
        entryTypeId,
        viewId,
        skip,
        limit
      );
      return safeResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Data tools — writing
// ---------------------------------------------------------------------------

server.tool(
  "create_entry",
  "Create a new entry (record) of a given type. Provide field values as an array of {fieldId, value} pairs. " +
    "Use get_fields to discover valid field IDs first.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    fields: z
      .array(
        z.object({
          fieldId: z.number().int().describe("Field ID"),
          value: z.unknown().describe("Value to set"),
        })
      )
      .min(1)
      .describe("Field values for the new entry"),
    ignoreNearDups: z
      .boolean()
      .default(false)
      .describe("Skip near-duplicate detection (default false)"),
  },
  async ({ entryTypeId, fields, ignoreNearDups }) => {
    try {
      // New entries use a negative entryId placeholder
      const storeRequests = fields.map((f, idx) => ({
        entryId: -(idx + 1),
        fieldId: f.fieldId,
        value: f.value,
        ignoreNearDups,
      }));
      // All fields for the same new entry must share the same negative ID
      const entryPlaceholder = -1;
      const aligned = storeRequests.map((r) => ({
        ...r,
        entryId: entryPlaceholder,
      }));
      const result = await client.setCellValues(entryTypeId, aligned);
      return safeResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "update_entry",
  "Update fields on an existing entry. Provide the entry ID and field values to change.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    entryId: z.number().int().describe("The entry (record) ID to update"),
    fields: z
      .array(
        z.object({
          fieldId: z.number().int().describe("Field ID to update"),
          value: z.unknown().describe("New value"),
        })
      )
      .min(1)
      .describe("Field values to update"),
  },
  async ({ entryTypeId, entryId, fields }) => {
    try {
      const storeRequests = fields.map((f) => ({
        entryId,
        fieldId: f.fieldId,
        value: f.value,
      }));
      const result = await client.setCellValues(entryTypeId, storeRequests);
      return safeResult(result);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Management tools
// ---------------------------------------------------------------------------

server.tool(
  "list_users",
  "List all DealCloud users.",
  {},
  async () => {
    try {
      const users = await client.getUsers();
      return safeResult(users);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// History / audit
// ---------------------------------------------------------------------------

server.tool(
  "get_history",
  "Get modification history for an entry type. Useful for auditing recent changes.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    modifiedSince: z
      .string()
      .optional()
      .describe(
        "ISO 8601 datetime string to filter changes after (e.g. 2025-01-01T00:00:00Z)"
      ),
    skip: z.number().int().min(0).default(0).describe("Records to skip"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Max records (default 100, max 1000)"),
  },
  async ({ entryTypeId, modifiedSince, skip, limit }) => {
    try {
      const history = await client.getAllHistory(
        entryTypeId,
        modifiedSince,
        skip,
        limit
      );
      return safeResult(history);
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
