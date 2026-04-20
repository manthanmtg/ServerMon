# Module Generator Prompt

> **⚠️ NOT FOR AUTONOMOUS USE.** This prompt creates entirely new modules, which is a drastic change. It should only be executed when a human explicitly requests a new module. If `random_selector.md` picks this prompt, **no-op** — skip and do nothing.

## Objective

Generate a complete, standard-compliant ServerMon module based on a user-provided name and core feature set.

## Requirements

1.  **Structure**: Create `src/modules/[name]/` with:
    - `module.ts`: Define the module's core interface (must follow types in `src/lib/types.ts`).
    - `ui/`: Subfolder for components.
    - `ui/[Name]Page.tsx`: Main view for the module.
2.  **Registration**:
    - Register the widget in `src/components/modules/ModuleWidgetRegistry.tsx`.
    - Add the nav entry in `navGroups` within `src/components/layout/ProShell.tsx`.
3.  **Route**: Create `src/app/[name]/page.tsx` wrapped in `<ProShell>`.
4.  **Logging**: Use `createLogger('module:[name]')` for any backend or complex logic.
5.  **API**: If an API is needed, follow the "New API Route Checklist" in `CLAUDE.md`. Use Zod for validation and `getSession()` for security.

## Design Guidelines

- Follow existing modules (e.g., `terminal`, `processes`) for structure.
- Use the semantic color system flow through CSS variables in `src/app/globals.css`.
- Ensure minimum 44px touch targets.
- Use `lucide-react` for icons.
