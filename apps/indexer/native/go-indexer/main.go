// go-indexer: analyze a Go project and emit a JSON AnalysisResult to stdout.
// Usage: go-indexer <project_root>
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ── Output types (mirror TypeScript AnalysisResult) ──────────────────────────

type FileInfo struct {
	Path     string `json:"path"`
	Language string `json:"language"`
	Loc      int    `json:"loc"`
	Test     bool   `json:"test"`
}

type SymbolInfo struct {
	FQN       string `json:"fqn"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Signature string `json:"signature"`
	Doc       string `json:"doc"`
	File      string `json:"file"`
	Line      int    `json:"line"`
	Exported  bool   `json:"exported"`
}

type RelationInfo struct {
	FromFQN string `json:"fromFqn"`
	ToFQN   string `json:"toFqn"`
	Rel     string `json:"rel"`
}

type DepInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Ecosystem string `json:"ecosystem"`
}

type ServiceInfo struct {
	Name       string `json:"name"`
	Technology string `json:"technology"`
}

type EnvVarInfo struct {
	Name    string `json:"name"`
	Purpose string `json:"purpose"`
}

type Output struct {
	Files        []FileInfo    `json:"files"`
	Symbols      []SymbolInfo  `json:"symbols"`
	Relations    []RelationInfo `json:"relations"`
	Dependencies []DepInfo     `json:"dependencies"`
	Services     []ServiceInfo `json:"services"`
	EnvVars      []EnvVarInfo  `json:"envvars"`
}

// ── Service patterns ──────────────────────────────────────────────────────────

var servicePatterns = []struct{ pattern, name, tech string }{
	{"database/sql", "sql", "sql"},
	{"postgres", "postgres", "postgres"},
	{"pgx", "postgres", "postgres"},
	{"go-redis", "redis", "redis"},
	{"redis", "redis", "redis"},
	{"minio-go", "minio", "s3"},
	{"aws-sdk-go", "minio", "s3"},
	{"mattn/go-sqlite3", "sqlite", "sqlite"},
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func fqn(relPath, name string) string {
	return relPath + "::" + name
}

func isTest(relPath string) bool {
	return strings.HasSuffix(relPath, "_test.go") || strings.Contains(relPath, "/testdata/")
}

func countLines(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	return strings.Count(string(data), "\n") + 1
}

func docString(cg *ast.CommentGroup) string {
	if cg == nil {
		return ""
	}
	var parts []string
	for _, c := range cg.List {
		text := strings.TrimPrefix(c.Text, "//")
		text = strings.TrimPrefix(text, "/*")
		text = strings.TrimSuffix(text, "*/")
		parts = append(parts, strings.TrimSpace(text))
	}
	return strings.Join(parts, " ")
}

func exprName(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name
	case *ast.SelectorExpr:
		return exprName(e.X) + "." + e.Sel.Name
	case *ast.IndexExpr:
		return exprName(e.X)
	default:
		return ""
	}
}

// ── File analyzer ─────────────────────────────────────────────────────────────

type fileCollector struct {
	relPath    string
	fset       *token.FileSet
	symbols    []SymbolInfo
	relations  []RelationInfo
	scopeStack []string // current enclosing function fqns
}

func (fc *fileCollector) currentScope() string {
	if len(fc.scopeStack) == 0 {
		return ""
	}
	return fc.scopeStack[len(fc.scopeStack)-1]
}

func (fc *fileCollector) visitDecl(decl ast.Decl) {
	switch d := decl.(type) {
	case *ast.FuncDecl:
		fc.visitFuncDecl(d)
	case *ast.GenDecl:
		fc.visitGenDecl(d)
	}
}

func (fc *fileCollector) visitFuncDecl(fn *ast.FuncDecl) {
	name := fn.Name.Name
	var sig strings.Builder
	sig.WriteString("func ")
	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		recv := fn.Recv.List[0].Type
		sig.WriteString("(")
		sig.WriteString(exprName(recv))
		sig.WriteString(") ")
	}
	sig.WriteString(name)
	sig.WriteString("(...)")

	doc := docString(fn.Doc)
	pos := fc.fset.Position(fn.Pos())
	exported := ast.IsExported(name)

	fullFQN := fqn(fc.relPath, name)
	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		recv := exprName(fn.Recv.List[0].Type)
		fullFQN = fqn(fc.relPath, recv+"."+name)
	}

	fc.symbols = append(fc.symbols, SymbolInfo{
		FQN:       fullFQN,
		Name:      name,
		Kind:      "function",
		Signature: sig.String(),
		Doc:       doc,
		File:      fc.relPath,
		Line:      pos.Line,
		Exported:  exported,
	})

	// Walk body for call expressions
	fc.scopeStack = append(fc.scopeStack, fullFQN)
	if fn.Body != nil {
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			callee := exprName(call.Fun)
			if callee != "" && fc.currentScope() != "" {
				fc.relations = append(fc.relations, RelationInfo{
					FromFQN: fc.currentScope(),
					ToFQN:   callee,
					Rel:     "CALLS",
				})
			}
			return true
		})
	}
	fc.scopeStack = fc.scopeStack[:len(fc.scopeStack)-1]
}

func (fc *fileCollector) visitGenDecl(gd *ast.GenDecl) {
	for _, spec := range gd.Specs {
		switch s := spec.(type) {
		case *ast.TypeSpec:
			kind := "type"
			if _, ok := s.Type.(*ast.StructType); ok {
				kind = "struct"
			} else if _, ok := s.Type.(*ast.InterfaceType); ok {
				kind = "interface"
			}
			doc := docString(gd.Doc)
			pos := fc.fset.Position(s.Pos())
			fc.symbols = append(fc.symbols, SymbolInfo{
				FQN:       fqn(fc.relPath, s.Name.Name),
				Name:      s.Name.Name,
				Kind:      kind,
				Signature: fmt.Sprintf("type %s %s", s.Name.Name, kind),
				Doc:       doc,
				File:      fc.relPath,
				Line:      pos.Line,
				Exported:  ast.IsExported(s.Name.Name),
			})
		case *ast.ValueSpec:
			for _, name := range s.Names {
				kind := "variable"
				if gd.Tok == token.CONST {
					kind = "constant"
				}
				pos := fc.fset.Position(name.Pos())
				fc.symbols = append(fc.symbols, SymbolInfo{
					FQN:      fqn(fc.relPath, name.Name),
					Name:     name.Name,
					Kind:     kind,
					File:     fc.relPath,
					Line:     pos.Line,
					Exported: ast.IsExported(name.Name),
				})
			}
		}
	}
}

// ── Go module deps via `go list` ──────────────────────────────────────────────

type goListPkg struct {
	ImportPath string
	Module     *struct {
		Path    string
		Version string
		Require []struct {
			Path    string
			Version string
		}
	}
}

func loadGoDeps(projectRoot string) []DepInfo {
	cmd := exec.Command("go", "list", "-json", "-m", "all")
	cmd.Dir = projectRoot
	out, err := cmd.Output()
	if err != nil {
		return nil
	}

	var deps []DepInfo
	seen := map[string]bool{}
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for dec.More() {
		var m struct {
			Path    string
			Version string
			Main    bool
		}
		if err := dec.Decode(&m); err != nil {
			break
		}
		if m.Main || m.Path == "" || seen[m.Path] {
			continue
		}
		seen[m.Path] = true
		deps = append(deps, DepInfo{Name: m.Path, Version: m.Version, Ecosystem: "gomod"})
	}
	return deps
}

// ── Env var detection ─────────────────────────────────────────────────────────

func scanEnvVars(src string) []EnvVarInfo {
	var result []EnvVarInfo
	seen := map[string]bool{}
	// os.Getenv("VAR") and os.LookupEnv("VAR")
	for _, prefix := range []string{`os.Getenv("`, `os.LookupEnv("`} {
		s := src
		for {
			pos := strings.Index(s, prefix)
			if pos < 0 {
				break
			}
			rest := s[pos+len(prefix):]
			end := strings.Index(rest, `"`)
			if end < 0 {
				break
			}
			name := rest[:end]
			if isEnvVarName(name) && !seen[name] {
				seen[name] = true
				result = append(result, EnvVarInfo{Name: name, Purpose: ""})
			}
			s = rest[end+1:]
		}
	}
	return result
}

