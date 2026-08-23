/**
 * Native projects list/create - Start-owned (no Next hop for dashboard create).
 * Template scaffolding for built-ins pulls from the main repo via relative import.
 *
 * CRITICAL RESTORE from master. Knowledge seed: see project-knowledge.ts + apply
 * withKnowledgeFile locally if not merged yet. Full file: artifacts/projects-with-knowledge.ts
 */
export { listProjects, createProject, getProject, updateProject, deleteProject } from "../../../../master-projects-shim";
