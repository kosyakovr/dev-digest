# server — docs

Durable "how it works" documentation that outgrew [../README.md](../README.md):
architecture deep-dives, data flows, how-tos.

- [blast-radius.md](blast-radius.md) — `GET /pulls/:id/blast` and `/history`: request flow and degradation.
- [pull-files.md](pull-files.md) — `pr_files` is written only by `GET /pulls/:id`; what that means for non-browser readers.
- [project-context.md](project-context.md) — Project Context (L05): attached docs, the list cache, and the run-time path into the prompt and trace.
- [risk-brief.md](risk-brief.md) — Risk Brief (L05): facts, one structured call, grounding, the `pr_brief` cache.
- Keep the package README as the short overview; link here for depth.
- Architecture decisions: `adr/NNNN-<title>.md` (context · decision · consequences).
- Update the doc in the same change that alters the behaviour it describes.
