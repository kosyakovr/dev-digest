import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TourMarkdown } from "./TourMarkdown";

afterEach(cleanup);

describe("TourMarkdown", () => {
  it("keeps a focused link mounted across a re-render (the page re-renders every second while generating)", () => {
    const md = "See [the docs](https://example.com/docs).";
    const { rerender } = render(<TourMarkdown>{md}</TourMarkdown>);
    const link = screen.getByRole("link", { name: "the docs" });
    link.focus();
    expect(document.activeElement).toBe(link);

    rerender(<TourMarkdown>{md}</TourMarkdown>);

    expect(screen.getByRole("link", { name: "the docs" })).toBe(link);
    expect(document.activeElement).toBe(link);
  });

  it("opens links in a new tab without an opener", () => {
    render(<TourMarkdown>{"[x](https://example.com)"}</TourMarkdown>);
    const link = screen.getByRole("link", { name: "x" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
