## KRChange Frontend Style Guide

### Theme (Steel Mode)

- Steel mode rather than plain dark mode. Default `html` has `class="dark"`.
- Background: metallic teal/cyan gradient (≈80% steel, 20% cyber) with subtle brushed texture and higher-contrast dot grid using `bg-app-gradient bg-grid-dot`. Avoid purple hues; stay in teal/cyan family.
- Ambient glows with mild parallax from `BackgroundFX` component; keep under 20% opacity.
- Neumorphic cards: `card` utility (rounded, border, soft shadow) and optional `brand-glow-sm` for dialogs.
- Colors: primary cyan/teal; muted slate/zinc grays; green/red only for deltas.
- Add metallic sheen: thin diagonal specular lines and a slight anisotropic brush pattern are included in `bg-app-gradient`. Keep them subtle so text remains legible.

### Components

- Use shadcn/ui equivalents where available; otherwise Tailwind utilities. Keep file structure under `src/components/*`.
- Buttons: primary `bg-primary text-primary-foreground`; secondary `bg-secondary`.
- Cards: use `card` utility and inner padding.
- Tables: slim headers, row hover with `hover:bg-secondary/40`, compact cells.
- Icons: lucide-react minimal line icons.

### Typography

- Clean sans (Geist), medium headers, lighter body. Avoid heavy weights.
- Use concise labels and accessible `aria-*` attributes for interactive elements.

### Layout

- Container padding via `container-padded` utility.
- Sticky top nav with blur and border.
- Keep content above effects: wrap `TopNav` and `main` in `relative z-10` since `BackgroundFX` sits at `z-0`.
- Keyboard focus rings use `focus-visible:ring-primary`.

### Motion

- Subtle `framer-motion` fades/slide-ups for KPI entrance.
- Ambient idle drift and cursor parallax via `BackgroundFX`. Keep parallax small.
- Avoid excessive animation; respect reduced motion if added later.

### Accessibility

- Provide `aria-label` on icon-only buttons.
- Ensure tab order and keyboard operation for menus and dialogs.

### Code Style

- TypeScript strict. Named, descriptive props.
- Avoid deep nesting; early returns.
- Utilities in `src/lib` for formatting and chain config.

### Utility Reference

- `bg-app-gradient`: Metallic teal/cyan gradient with faint brushed texture; brighter steel base with specular sheens.
- `bg-grid-dot`: High-contrast dotted grid overlay (dark mode tuned).
- `brand-glow-sm` / `brand-glow-md`: Soft teal glow box-shadows for accent surfaces.
- `animate-float-slow`: Slow float animation; pair with reduced-motion guard.
- `parallax-layer`: Applies transform via CSS variables `--px`, `--py`.
