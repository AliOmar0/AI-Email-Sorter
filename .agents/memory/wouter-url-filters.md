---
name: wouter URL-driven filters
description: Why inbox filters must be derived reactively from the URL (wouter useSearch) rather than read once at mount.
---

# wouter query-param filters must be reactive

In the inbox-ai frontend, page filters (view / labelId / search) are encoded in
the URL query string and driven from the global Sidebar (label links + search box).

**Rule:** derive query-param state with wouter's `useSearch()` and parse it on
every render (`new URLSearchParams(useSearch())`). Do NOT seed it once with
`useState(new URLSearchParams(window.location.search).get(...))`.

**Why:** wouter does client-side navigation, so clicking a sidebar label only
changes the URL — it does not remount the page. Mount-only `useState` reads the
URL once and then ignores later navigations, so the list silently stops updating
when you pick a different label (the original bug). `useSearch()` subscribes to
location changes and re-renders.

**How to apply:**
- Read filters from `useSearch()`; change them via `useLocation()[1]` navigate.
- When changing one filter, merge the existing params (`new URLSearchParams(searchString)`,
  mutate, re-serialize) so unrelated filters like `search` are preserved instead
  of clobbered.
- Reset transient UI tied to the old filter (open email, multi-select) in a
  `useEffect` keyed on the derived filter values.
