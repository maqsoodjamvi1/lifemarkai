/**
 * BM25-based relevance scoring for project file context selection.
 *
 * When a codebase is too large to fit in the AI context window, we need to
 * decide which files are most relevant to the current user message. This
 * module implements BM25 (Okapi BM25) — a standard information-retrieval
 * ranking function that outperforms naive TF-IDF for this purpose.
 *
 * Usage:
 *   const ranked = selectRelevantFiles(files, userMessage, 60000);
 *   // returns files sorted by BM25 relevance, total chars ≤ 60000
 */

const BM25_K1 = 1.5;
const BM25_B  = 0.75;

type FileEntry = { path: string; content: string };

/** Tokenise a string into lowercase terms for BM25 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    // Split on anything that isn't alphanumeric, underscore, or dot
    .split(/[^\w.]+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

/** Term-frequency map for a list of tokens */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * Score all files against a query using BM25.
 * Returns a parallel array of scores (higher = more relevant).
 */
export function bm25Scores(files: FileEntry[], query: string): number[] {
  if (files.length === 0) return [];

  // Tokenise each document (path + content) and build TF maps
  const docTokens = files.map((f) => tokenise(`${f.path} ${f.content}`));
  const docTFs    = docTokens.map(termFreq);
  const docLens   = docTokens.map((t) => t.length);
  const avgLen    = docLens.reduce((a, b) => a + b, 0) / docLens.length;

  // Build IDF map: for each term, how many docs contain it?
  const dfMap = new Map<string, number>();
  for (const tf of docTFs) {
    for (const term of tf.keys()) {
      dfMap.set(term, (dfMap.get(term) ?? 0) + 1);
    }
  }

  const N = files.length;
  const idf = (term: string): number => {
    const df = dfMap.get(term) ?? 0;
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  };

  const queryTerms = tokenise(query);

  return files.map((_, i) => {
    const tf  = docTFs[i]!;
    const len = docLens[i]!;
    let score = 0;

    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) continue;
      const norm = freq * (BM25_K1 + 1) / (freq + BM25_K1 * (1 - BM25_B + BM25_B * len / avgLen));
      score += idf(term) * norm;
    }

    return score;
  });
}

/**
 * Select the most relevant files for the given query, capped at `budgetChars`.
 *
 * Files are first ranked by BM25 score (descending). Files with zero relevance
 * are still included in score order (path similarity etc.) so important
 * structural files like package.json don't vanish just because the user's
 * prompt doesn't mention them explicitly — instead we append them after the
 * top-scored files until budget is exhausted.
 *
 * @param files       All project files
 * @param query       The user's current message (used for ranking)
 * @param budgetChars Max total characters of file content to include
 * @returns           Files sorted by relevance, total content ≤ budgetChars
 */
export function selectRelevantFiles(
  files: FileEntry[],
  query: string,
  budgetChars: number
): FileEntry[] {
  if (files.length === 0) return [];

  const scores = bm25Scores(files, query);

  // Pair each file with its score, then sort descending
  const ranked = files
    .map((f, i) => ({ file: f, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const selected: FileEntry[] = [];
  let usedChars = 0;

  for (const { file } of ranked) {
    const chars = file.path.length + file.content.length + 20; // overhead for headers
    if (usedChars + chars > budgetChars) continue;
    selected.push(file);
    usedChars += chars;
  }

  return selected;
}

/**
 * Quick helper: given a list of files + a user query, return the subset of
 * files whose BM25 score is above a minimum threshold (default 0.5).
 * Useful for scoping @file-mention auto-complete.
 */
export function filterByRelevance(
  files: FileEntry[],
  query: string,
  minScore = 0.5
): FileEntry[] {
  if (!query.trim()) return files;
  const scores = bm25Scores(files, query);
  return files.filter((_, i) => (scores[i] ?? 0) >= minScore);
}
