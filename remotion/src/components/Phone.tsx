import React from "react";
import { C, FONT } from "../theme";

export const Phone: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      width: 460,
      height: 860,
      borderRadius: 56,
      background: C.white,
      boxShadow: "0 60px 120px -40px rgba(34,32,28,0.35)",
      border: `1px solid rgba(34,32,28,0.08)`,
      padding: 34,
      fontFamily: FONT,
      color: C.ink,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{ label: string; color?: string; bg?: string }> = ({
  label,
  color = C.sage,
  bg = C.sageSoft,
}) => (
  <span
    style={{
      display: "inline-block",
      padding: "8px 16px",
      borderRadius: 999,
      background: bg,
      color,
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      fontFamily: FONT,
    }}
  >
    {label}
  </span>
);
