use anyhow::{Context, Result};
use cargo_metadata::MetadataCommand;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    env,
    fs,
    path::{Path, PathBuf},
};
use syn::{
    visit::Visit,
    File as SynFile, ImplItem, Item,
};
use walkdir::WalkDir;

// ── Output types (match TypeScript AnalysisResult) ───────────────────────────

#[derive(Serialize)]
struct FileInfo {
    path: String,
    language: String,
    loc: usize,
    test: bool,
}

#[derive(Serialize)]
struct SymbolInfo {
    fqn: String,
    name: String,
    kind: String,
    signature: String,
    doc: String,
    file: String,
    line: usize,
    exported: bool,
}

#[derive(Serialize)]
struct RelationInfo {
    #[serde(rename = "fromFqn")]
    from_fqn: String,
    #[serde(rename = "toFqn")]
    to_fqn: String,
    rel: String,
}

#[derive(Serialize)]
struct DepInfo {
    name: String,
    version: String,
    ecosystem: String,
}

#[derive(Serialize)]
struct ServiceInfo {
    name: String,
    technology: String,
}

#[derive(Serialize)]
struct EnvVarInfo {
    name: String,
    purpose: String,
}

#[derive(Serialize, Default)]
struct Output {
    files: Vec<FileInfo>,
    symbols: Vec<SymbolInfo>,
    relations: Vec<RelationInfo>,
    dependencies: Vec<DepInfo>,
    services: Vec<ServiceInfo>,
    envvars: Vec<EnvVarInfo>,
}

// ── Visitor ───────────────────────────────────────────────────────────────────

struct Collector<'a> {
    rel_path: &'a str,
    symbols: Vec<SymbolInfo>,
    relations: Vec<RelationInfo>,
    // current enclosing symbol fqn for CALLS edges
    scope_stack: Vec<String>,
}

impl<'a> Collector<'a> {
    fn new(rel_path: &'a str) -> Self {
        Self {
            rel_path,
            symbols: Vec::new(),
            relations: Vec::new(),
            scope_stack: Vec::new(),
        }
    }

    fn fqn(&self, name: &str) -> String {
        format!("{}::{}", self.rel_path, name)
    }

    fn current_scope(&self) -> Option<&str> {
        self.scope_stack.last().map(String::as_str)
    }

    fn push_fn(&mut self, name: &str) {
        self.scope_stack.push(self.fqn(name));
    }

    fn pop_fn(&mut self) {
        self.scope_stack.pop();
    }
}

