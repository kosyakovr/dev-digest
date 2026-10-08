"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "../../helpers";
import { s } from "./styles";

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
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
        urlTransform={safeUrl}
        components={{
          a: ({ children: c, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={s.link}>
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
