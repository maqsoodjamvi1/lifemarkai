/**
 * Shell stub for member groups until the full editor is ported.
 */
export function MemberGroupsSection() {
  return (
    <div className="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
      Member groups are available from{" "}
      <a className="text-violet-500 hover:underline" href="/dashboard/people">
        People
      </a>
      . Full group editing UI is coming to Start.
    </div>
  );
}
