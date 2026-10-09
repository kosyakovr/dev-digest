"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "../../helpers";
import { s } from "./styles";

// Module-level, so every render passes the same component type: an inline `a`
// would remount every link (and drop focus) on each re-render.
const REMARK_PLUGINS = [remarkGfm];
const DISALLOWED = ["img"];
const COMPONENTS: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={s.link}>
      {children}
    </a>
  ),
};

/**
 * Model text is untrusted (NFR-7): no raw HTML, no images (a remote image is a
 * tracking pixel) and no `javascript:` links. The shared `Markdown` primitive
 * renders images, so the tour has its own renderer.
 */
export function TourMarkdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div style={s.root}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        disallowedElements={DISALLOWED}
        unwrapDisallowed
        urlTransform={safeUrl}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
