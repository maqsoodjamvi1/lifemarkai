/**
 * Streaming JSON file extractor
 *
 * The AI returns a JSON object of the form:
 *   {"files":[{"path":"...","content":"...","language":"..."},...]}
 *
 * This extractor accumulates the raw stream and fires a callback each time a
 * complete file object is detected — allowing us to upsert files to the DB
 * immediately rather than waiting for the entire generation to finish.
 *
 * Uses a simple depth-tracking state machine that is robust to escaped
 * characters and arbitrary chunk boundaries.
 */

export interface StreamingFile {
  path: string;
  content: string;
  language: string;
}

export type OnFileExtracted = (file: StreamingFile) => void | Promise<void>;

export class StreamingFileExtractor {
  private buffer = "";
  private inFilesArray = false;
  private fileObjectStart = -1;
  private depth = 0;
  private inString = false;
  private escape = false;

  constructor(private readonly onFile: OnFileExtracted) {}

  /**
   * Feed the next chunk of the stream into the extractor.
   * Synchronously fires `onFile` for each complete file found so far.
   * If `onFile` is async the caller should await `feedAsync` instead.
   */
  feed(chunk: string): void {
    this.buffer += chunk;
    this._scan();
  }

  async feedAsync(chunk: string): Promise<void> {
    this.buffer += chunk;
    await this._scanAsync();
  }

  private _scan(): void {
    // We use a cursor over the buffer to avoid re-scanning already processed chars.
    // Nothing to do until we enter the files array.
    const buf = this.buffer;

    // Quick check: have we reached the "files": marker yet?
    if (!this.inFilesArray) {
      const marker = buf.indexOf('"files"');
      if (marker === -1) return;
      // Find the opening '[' after the marker
      const arrStart = buf.indexOf("[", marker);
      if (arrStart === -1) return;
      this.inFilesArray = true;
      this.buffer = buf.slice(arrStart + 1); // trim processed prefix
    }

    // Now scan for complete file objects inside the array
    this._extractCompleteObjects();
  }

  private async _scanAsync(): Promise<void> {
    const buf = this.buffer;

    if (!this.inFilesArray) {
      const marker = buf.indexOf('"files"');
      if (marker === -1) return;
      const arrStart = buf.indexOf("[", marker);
      if (arrStart === -1) return;
      this.inFilesArray = true;
      this.buffer = buf.slice(arrStart + 1);
    }

    await this._extractCompleteObjectsAsync();
  }

  private _extractCompleteObjects(): void {
    const buf = this.buffer;
    let i = 0;

    while (i < buf.length) {
      const ch = buf[i]!;

      if (this.escape) {
        this.escape = false;
        i++;
        continue;
      }

      if (this.inString) {
        if (ch === "\\") { this.escape = true; }
        else if (ch === '"') { this.inString = false; }
        i++;
        continue;
      }

      if (ch === '"') {
        this.inString = true;
        i++;
        continue;
      }

      if (ch === "{") {
        if (this.depth === 0) this.fileObjectStart = i;
        this.depth++;
        i++;
        continue;
      }

      if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.fileObjectStart !== -1) {
          // We have a complete top-level object within the array
          const raw = buf.slice(this.fileObjectStart, i + 1);
          this.fileObjectStart = -1;
          try {
            const parsed = JSON.parse(raw) as Partial<StreamingFile> & { name?: string };
            const filePath = parsed.path ?? parsed.name;
            if (filePath && parsed.content !== undefined) {
              this.onFile({
                path: filePath,
                content: parsed.content,
                language: parsed.language ?? inferLanguage(filePath),
              });
            }
          } catch {
            // Malformed partial object — skip
          }
          // Trim processed buffer so it doesn't grow unboundedly
          this.buffer = buf.slice(i + 1);
          // Restart scan on the trimmed buffer
          this.depth = 0;
          this.inString = false;
          this.escape = false;
          this.fileObjectStart = -1;
          this._extractCompleteObjects();
          return;
        }
        i++;
        continue;
      }

      i++;
    }
  }

  private async _extractCompleteObjectsAsync(): Promise<void> {
    const buf = this.buffer;
    let i = 0;

    while (i < buf.length) {
      const ch = buf[i]!;

      if (this.escape) { this.escape = false; i++; continue; }
      if (this.inString) {
        if (ch === "\\") this.escape = true;
        else if (ch === '"') this.inString = false;
        i++; continue;
      }
      if (ch === '"') { this.inString = true; i++; continue; }

      if (ch === "{") {
        if (this.depth === 0) this.fileObjectStart = i;
        this.depth++; i++; continue;
      }

      if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.fileObjectStart !== -1) {
          const raw = buf.slice(this.fileObjectStart, i + 1);
          this.fileObjectStart = -1;
          try {
            const parsed = JSON.parse(raw) as Partial<StreamingFile> & { name?: string };
            const filePath = parsed.path ?? parsed.name;
            if (filePath && parsed.content !== undefined) {
              await this.onFile({
                path: filePath,
                content: parsed.content,
                language: parsed.language ?? inferLanguage(filePath),
              });
            }
          } catch { /* skip */ }
          this.buffer = buf.slice(i + 1);
          this.depth = 0;
          this.inString = false;
          this.escape = false;
          this.fileObjectStart = -1;
          await this._extractCompleteObjectsAsync();
          return;
        }
        i++; continue;
      }

      i++;
    }
  }

  /** Reset state — call between requests */
  reset(): void {
    this.buffer = "";
    this.inFilesArray = false;
    this.fileObjectStart = -1;
    this.depth = 0;
    this.inString = false;
    this.escape = false;
  }
}

/**
 * Extract every *complete* file object from a partial or complete build JSON
 * stream. Used when the model hits max_tokens mid-JSON — we still ship the
 * files that finished before the cut-off and trigger a continuation pass.
 */
export function salvageFilesFromStreamJson(raw: string): StreamingFile[] {
  const files: StreamingFile[] = [];
  const extractor = new StreamingFileExtractor((file) => {
    files.push(file);
  });
  extractor.feed(raw);
  return files;
}

/** Infer language from file extension when not provided by AI */
function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    css: "css", html: "html", json: "json", md: "markdown",
    py: "python", rs: "rust", go: "go", sql: "sql", sh: "bash",
  };
  return map[ext] ?? "text";
}
