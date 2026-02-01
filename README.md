# docslurp

Give Claude Code access to any documentation. Always up to date, never hallucinated.

## What is this?

docslurp crawls a documentation website, chunks the content, generates embeddings, and creates an MCP server. Connect it to Claude Code and Claude can pull in the latest docs while helping you build. This way you're working with current APIs, not whatever was in the training data.

## Quick start

```bash
# Install globally
npm install -g docslurp

# Set your API keys
export OPENAI_API_KEY=sk-...

# Create an MCP server from docs (use --playwright or --firecrawl for JS-rendered sites)
docslurp https://docs.example.com --name my-docs

# Install the generated server's dependencies
cd ~/.docslurp/servers/my-docs && npm install

# Add to Claude Code
claude mcp add my-docs -- node ~/.docslurp/servers/my-docs/index.js
```

That's it. Claude now has real-time access to the docs while helping you build.

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
| `docslurp update <name>` | Re-scrape and refresh all sources |
| `docslurp sources <name>` | List all sources with their stats |
| `docslurp list` | Show all your servers |
| `docslurp remove <name>` | Delete a server |
| `docslurp connect <name>` | Print the command to add it to Claude Code |

## Options

**For `create` and `add`:**
```
--name, -n       Name for the server (required for create)
--to, -t         Server to add to (required for add)
--depth, -d      How many links deep to crawl (default: 3)
--max-pages, -m  Maximum pages to crawl (default: 100)
--firecrawl, -f  Use Firecrawl API for JS-rendered sites (fast, 500 page limit on free tier)
--playwright, -p Use Playwright for JS-rendered sites (slower but free, no limits)
--force          Skip duplicate check, add as new source (add only)
--continue       Resume an interrupted crawl (add only)
```

**For `update`:**
```
--url, -u        Only update a specific source URL
--depth, -d      How many links deep to crawl (default: 3)
--max-pages, -m  Maximum pages to crawl (default: 100)
--firecrawl, -f  Use Firecrawl for JS-rendered sites
--playwright, -p Use Playwright for JS-rendered sites
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

Some docs sites (like Salesforce, Notion, etc.) load content with JavaScript. The default crawler won't pick those up. You have two options:

### Option 1: Playwright (free, no limits)

Playwright runs a real browser to render pages. It's slower but completely free with no page limits:

```bash
docslurp https://developer.salesforce.com/docs --name sf-docs --playwright
```

Note: First run will download browser binaries (~150MB).

### Option 2: Firecrawl (fast, API-based)

Firecrawl is faster but requires an API key and has a 500 page limit on the free tier:

```bash
export FIRECRAWL_API_KEY=fc-...
docslurp https://developer.salesforce.com/docs --name sf-docs --firecrawl
```

Get your API key at https://firecrawl.dev.

## Where stuff lives

Servers are stored in `~/.docslurp/servers/`. Each one has:
- `index.js` - The MCP server
- `vectors.db` - SQLite database with embeddings
- `config.json` - Metadata about the crawl
- `package.json` - Dependencies (run `npm install` here before use)

## Examples

```bash
# Index React docs (static site, default crawler works fine)
docslurp https://react.dev/learn --name react-docs

# Index Salesforce docs with Playwright (free, no limits)
docslurp https://developer.salesforce.com/docs --name sf-docs --playwright

# Index Salesforce docs with Firecrawl (faster but has page limits)
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

**Auto-deduplication**: If you add a URL that already exists, docslurp will update it instead of creating duplicates:

```bash
# This updates the existing source instead of duplicating
docslurp add https://docs.stripe.com --to payment-apis

# Use --force to add as a new source anyway
docslurp add https://docs.stripe.com --to payment-apis --force
```

## Updating docs

When documentation changes, re-scrape to get the latest content:

```bash
# Update all sources for a server
docslurp update my-docs

# Update just one specific source
docslurp update my-docs --url https://docs.example.com

# See what sources exist
docslurp sources my-docs
```

The `sources` command shows each source with page counts and when it was added:

```
Sources for my-docs:

ID  URL                                              Pages  Chunks  Added
────────────────────────────────────────────────────────────────────────────────
 1  https://docs.stripe.com                            42     215  1/15/2026
 2  https://www.twilio.com/docs                        38     189  1/20/2026
────────────────────────────────────────────────────────────────────────────────
Total: 2 source(s)
```

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
