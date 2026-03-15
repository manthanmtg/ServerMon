# Dashboard Layout Audit - 2026-03-11 [RESOLVED]

I have identified and resolved the following critical layout defects. The structural integrity of the Dashboard has been restored through a master vertical flow architecture.

## 🚨 Critical Defects

### 1. Row Overlap (Y-Axis Collapse)

- **Problem**: The Chart Section (Row 2) is rendered directly on top of the Metric Stats Section (Row 1).
- **Impact**: Stat cards are partially or fully obscured, making primary telemetry unreadable.
- **Probable Cause**: A conflict between `glass` backdrop-filters and the `animate-slide-up` transform durations/delays. In some browsers (especially Safari/Chrome on Mac), simultaneous `transform` and `backdrop-filter` on layered elements can cause layout engine failures.

### 2. Widget Inconsistency (The "Double Card" Glitch)

- **Problem**: `CPUChartWidget` and `MemoryChartWidget` are rendering their own legacy bordered containers _inside_ the new premium glass cards.
- **Impact**: Cluttered UI, "boxes inside boxes", and inconsistent padding.
- **Status**: Identified in `src/modules/metrics/ui/CPUChartWidget.tsx` and `MemoryChartWidget.tsx`.

### 3. Z-Index / Stacking Confusion

- **Problem**: The "Diagnostics" widget is floating in front of the "Pro Engine" card, but its internal elements (like the health bar) appear to be misaligned with the parent's glass boundary.
- **Impact**: Broken visual hierarchy; components feel "detached" from the UI.

### 4. Label Overlap in Sanitized Widgets

- **Problem**: In the newly sanitized `HealthWidget`, the "Internal Load" label and CPU percentage are overlapping with the progress bar.
- **Impact**: Poor readability of secondary metrics.

## 🛠️ Proposed Tactical Fixes

### Phase 14.1: Component Sanitization

- COMPLETELY purge legacy styling from `CPUChartWidget` and `MemoryChartWidget`.
- Convert them to "transparent" components that consume the parent's glass card styling.

### Phase 14.2: Layout Stability

- Simplify the animation logic. Apply the animation to the _content container_ in `ProShell` or a single wrapper in `DashboardPage` rather than per-section.
- Explicitly check the `grid-template-rows` behavior to ensure clearing.
- Increase section gaps from `gap-8` to `gap-12` and `mt-14` to `mt-16`.

### Phase 14.3: Widget Geometry

- Standardize the `h-[300px]` constraint to the _container_, ensuring the inner chart fills it correctly without creating its own overflow boundaries.
