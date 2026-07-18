/** Lovable-parity slash-command prompt templates grouped by category. */
export const LOVABLE_PROMPT_TEMPLATES: { category: string; prompts: string[] }[] = [
  {
    category: "UI & Design",
    prompts: [
      "Add a dark mode toggle to the header",
      "Make the layout fully responsive for mobile",
      "Add smooth page transition animations",
      "Style all buttons consistently with a primary color",
      "Add a loading skeleton for data-fetching sections",
    ],
  },
  {
    category: "Features",
    prompts: [
      "Add user authentication with email and password",
      "Create a dashboard with key metrics cards",
      "Add a search bar that filters results in real time",
      "Implement infinite scroll for the list",
      "Add a notification bell with a dropdown feed",
    ],
  },
  {
    category: "Fixes",
    prompts: [
      "Fix all TypeScript errors in the project",
      "Make all images use next/image for optimization",
      "Add proper error boundaries and fallback UI",
      "Fix layout overflow issues on small screens",
      "Replace all console.log calls with proper error handling",
    ],
  },
  {
    category: "Data & API",
    prompts: [
      "Add a REST API integration with loading and error states",
      "Create a form with validation and submission handler",
      "Add optimistic UI updates for mutations",
      "Implement client-side pagination for the table",
      "Add data export to CSV functionality",
    ],
  },
];
