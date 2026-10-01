// Multiple-choice options are one line of text that can use `code` and **bold**, like the rest
// of the course. (Predict options are program output, so they're shown exactly as written.)
export function OptionText({ text }: { text: string }) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <code key={i} className="rounded-md border border-border bg-subtle px-1 py-px font-mono text-[0.88em]">
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith("**") && part.endsWith("**") && part.length > 3 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}
