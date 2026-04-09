/**
 * DealCloud REST API v4 client with OAuth2 token management.
 *
 * Credentials are read exclusively from environment variables — they are
 * never logged, serialised, or included in error messages.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealCloudConfig {
  siteUrl: string; // e.g. https://yourfirm.dealcloud.com
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface EntryType {
  id: number;
  name: string;
  apiName: string;
  singularName: string;
  pluralName: string;
  entryListType: number;
  entryListSubType: number;
  entryListId: number;
}

export interface Field {
  id: number;
  name: string;
  apiName: string;
  fieldType: number;
  isRequired: boolean;
  isReadOnly: boolean;
  entryTypeId: number;
  [key: string]: unknown;
}

export interface RowsQueryRequest {
  query?: string; // MongoDB-style query string, e.g. "{Status: {$eq: 'Active'}}"
  fields?: string[]; // Field apiNames to include in results
  skip?: number;
  limit?: number;
  resolveReferenceUrls?: boolean;
  wrapIntoArrays?: boolean;
}

export interface CellValue {
  entryId: number;
  fieldId: number;
  value: unknown;
}

export interface StoreRequest {
  entryId: number;
  fieldId: number;
  value: unknown;
  ignoreNearDups?: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class DealCloudClient {
  private config: DealCloudConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: DealCloudConfig) {
    this.config = config;
  }

  /** Load config from environment variables. Throws if any are missing. */
  static fromEnv(): DealCloudClient {
    const siteUrl = process.env.DEALCLOUD_SITE_URL;
    const clientId = process.env.DEALCLOUD_CLIENT_ID;
    const clientSecret = process.env.DEALCLOUD_CLIENT_SECRET;

    const missing: string[] = [];
    if (!siteUrl) missing.push("DEALCLOUD_SITE_URL");
    if (!clientId) missing.push("DEALCLOUD_CLIENT_ID");
    if (!clientSecret) missing.push("DEALCLOUD_CLIENT_SECRET");

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}. ` +
          "Set them before starting the server."
      );
    }

    return new DealCloudClient({
      siteUrl: siteUrl!.replace(/\/+$/, ""), // strip trailing slashes
      clientId: clientId!,
      clientSecret: clientSecret!,
    });
  }

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  private async authenticate(): Promise<string> {
    // Return cached token if it's still valid (with 60 s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const tokenUrl = `${this.config.siteUrl}/api/rest/v1/oauth/token`;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "data schema user_management",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `DealCloud auth failed (${res.status}): ${text.slice(0, 200)}`
      );
    }

    const data = (await res.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>
  ): Promise<T> {
    const token = await this.authenticate();
    const url = new URL(`${this.config.siteUrl}/api/rest/v4${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `DealCloud API error ${res.status} ${method} ${path}: ${text.slice(0, 500)}`
      );
    }

    // Some endpoints return 204 with no body
    if (res.status === 204) return undefined as T;

    return (await res.json()) as T;
  }

  // -----------------------------------------------------------------------
  // Schema endpoints
  // -----------------------------------------------------------------------

  async getEntryTypes(): Promise<EntryType[]> {
    return this.request<EntryType[]>("GET", "/schema/entryTypes");
  }

  async getEntryType(entryTypeId: number): Promise<EntryType> {
    return this.request<EntryType>(
      "GET",
      `/schema/entryTypes/${entryTypeId}`
    );
  }

  async getFields(entryTypeId: number): Promise<Field[]> {
    return this.request<Field[]>(
      "GET",
      `/schema/entryTypes/${entryTypeId}/fields`
    );
  }

  async getUsers(): Promise<unknown[]> {
    return this.request<unknown[]>("GET", "/schema/users");
  }

  // -----------------------------------------------------------------------
  // Data endpoints — Rows (tabular)
  // -----------------------------------------------------------------------

  async queryEntries(
    entryTypeId: number,
    query: RowsQueryRequest
  ): Promise<unknown> {
    return this.request<unknown>(
      "POST",
      `/data/entrydata/rows/query/${entryTypeId}`,
      query
    );
  }

  async getEntriesByView(
    entryTypeId: number,
    viewId: number,
    skip = 0,
    limit = 100
  ): Promise<unknown> {
    return this.request<unknown>(
      "GET",
      `/data/entrydata/rows/view/${entryTypeId}/${viewId}`,
      undefined,
      { skip: String(skip), limit: String(limit) }
    );
  }

  async listViews(entryTypeId: number): Promise<unknown[]> {
    return this.request<unknown[]>(
      "GET",
      `/data/entrydata/rows/view/${entryTypeId}`
    );
  }

  // -----------------------------------------------------------------------
  // Data endpoints — Cells filter
  // -----------------------------------------------------------------------

  async filterEntries(
    entryTypeId: number,
    filters: Array<{ fieldId: number; value: unknown; operation?: string }>
  ): Promise<unknown> {
    return this.request<unknown>(
      "POST",
      `/data/entrydata/${entryTypeId}/filter`,
      filters
    );
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  async deleteEntries(
    entryTypeId: number,
    entryIds: number[]
  ): Promise<unknown> {
    return this.request<unknown>(
      "DELETE",
      `/data/entrydata/${entryTypeId}`,
      entryIds
    );
  }

  // -----------------------------------------------------------------------
  // Data endpoints — Cells (columnar)
  // -----------------------------------------------------------------------

  async listEntries(
    entryTypeId: number,
    skip = 0,
    limit = 100
  ): Promise<unknown> {
    return this.request<unknown>(
      "GET",
      `/data/entrydata/${entryTypeId}/entries`,
      undefined,
      { skip: String(skip), limit: String(limit) }
    );
  }

  async getCellValues(
    cells: Array<{ entryId: number; fieldId: number }>
  ): Promise<CellValue[]> {
    return this.request<CellValue[]>(
      "POST",
      "/data/entrydata/get",
      cells,
      { wrapIntoArrays: "true" }
    );
  }

  async setCellValues(
    entryTypeId: number,
    storeRequests: StoreRequest[]
  ): Promise<unknown> {
    return this.request<unknown>(
      "POST",
      `/data/entrydata/${entryTypeId}`,
      { storeRequests }
    );
  }

  // -----------------------------------------------------------------------
  // History
  // -----------------------------------------------------------------------

  async getAllHistory(
    modifiedSince?: string,
    skip = 0,
    limit = 100
  ): Promise<unknown> {
    const query: Record<string, string> = {
      skip: String(skip),
      limit: String(limit),
    };
    if (modifiedSince) query.modifiedSince = modifiedSince;
    return this.request<unknown>(
      "GET",
      "/data/entrydata/allhistory",
      undefined,
      query
    );
  }
}
