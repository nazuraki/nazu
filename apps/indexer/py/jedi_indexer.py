#!/usr/bin/env python3
"""
Jedi-based Python code indexer. Accepts project root as argv[1].
Outputs a single JSON object to stdout.
"""
import sys
import os
import ast
import json
import pathlib
from typing import Any

try:
    import jedi
    HAS_JEDI = True
except ImportError:
    HAS_JEDI = False

PROJECT_ROOT = pathlib.Path(sys.argv[1]).resolve()

EXCLUDE = {".venv", "venv", "__pycache__", ".git", "dist", "build", "node_modules"}

ENV_FUNCS = {"os.environ.get", "os.getenv", "os.environ.__getitem__"}

SERVICE_PATTERNS = {
    "postgres": ["psycopg", "asyncpg", "DATABASE_URL", "pg.connect"],
    "redis": ["redis.Redis", "aioredis", "Redis("],
    "minio": ["minio", "boto3", "S3Client"],
    "sqlite": ["sqlite3", "aiosqlite"],
}


def count_lines(path: pathlib.Path) -> int:
    try:
        return path.read_text(encoding="utf-8", errors="replace").count("\n") + 1
    except Exception:
        return 0


def is_test_file(rel: str) -> bool:
    return any(p in rel for p in ["test_", "_test", "/tests/", "/test/"])


def collect_py_files() -> list[pathlib.Path]:
    result = []
    for p in PROJECT_ROOT.rglob("*.py"):
        if any(ex in p.parts for ex in EXCLUDE):
            continue
        result.append(p)
    return result


def parse_module(path: pathlib.Path) -> tuple[ast.Module | None, str]:
    try:
        src = path.read_text(encoding="utf-8", errors="replace")
        return ast.parse(src, filename=str(path)), src
    except SyntaxError:
        return None, ""


def extract_symbols(tree: ast.Module, rel: str) -> list[dict]:
    symbols = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            args = [a.arg for a in node.args.args]
            sig = f"def {node.name}({', '.join(args)})"
            doc = ast.get_docstring(node) or ""
            symbols.append({
                "fqn": f"{rel}::{node.name}",
                "name": node.name,
                "kind": "function",
                "signature": sig[:200],
                "doc": doc[:400],
                "file": rel,
                "line": node.lineno,
                "exported": not node.name.startswith("_"),
            })
        elif isinstance(node, ast.ClassDef):
            doc = ast.get_docstring(node) or ""
            symbols.append({
                "fqn": f"{rel}::{node.name}",
                "name": node.name,
                "kind": "class",
                "signature": f"class {node.name}",
                "doc": doc[:400],
                "file": rel,
                "line": node.lineno,
                "exported": not node.name.startswith("_"),
            })
    return symbols


def extract_envvars(src: str) -> list[dict]:
    seen: set[str] = set()
    result = []
    import re
    # os.environ.get("VAR") / os.getenv("VAR") / os.environ["VAR"]
    for m in re.finditer(r'os\.(?:environ\.get|getenv|environ\[)\s*\(\s*[\'"]([A-Z_][A-Z0-9_]*)[\'"]\s*\)', src):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            result.append({"name": name, "purpose": ""})
    for m in re.finditer(r'os\.environ\[[\'"]([A-Z_][A-Z0-9_]*)[\'"]\]', src):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            result.append({"name": name, "purpose": ""})
    return result


def extract_services(src: str) -> list[dict]:
    seen: set[str] = set()
    result = []
    for svc, patterns in SERVICE_PATTERNS.items():
        for pat in patterns:
            if pat in src and svc not in seen:
                seen.add(svc)
                result.append({"name": svc, "technology": svc})
                break
    return result


def resolve_calls_jedi(path: pathlib.Path, tree: ast.Module, rel: str) -> list[dict]:
    if not HAS_JEDI:
        return []
    src = path.read_text(encoding="utf-8", errors="replace")
    script = jedi.Script(source=src, path=str(path))
    relations = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        try:
            defs = script.goto(node.lineno, node.col_offset)
            for d in defs:
                if not d.module_path or not d.name:
                    continue
                target_rel = str(pathlib.Path(d.module_path).relative_to(PROJECT_ROOT))
                target_fqn = f"{target_rel}::{d.name}"
                # Find enclosing function name (best effort)
                relations.append({
                    "fromFqn": f"{rel}::<module>",
                    "toFqn": target_fqn,
                    "rel": "CALLS",
                })
        except Exception:
            pass
    return relations


def load_requirements(root: pathlib.Path) -> list[dict]:
    deps = []
    for fname in ["requirements.txt", "requirements-dev.txt"]:
        req_path = root / fname
        if not req_path.exists():
            continue
        for line in req_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            import re
            m = re.match(r"^([A-Za-z0-9_\-\.]+)\s*(?:[>=<~!]=?\s*([\w\.]+))?", line)
            if m:
                deps.append({"name": m.group(1), "version": m.group(2) or "", "ecosystem": "pypi"})
    # Also check pyproject.toml
    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        import re
        text = pyproject.read_text()
        for m in re.finditer(r'"([A-Za-z0-9_\-\.]+)\s*(?:[>=<~!]=?\s*[\w\.]+)?"', text):
            deps.append({"name": m.group(1), "version": "", "ecosystem": "pypi"})
    return deps


def main():
    files_out = []
    symbols_out = []
    relations_out = []
    services_out: list[dict] = []
    envvars_out: list[dict] = []
    seen_services: set[str] = set()
    seen_envvars: set[str] = set()

    for path in collect_py_files():
        rel = str(path.relative_to(PROJECT_ROOT))
        loc = count_lines(path)
        files_out.append({"path": rel, "language": "python", "loc": loc, "test": is_test_file(rel)})

        tree, src = parse_module(path)
        if tree is None:
            continue

        symbols_out.extend(extract_symbols(tree, rel))
        relations_out.extend(resolve_calls_jedi(path, tree, rel))

        for ev in extract_envvars(src):
            if ev["name"] not in seen_envvars:
                seen_envvars.add(ev["name"])
                envvars_out.append(ev)

        for svc in extract_services(src):
            if svc["name"] not in seen_services:
                seen_services.add(svc["name"])
                services_out.append(svc)

    deps = load_requirements(PROJECT_ROOT)

    print(json.dumps({
        "files": files_out,
        "symbols": symbols_out,
        "relations": relations_out,
        "dependencies": deps,
        "services": services_out,
        "envvars": envvars_out,
    }))


if __name__ == "__main__":
    main()
