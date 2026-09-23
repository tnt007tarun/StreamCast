# HereFishyFishy — asset layout

```
index.html          45 KB   markup only (was 597 KB)
assets/app.css     103 KB   all styling, organised into cascade layers
assets/app.js      460 KB   all application logic
```

`index.html` references them with absolute paths (`/assets/app.css`,
`/assets/app.js`) so they resolve the same whatever route serves the page.

## The split

The split is mechanical and was verified by re-inlining both files and
diffing the result against the original single-file build: the SHA-256
matched exactly. Nothing about load order changed — the stylesheet sits
where the `<style>` block was, and the script tag sits where the inline
`<script>` was, at the end of `<body>`.

Two things did change, deliberately:

* The Microsoft Clarity snippet was installed **three times** (same project
  id, `x3jmju83ap`). Two copies were removed. Session counts after this
  deploy will not be comparable with before.
* `app.css` is wrapped in cascade layers (below).

## Cascade layers

```css
@layer app, overrides;
```

Later layers win over earlier ones **regardless of selector specificity**.
So a bare `.rrank-card { ... }` written in `overrides` beats
`#results .rrank-card { ... }` in `app`. No specificity games, no
`!important`.

* **`app`** — everything that existed before layers. Treat as frozen.
* **`overrides`** — all new styling. This is where the results-page
  restyle belongs.

### The caveat that will bite you

`!important` **inverts** layer order: an `!important` declaration in `app`
beats a *normal* declaration in `overrides`. 52 such declarations remain
in `app`. The ones that have already caused trouble:

| selector | property | what it forces |
|---|---|---|
| `.species-btn-img` | `width` / `height` | the 44×28 thumbnail box |
| `.hero-photo` | `height` | the 160px photo hero |
| `.bdet, .rra…` group | `font-size` | an 11px minimum |

When an override silently does nothing, grep `app.css` for `!important`
on that property before assuming the selector is wrong.

### Next pass

Move those 52 `!important` declarations into their own layer between `app`
and `overrides` and drop the flags — layer order then expresses the same
intent, and `overrides` becomes genuinely final. This needs doing in small
batches with a visual check on each, because removing `!important` changes
who wins *within* `app`.

## Browser support

`@layer` is supported in Chrome 99+, Safari 15.4+, Firefox 97+ (all
early 2022). A browser without support ignores the entire block, which
means an unstyled page rather than a degraded one. Check analytics before
assuming this is free.
