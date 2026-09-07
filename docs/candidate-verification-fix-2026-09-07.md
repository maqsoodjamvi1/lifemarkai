# TanStack candidate verification

The bakery test exposed two false signals in candidate verification: a local
TypeScript workspace without dependency types reported missing inherited
`BadgeProps.className`, and the fallback renderer rejected TanStack router
imports that the real preview supports. A separate inspection found the saved
and runtime package manifests contained six identical concatenated JSON objects.

TanStack candidates now build in a disposable directory inside the existing
Docker sandbox, using its installed Vite and dependency tree. Canonical files
and the live source directory are not overwritten during this check. Dependency
declarations must match; missing tools, unavailable containers and timeouts are
unknown outcomes and cannot pass. Builds have a 45-second execution limit and
the temporary directory is cleaned up. Concurrent checks for the same sandbox
are rejected within each application process.

Only exact repeated package JSON objects are collapsed. Conflicting objects or
trailing garbage are left for diagnosis. The repaired file is returned through
the existing staged commit path only after the candidate passes.

Results use `engine: "build"`. This validates a production bundle, not browser
behavior or every TypeScript semantic constraint. It does not claim runtime or
visual parity. Projects without an existing compatible Docker dependency
environment still require one before this verification can succeed. A failed
framework build preserves the working revision without spending fallback AI
repair rounds on unsupported renderer errors.

Validation before deployment:

- Candidate fixtures cover live-file preservation, broken candidates, timeouts,
  dependency mismatch, unsafe archive paths and repeated manifest repair.
- A disposable copy of the real bakery project, with its repeated manifest
  collapsed and heading changed to “Fresh from Our Oven”, built client and
  server bundles successfully in 14,150 ms (exit 0). No saved files were changed
  by this diagnostic.
- TypeScript and focused lint checks run for the implementation; live paid edit
  and restoration remain release verification steps.
