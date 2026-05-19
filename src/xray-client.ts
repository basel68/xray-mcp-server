import type { GraphQLResponse } from "./types.js";
import { XrayGqlError } from "./types.js";
import { HttpClient } from "./clients/HttpClient.js";

const XRAY_CLOUD_GRAPHQL_URL = "https://xray.cloud.getxray.app/api/v2/graphql";

/**
 * Client for the Xray Cloud GraphQL API.
 * All queries MUST use parameterized variables — never string interpolation.
 */
export class XrayClient {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly getToken: () => Promise<string>
  ) {}

  /**
   * Executes a GraphQL query or mutation against the Xray Cloud GraphQL endpoint.
   * ALWAYS use parameterized variables — never interpolate user input into query strings.
   *
   * @param query - GraphQL query or mutation document string
   * @param variables - Optional parameterized variables object
   * @returns Parsed GraphQL data typed as T
   * @throws {XrayGqlError} When the response contains errors without usable data
   * @throws {XrayAuthError} On authentication failures
   * @throws {XrayHttpError} On other HTTP errors
   */
  async graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    const token = await this.getToken();

    const body: { query: string; variables?: Record<string, any> } = { query };
    if (variables !== undefined) {
      body.variables = variables;
    }

    const response = await this.httpClient.request<GraphQLResponse<T>>(XRAY_CLOUD_GRAPHQL_URL, {
      method: "POST",
      token,
      body,
    });

    // Handle GraphQL errors
    if (response.errors?.length) {
      if (!response.data) {
        // Full error — no usable data
        throw new XrayGqlError(response.errors);
      }
      // Partial success — check if all top-level fields are null
      const values = Object.values(response.data as Record<string, any>);
      const allNull = values.every((v) => v === null || v === undefined);
      if (allNull) {
        // Data exists but all fields are null — treat as error
        throw new XrayGqlError(response.errors);
      }
      // Partial success — return data even when errors are present
    }

    if (!response.data) {
      throw new XrayGqlError([{ message: "GraphQL response contained no data" }]);
    }

    return response.data as T;
  }
}
