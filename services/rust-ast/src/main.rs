//! LifemarkAI Rust AST service - structural code intelligence.
//! Symbol extraction is line-aware + keyword based (fast, zero C deps).
//! Swap extract_symbols() for tree-sitter when lib is available in CI.

use axum::{routing::{get, post}, Json, Router};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tower_http::cors::CorsLayer;

#[derive(Clone, Serialize, Deserialize)]
struct FileIn {
    path: String,
    content: String,
    language: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AstSymbol {
    name: String,
    kind: String,
    file: String,
    line: usize,
    end_line: Option<usize>,
    signature: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CallEdge {
    from: String,
    to: String,
    file: String,
    line: usize,
}

#[derive(Default)]
struct Index {
    symbols: Vec<AstSymbol>,
    edges: Vec<CallEdge>,
    files: HashMap<String, String>,
}

static INDEX: Lazy<Mutex<Index>> = Lazy::new(|| Mutex::new(Index::default()));

fn extract_ident_after(keywords: &[&str], line: &str) -> Option<String> {
    let trimmed = line.trim();
    for kw in keywords {
        if let Some(rest) = trimmed.strip_prefix(kw) {
            let rest = rest.trim_start();
            let name: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
                .collect();
            if !name.is_empty() {
                return Some(name);
            }
        }
    }
    None
}

fn extract_symbols(path: &str, content: &str) -> (Vec<AstSymbol>, Vec<CallEdge>) {
    let mut symbols = Vec::new();
    let mut edges = Vec::new();
    let mut current_fn: Option<String> = None;

    for (i, line) in content.lines().enumerate() {
        let line_no = i + 1;
        let t = line.trim();

        if let Some(name) = extract_ident_after(&["function ", "export function ", "async function ", "export async function "], t) {
            symbols.push(AstSymbol {
                name: name.clone(),
                kind: "function".into(),
                file: path.into(),
                line: line_no,
                end_line: None,
                signature: Some(t.chars().take(120).collect()),
            });
            current_fn = Some(name);
        } else if let Some(name) = extract_ident_after(&["class ", "export class "], t) {
            symbols.push(AstSymbol {
                name,
                kind: "class".into(),
                file: path.into(),
                line: line_no,
                end_line: None,
                signature: Some(t.chars().take(120).collect()),
            });
        } else if let Some(name) = extract_ident_after(&["interface ", "export interface ", "type ", "export type "], t) {
            symbols.push(AstSymbol {
                name,
                kind: "interface".into(),
                file: path.into(),
                line: line_no,
                end_line: None,
                signature: Some(t.chars().take(120).collect()),
            });
        }

        // naive call-site detection: foo(
        if let Some(from) = &current_fn {
            for part in t.split(|c: char| !c.is_alphanumeric() && c != '_') {
                if part.len() > 2 && t.contains(&format!("{}(", part)) && part != from {
                    edges.push(CallEdge {
                        from: from.clone(),
                        to: part.to_string(),
                        file: path.into(),
                        line: line_no,
                    });
                }
            }
        }
    }
    (symbols, edges)
}

#[derive(Deserialize)]
struct IndexReq {
    files: Vec<FileIn>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexRes {
    indexed: usize,
    symbols: usize,
}

async fn index_handler(Json(req): Json<IndexReq>) -> Json<IndexRes> {
    let mut idx = INDEX.lock().unwrap();
    for f in &req.files {
        idx.files.insert(f.path.clone(), f.content.clone());
        // drop prior symbols/edges for this file (merge mode)
        idx.symbols.retain(|s| s.file != f.path);
        idx.edges.retain(|e| e.file != f.path);
        let (syms, edges) = extract_symbols(&f.path, &f.content);
        idx.symbols.extend(syms);
        idx.edges.extend(edges);
    }
    Json(IndexRes {
        indexed: req.files.len(),
        symbols: idx.symbols.len(),
    })
}

#[derive(Deserialize)]
struct SymbolReq {
    symbol: String,
}

async fn definition_handler(Json(req): Json<SymbolReq>) -> Json<Option<AstSymbol>> {
    let idx = INDEX.lock().unwrap();
    Json(idx.symbols.iter().find(|s| s.name == req.symbol).cloned())
}

async fn callers_handler(Json(req): Json<SymbolReq>) -> Json<serde_json::Value> {
    let idx = INDEX.lock().unwrap();
    let callers: Vec<_> = idx
        .edges
        .iter()
        .filter(|e| e.to == req.symbol)
        .cloned()
        .collect();
    Json(serde_json::json!({ "callers": callers }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImpactReport {
    symbol: String,
    direct_callers: Vec<String>,
    transitive_callers: Vec<String>,
    files_affected: Vec<String>,
    risk_score: u32,
}

async fn impact_handler(Json(req): Json<SymbolReq>) -> Json<ImpactReport> {
    let idx = INDEX.lock().unwrap();
    let direct: Vec<String> = idx
        .edges
        .iter()
        .filter(|e| e.to == req.symbol)
        .map(|e| e.from.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let files: Vec<String> = idx
        .edges
        .iter()
        .filter(|e| e.to == req.symbol || e.from == req.symbol)
        .map(|e| e.file.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let risk = ((direct.len() * 12 + files.len() * 8).min(100)) as u32;
    Json(ImpactReport {
        symbol: req.symbol,
        direct_callers: direct.clone(),
        transitive_callers: direct,
        files_affected: files,
        risk_score: risk,
    })
}

async fn health_handler() -> Json<serde_json::Value> {
    let idx = INDEX.lock().unwrap();
    Json(serde_json::json!({
        "status": "ok",
        "service": "rust-ast",
        "symbols": idx.symbols.len(),
        "edges": idx.edges.len(),
    }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health_handler).post(health_handler))
        .route("/index", post(index_handler))
        .route("/definition", post(definition_handler))
        .route("/callers", post(callers_handler))
        .route("/impact", post(impact_handler))
        .layer(CorsLayer::permissive());

    let addr = std::env::var("PORT").unwrap_or_else(|_| "8765".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{addr}"))
        .await
        .expect("bind");
    eprintln!("lifemark-ast listening on {addr}");
    axum::serve(listener, app).await.expect("serve");
}
