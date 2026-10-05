# HereFishyFishy — asset layout

```
index.html          45 KB   markup only (was 597 KB)
assets/app.css     141 KB   all styling, organised into cascade layers
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
@layer tokens, app, patches, overrides;
```

Later layers win over earlier ones **regardless of selector specificity**.
So a bare `.rrank-card { ... }` written in `overrides` beats
`#results .rrank-card { ... }` in `app`. No specificity games, no
`!important`.

* **`tokens`**: the design system. Palette, paper and panel surfaces,
  status colours (on-paper and on-panel versions), font roles, type scale,
  radii, spacing, and `--content-max` / `--band-pad` for the centred
  results column. New rules should read from these instead of writing
  literal colours or sizes.
* **`app`**: everything that existed before layers. Frozen; don't add to it.
  It has no `!important` declarations left.
* **`patches`**: declarations moved out of `app` when their `!important`
  flags were dropped, kept in original source order.
* **`overrides`**: all new styling, including the results-page restyle
  (editorial page, dark panel only for the headline readings).

### The caveat that will bite you

`!important` **inverts** layer order: an `!important` declaration in an
earlier layer beats a *normal* declaration in a later one. Ten remain, and
each one exists to beat an inline `style` attribute set by JS, which no
layer can outrank:

* `patches`: three `display` rules, two label rules against inline
  `letter-spacing` / `text-transform`, and padding against
  `#river-placeholder`'s inline padding.
* `overrides`: `margin-top` and `padding` on `#river-section-picker` /
  `#river-placeholder` (mobile).

When an override silently does nothing, grep `app.css` for `!important`
on that property, and check the element for an inline `style`, before
assuming the selector is wrong.

## Browser support

`@layer` is supported in Chrome 99+, Safari 15.4+, Firefox 97+ (all
early 2022). A browser without support ignores the entire block, which
means an unstyled page rather than a degraded one. Check analytics before
assuming this is free.
