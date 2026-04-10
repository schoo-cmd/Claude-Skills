#!/usr/bin/env node

/**
 * DealCloud MCP Server
 *
 * Exposes DealCloud REST API v4 operations as MCP tools so Claude (or any
 * MCP‑compatible client) can query and manage DealCloud data conversationally.
 *
 * Credentials are loaded from environment variables — never hard‑coded.
 */

import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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
  "Search / query entries of a given type using MongoDB-style filters. " +
    "Use get_fields first to discover field apiNames. " +
    "Query examples: \"{Status: {$eq: 'Active'}}\", \"{DealSize: {$gt: 1000000}}\", " +
    "\"{Name: {$contains: 'Acme'}}\". " +
    "Operators: $eq, $contains, $gt, $lt, $gte, $lte, $in, $nin, $between, $or, $and.",
  {
    entryTypeId: z.number().int().describe("The entry type ID to query"),
    query: z
      .string()
      .optional()
      .describe(
        "MongoDB-style query string, e.g. \"{Status: {$eq: 'Active'}}\"." +
          " Omit to return all entries."
      ),
    fields: z
      .array(z.string())
      .optional()
      .describe("Field apiNames to include in results. Omit for all fields."),
    skip: z.number().int().min(0).default(0).describe("Records to skip"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(100)
      .describe("Max records (default 100, max 1000)"),
  },
  async ({ entryTypeId, query, fields, skip, limit }) => {
    try {
      const result = await client.queryEntries(entryTypeId, {
        query,
        fields,
        skip,
        limit,
        resolveReferenceUrls: true,
        wrapIntoArrays: true,
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
  "List saved views in DealCloud. Optionally filter by name. Views can be used with get_view_data.",
  {
    query: z
      .string()
      .optional()
      .describe("Optional search string to filter views by name"),
  },
  async ({ query }) => {
    try {
      const views = await client.listViews(query);
      return safeResult(views);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_view_data",
  "Fetch data from a saved DealCloud view (paginated). Get the view ID from list_views first.",
  {
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
  async ({ viewId, skip, limit }) => {
    try {
      const data = await client.getEntriesByView(viewId, skip, limit);
      return safeResult(data);
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "filter_entries",
  "Filter entries of a given type using the Cells filter API. Provide an array of " +
    "{fieldId, value, operation} conditions (ANDed together). " +
    "Use get_fields first to discover field IDs.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    filters: z
      .array(
        z.object({
          fieldId: z.number().int().describe("Field ID to filter on"),
          value: z.unknown().describe("Value to compare"),
          operation: z
            .string()
            .optional()
            .describe("Filter operation (e.g. Equals, Contains, GreaterThan)"),
        })
      )
      .min(1)
      .describe("Filter conditions (all ANDed together)"),
  },
  async ({ entryTypeId, filters }) => {
    try {
      const result = await client.filterEntries(entryTypeId, filters);
      return safeResult(result);
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
    "Use get_fields to discover valid field IDs first. " +
    "New entries use a negative entryId placeholder internally — the API returns the real ID.",
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
      // All fields for a single new entry share the same negative placeholder ID
      const storeRequests = fields.map((f) => ({
        entryId: -1,
        fieldId: f.fieldId,
        value: f.value,
        ignoreNearDups,
      }));
      const result = await client.setCellValues(entryTypeId, storeRequests);
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

server.tool(
  "delete_entries",
  "Delete one or more entries by ID. This is IRREVERSIBLE — use with caution.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    entryIds: z
      .array(z.number().int())
      .min(1)
      .max(100)
      .describe("Entry IDs to delete (max 100 per call)"),
  },
  async ({ entryTypeId, entryIds }) => {
    try {
      const result = await client.deleteEntries(entryTypeId, entryIds);
      return safeResult(
        result ?? { success: true, deleted: entryIds.length }
      );
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
  "Get modification history for an entry type (includes calculated/system-triggered changes). " +
    "Results limited to 6 months. Specify modifiedSince to also see deleted entries.",
  {
    entryTypeId: z.number().int().describe("The entry type ID"),
    modifiedSince: z
      .string()
      .optional()
      .describe(
        "ISO 8601 datetime to filter changes after (e.g. 2025-01-01T00:00:00Z). " +
          "Required to see deleted entries."
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
// Start — stdio (local) or HTTP (remote/mobile)
// ---------------------------------------------------------------------------

const httpMode = process.argv.includes("--http");
const port = parseInt(process.env.MCP_PORT ?? "3000", 10);

async function startStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp() {
  // Track active sessions so we can route and clean up
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only serve the /mcp endpoint
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end("Not found");
      return;
    }

    try {
      if (req.method === "POST") {
        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString());

        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        // New session (Initialize request)
        if (!sessionId || !transports[sessionId]) {
          if (isInitializeRequest(body)) {
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (id) => {
                transports[id] = transport;
              },
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && transports[sid]) delete transports[sid];
            };

            await server.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
          }
          res.writeHead(400).end("Bad request: missing session ID");
          return;
        }

        // Existing session
        await transports[sessionId].handleRequest(req, res, body);
      } else if (req.method === "GET") {
        // SSE stream for notifications
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400).end("Invalid or missing session ID");
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } else if (req.method === "DELETE") {
        // Session termination
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (!sessionId || !transports[sessionId]) {
          res.writeHead(400).end("Invalid or missing session ID");
          return;
        }
        await transports[sessionId].handleRequest(req, res);
      } else {
        res.writeHead(405).end("Method not allowed");
      }
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`DealCloud MCP server (HTTP) listening on http://0.0.0.0:${port}/mcp`);
  });

  process.on("SIGINT", async () => {
    for (const sid of Object.keys(transports)) {
      await transports[sid].close();
      delete transports[sid];
    }
    httpServer.close();
    process.exit(0);
  });
}

(httpMode ? startHttp() : startStdio()).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
