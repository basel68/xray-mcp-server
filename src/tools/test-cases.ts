import { z } from "zod";
import type { XrayClient } from "../xray-client.js";
import { registerTool } from "./registry.js";
import type { GraphQLResponse } from "../types.js";

// --- Schemas ---

const CreateTestCaseSchema = z.object({
  projectKey: z.string().describe("Jira project key (e.g. 'PROJ')"),
  summary: z.string().describe("Test case summary/title"),
  testType: z
    .enum(["Manual", "Cucumber", "Generic"])
    .default("Manual")
    .describe("Type of test"),
  priority: z.string().optional().describe("Priority name (e.g. 'High', 'Medium')"),
  labels: z.array(z.string()).optional().describe("Labels to apply"),
  steps: z
    .array(
      z.object({
        action: z.string().describe("Step action/instruction"),
        data: z.string().optional().describe("Test data for this step"),
        result: z.string().optional().describe("Expected result"),
      })
    )
    .optional()
    .describe("Manual test steps"),
  gherkin: z.string().optional().describe("Cucumber/Gherkin scenario definition (for Cucumber type)"),
  preconditionKeys: z
    .array(z.string())
    .optional()
    .describe("Issue keys of preconditions to link"),
  folderPath: z.string().optional().describe("Test repository folder path (e.g. '/Regression/Login')"),
});

const UpdateTestCaseSchema = z.object({
  issueId: z.string().describe("Jira issue ID of the test case (e.g. 'PROJ-123')"),
  summary: z.string().optional().describe("Updated summary/title"),
  testType: z.enum(["Manual", "Cucumber", "Generic"]).optional().describe("Updated test type"),
  priority: z.string().optional().describe("Updated priority"),
  labels: z.array(z.string()).optional().describe("Updated labels (replaces existing)"),
  steps: z
    .array(
      z.object({
        action: z.string().describe("Step action/instruction"),
        data: z.string().optional().describe("Test data for this step"),
        result: z.string().optional().describe("Expected result"),
      })
    )
    .optional()
    .describe("Updated manual test steps (replaces existing steps)"),
  gherkin: z.string().optional().describe("Updated Cucumber/Gherkin definition"),
  folderPath: z.string().optional().describe("Move to this test repository folder path"),
});

const GetTestCaseSchema = z.object({
  issueId: z.string().describe("Jira issue ID of the test case (e.g. 'PROJ-123')"),
});

// --- Tool Handlers ---

async function createTestCase(
  client: XrayClient,
  input: z.infer<typeof CreateTestCaseSchema>
): Promise<any> {
  const mutation = `
    mutation CreateTest($testType: UpdateTestTypeInput!, $steps: [CreateStepInput], $gherkin: String, $preconditionKeys: [String], $folderPath: String, $jira: JSON!) {
      createTest(
        testType: $testType
        steps: $steps
        gherkin: $gherkin
        preconditionIssueIds: $preconditionKeys
        folderPath: $folderPath
        jira: $jira
      ) {
        test {
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
    testType: { name: input.testType },
    jira: { fields: jiraFields },
  };

  if (input.steps && input.steps.length > 0) {
    variables.steps = input.steps.map((s) => ({
      action: s.action,
      data: s.data || "",
      result: s.result || "",
    }));
  }

  if (input.gherkin) {
    variables.gherkin = input.gherkin;
  }

  if (input.preconditionKeys && input.preconditionKeys.length > 0) {
    variables.preconditionKeys = input.preconditionKeys;
  }

  if (input.folderPath) {
    variables.folderPath = input.folderPath;
  }

  const data = await client.graphql<{ createTest: any }>(mutation, variables);
  return data.createTest;
}

async function updateTestCase(
  client: XrayClient,
  input: z.infer<typeof UpdateTestCaseSchema>
): Promise<any> {
  const mutation = `
    mutation UpdateTest($issueId: String!, $testType: UpdateTestTypeInput, $steps: [UpdateStepInput], $gherkin: String, $folderPath: String, $jira: JSON) {
      updateTest(
        issueId: $issueId
        testType: $testType
        steps: $steps
        gherkin: $gherkin
        folderPath: $folderPath
        jira: $jira
      ) {
        test {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `;

  const variables: Record<string, any> = {
    issueId: input.issueId,
  };

  if (input.testType) {
    variables.testType = { name: input.testType };
  }

  if (input.steps) {
    variables.steps = input.steps.map((s) => ({
      action: s.action,
      data: s.data || "",
      result: s.result || "",
    }));
  }

  if (input.gherkin) {
    variables.gherkin = input.gherkin;
  }

  if (input.folderPath) {
    variables.folderPath = input.folderPath;
  }

  const jiraFields: Record<string, any> = {};
  if (input.summary) jiraFields.summary = input.summary;
  if (input.priority) jiraFields.priority = { name: input.priority };
  if (input.labels) jiraFields.labels = input.labels;

  if (Object.keys(jiraFields).length > 0) {
    variables.jira = jiraFields;
  }

  const data = await client.graphql<{ updateTest: any }>(mutation, variables);
  return data.updateTest;
}

async function getTestCase(
  client: XrayClient,
  input: z.infer<typeof GetTestCaseSchema>
): Promise<any> {
  const query = `
    query GetTest($issueId: String!) {
      getTest(issueId: $issueId) {
        issueId
        testType { name }
        steps {
          id
          action
          data
          result
        }
        gherkin
        preconditions(limit: 50) {
          results {
            issueId
            jira(fields: ["key", "summary"])
          }
        }
        folder { path }
        jira(fields: ["key", "summary", "priority", "labels", "status"])
      }
    }
  `;

  const data = await client.graphql<{ getTest: any }>(query, { issueId: input.issueId });
  return data.getTest;
}

// --- Register Tools ---

registerTool({
  name: "create_test_case",
  description:
    "Create a new test case in Xray Cloud. Supports Manual, Cucumber, and Generic test types with steps, Gherkin definitions, and folder placement.",
  accessLevel: "write",
  inputSchema: CreateTestCaseSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = CreateTestCaseSchema.parse(args);
      const result = await createTestCase(client as XrayClient, input);
      if (result === null || result === undefined) {
        return { content: [{ type: "text", text: "Test case creation returned null — the API may have rejected the request silently. Check project permissions and issue type scheme." }], isError: true };
      }
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
  name: "update_test_case",
  description:
    "Update an existing test case in Xray Cloud. Can modify summary, type, steps, Gherkin, labels, priority, and folder.",
  accessLevel: "write",
  inputSchema: UpdateTestCaseSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = UpdateTestCaseSchema.parse(args);
      const result = await updateTestCase(client as XrayClient, input);
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
  name: "get_test_case",
  description:
    "Retrieve details of a test case from Xray Cloud, including steps, type, preconditions, and Jira fields.",
  accessLevel: "read",
  inputSchema: GetTestCaseSchema,
  handler: async (args, ctx) => {
    try {
      const client = (args._client as XrayClient) ?? undefined;
      const input = GetTestCaseSchema.parse(args);
      const result = await getTestCase(client as XrayClient, input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  },
});

export { CreateTestCaseSchema, UpdateTestCaseSchema, GetTestCaseSchema };