fn attrs_to_doc(attrs: &[syn::Attribute]) -> String {
    attrs
        .iter()
        .filter_map(|a| {
            if a.path().is_ident("doc") {
                if let syn::Meta::NameValue(nv) = &a.meta {
                    if let syn::Expr::Lit(syn::ExprLit { lit: syn::Lit::Str(s), .. }) = &nv.value {
                        return Some(s.value().trim().to_string());
                    }
                }
            }
            None
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_pub(vis: &syn::Visibility) -> bool {
    matches!(vis, syn::Visibility::Public(_))
}

fn fn_sig(sig: &syn::Signature) -> String {
    format!("fn {}({})", sig.ident, sig.inputs.len())
}

impl<'a, 'ast> Visit<'ast> for Collector<'a> {
    fn visit_item_fn(&mut self, node: &'ast syn::ItemFn) {
        let name = node.sig.ident.to_string();
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&name),
            name: name.clone(),
            kind: "function".into(),
            signature: fn_sig(&node.sig),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0, // syn doesn't give line numbers without proc_macro2 spans in file context
            exported: is_pub(&node.vis),
        });
        self.push_fn(&name);
        syn::visit::visit_item_fn(self, node);
        self.pop_fn();
    }

    fn visit_item_struct(&mut self, node: &'ast syn::ItemStruct) {
        let name = node.ident.to_string();
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&name),
            name: name.clone(),
            kind: "struct".into(),
            signature: format!("struct {}", name),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0,
            exported: is_pub(&node.vis),
        });
        syn::visit::visit_item_struct(self, node);
    }

    fn visit_item_enum(&mut self, node: &'ast syn::ItemEnum) {
        let name = node.ident.to_string();
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&name),
            name: name.clone(),
            kind: "enum".into(),
            signature: format!("enum {}", name),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0,
            exported: is_pub(&node.vis),
        });
        syn::visit::visit_item_enum(self, node);
    }

    fn visit_item_trait(&mut self, node: &'ast syn::ItemTrait) {
        let name = node.ident.to_string();
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&name),
            name: name.clone(),
            kind: "trait".into(),
            signature: format!("trait {}", name),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0,
            exported: is_pub(&node.vis),
        });
        syn::visit::visit_item_trait(self, node);
    }

    fn visit_item_impl(&mut self, node: &'ast syn::ItemImpl) {
        let self_ty = quote_type(&node.self_ty);
        let trait_name = node.trait_.as_ref().map(|(_, p, _)| quote_path(p));
        let impl_name = match &trait_name {
            Some(t) => format!("impl {} for {}", t, self_ty),
            None => format!("impl {}", self_ty),
        };
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&impl_name),
            name: impl_name.clone(),
            kind: "impl".into(),
            signature: impl_name.clone(),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0,
            exported: false,
        });

        // EXTENDS edge for trait impls
        if let Some(trait_name) = trait_name {
            self.relations.push(RelationInfo {
                from_fqn: self.fqn(&self_ty),
                to_fqn: trait_name,
                rel: "EXTENDS".into(),
            });
        }

        // Methods inside impl
        for item in &node.items {
            if let ImplItem::Fn(method) = item {
                let method_name = format!("{}::{}", self_ty, method.sig.ident);
                self.symbols.push(SymbolInfo {
                    fqn: self.fqn(&method_name),
                    name: method_name.clone(),
                    kind: "method".into(),
                    signature: fn_sig(&method.sig),
                    doc: attrs_to_doc(&method.attrs),
                    file: self.rel_path.to_string(),
                    line: 0,
                    exported: is_pub(&method.vis),
                });
                self.push_fn(&method_name);
                syn::visit::visit_impl_item_fn(self, method);
                self.pop_fn();
            }
        }
    }

    fn visit_item_type(&mut self, node: &'ast syn::ItemType) {
        let name = node.ident.to_string();
        self.symbols.push(SymbolInfo {
            fqn: self.fqn(&name),
            name: name.clone(),
            kind: "type".into(),
            signature: format!("type {} = ...", name),
            doc: attrs_to_doc(&node.attrs),
            file: self.rel_path.to_string(),
            line: 0,
            exported: is_pub(&node.vis),
        });
    }

    fn visit_item_macro(&mut self, node: &'ast syn::ItemMacro) {
        if let Some(ident) = &node.ident {
            let name = ident.to_string();
            self.symbols.push(SymbolInfo {
                fqn: self.fqn(&name),
                name: name.clone(),
                kind: "macro".into(),
                signature: format!("macro_rules! {}", name),
                doc: attrs_to_doc(&node.attrs),
                file: self.rel_path.to_string(),
                line: 0,
                exported: false,
            });
        }
    }

    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        if let Some(caller) = self.current_scope() {
            let caller = caller.to_string();
            if let Some(name) = extract_call_name(&node.func) {
                self.relations.push(RelationInfo {
                    from_fqn: caller,
                    to_fqn: name,
                    rel: "CALLS".into(),
                });
            }
        }
        syn::visit::visit_expr_call(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        if let Some(caller) = self.current_scope() {
            let caller = caller.to_string();
            let method = node.method.to_string();
            self.relations.push(RelationInfo {
                from_fqn: caller,
                to_fqn: method,
                rel: "CALLS".into(),
            });
        }
        syn::visit::visit_expr_method_call(self, node);
    }

    fn visit_expr_macro(&mut self, node: &'ast syn::ExprMacro) {
        // Detect env!("VAR") macro
        if node.mac.path.is_ident("env") || node.mac.path.is_ident("option_env") {
            // Skip — handled by text scan below
        }
        syn::visit::visit_expr_macro(self, node);
    }
}

fn extract_call_name(expr: &syn::Expr) -> Option<String> {
    match expr {
        syn::Expr::Path(p) => Some(quote_path(&p.path)),
        syn::Expr::Field(f) => extract_call_name(&f.base),
        _ => None,
    }
}

fn quote_path(path: &syn::Path) -> String {
    path.segments.iter().map(|s| s.ident.to_string()).collect::<Vec<_>>().join("::")
}

fn quote_type(ty: &syn::Type) -> String {
    match ty {
        syn::Type::Path(p) => quote_path(&p.path),
        _ => "Unknown".into(),
    }
}

// ── Env var + service detection via text scan ────────────────────────────────

