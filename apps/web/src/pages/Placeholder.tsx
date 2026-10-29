export function Placeholder({
  title,
  sprint,
  what,
}: {
  title: string;
  sprint: number;
  what: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-prose text-muted-foreground">{what}</p>
      <p className="mt-4 text-sm text-muted-foreground">Built in sprint {sprint}.</p>
    </div>
  );
}
