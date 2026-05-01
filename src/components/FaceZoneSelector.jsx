import { useMemo } from "react";

const ZONES = [
  {
    id: "forehead",
    label: "Forehead",
    d: "M 50 88 Q 50 32 100 28 Q 150 32 150 88 L 138 92 Q 100 80 62 92 Z",
  },
  {
    id: "nose",
    label: "Nose",
    d: "M 92 92 L 108 92 L 113 158 L 87 158 Z",
  },
  {
    id: "left_cheek",
    label: "Left cheek",
    d: "M 50 95 L 88 95 L 88 158 Q 70 168 52 152 Z",
  },
  {
    id: "right_cheek",
    label: "Right cheek",
    d: "M 150 95 L 112 95 L 112 158 Q 130 168 148 152 Z",
  },
  {
    id: "jawline_left",
    label: "Left jaw",
    d: "M 52 158 Q 42 198 78 218 L 92 200 Q 86 178 76 172 Z",
  },
  {
    id: "jawline_right",
    label: "Right jaw",
    d: "M 148 158 Q 158 198 122 218 L 108 200 Q 114 178 124 172 Z",
  },
  {
    id: "chin",
    label: "Chin",
    d: "M 78 218 Q 100 238 122 218 L 108 200 Q 100 206 92 200 Z",
  },
];

const ZONE_LABEL = ZONES.reduce((acc, z) => {
  acc[z.id] = z.label;
  return acc;
}, {});

const STROKE_DEFAULT = "var(--color-inky-moss, #2d3d2b)";
const STROKE_SELECTED = "rgba(45,61,43,0.6)";
const FILL_SELECTED = "rgba(45,61,43,0.15)";

export function FaceZoneSelector({ selected = [], onChange }) {
  const set = useMemo(() => new Set(selected), [selected]);

  const toggle = (id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange?.(Array.from(next));
  };

  const labelText = selected
    .map(id => (ZONE_LABEL[id] || id).toUpperCase())
    .join(" · ");

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox="0 0 200 260"
        style={{
          width: 180,
          height: "auto",
          margin: "0 auto",
          display: "block",
          touchAction: "manipulation",
        }}
        aria-label="Face zone selector"
      >
        {/* Decorative outline — non-interactive */}
        <ellipse
          cx="100"
          cy="128"
          rx="74"
          ry="104"
          fill="none"
          stroke={STROKE_DEFAULT}
          strokeOpacity="0.3"
          strokeWidth="1"
          pointerEvents="none"
        />
        {ZONES.map(z => {
          const isSel = set.has(z.id);
          return (
            <path
              key={z.id}
              id={z.id}
              d={z.d}
              fill={isSel ? FILL_SELECTED : "none"}
              stroke={isSel ? STROKE_SELECTED : STROKE_DEFAULT}
              strokeOpacity={isSel ? 1 : 0.3}
              strokeWidth="1"
              onClick={() => toggle(z.id)}
              style={{ cursor: "pointer", transition: "fill 180ms ease, stroke 180ms ease, stroke-opacity 180ms ease" }}
            >
              <title>{z.label}</title>
            </path>
          );
        })}
      </svg>

      <p
        style={{
          fontFamily: "var(--font-display, 'Fungis Heavy', 'Space Grotesk', sans-serif)",
          fontWeight: 400,
          fontSize: 10,
          letterSpacing: "0.15em",
          color: "var(--color-inky-moss, #2d3d2b)",
          textAlign: "center",
          marginTop: 14,
          minHeight: 14,
        }}
      >
        {labelText || " "}
      </p>
    </div>
  );
}

export const FACE_ZONE_IDS = ZONES.map(z => z.id);
export const FACE_ZONE_LABELS = ZONE_LABEL;
export const FACE_ZONES = ZONES;
