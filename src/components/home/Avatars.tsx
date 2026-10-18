import { useId, type ReactNode } from "react";

/* Put this file at: src/components/home/Avatars.tsx */

export type StoredUser = {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
  [key: string]: unknown;
};

export type AvatarDef = {
  id: string;
  label: string;
  from: string;
  to: string;
  /** hand-drawn artwork in a 100x100 box (no emoji, so it looks the same everywhere) */
  art: (uid: string) => ReactNode;
};

/* ------------------------------ tiny helpers ----------------------------- */

const INK = "#2A1B12";

function Eye({ cx, cy, r = 3.4 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={INK} />
      <circle cx={cx + r * 0.35} cy={cy - r * 0.35} r={r * 0.38} fill="#fff" />
    </g>
  );
}

function Smile({ cx, cy, w = 6 }: { cx: number; cy: number; w?: number }) {
  return (
    <path
      d={`M${cx - w} ${cy} Q${cx} ${cy + w * 0.9} ${cx + w} ${cy}`}
      fill="none"
      stroke={INK}
      strokeWidth="2"
      strokeLinecap="round"
    />
  );
}

function Blush({ cx, cy }: { cx: number; cy: number }) {
  return <ellipse cx={cx} cy={cy} rx="4.5" ry="3" fill="#FF8FA3" opacity="0.55" />;
}