fn scan_envvars_simple(src: &str) -> Vec<EnvVarInfo> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    // Find std::env::var("...") patterns
    let mut s = src;
    while let Some(pos) = s.find("std::env::var(\"") {
        s = &s[pos + 15..];
        if let Some(end) = s.find('"') {
            let name = &s[..end];
            if name.chars().all(|c| c.is_uppercase() || c == '_' || c.is_ascii_digit()) && !name.is_empty() {
                if seen.insert(name.to_string()) {
                    out.push(EnvVarInfo { name: name.to_string(), purpose: String::new() });
                }
            }
        }
    }
    // Find env!("...") patterns
    let mut s2 = src;
    while let Some(pos) = s2.find("env!(\"") {
        s2 = &s2[pos + 6..];
        if let Some(end) = s2.find('"') {
            let name = &s2[..end];
            if name.chars().all(|c| c.is_uppercase() || c == '_' || c.is_ascii_digit()) && !name.is_empty() {
                if seen.insert(name.to_string()) {
                    out.push(EnvVarInfo { name: name.to_string(), purpose: String::new() });
                }
            }
        }
    }
    out
}

const SERVICE_PATS: &[(&str, &str)] = &[
    ("postgres", "postgres"),
    ("tokio_postgres", "postgres"),
    ("rusqlite", "sqlite"),
    ("sqlx", "sqlite"),
    ("redis", "redis"),
    ("minio", "minio"),
    ("aws_sdk_s3", "minio"),
    ("reqwest", "http"),
    ("tauri", "tauri"),
];

fn scan_services(src: &str) -> Vec<ServiceInfo> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (pat, technology) in SERVICE_PATS {
        if src.contains(pat) && seen.insert(*pat) {
            out.push(ServiceInfo { name: pat.to_string(), technology: technology.to_string() });
        }
    }
    out
}

// ── Cargo metadata ────────────────────────────────────────────────────────────

fn load_cargo_deps(project_root: &Path) -> Vec<DepInfo> {
    let manifest = project_root.join("Cargo.toml");
    if !manifest.exists() {
        return Vec::new();
    }
    let meta = MetadataCommand::new()
        .manifest_path(&manifest)
        .no_deps()
        .exec();
    match meta {
        Ok(m) => m
            .packages
            .iter()
            .flat_map(|pkg| {
                pkg.dependencies.iter().map(|d| DepInfo {
                    name: d.name.clone(),
                    version: d.req.to_string(),
                    ecosystem: "cargo".into(),
                })
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn is_test_file(rel: &str) -> bool {
    rel.contains("test") || rel.contains("tests/") || rel.contains("_test")
}

fn process_file(path: &Path, project_root: &Path) -> Result<(FileInfo, Vec<SymbolInfo>, Vec<RelationInfo>, Vec<EnvVarInfo>, Vec<ServiceInfo>)> {
    let src = fs::read_to_string(path).unwrap_or_default();
    let rel = path.strip_prefix(project_root)?.to_string_lossy().replace('\\', "/");
    let loc = src.lines().count();
    let test = is_test_file(&rel);

    let file_info = FileInfo {
        path: rel.clone(),
        language: "rust".into(),
        loc,
        test,
    };

    let parsed: SynFile = match syn::parse_str(&src) {
        Ok(f) => f,
        Err(_) => return Ok((file_info, vec![], vec![], vec![], vec![])),
    };

    let mut collector = Collector::new(Box::leak(rel.clone().into_boxed_str()));
    collector.visit_file(&parsed);

    let envvars = scan_envvars_simple(&src);
    let services = scan_services(&src);

    Ok((file_info, collector.symbols, collector.relations, envvars, services))
}

fn main() -> Result<()> {
    let project_root = PathBuf::from(env::args().nth(1).context("Usage: rust-indexer <project_root>")?);
    let project_root = project_root.canonicalize().context("Cannot resolve project root")?;

    let mut output = Output::default();
    let mut seen_services: HashSet<String> = HashSet::new();
    let mut seen_envvars: HashSet<String> = HashSet::new();

    let exclude = ["target", "node_modules", ".git"];

    for entry in WalkDir::new(&project_root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        if path.components().any(|c| exclude.contains(&c.as_os_str().to_str().unwrap_or(""))) {
            continue;
        }
        match process_file(path, &project_root) {
            Ok((file, syms, rels, evs, svcs)) => {
                output.files.push(file);
                output.symbols.extend(syms);
                output.relations.extend(rels);
                for ev in evs {
                    if seen_envvars.insert(ev.name.clone()) {
                        output.envvars.push(ev);
                    }
                }
                for svc in svcs {
                    if seen_services.insert(svc.name.clone()) {
                        output.services.push(svc);
                    }
                }
            }
            Err(e) => eprintln!("Warning: {}", e),
        }
    }

    output.dependencies = load_cargo_deps(&project_root);

    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}
