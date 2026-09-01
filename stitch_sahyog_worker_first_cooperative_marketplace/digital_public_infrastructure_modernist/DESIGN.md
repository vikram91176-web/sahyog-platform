---
name: Digital Public Infrastructure Modernist
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#43474e'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#455f88'
  primary: '#002045'
  on-primary: '#ffffff'
  primary-container: '#1a365d'
  on-primary-container: '#86a0cd'
  inverse-primary: '#adc7f7'
  secondary: '#2c694e'
  on-secondary: '#ffffff'
  secondary-container: '#aeeecb'
  on-secondary-container: '#316e52'
  tertiary: '#361900'
  on-tertiary: '#ffffff'
  tertiary-container: '#552b00'
  on-tertiary-container: '#eb851c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#adc7f7'
  on-primary-fixed: '#001b3c'
  on-primary-fixed-variant: '#2d476f'
  secondary-fixed: '#b1f0ce'
  secondary-fixed-dim: '#95d4b3'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#0e5138'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding-mobile: 16px
  container-padding-desktop: 32px
  gutter: 16px
  touch-target-min: 48px
---

## Brand & Style

The design system is built on the principles of **Modern Indian Digital Public Infrastructure (DPI)** combined with the precision of **Enterprise SaaS**. It prioritizes extreme clarity, resilience, and "Human-Centric Professionalism." The aesthetic avoids ephemeral trends like glassmorphism in favor of a **Corporate Modern** style that feels permanent and institutional yet accessible.

The interface must evoke a sense of "Aatmanirbhar" (Self-reliance) and dignity for the gig workforce. It utilizes a high-contrast layout, generous whitespace for focus, and a "Safety-First" visual architecture. The UI is designed to be legible in varying outdoor light conditions and intuitive for users with varying levels of digital literacy.

## Colors

The palette is rooted in stability and trust. 

- **Primary (Deep Royal Blue):** Used for headers, primary navigation, and core brand elements to signify authority and institutional backing.
- **Secondary (Success Green):** Reserved exclusively for positive financial outcomes, earnings, and successful verification states.
- **Accent (Warm Orange):** Used for attention-requiring items like "New Jobs" or "Safety Alerts" without the alarmism of red.
- **Intelligence (Purple):** Identifies platform-driven insights, such as "Fair Wage" recommendations or AI-optimized routes.
- **Safety (Clear Red):** Strictly reserved for the SOS/Emergency button and critical system failures.
- **Surface:** A "Paper White" background with "Off-White" (#F9FAFB) sectioning provides a clean, breathable canvas.

## Typography

This design system uses **Inter** for its exceptional legibility at small sizes and its neutral, systematic feel. 

- **Weight Strategy:** Use Bold (700) for primary headers to ensure immediate information hierarchy. Use Semibold (600) for interactive labels.
- **Accessibility:** The `body-lg` (18px) is the preferred size for worker-facing job descriptions to ensure readability on diverse mobile devices.
- **Hierarchy:** Ensure a clear distinction between data (labels) and instructions (body) by using varying font weights rather than just color.

## Layout & Spacing

This design system employs a **Fluid Grid** for mobile and a **Fixed 12-Column Grid** (max-width 1280px) for desktop dashboards.

- **Mobile Philosophy:** Adheres to a "Thumb-Zone" layout. All primary actions are placed in the lower 60% of the screen.
- **Rhythm:** An 8px linear scale is used for all spacing. 
- **Touch Targets:** All interactive elements (buttons, chips, inputs) must maintain a minimum height of 48px to accommodate all users, including those in labor-intensive environments.
- **Breakpoints:**
  - Mobile: < 600px (Single column, 16px margins)
  - Tablet: 600px - 1024px (8-column grid)
  - Desktop: > 1024px (12-column grid, 32px margins)

## Elevation & Depth

To maintain the "DPI" (Digital Public Infrastructure) aesthetic, the design system avoids heavy shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Background):** #F9FAFB.
- **Level 1 (Cards/Surface):** White (#FFFFFF) with a 1px border of #E5E7EB. No shadow.
- **Level 2 (Interactive/Floating):** White (#FFFFFF) with a very soft, diffused shadow (Blur: 12px, Y: 4px, Color: #1A365D at 5% opacity). Used for bottom sheets and active job cards.
- **Separators:** 1px solid #F3F4F6 for list items.

## Shapes

The design system uses a **Rounded** (0.5rem) shape language. This strikes a balance between the "Serious/Professional" (Sharp) and "Friendly/Consumer" (Pill) styles.

- **Standard Buttons & Inputs:** 8px (0.5rem) corner radius.
- **Cards:** 16px (1rem) corner radius to create a distinct container feel.
- **Status Pills:** Fully rounded (Pill) to differentiate them from interactive buttons.
- **Selection Indicators:** Use thick (4px) vertical bars on the left side of cards to indicate active selection.

## Components

### Buttons
- **Primary:** Deep Royal Blue background, White text. High contrast, 48px height.
- **Secondary:** Success Green background (for "Accept Job" or "Withdraw Earnings").
- **Ghost:** Transparent background with 1px #D1D5DB border. Used for "Cancel" or "Back".
- **SOS/Emergency:** Clear Red background, Bold White text. Placed at the top right of the active job screen or within a persistent bottom sheet during active gigs.

### Inputs & Search
- Inputs must have persistent labels (never use placeholder-only labels). 
- Search bars should include a prominent leading icon and a "Filter" trailing icon to manage job density.

### Cards
- **Job Card:** Features a 3-tier hierarchy: 1. Job Title & Earnings (Top), 2. Location & Time (Middle), 3. Skill Chips & Accept Button (Bottom).
- **Worker Profile Card:** Includes a "Trust Score" visualization—a circular progress ring using the Primary Blue.

### Status Pills & Badges
- **Verified:** Success Green background (10% opacity) with Green text + Check icon.
- **Fair Wage:** Purple background (10% opacity) with Purple text + "Sparkle" icon.
- **Pending:** Warm Orange background (10% opacity) with Orange text.

### Navigation
- **Mobile Bottom Nav:** 4 items (Home, My Jobs, Earnings, Profile). Active state uses a Primary Blue icon with a 4px bottom indicator bar.
- **Desktop Sidebar:** Collapsible, using a dark navy background (#111827) with light text for a "Command Center" feel for admins.

### Visual Elements
- **Maps:** Use a simplified grayscale base map with Primary Blue pins for locations and a Success Green pin for the worker's current location.
- **Charts:** Use simple bar charts for earnings (Success Green) and line charts for hours worked (Primary Blue). Avoid complex 3D charts.