function Star({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const d = (n: number) => n * s;
  return (
    <path
      d={`M${x} ${y - d(5)} L${x + d(1.5)} ${y - d(1.5)} L${x + d(5)} ${y} L${x + d(1.5)} ${y + d(1.5)} L${x} ${y + d(5)} L${x - d(1.5)} ${y + d(1.5)} L${x - d(5)} ${y} L${x - d(1.5)} ${y - d(1.5)}Z`}
      fill="#FFF6C9"
    />
  );
}

/* ------------------------------- the avatars ----------------------------- */

export const AVATARS: AvatarDef[] = [
  /* ---- nature ---- */
  {
    id: "tulsi",
    label: "Tulsi leaf",
    from: "#4FA77A",
    to: "#1F5C41",
    art: () => (
      <g>
        <path d="M50 20 C74 32 78 60 50 80 C22 60 26 32 50 20Z" fill="#E4F6CF" />
        <path d="M50 28 V78" stroke="#3E8F5E" strokeWidth="2.6" strokeLinecap="round" />
        <path
          d="M50 44 L38 36 M50 54 L36 47 M50 64 L40 58 M50 44 L62 36 M50 54 L64 47 M50 64 L60 58"
          stroke="#3E8F5E"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    ),
  },
  {
    id: "lotus",
    label: "Lotus",
    from: "#F7B6CB",
    to: "#D6648C",
    art: () => (
      <g>
        {[-62, -31, 31, 62].map((a) => (
          <ellipse
            key={a}
            cx="50"
            cy="52"
            rx="10"
            ry="22"
            fill="#FFD3E3"
            transform={`rotate(${a} 50 76)`}
          />
        ))}
        <ellipse cx="50" cy="52" rx="10.5" ry="23" fill="#FFF0F6" />
        <path d="M24 78 Q50 70 76 78 Q50 88 24 78Z" fill="#7CC38F" />
      </g>
    ),
  },
  {
    id: "sprout",
    label: "Sprout",
    from: "#C9E8A8",
    to: "#6FAF55",
    art: () => (
      <g>
        <ellipse cx="50" cy="78" rx="20" ry="6" fill="#8A5A3A" />
        <path d="M50 78 V52" stroke="#3E8F4B" strokeWidth="4" strokeLinecap="round" />
        <path d="M50 56 C32 58 24 44 26 30 C42 30 52 40 50 56Z" fill="#4FA85A" />
        <path d="M50 50 C68 52 76 38 74 24 C58 24 48 34 50 50Z" fill="#74C466" />
      </g>
    ),
  },
  {
    id: "surya",
    label: "Surya",
    from: "#FFB259",
    to: "#F0612B",
    art: () => (
      <g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line
            key={a}
            x1="50"
            y1="17"
            x2="50"
            y2="27"
            stroke="#FFF1B0"
            strokeWidth="4.5"
            strokeLinecap="round"
            transform={`rotate(${a} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="18" fill="#FFE27A" />
        <Eye cx={44} cy={48} r={2.8} />
        <Eye cx={56} cy={48} r={2.8} />
        <Blush cx={40} cy={55} />
        <Blush cx={60} cy={55} />
        <Smile cx={50} cy={54} w={4.5} />
      </g>
    ),
  },
  {
    id: "chandra",
    label: "Chandra",
    from: "#6C86C8",
    to: "#26386F",
    art: (uid) => (
      <g>
        <defs>
          <mask id={`${uid}-moon`}>
            <rect width="100" height="100" fill="#fff" />
            <circle cx="62" cy="42" r="22" fill="#000" />
          </mask>
        </defs>
        <circle cx="48" cy="54" r="27" fill="#FFEFB0" mask={`url(#${uid}-moon)`} />
        <path
          d="M28 58 Q32 62 36 58"
          fill="none"
          stroke={INK}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Blush cx={31} cy={65} />
        <Star x={72} y={64} />
        <Star x={68} y={26} s={0.8} />
        <Star x={80} y={44} s={0.6} />
      </g>
    ),
  },
  {
    id: "herbal-oil",
    label: "Herbal oil",
    from: "#F2CB6B",
    to: "#B97E14",
    art: () => (
      <g>
        <path
          d="M50 22 C50 22 28 46 28 60 A22 22 0 0 0 72 60 C72 46 50 22 50 22Z"
          fill="#FFF3CC"
        />
        <ellipse
          cx="38"
          cy="58"
          rx="3.5"
          ry="7"
          fill="#fff"
          opacity="0.75"
          transform="rotate(20 38 58)"
        />
        <path d="M52 22 C60 14 70 16 72 22 C66 28 56 28 52 22Z" fill="#59B35A" />
        <Eye cx={43} cy={62} />
        <Eye cx={57} cy={62} />
        <Blush cx={38} cy={69} />
        <Blush cx={62} cy={69} />
        <Smile cx={50} cy={67} w={4} />
      </g>
    ),
  },
  {
    id: "marigold",
    label: "Marigold",
    from: "#FFD76A",
    to: "#F29A1F",
    art: () => (
      <g>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle
            key={i}
            cx="50"
            cy="31"
            r="10.5"
            fill={i % 2 ? "#FFC23D" : "#FFAA1F"}
            transform={`rotate(${i * 45} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="12" fill="#E8741A" />
        <circle cx="50" cy="50" r="5.5" fill="#FFD76A" />
      </g>
    ),
  },
  {
    id: "himalaya",
    label: "Himalaya",
    from: "#9FB8C9",
    to: "#4D6B7E",
    art: () => (
      <g>
        <circle cx="70" cy="30" r="7" fill="#FFE9A8" />
        <path d="M46 78 L68 44 L90 78Z" fill="#7C9DB0" />
        <path d="M10 78 L38 32 L66 78Z" fill="#4D6B7E" />
        <path d="M38 32 L28 48 L34 45 L38 50 L44 45 L48 48Z" fill="#fff" />
        <path d="M68 44 L61 55 L66 53 L69 57 L73 53 L76 55Z" fill="#fff" />
        <ellipse cx="50" cy="79" rx="40" ry="6" fill="#3C5666" />
      </g>
    ),
  },

  /* ---- cute animals and more ---- */
  {
    id: "mor",
    label: "Mor",
    from: "#4CC3B5",
    to: "#1B6E8C",
    art: () => (
      <g>
        {[-64, -32, 0, 32, 64].map((a) => (
          <g key={a} transform={`rotate(${a} 50 68)`}>
            <ellipse cx="50" cy="42" rx="7.5" ry="21" fill="#2FB59A" />
            <ellipse cx="50" cy="28" rx="4.2" ry="5" fill="#F2CB6B" />
            <circle cx="50" cy="28" r="2" fill="#1B6E8C" />
          </g>
        ))}
        <ellipse cx="50" cy="70" rx="13" ry="15" fill="#1E7FA6" />
        <path
          d="M46 43 L44 34 M50 42 V32 M54 43 L56 34"
          stroke="#1B6E8C"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="44" cy="33" r="2" fill="#F2CB6B" />
        <circle cx="50" cy="31" r="2" fill="#F2CB6B" />
        <circle cx="56" cy="33" r="2" fill="#F2CB6B" />
        <circle cx="50" cy="52" r="11" fill="#2AA5C4" />
        <Eye cx={46} cy={51} r={2.6} />
        <Eye cx={54} cy={51} r={2.6} />
        <path d="M47.5 56 L52.5 56 L50 61Z" fill="#F2A33A" />
      </g>
    ),
  },
  {
    id: "gau",
    label: "Gau",
    from: "#F6E7C8",
    to: "#C79A5A",
    art: () => (
      <g>
        <path d="M36 40 Q28 28 22 30" stroke="#EBCB8F" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M64 40 Q72 28 78 30" stroke="#EBCB8F" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <ellipse cx="27" cy="47" rx="10" ry="5.5" fill="#FFF8EA" transform="rotate(-20 27 47)" />
        <ellipse cx="73" cy="47" rx="10" ry="5.5" fill="#FFF8EA" transform="rotate(20 73 47)" />
        <ellipse cx="27" cy="47" rx="5.5" ry="2.8" fill="#F7B7AE" transform="rotate(-20 27 47)" />
        <ellipse cx="73" cy="47" rx="5.5" ry="2.8" fill="#F7B7AE" transform="rotate(20 73 47)" />
        <ellipse cx="50" cy="52" rx="22" ry="22" fill="#FFF8EA" />
        <path d="M32 40 Q40 32 48 38 Q46 48 36 50 Q30 48 32 40Z" fill="#8B5A33" />
        <ellipse cx="50" cy="65" rx="15" ry="10" fill="#F7B7AE" />
        <circle cx="44" cy="65" r="2" fill="#C9776E" />
        <circle cx="56" cy="65" r="2" fill="#C9776E" />
        <Eye cx={40} cy={54} />
        <Eye cx={60} cy={54} />
      </g>
    ),
  },
  {
    id: "haathi",
    label: "Haathi",
    from: "#B8C4D6",
    to: "#6D7C99",
    art: () => (
      <g>
        <circle cx="27" cy="50" r="15" fill="#8E9CBA" />
        <circle cx="27" cy="50" r="9" fill="#E7B8C6" />
        <circle cx="73" cy="50" r="15" fill="#8E9CBA" />
        <circle cx="73" cy="50" r="9" fill="#E7B8C6" />
        <circle cx="50" cy="48" r="21" fill="#AEBBD3" />
        <path d="M50 54 V72 Q50 80 58 78" stroke="#AEBBD3" strokeWidth="11" fill="none" strokeLinecap="round" />
        <path d="M46 62 H54 M46 68 H54" stroke="#8E9CBA" strokeWidth="1.6" strokeLinecap="round" />
        <Eye cx={41} cy={46} />
        <Eye cx={59} cy={46} />
        <Blush cx={35} cy={55} />
        <Blush cx={65} cy={55} />
      </g>
    ),
  },
  {
    id: "billi",
    label: "Billi",
    from: "#FFC48A",
    to: "#E2803A",
    art: () => (
      <g>
        <path d="M29 46 L30 22 L47 33Z" fill="#FFF4E6" />
        <path d="M71 46 L70 22 L53 33Z" fill="#FFF4E6" />
        <path d="M33 40 L33.5 28 L42 34Z" fill="#FFB3BE" />
        <path d="M67 40 L66.5 28 L58 34Z" fill="#FFB3BE" />
        <circle cx="50" cy="54" r="23" fill="#FFF4E6" />
        <path d="M46 34 V41 M50 33 V41 M54 34 V41" stroke="#E2803A" strokeWidth="2.6" strokeLinecap="round" />
        <Eye cx={40} cy={53} />
        <Eye cx={60} cy={53} />
        <Blush cx={34} cy={61} />
        <Blush cx={66} cy={61} />
        <path d="M47 59 L53 59 L50 63Z" fill="#F27B94" />
        <path d="M50 63 Q46 68 42 65 M50 63 Q54 68 58 65" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M22 58 L33 60 M22 65 L33 63 M78 58 L67 60 M78 65 L67 63" stroke="#C9A98A" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: "panda",
    label: "Panda",
    from: "#E8EFE6",
    to: "#9BB09C",
    art: () => (
      <g>
        <circle cx="31" cy="33" r="9.5" fill="#2A2A2E" />
        <circle cx="69" cy="33" r="9.5" fill="#2A2A2E" />
        <circle cx="50" cy="54" r="23" fill="#FFFFFF" />
        <ellipse cx="39" cy="52" rx="6.5" ry="8.5" fill="#2A2A2E" transform="rotate(25 39 52)" />
        <ellipse cx="61" cy="52" rx="6.5" ry="8.5" fill="#2A2A2E" transform="rotate(-25 61 52)" />
        <circle cx="39" cy="52" r="3" fill="#fff" />
        <circle cx="39" cy="52" r="1.5" fill={INK} />
        <circle cx="61" cy="52" r="3" fill="#fff" />
        <circle cx="61" cy="52" r="1.5" fill={INK} />
        <ellipse cx="50" cy="60" rx="4.5" ry="3.2" fill="#2A2A2E" />
        <path d="M50 63 V65 M50 65 Q46 69 43 66 M50 65 Q54 69 57 66" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <Blush cx={34} cy={64} />
        <Blush cx={66} cy={64} />
      </g>
    ),
  },
  {
    id: "diya",
    label: "Diya",
    from: "#FFB86B",
    to: "#D2561F",
    art: () => (
      <g>
        <circle cx="50" cy="38" r="20" fill="#fff" opacity="0.18" />
        <path d="M22 56 C24 78 76 78 78 56Z" fill="#9C3A14" />
        <ellipse cx="50" cy="56" rx="28" ry="5" fill="#D9692F" />
        <circle cx="38" cy="68" r="2" fill="#FFD76A" />
        <circle cx="50" cy="71" r="2" fill="#FFD76A" />
        <circle cx="62" cy="68" r="2" fill="#FFD76A" />
        <path d="M50 20 C59 33 61 41 50 53 C39 41 41 33 50 20Z" fill="#FFE066" />
        <path d="M50 34 C55 40 55 45 50 50 C45 45 45 40 50 34Z" fill="#FF8A2B" />
      </g>
    ),
  },
  {
    id: "tota",
    label: "Tota",
    from: "#8EDB7A",
    to: "#2F9A58",
    art: () => (
      <g>
        {[-18, 0, 18].map((a) => (
          <ellipse key={a} cx="50" cy="27" rx="3.6" ry="8" fill="#2E9E4A" transform={`rotate(${a} 50 48)`} />
        ))}
        <circle cx="50" cy="50" r="21" fill="#46C25E" />
        <ellipse cx="33" cy="58" rx="6" ry="5" fill="#FFE066" />
        <ellipse cx="67" cy="58" rx="6" ry="5" fill="#FFE066" />
        <circle cx="40" cy="45" r="6" fill="#fff" />
        <circle cx="60" cy="45" r="6" fill="#fff" />
        <Eye cx={40} cy={45} r={3.2} />
        <Eye cx={60} cy={45} r={3.2} />
        <path d="M42 53 Q50 48 58 53 Q58 66 50 69 Q42 66 42 53Z" fill="#F0504A" />
        <path d="M45 58 Q50 62 55 58" fill="none" stroke="#C93A34" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: "hiran",
    label: "Hiran",
    from: "#D9A877",
    to: "#8F5A32",
    art: () => (
      <g>
        <g fill="none" stroke="#7A4A25" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M39 38 Q31 28 33 14 M34 26 L25 22 M33 17 L40 12" />
          <path d="M39 38 Q31 28 33 14 M34 26 L25 22 M33 17 L40 12" transform="translate(100 0) scale(-1 1)" />
        </g>
        <ellipse cx="29" cy="46" rx="9" ry="5" fill="#E8B887" transform="rotate(-25 29 46)" />
        <ellipse cx="71" cy="46" rx="9" ry="5" fill="#E8B887" transform="rotate(25 71 46)" />
        <ellipse cx="50" cy="56" rx="18" ry="21" fill="#F5D7AE" />
        <circle cx="38" cy="46" r="1.8" fill="#fff" opacity="0.85" />
        <circle cx="62" cy="46" r="1.8" fill="#fff" opacity="0.85" />
        <circle cx="46" cy="41" r="1.6" fill="#fff" opacity="0.85" />
        <circle cx="54" cy="41" r="1.6" fill="#fff" opacity="0.85" />
        <ellipse cx="50" cy="69" rx="10" ry="8" fill="#FFF6E8" />
        <ellipse cx="50" cy="65" rx="4" ry="3" fill={INK} />
        <path d="M50 68 Q46 72 43 70 M50 68 Q54 72 57 70" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
        <Eye cx={41} cy={54} />
        <Eye cx={59} cy={54} />
      </g>
    ),
  },
  {
    id: "kachua",
    label: "Kachua",
    from: "#8BD3A0",
    to: "#3D8F5E",
    art: () => (
      <g>
        <circle cx="27" cy="46" r="7" fill="#BFE8A8" />
        <circle cx="73" cy="46" r="7" fill="#BFE8A8" />
        <circle cx="29" cy="74" r="7" fill="#BFE8A8" />
        <circle cx="71" cy="74" r="7" fill="#BFE8A8" />
        <ellipse cx="50" cy="60" rx="26" ry="22" fill="#3B8F5B" />
        <path d="M50 48 L59 53 V64 L50 69 L41 64 V53Z" fill="#2F7D4F" stroke="#8BD3A0" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M59 53 L66 49 M59 64 L66 68 M50 69 V77 M41 64 L34 68 M41 53 L34 49" stroke="#8BD3A0" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="50" cy="30" r="11" fill="#BFE8A8" />
        <Eye cx={45} cy={29} r={2.8} />
        <Eye cx={55} cy={29} r={2.8} />
        <Blush cx={41} cy={34} />
        <Blush cx={59} cy={34} />
        <Smile cx={50} cy={33} w={3.5} />
      </g>
    ),
  },
  {
    id: "titli",
    label: "Titli",
    from: "#A99BFF",
    to: "#5B49C9",
    art: () => (
      <g>
        <ellipse cx="35" cy="40" rx="17" ry="13" fill="#FFE3F7" transform="rotate(-28 35 40)" />
        <ellipse cx="65" cy="40" rx="17" ry="13" fill="#FFE3F7" transform="rotate(28 65 40)" />
        <ellipse cx="39" cy="63" rx="12" ry="10" fill="#FFC27A" transform="rotate(25 39 63)" />
        <ellipse cx="61" cy="63" rx="12" ry="10" fill="#FFC27A" transform="rotate(-25 61 63)" />
        <circle cx="31" cy="40" r="4" fill="#B79BFF" />
        <circle cx="69" cy="40" r="4" fill="#B79BFF" />
        <circle cx="38" cy="63" r="3" fill="#fff" />
        <circle cx="62" cy="63" r="3" fill="#fff" />
        <ellipse cx="50" cy="52" rx="3.6" ry="19" fill="#33236B" />
        <circle cx="50" cy="31" r="4.8" fill="#33236B" />
        <path d="M48 28 Q44 20 40 18 M52 28 Q56 20 60 18" fill="none" stroke="#33236B" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="40" cy="18" r="1.8" fill="#33236B" />
        <circle cx="60" cy="18" r="1.8" fill="#33236B" />
      </g>
    ),
  },
  {
    id: "ullu",
    label: "Ullu",
    from: "#C7A58A",
    to: "#7A5640",
    art: () => (
      <g>
        <path d="M31 36 L30 20 L44 30Z" fill="#8A5E3E" />
        <path d="M69 36 L70 20 L56 30Z" fill="#8A5E3E" />
        <ellipse cx="29" cy="62" rx="6" ry="14" fill="#B98A64" transform="rotate(8 29 62)" />
        <ellipse cx="71" cy="62" rx="6" ry="14" fill="#B98A64" transform="rotate(-8 71 62)" />
        <ellipse cx="50" cy="56" rx="24" ry="26" fill="#D9B28F" />
        <ellipse cx="50" cy="70" rx="14" ry="11" fill="#F3DFC4" />
        <path d="M43 67 Q46.5 70 50 67 Q53.5 70 57 67 M45 73 Q47.5 75.5 50 73 Q52.5 75.5 55 73" fill="none" stroke="#C9A07A" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="40" cy="48" r="11" fill="#FFF6E0" stroke="#F2CB6B" strokeWidth="2" />
        <circle cx="60" cy="48" r="11" fill="#FFF6E0" stroke="#F2CB6B" strokeWidth="2" />
        <Eye cx={40} cy={48} r={5.2} />
        <Eye cx={60} cy={48} r={5.2} />
        <path d="M47 55 L53 55 L50 62Z" fill="#F29A1F" />
      </g>
    ),
  },
  {
    id: "bunny",
    label: "Bunny",
    from: "#FFC9DD",
    to: "#E78AB0",
    art: () => (
      <g>
        <g transform="rotate(-8 40 46)">
          <ellipse cx="40" cy="26" rx="8" ry="19" fill="#FFF6FA" />
          <ellipse cx="40" cy="27" rx="4" ry="13" fill="#FFB6CF" />
        </g>
        <g transform="rotate(8 60 46)">
          <ellipse cx="60" cy="26" rx="8" ry="19" fill="#FFF6FA" />
          <ellipse cx="60" cy="27" rx="4" ry="13" fill="#FFB6CF" />
        </g>
        <circle cx="50" cy="60" r="21" fill="#FFF8FB" />
        <ellipse cx="35" cy="66" rx="5" ry="3.2" fill="#FF9DBB" opacity="0.6" />
        <ellipse cx="65" cy="66" rx="5" ry="3.2" fill="#FF9DBB" opacity="0.6" />
        <Eye cx={41} cy={58} />
        <Eye cx={59} cy={58} />
        <ellipse cx="50" cy="64" rx="3" ry="2.2" fill="#F27B94" />
        <path d="M50 66 Q46 71 43 68 M50 66 Q54 71 57 68" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    ),
  },
];

/* ------------------------------ user storage ------------------------------ */

const USER_KEY = "ayurvedai_user";
/* Avatars live in their own key (email -> avatar id), so logging out,
   which removes USER_KEY, does not wipe the chosen avatar. */
const AVATAR_KEY = "ayurvedai_avatars";

const avatarOwner = (user: StoredUser) =>
  (typeof user.email === "string" && user.email.trim().toLowerCase()) || "guest";

function readAvatarMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function loadUser(): StoredUser {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const user: StoredUser = raw ? (JSON.parse(raw) as StoredUser) : {};
    /* the saved avatar wins, so a fresh login without avatar still gets it back */
    const saved = readAvatarMap()[avatarOwner(user)];
    return saved ? { ...user, avatar: saved } : user;
  } catch {
    return {};
  }
}

export function saveUser(user: StoredUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    const map = readAvatarMap();
    const owner = avatarOwner(user);
    if (user.avatar) map[owner] = user.avatar;
    else delete map[owner];
    localStorage.setItem(AVATAR_KEY, JSON.stringify(map));

    window.dispatchEvent(new Event("ayurvedai-user-changed"));
  } catch {
    /* storage full or blocked: ignore */
  }
}

/* ------------------------------ the component ----------------------------- */

type ProfileAvatarProps = {
  /** avatar id from AVATARS, or an old uploaded photo (data: URL) */
  value?: string;
  /** used for the initial when no avatar is chosen */
  name?: string;
  className?: string;
};

export function ProfileAvatar({ value, name, className = "" }: ProfileAvatarProps) {
  const gid = useId().replace(/:/g, "");
  const def = AVATARS.find((a) => a.id === value);

  /* old uploaded photos keep working */
  if (value?.startsWith("data:")) {
    return (
      <img
        src={value}
        alt=""
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  if (def) {
    return (
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={def.label}
        className={`shrink-0 rounded-full ${className}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={def.from} />
            <stop offset="100%" stopColor={def.to} />
          </linearGradient>
          <radialGradient id={`${gid}-shine`} cx="30%" cy="25%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${gid})`} />
        <circle cx="50" cy="50" r="50" fill={`url(#${gid}-shine)`} />
        {def.art(gid)}
      </svg>
    );
  }

  /* initials fallback */
  const initial = (name?.trim()?.[0] ?? "U").toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C9E3B8] to-[#7FB28A] font-bold text-[#0C2419] ${className}`}
    >
      {initial}
    </span>
  );
}