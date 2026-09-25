export function Avatar({ name, size = 32 }: { name?: string; size?: number }) {
  const initial = name?.trim()[0]?.toUpperCase();
  return (
    <span className="grid place-items-center rounded-full bg-brand/15 font-semibold text-brand" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial ?? (
        <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
