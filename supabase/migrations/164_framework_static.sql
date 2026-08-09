-- Static projects use the dependency-free HTML/CSS/JS generation and srcdoc
-- preview path. Framework projects continue to use sandbox/WebContainer.
alter table public.projects drop constraint if exists projects_framework_check;

alter table public.projects
  add constraint projects_framework_check
  check (framework in (
    'static', 'react', 'next', 'nextjs', 'vue', 'svelte',
    'react-native', 'tanstack-start', 'tanstack'
  ));
