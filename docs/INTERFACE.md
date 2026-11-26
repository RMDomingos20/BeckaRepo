# Visual Design Direction

Workspace-first desktop interface: neutral gray surfaces, subtle dividers, legible typography, and purposeful color encoding.

- `src/styles/theme.js`: shared color tokens for panels, graph categories, and controls.
- `src/styles/app.css`: layout rules, keyboard focus rings, custom scrollbars, and `prefers-reduced-motion` support.
- System UI fonts for chrome and labels; bundled `JetBrains Mono` reserved for source code and byte/line evidence.
- Clean start screen with static mark, concise description, and primary folder-selection action (decorative background networks, logo physics, glowing gradients, and neon shadows removed).
- Graph nodes use a restrained category palette with distinct visual states for active selection, hover, and search matches.
- Responsive toolbar wrapping, viewport-constrained modals, and a `11 px` minimum font size floor for small control labels.
- User-customizable accent hue (Lilac, Blue, Sage, or custom system color picker with automatic dark-mode contrast adjustment) and row spacing (Comfortable / Compact) persisted in SQLite.

## Ongoing Polish

- Shared button/input/modal primitives, full migration of remaining inline styles to CSS classes, extended keyboard navigation across tree and graph views, contrast audits, and consistent legend/i18n review across English and Portuguese.
