// A generic football shirt in club colours — our own drawing, no club crests or official kit art.

type KitColors = { body: string; sleeve: string; trim: string; stripes?: string };

const COLORS: Record<number, KitColors> = {
  3: { body: "#EF0107", sleeve: "#FFFFFF", trim: "#FFFFFF" }, // Arsenal
  7: { body: "#670E36", sleeve: "#95BFE5", trim: "#95BFE5" }, // Aston Villa
  91: { body: "#DA291C", sleeve: "#000000", trim: "#000000", stripes: "#000000" }, // Bournemouth
  94: { body: "#E30613", sleeve: "#E30613", trim: "#FFFFFF", stripes: "#FFFFFF" }, // Brentford
  36: { body: "#0057B8", sleeve: "#0057B8", trim: "#FFFFFF", stripes: "#FFFFFF" }, // Brighton
  8: { body: "#034694", sleeve: "#034694", trim: "#FFFFFF" }, // Chelsea
  9: { body: "#59CBE8", sleeve: "#59CBE8", trim: "#FFFFFF" }, // Coventry
  31: { body: "#1B458F", sleeve: "#C4122E", trim: "#C4122E", stripes: "#C4122E" }, // Crystal Palace
  11: { body: "#003399", sleeve: "#003399", trim: "#FFFFFF" }, // Everton
  54: { body: "#FFFFFF", sleeve: "#FFFFFF", trim: "#000000" }, // Fulham
  88: { body: "#F5A12D", sleeve: "#000000", trim: "#000000" }, // Hull
  40: { body: "#0044A9", sleeve: "#0044A9", trim: "#FFFFFF" }, // Ipswich
  2: { body: "#FFFFFF", sleeve: "#FFFFFF", trim: "#1D428A" }, // Leeds
  14: { body: "#C8102E", sleeve: "#C8102E", trim: "#F6EB61" }, // Liverpool
  43: { body: "#6CABDD", sleeve: "#6CABDD", trim: "#FFFFFF" }, // Man City
  1: { body: "#DA291C", sleeve: "#DA291C", trim: "#FBE122" }, // Man Utd
  4: { body: "#FFFFFF", sleeve: "#241F20", trim: "#241F20", stripes: "#241F20" }, // Newcastle
  17: { body: "#DD0000", sleeve: "#DD0000", trim: "#FFFFFF" }, // Nott'm Forest
  6: { body: "#FFFFFF", sleeve: "#FFFFFF", trim: "#132257" }, // Spurs
  56: { body: "#EB172B", sleeve: "#FFFFFF", trim: "#FFFFFF", stripes: "#FFFFFF" }, // Sunderland
  21: { body: "#7A263A", sleeve: "#1BB1E7", trim: "#1BB1E7" }, // West Ham
  39: { body: "#FDB913", sleeve: "#FDB913", trim: "#231F20" }, // Wolves
  90: { body: "#6C1D45", sleeve: "#99D6EA", trim: "#99D6EA" }, // Burnley
};

const GK: KitColors = { body: "#1FA34A", sleeve: "#1FA34A", trim: "#0B3D1C" };

export function Kit({
  teamCode,
  goalkeeper = false,
  size = 48,
}: {
  teamCode: number;
  goalkeeper?: boolean;
  size?: number;
}) {
  const c: KitColors = goalkeeper ? GK : (COLORS[teamCode] ?? { body: "#888", sleeve: "#666", trim: "#fff" });
  const stripes = c.stripes;
  const id = `k${teamCode}${goalkeeper ? "g" : ""}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M20 10 L26 6 Q32 10 38 6 L44 10 L44 58 L20 58 Z" />
        </clipPath>
      </defs>
      {/* sleeves */}
      <path d="M20 10 L8 18 L12 30 L20 26 Z" fill={c.sleeve} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      <path d="M44 10 L56 18 L52 30 L44 26 Z" fill={c.sleeve} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      {/* body */}
      <path d="M20 10 L26 6 Q32 10 38 6 L44 10 L44 58 L20 58 Z" fill={c.body} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      {stripes && (
        <g clipPath={`url(#${id}-body)`}>
          {[22, 30, 38].map((x) => (
            <rect key={x} x={x} y={4} width={4} height={56} fill={stripes} />
          ))}
        </g>
      )}
      {/* collar */}
      <path d="M26 6 Q32 12 38 6" fill="none" stroke={c.trim} strokeWidth="2.5" />
    </svg>
  );
}
