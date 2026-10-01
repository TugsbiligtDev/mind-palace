import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// "On Windows" → "on-windows", so a link can jump to a section (e.g. setup#windows).
function slug(children: ReactNode): string {
  const text = (n: ReactNode): string =>
    Children.toArray(n)
      .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? text(c.props.children) : ""))
      .join("");
  return text(children).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-mp ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h2: ({ children: c }) => <h2 id={slug(c)}>{c}</h2> }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
