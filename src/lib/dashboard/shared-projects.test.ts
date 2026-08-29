import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSharedProjects } from "./shared-projects";

interface P { id: string; status?: string | null; name?: string }

test("extractSharedProjects returns the embedded project for each row", () => {
  const rows = [{ projects: { id: "a", name: "Alpha" } as P }, { projects: { id: "b", name: "Beta" } as P }];
  assert.deepEqual(extractSharedProjects(rows).map((p) => p.id), ["a", "b"]);
});

test("extractSharedProjects drops a row whose embedded project is null", () => {
  const rows = [{ projects: { id: "a" } as P }, { projects: null }];
  assert.deepEqual(extractSharedProjects(rows).map((p) => p.id), ["a"]);
});

test("extractSharedProjects drops an archived project", () => {
  const rows = [{ projects: { id: "a", status: "active" } as P }, { projects: { id: "b", status: "archived" } as P }];
  assert.deepEqual(extractSharedProjects(rows).map((p) => p.id), ["a"]);
});

test("extractSharedProjects dedupes a project shared via more than one collaborator row", () => {
  const rows = [{ projects: { id: "a" } as P }, { projects: { id: "a" } as P }];
  assert.deepEqual(extractSharedProjects(rows).map((p) => p.id), ["a"]);
});

test("extractSharedProjects returns an empty list for no rows", () => {
  assert.deepEqual(extractSharedProjects([]), []);
});

test("extractSharedProjects returns an empty list when every row's project is null or archived", () => {
  const rows = [{ projects: null }, { projects: { id: "a", status: "archived" } as P }];
  assert.deepEqual(extractSharedProjects(rows), []);
});
