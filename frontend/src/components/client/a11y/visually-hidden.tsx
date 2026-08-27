/**
 * VisuallyHidden — screen-reader-only text using the standard clip
 * pattern (1px box, clipped, no overflow). Never `display:none` — that
 * removes content from assistive tech as well.
 */
import type { CSSProperties, ReactNode } from "react";

/** The canonical clip pattern, kept explicit for auditability. */
export const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function VisuallyHidden({
  children,
  as: Tag = "span",
}: {
  children: ReactNode;
  as?: "span" | "p" | "div" | "label";
}) {
  return <Tag style={VISUALLY_HIDDEN_STYLE}>{children}</Tag>;
}
