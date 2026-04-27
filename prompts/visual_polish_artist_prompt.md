# Visual Polish Artist Prompt

## Objective

Elevate the UI/UX of **one specific ServerMon component or module** per run to a polished, production-quality standard using the existing ServerMon design system.

## Scope

- Pick **one** component or module at random.
- Make **one** visual improvement (e.g., add an animation, improve a shadow, fix typography, add a gradient). Don't redesign the whole thing.

## Aesthetic Checklist

1.  **Design Tokens**: Use semantic CSS variables and existing component classes from `src/app/globals.css`; do not introduce hardcoded Tailwind color families or one-off hex values.
2.  **Surface Quality**: Improve hierarchy with existing border, shadow, background, and spacing patterns already used nearby.
3.  **Animations**: Use existing motion patterns or `framer-motion` only where motion adds clear feedback. Specifically:
    - `layout` prop for list changes.
    - `AnimatePresence` for entries/exits.
    - `whileHover={{ scale: 1.01 }}` and `whileTap={{ scale: 0.99 }}` for interactive elements.
4.  **Typography**: Improve scanability with existing text scales, weights, and contrast. Avoid negative tracking unless it is already established in the surrounding UI.
5.  **Interactive Feedback**: Ensure every interactive element has visible hover, focus, disabled, and active states.
6.  **Accessibility**: Preserve 44px touch targets, keyboard focus visibility, and color contrast.

## Workflow

- **Audit**: Identify "flat" or static areas in the UI.
- **Inject Motion Carefully**: Wrap key elements in `motion.div` only if the project already has the dependency and the change remains small.
- **Refine Spacing**: Ensure high information density without clutter. Use consistent `gap` and `padding` tokens.
- **Theme Check**: Ensure all colors use CSS variables (no hardcoded hex or default Tailwind colors).
- **Responsive Check**: Verify the changed UI does not overflow or overlap on mobile and desktop widths.

## No-Op Protocol

- If the target component is already consistent, accessible, and polished, **stop** — log "visual polish is solid" and no-op.
- If a visual improvement requires restructuring the component's layout or HTML drastically, log it to `issues_to_look/` instead.

## Verify

- Run focused tests when the changed component already has coverage.
- Run `pnpm check` to confirm no lint, type, build, or test regressions.
- Do not start the ServerMon server locally; rely on static review and non-server checks unless an existing running app is already available.

## Commit

- Commit with a message like: `style(ui): polish dashboard widget interactions`
- Include the component or module name and the specific visual improvement in the commit body.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
