import { z } from "zod";
import type { XrayClient } from "../xray-client.js";
import { registerTool } from "./registry.js";

// --- Schemas ---

const CreateTestSetSchema = z.object({
  projectKey: z.string().describe("Jira project key (e.g. 'PROJ')"),
  summary: z.string().describe("Test set summary/title"),
  labels: z.array(z.string()).optional().describe("Labels to apply"),
  priority: z.string().optional().describe("Priority name (e.g. 'High', 'Medium')"),
  testIssueIds: z
    .array(z.string())
    .optional()
    .describe("Issue IDs of tests to include in the set (e.g. ['PROJ-10', 'PROJ-11'])"),
  folderPath: z.string().optional().describe("Test repository folder path"),
});

const UpdateTestSetSchema = z.object({
  issueId: z.string().describe("Jira issue ID of the test set (e.g. 'PROJ-200')"),
  summary: z.string().optional().describe("Updated summary/title"),
  labels: z.array(z.string()).optional().describe("Updated labels"),
  priority: z.string().optional().describe("Updated priority"),
  addTestIssueIds: z
    .array(z.string())
    .optional()
    .describe("Test issue IDs to ADD to the set"),
  removeTestIssueIds: z
    .array(z.string())
    .optional()
    .describe("Test issue IDs to REMOVE from the set"),
  folderPath: z.string().optional().describe("Move to this folder path"),
});

const GetTestSetSchema = z.object({
  issueId: z.string().describe("Jira issue ID of the test set (e.g. 'PROJ-200')"),
});

// --- Tool Handlers ---

async function createTestSet(
  client: XrayClient,
  input: z.infer<typeof CreateTestSetSchema>
): Promise<any> {
  const mutation = `
    mutation CreateTestSet($testIssueIds: [String], $jira: JSON!) {
      createTestSet(
        testIssueIds: $testIssueIds
        jira: $jira
      ) {
        testSet {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `;

  const jiraFields: Record<string, any> = {
    summary: input.summary,
    project: { key: input.projectKey },
  };

  if (input.priority) {
    jiraFields.priority = { name: input.priority };
  }
  if (input.labels) {
    jiraFields.labels = input.labels;
  }

  const variables: Record<string, any> = {
    jira: { fields: jiraFields },
  };

  if (input.testIssueIds && input.testIssueIds.length > 0) {
    variables.testIssueIds = input.testIssueIds;
  }

  const data = await client.graphql<{ createTestSet: any }>(mutation, variables);
  return data.createTestSet;
}

async function updateTestSet(
  client: XrayClient,
  input: z.infer<typeof UpdateTestSetSchema>
): Promise<any> {
  const results: any[] = [];

  // Update Jira fields if any provided
  const jiraFields: Record<string, any> = {};
  if (input.summary) jiraFields.summary = input.summary;
  if (input.priority) jiraFields.priority = { name: input.priority };
  if (input.labels) jiraFields.labels = input.labels;

  if (Object.keys(jiraFields).length > 0 || input.folderPath) {
    const updateMutation = `
      mutation UpdateTestSet($issueId: String!, $folderPath: String, $jira: JSON) {
        updateTestSet(
          issueId: $issueId
          folderPath: $folderPath
          jira: $jira
        ) {
          testSet {
            issueId
            jira(fields: ["key", "summary"])
          }
          warnings
        }
      }
    `;

    const vars: Record<string, any> = { issueId: input.issueId };
    if (Object.keys(jiraFields).length > 0) vars.jira = jiraFields;
    if (input.folderPath) vars.folderPath = input.folderPath;

    const updateResult = await client.graphql<{ updateTestSet: any }>(updateMutation, vars);
    results.push({ action: "updateFields", result: updateResult.updateTestSet });
  }

  // Add tests to the set
  if (input.addTestIssueIds && input.addTestIssueIds.length > 0) {
    const addMutation = `
      mutation AddTestsToTestSet($issueId: String!, $testIssueIds: [String]!) {
        addTestsToTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
          testSet {
            issueId
          }
          warnings
        }
      }
    `;

    const addResult = await client.graphql<{ addTestsToTestSet: any }>(addMutation, {
      issueId: input.issueId,
      testIssueIds: input.addTestIssueIds,
    });
    results.push({ action: "addTests", result: addResult.addTestsToTestSet });
  }

  // Remove tests from the set
  if (input.removeTestIssueIds && input.removeTestIssueIds.length > 0) {
    const removeMutation = `
      mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String]!) {
        removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
          testSet {
            issueId
          }
          warnings
        }
      }
    `;

    const removeResult = await client.graphql<{ removeTestsFromTestSet: any }>(removeMutation, {
      issueId: input.issueId,
      testIssueIds: input.removeTestIssueIds,
    });
    results.push({ action: "removeTests", result: removeResult.removeTestsFromTestSet });
  }

  return results;
}

async function getTestSet(
  client: XrayClient,
  input: z.infer<typeof GetTestSetSchema>
): Promise<any> {
  const query = `
    query GetTestSet($issueId: String!) {
      getTestSet(issueId: $issueId) {
        issueId
        tests(limit: 100) {
          results {
            issueId
            jira(fields: ["key", "summary", "status"])
          }
          total
        }
        folder { path }
        jira(fields: ["key", "summary", "priority", "labels", "status"])
      }
    }
  `;

  const data = await client.graphql<{ getTestSet: any }>(query, { issueId: input.issueId });
  return data.getTestSet;
}

// --- Register Tools ---

registerTool({
  name: "create_test_set",
  description:
    "Create a new test set in Xray Cloud. Optionally include tests by their issue IDs.",
  accessLevel: "write",
  inputSchema: CreateTestSetSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = CreateTestSetSchema.parse(args);
      const result = await createTestSet(client as XrayClient, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  },
});

registerTool({
  name: "update_test_set",
  description:
    "Update an existing test set in Xray Cloud. Can modify Jira fields, add/remove tests, and change folder.",
  accessLevel: "write",
  inputSchema: UpdateTestSetSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = UpdateTestSetSchema.parse(args);
      const result = await updateTestSet(client as XrayClient, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  },
});

registerTool({
  name: "get_test_set",
  description:
    "Retrieve details of a test set from Xray Cloud, including its member tests and Jira fields.",
  accessLevel: "read",
  inputSchema: GetTestSetSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = GetTestSetSchema.parse(args);
      const result = await getTestSet(client as XrayClient, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  },
});

export { CreateTestSetSchema, UpdateTestSetSchema, GetTestSetSchema };
