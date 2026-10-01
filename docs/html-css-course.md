# HTML & CSS Course Plan

The owner's full roadmap for the HTML & CSS course: 52 modules across three levels, plus a capstone project per level. Each module is one lesson on the site with its own knowledge check. Lessons live in `content/html-css/<level>/<folder>/`. Course id: `html-css`.

🔹 = a brief, recognition-only item (a short "just recognize it" step in the lesson).

## Status

| Level | Modules | Status |
|---|---|---|
| Beginner: Fundamentals | 1–22, two case reviews, capstone | Built (branch `content/html-css`) |
| Intermediate: Essential+ | 23–38, two case reviews, capstone | Built (same branch) |
| Advanced: Mastery | 39–52, two case reviews, capstone | Planned (built after Intermediate) |

## What runs where

This course uses a fifth engine, **`web`**: the learner edits real HTML and CSS in the browser and sees the page update in a live preview next to the editor.

- **Lesson exercises** (`web` steps) have two editor tabs, `index.html` and `style.css`. The preview is a real page rendered by the learner's own browser. A short HTML snippet (no `<html>` or `<head>`) is wrapped in a ready-made page that already links `style.css`; a full document only gets the CSS if it links a file called `style.css` itself (in any folder, e.g. `css/style.css`), exactly like a real site. Relative image paths like `images/cover-dune.svg` load the course's sample images from `public/course-assets/html-css/`.
- **Grading** works like the DSA course: each graded step has a reference solution and a list of hidden checks (small JavaScript expressions such as `css('h1', 'color')` or `$$('nav a').length`; the helpers are listed in `src/lib/web/core.ts`). The checks run against the learner's page and the solution's page, and the answers must match. Because the browser computes the final values, `red`, `#f00` and `rgb(255 0 0)` all count as the same answer. Steps can be checked at several screen widths (for media queries).
- **The preview does not run JavaScript.** This is an HTML & CSS course, and every interactive element it teaches (`<details>`, `<dialog>` with `command`/`commandfor`, popovers) works without scripts. Where a real site would usually add a line of JavaScript, the lesson shows it as copy-paste only.
- **Mac steps** ("On your Mac") cover what a web page can't: Finder and file paths, VS Code and Live Server, real DevTools on a real site, Git and GitHub, publishing, Prettier and Stylelint, Vite, VoiceOver, Lighthouse.
- **The content check** (`pnpm check:content html-css`) loads every graded step in a real Chrome (Playwright's headless Chrome, installed once with `pnpm exec playwright-core install chromium-headless-shell`): the reference solution must pass its own checks, the starter must not, and every listed wrong answer must be rejected. Starter code for ungraded steps must at least render. Quizzes are multiple choice (and fill-in with `runnable: false`); there are no predict-the-output questions.

Running example: the learner builds and repairs pages for **Inkwell Books** (the bookstore from the story bible): its storefront, a book page, the contact form, the staff directory.

---

## Beginner: Fundamentals

*Season goal: from "what is a website?" to a responsive multi-page site built with semantic HTML, Flexbox and Grid.*

### Part 1: How the Web Works & Your Workspace

| # | Module | Folder | Covers |
|---|---|---|---|
| 1 | The Web in Plain Terms | `01-the-web` | What a website is (files sent from a server to your browser); browser vs. server vs. internet; URLs and domains; what HTML (structure/content), CSS (appearance) and JavaScript (behavior) each do; HTTP/HTTPS at a glance; 🔹 DNS (recognition only) |
| 2 | Files, Folders & Your Mac | `02-files-folders` | Finder; creating and organizing project folders; file names and extensions (`.html`, `.css`); why lowercase-no-spaces naming matters; file paths (absolute vs. relative, `../`); common mistake: broken paths from spaces or wrong capitalization |
| 3 | Your Code Editor & Browser Tools | `03-editor-devtools` | VS Code basics (open folder, create files, save, autosave); Emmet shortcuts; Live Server/preview; opening browser DevTools (Inspect Element); viewing HTML and live-editing CSS in DevTools. Your first debugging skill |

### Part 2: HTML Foundations

| # | Module | Folder | Covers |
|---|---|---|---|
| 4 | HTML Document Anatomy | `04-document-anatomy` | Tags, elements, attributes; opening/closing and void elements; nesting rules; `<!DOCTYPE html>`, `<html lang>`, `<head>`, `<body>`; `<meta charset>` and `<meta name="viewport">`; `<title>`; comments; indentation conventions; common mistake: unclosed or mis-nested tags |
| 5 | Text Content | `05-text-content` | Headings `<h1>`–`<h6>` and heading hierarchy; paragraphs; `<strong>` vs. `<b>`, `<em>` vs. `<i>`; line breaks vs. paragraphs; lists (`<ul>`, `<ol>`, `<li>`, nested lists); `<blockquote>`, `<code>`, `<pre>`; HTML entities (`&amp;`, `&lt;`, `&nbsp;`); 🔹 `<dl>` description lists |
| 6 | Links & Navigation | `06-links` | `<a href>`; relative vs. absolute links; linking between your own pages; in-page links with `id`; `target="_blank"` + `rel="noopener"`; `mailto:`/`tel:` links; meaningful link text (avoid "click here") |
| 7 | Images & Media | `07-images-media` | `<img>` with `src`, `alt` (and when alt should be empty), `width`/`height` to prevent layout shift; file formats (JPEG, PNG, SVG, WebP, AVIF) and when to use each; `<figure>`/`<figcaption>`; `<video>` and `<audio>` basics; `<iframe>` embeds (YouTube, maps) |
| 8 | Semantic Page Structure | `08-semantic-structure` | `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`; `<div>` and `<span>` as generic containers and when to use them; why semantics matter (accessibility, SEO, readability); common mistake: "div soup" |
| 9 | Tables | `09-tables` | `<table>`, `<tr>`, `<th>`, `<td>`; `<thead>`/`<tbody>`; `<caption>`; `scope`; `colspan`/`rowspan`; tables for data only, never for page layout |
| 10 | Forms Basics | `10-forms-basics` | `<form>`, `action`, `method`; `<input>` types (text, email, password, number, checkbox, radio, date, file); `<label>` with `for`; `<textarea>`, `<select>`/`<option>`, `<button type>`; `name` and `value`; `<fieldset>`/`<legend>`; placeholder is not a label |
| 11 | Validation & Debugging HTML | `11-validating-html` | W3C validator; reading the DevTools Elements panel; how browsers "fix" broken HTML silently; checking structure with the browser's accessibility tree |

✅ **Checkpoint:** *(Case review `review-1-html`.)* Mark up a complete Inkwell Books page from a plain-text brief: semantic structure, a book table, a contact form, with no starter scaffolding.

### Part 3: CSS Foundations *(prerequisite: Parts 1–2)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 12 | Connecting CSS | `12-connecting-css` | Inline vs. `<style>` vs. external stylesheet (`<link>`); why external is the default; rule anatomy (selector, property, value, declaration); comments |
| 13 | Selectors | `13-selectors` | Type, class, ID; grouping; descendant and child combinators (`a b`, `a > b`); attribute selectors; pseudo-classes (`:hover`, `:focus`, `:focus-visible`, `:first-child`, `:nth-child()`, `:not()`); pseudo-elements (`::before`, `::after`, `::placeholder`); 🔹 sibling combinators `+` and `~` |
| 14 | The Cascade, Specificity & Inheritance | `14-cascade-specificity` | How conflicts are resolved (origin, specificity, order); calculating specificity; inherited vs. non-inherited properties; `inherit`, `initial`, `unset`; why to avoid `!important` and ID selectors for styling; debugging with DevTools "Computed" and crossed-out rules |
| 15 | Units, Colors & Values | `15-units-colors` | `px`, `%`, `em`, `rem`, `vw`/`vh`, and the newer `dvh`/`svh`; when to use rem vs. em; colors (named, hex, `rgb()`, `hsl()`, `oklch()`), alpha transparency; `calc()` |
| 16 | Typography | `16-typography` | `font-family` and fallback stacks; system fonts; web fonts (Google Fonts, `@font-face`, `font-display`); `font-size`, `font-weight`, `line-height`, `letter-spacing`; `text-align`, `text-decoration`, `text-transform`; readable line length; 🔹 variable fonts |
| 17 | The Box Model | `17-box-model` | Content, padding, border, margin; `box-sizing: border-box` (and why everyone sets it); margin collapsing; width/height, min-/max- sizes; overflow; common mistake: unexpected sizes from padding without border-box |
| 18 | Display & Normal Flow | `18-display-flow` | Block vs. inline vs. inline-block; how normal document flow works; `display: none` vs. `visibility: hidden`; backgrounds (color, image, size, position, gradients); `border-radius`; `box-shadow` |
| 19 | Positioning | `19-positioning` | static, relative, absolute, fixed, sticky; offsets (`top`/`left`/`inset`); containing blocks; `z-index` and stacking basics; common mistake: absolute elements "escaping" because the parent isn't positioned |

✅ **Checkpoint:** *(Case review `review-2-css`.)* Restyle the plain Inkwell page from the brief: typography, colors, spacing and a positioned "sale" badge, with every value checked.

### Part 4: Modern Layout *(prerequisite: Modules 17–19)*

| # | Module | Folder | Covers |
|---|---|---|---|
| 20 | Flexbox | `20-flexbox` | Flex container vs. items; main/cross axis; `flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `gap`; `flex-grow`/`shrink`/`basis` and the `flex` shorthand; `order`; typical patterns (navbars, centering, card rows) |
| 21 | CSS Grid | `21-grid` | `grid-template-columns`/`rows`; the `fr` unit; `repeat()`, `minmax()`, `auto-fit`/`auto-fill`; `gap`; placing items by line numbers; `grid-template-areas`; Grid vs. Flexbox: when to use which; Grid inspector in DevTools |
| 22 | Responsive Design Basics | `22-responsive-basics` | Mobile-first approach; viewport meta (review); media queries with modern range syntax (`width >= 768px`); choosing breakpoints by content, not devices; fluid images (`max-width: 100%`); testing with DevTools device mode; 🔹 floats for layout are legacy |

**Beginner capstone** *(folder `capstone-1-personal-site`)*: a responsive multi-page personal site (home, about, projects, contact form) built with semantic HTML, Flexbox and Grid, working well on phone and desktop. Graded pieces in the browser, then assembled and opened on the Mac.

---

## Intermediate: Essential+

### Part 5: Professional HTML

| # | Module | Folder | Covers |
|---|---|---|---|
| 23 | Accessibility (a11y) Core | `23-accessibility-core` | Why it matters (users, law); keyboard navigation and visible focus; correct heading order; landmarks; color contrast (WCAG AA); alt-text strategy; skip links; ARIA basics and the "no ARIA is better than bad ARIA" rule; `aria-label`, `aria-hidden`, `aria-expanded`; testing with VoiceOver and Lighthouse/axe |
| 24 | Advanced Forms | `24-advanced-forms` | Built-in validation (`required`, `pattern`, `min`/`max`, `type`); `:valid`/`:invalid`/`:user-invalid` styling; `autocomplete` attributes; accessible error messages; `accent-color`; `<datalist>`; 🔹 `<output>`, `<progress>`, `<meter>` |
| 25 | Native Interactive Elements | `25-native-interactive` | `<details>`/`<summary>` accordions; `<dialog>` modals; the Popover API (`popover` attribute) for menus and tooltips; why native beats custom-built widgets; the tiny bit of JavaScript some of these need, shown as copy-paste only |
| 26 | Responsive Images & Performance-Aware HTML | `26-responsive-images` | `srcset` and `sizes`; `<picture>` for art direction and format fallbacks; `loading="lazy"`, `decoding`, `fetchpriority`; preloading fonts; 🔹 `<link rel="preconnect">` |
| 27 | Metadata, SEO & Sharing | `27-metadata-seo` | `<meta name="description">`; Open Graph and social preview tags; favicons and app icons; canonical URLs; semantic HTML as SEO foundation; 🔹 structured data/JSON-LD |

✅ **Checkpoint:** *(Case review `review-3-professional-html`.)* Make the Inkwell order form and book page accessible, validated, shareable and fast-loading.

### Part 6: Intermediate CSS

| # | Module | Folder | Covers |
|---|---|---|---|
| 28 | Custom Properties (CSS Variables) | `28-custom-properties` | `--name` and `var()`; fallbacks; scope and inheritance; a design-token set (colors, spacing, type scale); theming; light/dark mode with `prefers-color-scheme` and `light-dark()` |
| 29 | Modern Selectors | `29-modern-selectors` | `:has()` (the "parent selector"); `:is()` and `:where()` (and their specificity difference); `:focus-within`; `:nth-child(… of S)` |
| 30 | Native CSS Nesting | `30-css-nesting` | Nesting syntax and `&`; nesting media queries; keep it shallow; native nesting now covers most of what people used Sass for |
| 31 | Fluid & Intrinsic Sizing | `31-fluid-intrinsic` | `clamp()`, `min()`, `max()`; fluid typography and spacing; `aspect-ratio`; `object-fit`/`object-position`; `fit-content`, `min-content`, `max-content`; logical properties (`margin-inline`, `padding-block`, `inline-size`) |
| 32 | Transitions & Transforms | `32-transitions-transforms` | `transition` (property, duration, easing, delay); `transform` (translate, scale, rotate) and individual transform properties; cheap properties to animate (transform, opacity); `prefers-reduced-motion` |
| 33 | Keyframe Animations | `33-keyframe-animations` | `@keyframes`; the `animation` shorthand; iteration, direction, fill-mode; loading spinners and entrance effects; restraint as best practice |
| 34 | Layout Patterns | `34-layout-patterns` | Holy-grail page layout; card grids; sidebar layouts; centering every way; sticky header/footer; full-bleed sections; intrinsic "no media query" layouts with Grid `auto-fit` |

✅ **Checkpoint:** *(Case review `review-4-modern-css`.)* Theme the Inkwell storefront with tokens, light/dark mode, fluid type and a motion-safe card grid.

### Part 7: Workflow & Shipping

| # | Module | Folder | Covers |
|---|---|---|---|
| 35 | Git & GitHub Basics | `35-git-github` | What version control is; installing Git; `init`, `add`, `commit`, `status`, `log`; GitHub repositories; push/pull; `.gitignore`; committing often with clear messages |
| 36 | Publishing a Site | `36-publishing` | GitHub Pages; Netlify or Vercel drag-and-drop/Git deploy; custom domains and HTTPS at a glance; checking the live site on your phone |
| 37 | Code Quality Tooling | `37-code-quality` | Prettier (formatting); Stylelint (CSS linting); VS Code extensions setup; consistent naming and file organization |
| 38 | Browser Compatibility | `38-browser-compat` | "Baseline" status on MDN and caniuse.com; `@supports` feature queries; progressive enhancement; testing in Safari, Chrome and Firefox on your Mac; 🔹 vendor prefixes |

**Intermediate capstone** *(folder `capstone-2-landing-page`)*: a polished, accessible landing page for a fictional product with light/dark themes, fluid typography, native dialog/popover components, responsive images, passing a Lighthouse audit, deployed live from GitHub.

---

## Advanced: Mastery

### Part 8: Scalable CSS Architecture

| # | Module | Folder | Covers |
|---|---|---|---|
| 39 | Methodologies | `39-methodologies` | BEM naming; utility-first vs. component styles; CUBE CSS concepts; organizing files (reset/base, layout, components, utilities); a modern CSS reset |
| 40 | Cascade Layers | `40-cascade-layers` | `@layer` order and declaration; layering resets, base, components, utilities and third-party CSS; ending specificity wars |
| 41 | Scoping Styles | `41-scoping` | `@scope` with donut scopes; comparing with BEM and CSS Modules; when scoping is worth it |
| 42 | Design Systems & Tokens | `42-design-tokens` | Token tiers (primitive → semantic → component); type and spacing scales; documenting components; consistency across pages |

✅ **Checkpoint:** *(Case review `review-5-architecture`.)* Untangle a specificity war in an inherited Inkwell stylesheet with layers, scope and semantic tokens.

### Part 9: Advanced Modern CSS

| # | Module | Folder | Covers |
|---|---|---|---|
| 43 | Container Queries | `43-container-queries` | `container-type`, `container-name`; `@container` size queries; container units (`cqi`, `cqw`); components that respond to their space, not the screen; 🔹 container style queries |
| 44 | Subgrid & Advanced Grid | `44-subgrid` | `subgrid` for aligned cards and forms; named lines; implicit grid and `grid-auto-flow: dense`; overlap layouts |
| 45 | Anchor Positioning | `45-anchor-positioning` | `anchor-name`, `position-anchor`, `anchor()`, `position-area`; fallbacks with `position-try`; pairing with the Popover API for tooltips and dropdowns; `@supports` fallbacks |
| 46 | View Transitions & Scroll-Linked Effects | `46-view-transitions-scroll` | Same-document view transitions (CSS side: `view-transition-name`, `::view-transition-*`); cross-document transitions (`@view-transition`) as progressive enhancement; scroll snap; 🔹 scroll-driven animations (`animation-timeline: scroll()`/`view()`) |
| 47 | Advanced Visual Effects | `47-visual-effects` | `filter` and `backdrop-filter`; `mix-blend-mode`; `clip-path` and `mask`; layered gradients; `color-mix()` and relative color syntax; wide-gamut color (oklch, display-p3) |

✅ **Checkpoint:** *(Case review `review-6-modern-css`.)* Build a self-adapting Inkwell book card: container queries, subgrid alignment, an anchored tooltip and a scroll-snap shelf.

### Part 10: Performance, Quality & Professional Practice

| # | Module | Folder | Covers |
|---|---|---|---|
| 48 | Rendering Performance | `48-rendering-performance` | How browsers render (parse → style → layout → paint → composite); Core Web Vitals (LCP, CLS, INP) as they relate to HTML/CSS; avoiding layout shift; `content-visibility`; `will-change` (sparingly); critical CSS; DevTools Performance panel and Lighthouse |
| 49 | Accessibility at Professional Level | `49-accessibility-pro` | WCAG 2.2 AA criteria overview; accessible custom components (tabs, menus) following ARIA Authoring Practices; focus management; forced-colors/High Contrast mode; full audit workflow |
| 50 | Build Tools & Frameworks Overview | `50-build-tools` | Vite as a dev server/bundler; Lightning CSS/PostCSS for automatic prefixing and minifying; Tailwind CSS (v4) utility workflow and its trade-offs vs. hand-written CSS; 🔹 Sass (recognition only) |
| 51 | Debugging Mastery | `51-debugging-mastery` | Systematic layout debugging (outline trick, DevTools Flex/Grid/Container overlays); stacking context bugs; overflow hunting; cross-browser bug isolation; reading the spec and MDN effectively |
| 52 | Professional Handoff | `52-professional-handoff` | Translating Figma designs to code (Dev Mode, measuring, exporting assets); pixel-accuracy vs. responsive intent; code review habits; writing maintainable CSS for teams |

**Advanced capstone** *(folder `capstone-3-design-system`)*: a small design system (tokens, layered architecture, 10+ components built with container queries, anchor-positioned tooltips and view transitions) documented in a component showcase site, plus a full WCAG 2.2 AA audit and performance report.

---

## Final Skills

- **After Beginner:** write valid, semantic HTML; style pages with CSS; build responsive layouts with Flexbox and Grid; debug basics in DevTools.
- **After Intermediate:** build accessible, themeable, responsive sites with modern CSS; use Git; deploy sites publicly; handle browser support confidently. This is the level of most junior front-end tasks.
- **After Advanced:** architect maintainable CSS for large projects and teams; use the newest layout and interaction features with fallbacks; diagnose performance and accessibility at a professional level; turn designs into production-quality code.

## Not covered / deferred

JavaScript (its own roadmap; the natural next step) · CSS Houdini / `@property` deep dive · SVG authoring and animation in depth · CSS-in-JS libraries · CSS Modules in frameworks · customizable `<select>` (`appearance: base-select`) · Web Components and Shadow DOM styling · email HTML/CSS · print stylesheets in depth · internationalization and right-to-left/vertical writing modes · CSS `shape()` and `shape-outside` · `@starting-style` animation edge cases · browser rendering-engine internals · Sass in depth · legacy float/table layouts · CSS frameworks other than Tailwind (Bootstrap, etc.)
