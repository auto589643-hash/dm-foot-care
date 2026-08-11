# DM Foot Care — Product Design Contract

## 1. Overview
DM Foot Care is a mobile-first clinical support application for foot-health monitoring. The interface must feel calm, trustworthy, simple, and modern without looking decorative or promotional.

North star: **Calm Clinical Utility** — white and cool-neutral surfaces, restrained medical blue, clear Thai typography, obvious primary actions, minimal visual noise.

Primary users include older and less tech-confident users. Design decisions must favor clarity and touch usability over density.

## 2. Principles
- One obvious primary action per screen.
- Prefer clarity over cleverness; labels describe outcomes directly.
- Mobile is the primary context, not a reduced desktop layout.
- Never let content touch the viewport edge. Use safe-area-aware gutters.
- Body copy is at least 16px for patient-facing content; secondary metadata may be 13–14px.
- Interactive targets are at least 44px high/wide.
- Avoid decorative uppercase kickers, excessive letter spacing, deep card nesting, heavy shadows, oversized logos, and gratuitous animation.
- Keep critical functionality available on mobile; adapt rather than hide.

## 3. Tokens
- Canvas: #F6F8FB
- Surface: #FFFFFF
- Ink: #14243A
- Muted text: #66768A
- Primary blue: #2563EB
- Primary hover/pressed: #1D4ED8
- Border: #DCE4EE
- Success teal: #0F766E
- Attention amber: #A85B08
- Danger red: #B4232F
- Small radius: 10px
- Standard radius: 14px
- Large radius: 20px
- Patient page gutter: 16px mobile, 24–32px tablet/desktop
- Content width: 1180px max for application pages, 440px max for authentication forms

## 4. Typography
Use Noto Sans Thai for body/UI and IBM Plex Sans Thai for headings.

- Display/page title: 30–36px, 700, compact line-height
- Section title: 20–24px, 700
- Body: 16px, 1.55–1.7 line-height
- Label: 14px, 600–700
- Metadata/caption: 13px minimum when user-facing

Do not use all-caps Thai/English eyebrow text. Avoid extreme negative tracking. Keep long text lines below roughly 70 characters where practical.

## 5. Components
### Authentication
- One centered form column on mobile with 18–20px gutters.
- Compact brand lockup; logo must not dominate the task.
- Field labels are always visible.
- Inputs are 54–56px tall on touch devices.
- Primary submit button follows fields immediately.
- Registration/login switch is secondary but clearly tappable.

### Cards
Use borders and tonal separation before shadows. Avoid cards inside cards unless hierarchy requires it.

### Navigation
Desktop rail may be persistent. Mobile navigation stays reachable at the bottom with safe-area padding and labels at least 12px.

### Forms
Inputs, selects, and textareas share border, radius, focus ring, disabled, loading, and error behavior. Never rely on placeholder text as a label.

### Modals
Desktop: centered dialog. Mobile: bottom-aligned sheet with safe-area padding and no horizontal overflow.

### Data and empty states
Never invent data. Loading, empty, error, and success states must explain what is happening and the next available action.

## 6. Accessibility and resilience
- WCAG AA contrast for normal text.
- Visible `:focus-visible` ring.
- Respect `prefers-reduced-motion`.
- Layout must remain usable at 320px CSS width, browser text zoom, long Thai names, long disease names, and network/error states.
- Use `min-width: 0`, wrapping, and overflow controls in grid/flex children.
- Do not remove features purely because the viewport is small.
