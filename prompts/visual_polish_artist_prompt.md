# Visual Polish Artist Prompt

## Objective

Elevate the UI/UX of **one specific ServerMon component or module** per run to "Premium" standards using Tailwind 4, Framer Motion, and Glassmorphism.

## Scope

- Pick **one** component or module at random.
- Make **one** visual improvement (e.g., add an animation, improve a shadow, fix typography, add a gradient). Don't redesign the whole thing.

## Aesthetic Checklist

1.  **Glassmorphism**: Use `backdrop-blur-md`, `bg-zinc-900/50`, and subtle borders (`border-white/10`).
2.  **Animations**: Use `framer-motion` for transitions. Specifically:
    - `layout` prop for list changes.
    - `AnimatePresence` for entries/exits.
    - `whileHover={{ scale: 1.01 }}` and `whileTap={{ scale: 0.99 }}` for interactive elements.
3.  **Typography**: Use `tracking-tighter` for headings and high-contrast font weights.
4.  **Glows & Gradients**: Add subtle indicator glows for active states (e.g., `shadow-[0_0_15px_rgba(var(--accent),0.2)]`). Use gradients from `zinc-900` to `black`.
5.  **Interactive Feedback**: Ensure every click and hover has immediate, smooth visual feedback.

## Workflow

- **Audit**: Identify "flat" or static areas in the UI.
- **Inject Motion**: Wrap key elements in `motion.div`.
- **Refine Spacing**: Ensure high information density without clutter. Use consistent `gap` and `padding` tokens.
- **Theme Check**: Ensure all colors use CSS variables (no hardcoded hex or default Tailwind colors).

## No-Op Protocol

- If the target component already looks premium (good animations, proper colors, nice shadows), **stop** — log "visual polish is solid" and no-op.
- If a visual improvement requires restructuring the component's layout or HTML drastically, log it to `issues_to_look/` instead.

## Issue Management

- If an issue from `issues_to_look/` is resolved or found to be resolved, move it to the `issues_to_look/resolved/` directory to keep things clean.
