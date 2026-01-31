import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { DocumentChunk } from "./chunk.js";
import { getServersDir } from "./utils.js";

/**
 * Generates a complete MCP server for the given documentation.
 * Creates the server directory, database, and all necessary files.
 */
export async function generateMcpServer(
  name: string,
  sourceUrl: string,
  chunks: DocumentChunk[]
): Promise<void> {
  const serverDir = path.join(getServersDir(), name);

  // Create server directory
  fs.mkdirSync(serverDir, { recursive: true });

  // Create and populate the vector database
  const dbPath = path.join(serverDir, "vectors.db");
  const db = new Database(dbPath);
  // Disable BigInt mode so rowids are regular numbers (sqlite-vec requires this)
  db.defaultSafeIntegers(false);
  sqliteVec.load(db);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding float[1536]
    );
  `);

  // Insert chunks and embeddings
  const insertChunk = db.prepare(
    "INSERT INTO chunks (content, url, title, chunk_index) VALUES (?, ?, ?, ?)"
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    insertChunk.run(
      chunk.content,
      chunk.url,
      chunk.title,
      chunk.chunkIndex
    );

    if (chunk.embedding) {
      const embeddingBuffer = new Float32Array(chunk.embedding).buffer;
      const embeddingBytes = new Uint8Array(embeddingBuffer);
      // Use raw SQL with vec_f32 function to insert the embedding
      db.exec(`INSERT INTO vec_chunks (rowid, embedding) VALUES (${i + 1}, vec_f32(x'${Buffer.from(embeddingBytes).toString('hex')}'))`);
    }
  }
  db.close();

  // Write config file
  const config = {
    name,
    sourceUrl,
    createdAt: new Date().toISOString(),
    pageCount: new Set(chunks.map((c) => c.url)).size,
    chunkCount: chunks.length,
  };

  fs.writeFileSync(
    path.join(serverDir, "config.json"),
    JSON.stringify(config, null, 2)
  );

  // Write the MCP server files
  await writeServerFiles(serverDir, name);
}

async function writeServerFiles(serverDir: string, name: string): Promise<void> {
  // Package.json for the server
  const packageJson = {
    name: `${name}-mcp-server`,
    version: "1.0.0",
    type: "module",
    main: "index.js",
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.0.0",
      "better-sqlite3": "^11.0.0",
      "sqlite-vec": "^0.1.6",
      "openai": "^4.0.0",
      "zod": "^3.23.0",
    },
  };

  fs.writeFileSync(
    path.join(serverDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // The actual MCP server
  const serverCode = `#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "vectors.db");

const db = new Database(dbPath);
sqliteVec.load(db);

const openai = new OpenAI();

const server = new McpServer({
  name: "${name}",
  version: "1.0.0",
});

// Search tool - semantic search across the documentation
server.tool(
  "search",
  "Search the documentation semantically. Returns the most relevant passages.",
  {
    query: z.string().describe("What to search for"),
    limit: z.number().optional().describe("Number of results (default 5)"),
  },
  async ({ query, limit = 5 }) => {
    try {
      // Generate embedding for the query
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
      const queryEmbedding = response.data[0].embedding;
      const embeddingBuffer = new Float32Array(queryEmbedding).buffer;

      // Find similar chunks
      const results = db.prepare(\`
        SELECT
          chunks.content,
          chunks.url,
          chunks.title,
          vec_chunks.distance
        FROM vec_chunks
        LEFT JOIN chunks ON chunks.id = vec_chunks.rowid
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      \`).all(new Uint8Array(embeddingBuffer), limit);

      const formatted = results.map((r, i) =>
        \`[\${i + 1}] \${r.title}\\n\${r.content}\\nSource: \${r.url}\`
      ).join("\\n\\n---\\n\\n");

      return {
        content: [{ type: "text", text: formatted || "No results found." }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true,
      };
    }
  }
);

// Ask tool - answer questions with citations
server.tool(
  "ask",
  "Ask a question about the documentation and get an answer with sources.",
  {
    question: z.string().describe("Your question"),
  },
  async ({ question }) => {
    try {
      // Get relevant context
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: question,
      });
      const queryEmbedding = response.data[0].embedding;
      const embeddingBuffer = new Float32Array(queryEmbedding).buffer;

      const results = db.prepare(\`
        SELECT chunks.content, chunks.url, chunks.title
        FROM vec_chunks
        LEFT JOIN chunks ON chunks.id = vec_chunks.rowid
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT 5
      \`).all(new Uint8Array(embeddingBuffer));

      const context = results.map(r => r.content).join("\\n\\n");
      const sources = [...new Set(results.map(r => r.url))];

      return {
        content: [{
          type: "text",
          text: \`Based on the documentation:\\n\\n\${context}\\n\\nSources:\\n\${sources.map(s => \`- \${s}\`).join("\\n")}\`
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true,
      };
    }
  }
);

// Sources tool - list all indexed pages
server.tool(
  "sources",
  "List all the documentation pages that have been indexed.",
  {},
  async () => {
    const pages = db.prepare(
      "SELECT DISTINCT url, title FROM chunks ORDER BY title"
    ).all();

    const list = pages.map(p => \`- \${p.title}: \${p.url}\`).join("\\n");

    return {
      content: [{
        type: "text",
        text: \`Indexed \${pages.length} pages:\\n\\n\${list}\`
      }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
`;

  fs.writeFileSync(path.join(serverDir, "index.js"), serverCode);
}
