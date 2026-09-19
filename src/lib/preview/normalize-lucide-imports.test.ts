import test from "node:test";
import assert from "node:assert/strict";
import { Contact } from "lucide-react";
import { normalizeLucideImports } from "./normalize-lucide-imports.ts";

test("invalid Contacts icon becomes a real export without changing JSX bindings", () => {
  assert.ok(Contact);
  const source = "import { Contacts, Contacts as AddressBook, Users } from 'lucide-react'; const view = <Contacts />;";
  const fixed = normalizeLucideImports(source);
  assert.equal(fixed, "import { Contact as Contacts, Contact as AddressBook, Users } from 'lucide-react'; const view = <Contacts />;");
  assert.equal(normalizeLucideImports(fixed), fixed);
});

test("icon normalization leaves other libraries, types, comments and strings untouched", () => {
  const source = `// import { Contacts } from 'lucide-react';
import { Contacts } from './contacts';
import type { Contacts as ContactType } from 'lucide-react';
const example = "import { Contacts } from 'lucide-react'";`;
  assert.equal(normalizeLucideImports(source), source);
});
