//! Optional, stateless structural risk probe for editor plans.
//! Each request carries one project's files; no source code persists between requests.
use axum::{extract::DefaultBodyLimit, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Deserialize)]
struct FileIn { path: String, content: String }
#[derive(Deserialize)]
struct Target { id: String, paths: Vec<String> }
#[derive(Deserialize)]
struct RiskRequest { files: Vec<FileIn>, targets: Vec<Target> }
#[derive(Serialize)]
struct Risk { id: String, score: u32 }
#[derive(Serialize)]
struct RiskResponse { risks: Vec<Risk> }

// Lightweight JS/TS declaration and call heuristic. Results are advisory, not a parser.
fn declarations(content: &str) -> HashSet<String> {
    let mut names = HashSet::new();
    for line in content.lines() {
        let words: Vec<&str> = line.split_whitespace().collect();
        for (pos, word) in words.iter().enumerate() {
            if ["function", "class", "interface", "type"].contains(word) {
                if let Some(name) = words.get(pos + 1) {
                    let name: String = name.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
                    if name.len() > 2 { names.insert(name); }
                }
            }
        }
    }
    names
}

fn risks(req: &RiskRequest) -> Vec<Risk> {
    let symbols: HashMap<&str, HashSet<String>> = req.files.iter()
        .map(|f| (f.path.as_str(), declarations(&f.content))).collect();
    req.targets.iter().map(|target| {
        let target_symbols: HashSet<&String> = target.paths.iter()
            .filter_map(|p| symbols.get(p.as_str()))
            .flat_map(|s| s.iter()).collect();
        let affected = req.files.iter().filter(|f| !target.paths.contains(&f.path) &&
            target_symbols.iter().any(|sym| f.content.contains(&format!("{}(", sym)))).count();
        Risk { id: target.id.clone(), score: (affected * 20).min(100) as u32 }
    }).collect()
}

async fn risk(Json(req): Json<RiskRequest>) -> Json<RiskResponse> {
    Json(RiskResponse { risks: risks(&req) })
}
async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "rust-ast-risk" }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health))
        .route("/risk", post(risk))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024));
    let port = std::env::var("PORT").unwrap_or_else(|_| "8765".into());
    // Keep this service private to the app host; do not expose code via a public port.
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
        .await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cross_file_call_increases_risk_without_shared_state() {
        let request = RiskRequest { files: vec![
            FileIn { path: "src/a.ts".into(), content: "export function calculate() {}".into() },
            FileIn { path: "src/b.ts".into(), content: "calculate()".into() },
        ], targets: vec![Target { id: "edit".into(), paths: vec!["src/a.ts".into()] }] };
        assert_eq!(risks(&request)[0].score, 20);
        let other = RiskRequest { files: vec![], targets: vec![Target { id: "edit".into(), paths: vec!["src/a.ts".into()] }] };
        assert_eq!(risks(&other)[0].score, 0);
    }
}
