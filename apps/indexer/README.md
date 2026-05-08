# nazu code-graph indexer

Indexes codebases into per-project FalkorDB graphs for rich code intelligence queries. Uses real language tooling — no pattern matching hacks.

| Language | Tooling |
|---|---|
| TypeScript / JavaScript | ts-morph (TypeScript compiler API) |
| Svelte | script block extraction → ts-morph |
| Python | jedi (LSP backend) |
| Rust | syn + cargo_metadata (native binary) |
| Go | go/ast + go/packages (native binary) |

## Quick start

```bash
# Build everything
just build-indexer

# Index nazu itself
just index nazu

# Index wealth
just index wealth

# Index any project
just index-path /path/to/project code:myproject
```

## Architecture

Each project gets a named FalkorDB graph (`code:nazu`, `code:wealth`, etc.). The indexer does a **full rebuild** on every run — it deletes the existing graph and re-populates it. This keeps the graph consistent with the current codebase.

### Graph schema

**Nodes:** `Project`, `File`, `Symbol`, `Dependency`, `Service`, `EnvVar`

`Symbol.kind` values: `function`, `method`, `class`, `interface`, `type`, `struct`, `enum`, `trait`, `impl`, `macro`, `component`, `route`, `table`, `constant`, `variable`

**Relationships:** `DEFINES`, `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `DEPENDS_ON`, `CONNECTS_TO`, `READS_ENV`

### Cross-project queries

FalkorDB graphs are isolated. Cross-project queries are federated at the application layer — the MCP `cross_project_query` tool and the API query each registered graph and merges results.

## MCP server

The indexer doubles as an MCP server for Claude Code:

```bash
# Run MCP server (stdio transport)
pnpm --filter @nazu/indexer mcp
```

Configure in `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "node",
      "args": ["/Users/nazuraki/src/nazu/apps/indexer/dist/mcp.js"]
    }
  }
}
```

### Available MCP tools

| Tool | Description |
|---|---|
| `list_projects` | List registered projects |
| `get_project_overview` | File/symbol counts, services, deps |
| `find_symbol(project, name)` | Fuzzy symbol search |
| `find_callers(project, symbol_name)` | Who calls this symbol |
| `query_code_graph(project, cypher)` | Raw Cypher query |
| `cross_project_query(cypher)` | Query all projects, merge results |

### Example queries

```cypher
-- All exported functions in nazu
MATCH (s:Symbol {kind: 'function', exported: true}) RETURN s.name, s.file ORDER BY s.name

-- Call graph: who calls validateCFToken?
MATCH (caller:Symbol)-[:CALLS]->(callee:Symbol {name: 'validateCFToken'})
RETURN caller.name, caller.file

-- Services nazu connects to
MATCH (s:Symbol)-[:CONNECTS_TO]->(svc:Service) RETURN svc.name, svc.technology, collect(s.name)

-- Cross-project: which npm packages are shared?
-- (run via cross_project_query)
MATCH (d:Dependency {ecosystem: 'npm'}) RETURN d.name, d.version
```

## Adding `just index` to another project

1. Add the project to [`projects.json`](./projects.json):

```json
{
  "name": "myproject",
  "path": "/absolute/path/to/myproject",
  "graph": "code:myproject",
  "github": "owner/repo"
}
```

2. Optionally add a recipe to the project's own `Justfile`:

```just
# Re-index this project in nazu's code graph
index:
    node /Users/nazuraki/src/nazu/apps/indexer/dist/cli.js --path . --graph code:myproject
```

Or use the env var approach:

```just
index:
    node ${NAZU_INDEXER:-/Users/nazuraki/src/nazu/apps/indexer/dist/cli.js} --path . --graph code:myproject
```

3. Add to the project's `CLAUDE.md` so Claude uses the graph instead of reading source files:

```markdown
## Code intelligence

This project is indexed in nazu's code graph as `code:myproject`.

At the start of every session, call `get_project_overview("myproject")` via the
`code-graph` MCP server to orient yourself. Use `find_symbol`, `find_callers`,
and `query_code_graph` for targeted lookups — do not read source files to answer
structural questions.

Example queries:
- "What functions exist in the auth module?" → find_symbol("myproject", "auth")
- "Who calls saveUser?" → find_callers("myproject", "saveUser")
- "What services does this project use?" → get_project_overview("myproject")
```

## GitHub webhook auto-reindex

On every push, GitHub can trigger an automatic reindex via nazu's webhook endpoint.

1. Add env vars to `.env`:

```
GITHUB_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
REPO_CACHE_DIR=/var/cache/nazu/repos
```

2. Create the cache directory on the server:

```bash
mkdir -p /var/cache/nazu/repos
```

3. In GitHub → repo settings → Webhooks → Add webhook:
   - **Payload URL**: `https://<your-nazu-host>/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: (same as `GITHUB_WEBHOOK_SECRET`)
   - **Events**: Just the `push` event

The webhook responds 200 immediately and runs the indexer in the background against a cached checkout in `REPO_CACHE_DIR`.

## Building native binaries

```bash
# Rust (required for Rust project indexing)
cargo build --release --manifest-path apps/indexer/native/rust-indexer/Cargo.toml

# Go (required for Go project indexing)
cd apps/indexer/native/go-indexer
go mod download
go build -o go-indexer .
```

The binaries are looked up at runtime relative to the indexer package root. Missing binaries produce a warning and an empty result for that language — the rest of the index still completes.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `FALKORDB_ADDR` | `localhost:6380` | FalkorDB host:port (host machine) |
| `PYTHON` | `/opt/homebrew/bin/python3.14` | Python interpreter for jedi_indexer.py |
| `GITHUB_WEBHOOK_SECRET` | — | HMAC secret for webhook signature verification |
| `REPO_CACHE_DIR` | `/var/cache/nazu/repos` | Directory for cached git checkouts |
