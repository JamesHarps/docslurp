#!/usr/bin/env node
/**
 * MCP Server Template
 *
 * This is a reference implementation. The actual server code is generated
 * by the CLI and written directly to the server directory.
 *
 * Each generated server includes:
 * - search: Semantic search across documentation
 * - ask: Q&A with citations
 * - sources: List all indexed pages
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VectorStore } from "./vectorstore.js";
import { search, ask, listSources } from "./search.js";

const SERVER_NAME = process.env.DOCSLURP_SERVER_NAME || "docslurp-server";

const vectorStore = new VectorStore();
const server = new McpServer({
  name: SERVER_NAME,
  version: "1.0.0",
});

// Semantic search tool
server.tool(
  "search",
  "Search the documentation semantically. Returns the most relevant passages.",
  {
    query: z.string().describe("What to search for"),
    limit: z.number().optional().describe("Number of results (default 5)"),
  },
  async ({ query, limit = 5 }) => {
    try {
      const results = await search(vectorStore, query, limit);
      return {
        content: [{ type: "text", text: results }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Q&A tool with citations
server.tool(
  "ask",
  "Ask a question about the documentation and get an answer with sources.",
  {
    question: z.string().describe("Your question"),
  },
  async ({ question }) => {
    try {
      const answer = await ask(vectorStore, question);
      return {
        content: [{ type: "text", text: answer }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// List sources tool
server.tool(
  "sources",
  "List all the documentation pages that have been indexed.",
  {},
  async () => {
    const sources = listSources(vectorStore);
    return {
      content: [{ type: "text", text: sources }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
