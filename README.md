# docslurp

Turn any documentation site into an MCP server with semantic search.

## What is this?

docslurp crawls a documentation website, chunks the content, generates embeddings, and spits out a ready-to-use MCP server. You can then connect it to Claude Code (or any MCP-compatible tool) and search your docs using natural language.

## Quick start

```bash
# Install globally
npm install -g docslurp

# Set your API keys
export OPENAI_API_KEY=sk-...

# Create an MCP server from docs (use --firecrawl for JS-rendered sites)
docslurp https://docs.example.com --name my-docs

# Install the generated server's dependencies
cd ~/.docslurp/servers/my-docs && npm install

# Add to Claude Code
claude mcp add my-docs -- node ~/.docslurp/servers/my-docs/index.js
```

That's it. Now you can ask Claude questions about your documentation.

## How it works

1. **Crawl** - docslurp fetches pages from your docs site, following internal links
2. **Chunk** - Long pages get split into smaller pieces (with overlap to maintain context)
3. **Embed** - Each chunk gets converted to a vector using OpenAI's embedding API
4. **Store** - Everything goes into a SQLite database with vector search support
5. **Generate** - An MCP server is created that can search those vectors

The generated server has three tools:
- `search` - Find relevant passages
- `ask` - Get answers with source citations
- `sources` - See what pages were indexed

## Commands

| Command | What it does |
|---------|-------------|
| `docslurp <url> --name <name>` | Create an MCP server from a docs site |
| `docslurp add <url> --to <name>` | Add more docs to an existing server |
| `docslurp list` | Show all your servers |
| `docslurp remove <name>` | Delete a server |
| `docslurp connect <name>` | Print the command to add it to Claude Code |

## Options

```
--name, -n      Name for the server (required)
--depth, -d     How many links deep to crawl (default: 3)
--max-pages, -m Maximum pages to crawl (default: 100)
--firecrawl, -f Use Firecrawl for JavaScript-rendered sites
```

## Requirements

You'll need an OpenAI API key for generating embeddings:

```bash
export OPENAI_API_KEY=sk-...
```

The generated servers also use this key at runtime for search queries.

After creating a server, install its dependencies before using it:

```bash
cd ~/.docslurp/servers/<name> && npm install
```

## JavaScript-rendered sites

Some docs sites (like Salesforce, Notion, etc.) load content with JavaScript. The default crawler won't pick those up. Use the `--firecrawl` flag instead:

```bash
export FIRECRAWL_API_KEY=fc-...
docslurp https://developer.salesforce.com/docs --name sf-docs --firecrawl
```

Get your Firecrawl API key at https://firecrawl.dev (they have a free tier).

## Where stuff lives

Servers are stored in `~/.docslurp/servers/`. Each one has:
- `index.js` - The MCP server
- `vectors.db` - SQLite database with embeddings
- `config.json` - Metadata about the crawl
- `package.json` - Dependencies (run `npm install` here before use)

## Examples

```bash
# Index React docs (static site, no firecrawl needed)
docslurp https://react.dev/learn --name react-docs

# Index Salesforce docs (JS-rendered, needs firecrawl)
docslurp https://developer.salesforce.com/docs --name sf-docs --firecrawl

# Index with more depth
docslurp https://docs.myproject.dev --name myproject --depth 5

# Limit pages for a smaller index
docslurp https://docs.python.org/3/tutorial --name python-tutorial --max-pages 50
```

## Combining multiple doc sources

You can consolidate docs from different sites into a single server:

```bash
# Create server with first doc source
docslurp https://docs.stripe.com --name payment-apis

# Add more sources to the same server
docslurp add https://www.twilio.com/docs --to payment-apis
docslurp add https://docs.plaid.com --to payment-apis
```

Now searching `payment-apis` will hit all three doc sources at once.

## Limitations

- Rate limiting isn't configurable yet, so very large sites might take a while
- Only supports OpenAI embeddings for now

## Development

```bash
# Clone it
git clone https://github.com/jamesagudo/docslurp.git
cd docslurp

# Install dependencies
npm install

# Build
npm run build

# Link for local testing
cd packages/cli && npm link

# If you get "permission denied" after rebuilding, clear the shell hash:
hash -r
```

## License

MIT
