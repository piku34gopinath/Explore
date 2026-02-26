# Design System: AI Explorer Dashboard
**Project ID:** 4649312183721025376

## 1. Visual Theme & Atmosphere
The "Command Center" aesthetic is designed for high-density information display. It uses a "Deep Obsidian" backdrop to minimize eye strain and "Neon Cyberpunk" accents (Indigo and Cyan) to highlight critical AI-driven data points. The atmosphere is professional yet futuristic, evoking a sense of powerful, real-time intelligence.

## 2. Color Palette & Roles
* **Deep Obsidian (#0a0a0a):** Primary page background. Used for the entire app canvas.
* **Dark Graphite (#1a1a1a):** Surface color for cards, containers, and inputs. Provides subtle contrast against the background.
* **Electric Indigo (#6467f2):** Primary brand color. Used for active navigation states, primary buttons, and branding elements.
* **Neon Cyan (#06b6d4):** Data accent color. Used for metrics, sparklines, and active status indicators.
* **Slate Gray (#94a3b8):** Secondary text and icon color for non-emphasized elements.

## 3. Typography Rules
* **Font Family:** `Space Grotesk` — A geometric sans-serif that feels technical and modern.
* **Headings:** Bold and tracked tight for a "HUD" (Heads-Up Display) feel.
* **Labels:** Uppercase with wide letter-spacing (`tracking-widest`) for a professional, dashboard-style hierarchy.

## 4. Component Stylings
* **Buttons:** 
    - **Primary:** Electric Indigo background, 8px rounded corners, with a subtle "indigo glow."
    - **Secondary:** Semi-transparent Indigo (#6467f2/20) with a bordered outline.
* **Cards/Containers:** 
    - **Background:** Dark Graphite.
    - **Roundness:** 12px (`rounded-xl`).
    - **Interactive:** Active/hover cards feature a subtle indigo or cyan outer glow.
* **Inputs/Forms:** 
    - **Background:** Dark Graphite.
    - **Borders:** Border-less by default, using simple Indigo focus rings.

## 5. Layout Principles
* **Structure:** A fixed left sidebar for global navigation and a scrollable main content area.
* **Density:** High-density grids (2/3 + 1/3 splits) to maximize data visibility without clutter.
* **Depth:** Achieved through color layering (Obisidian -> Graphite) and glowing borders rather than traditional drop shadows.

## 6. Design System Notes for Stitch Generation
> **Note to Stitch:** When generating new screens for this project, always:
> 1. Use `class="dark"` on the HTML root.
> 2. Use `bg-[#0a0a0a]` for the background.
> 3. Use `bg-[#1a1a1a]` for all cards.
> 4. Use `Space Grotesk` as the primary font.
> 5. Use `Electric Indigo (#6467f2)` for primary CTAs.
> 6. Use `Neon Cyan (#06b6d4)` for data points and status alerts.