func isEnvVarName(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, c := range s {
		if !(c >= 'A' && c <= 'Z' || c == '_' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: go-indexer <project_root>")
		os.Exit(1)
	}
	projectRoot, err := filepath.Abs(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	output := Output{
		Files:        []FileInfo{},
		Symbols:      []SymbolInfo{},
		Relations:    []RelationInfo{},
		Dependencies: []DepInfo{},
		Services:     []ServiceInfo{},
		EnvVars:      []EnvVarInfo{},
	}

	seenSvc := map[string]bool{}
	seenEnv := map[string]bool{}
	fset := token.NewFileSet()

	exclude := map[string]bool{"vendor": true, "node_modules": true, ".git": true, "testdata": true}

	err = filepath.Walk(projectRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && exclude[info.Name()] {
			return filepath.SkipDir
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}

		relPath, _ := filepath.Rel(projectRoot, path)
		relPath = filepath.ToSlash(relPath)

		src, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		srcStr := string(src)

		output.Files = append(output.Files, FileInfo{
			Path:     relPath,
			Language: "go",
			Loc:      countLines(path),
			Test:     isTest(relPath),
		})

		af, parseErr := parser.ParseFile(fset, path, srcStr, parser.ParseComments)
		if parseErr != nil {
			return nil
		}

		fc := &fileCollector{relPath: relPath, fset: fset}
		for _, decl := range af.Decls {
			fc.visitDecl(decl)
		}
		output.Symbols = append(output.Symbols, fc.symbols...)
		output.Relations = append(output.Relations, fc.relations...)

		// Env vars
		for _, ev := range scanEnvVars(srcStr) {
			if !seenEnv[ev.Name] {
				seenEnv[ev.Name] = true
				output.EnvVars = append(output.EnvVars, ev)
			}
		}

		// Services (from import paths)
		for _, imp := range af.Imports {
			if imp.Path == nil {
				continue
			}
			impPath := strings.Trim(imp.Path.Value, `"`)
			for _, pat := range servicePatterns {
				if strings.Contains(impPath, pat.pattern) && !seenSvc[pat.name] {
					seenSvc[pat.name] = true
					output.Services = append(output.Services, ServiceInfo{Name: pat.name, Technology: pat.tech})
				}
			}
		}

		return nil
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "walk error:", err)
	}

	output.Dependencies = loadGoDeps(projectRoot)
	if output.Dependencies == nil {
		output.Dependencies = []DepInfo{}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "")
	_ = enc.Encode(output)
}
