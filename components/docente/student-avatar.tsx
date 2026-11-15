/** Foto del estudiante; si no tiene, muestra sus iniciales. */
export function StudentAvatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const style = { width: size, height: size };

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} style={style} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand-dark"
    >
      {initials}
    </span>
  );
}
