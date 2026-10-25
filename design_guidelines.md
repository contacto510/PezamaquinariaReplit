# Design Guidelines: Péza Maquinaria - Sistema de Gestión

## Design Approach
**Material Design System** adapted for industrial/machinery context. This utility-focused application prioritizes efficiency, data clarity, and quick task completion for repair management and quotation workflows.

## Typography System
**Primary Font**: Inter (Google Fonts)
- Headings: 600-700 weight
- Body: 400 regular, 500 medium for emphasis
- Labels: 500 medium, uppercase for section headers

**Scale**:
- H1: text-3xl (dashboard headers)
- H2: text-2xl (section titles)
- H3: text-xl (card headers)
- Body: text-base
- Small: text-sm (metadata, timestamps)
- Tiny: text-xs (badges, status indicators)

## Layout System
**Spacing**: Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4 to p-6
- Section spacing: mb-6 to mb-8
- Card gaps: gap-4 to gap-6

**Grid Structure**:
- Desktop: 12-column grid, max-w-7xl containers
- Tablet: 8-column, adapt to 2-column layouts
- Mobile: Single column, full-width cards with p-4

## Core Components

**Navigation**:
- Top navbar: Fixed, shadow-md elevation
- Logo left, user profile right
- Main navigation tabs/pills center
- Mobile: Hamburger menu with slide-in drawer

**Dashboard Cards**:
- Elevated cards with shadow-sm
- Rounded corners (rounded-lg)
- Header with icon + title
- Clear data hierarchy with dividers
- Action buttons bottom-right

**Forms**:
- Floating labels with smooth transitions
- Helper text below inputs (text-sm)
- Error states with inline messages
- Group related fields with border/background separation
- CTAs: Primary (filled) + Secondary (outlined)

**Data Tables**:
- Sticky headers on scroll
- Alternating row backgrounds for readability
- Inline action buttons (icon-only)
- Mobile: Transform to stacked cards showing key info
- Pagination controls bottom-center

**Status Indicators**:
- Chips/badges with rounded-full
- Clear iconography (checkmark, clock, alert)
- Consistent positioning (top-right of cards)

**Modals/Dialogs**:
- Centered overlay with backdrop blur
- Header with title + close button
- Content with generous padding (p-6)
- Footer with action buttons right-aligned

## Responsive Breakpoints
- Mobile: < 640px - Stack all, full-width
- Tablet: 640px-1024px - 2-column grids
- Desktop: > 1024px - Full multi-column layouts

**Mobile Optimizations**:
- Larger touch targets (min 44x44px)
- Bottom navigation bar for primary actions
- Collapsible sections with accordions
- Simplified tables showing essential data only

## Iconography
**Heroicons** (outline style for UI, solid for filled states)
- Wrench: repairs
- Document: quotes
- User: clients
- Calendar: scheduling
- Chart: analytics

## Images
**Hero Image**: Yes - Industrial machinery workspace photo
- Placement: Dashboard login/welcome screen
- Treatment: 40% opacity overlay with gradient
- Size: Full-width, 60vh on desktop, 40vh mobile
- CTA buttons: Blurred background (backdrop-blur-sm with bg-white/20)

**Additional Images**:
- Empty states: Illustrated placeholders for no data
- Profile avatars: Circular, 40x40px default
- Equipment photos: In repair detail cards (16:9 ratio)

## Page Layouts

**Dashboard**:
- Stats cards grid (3-col desktop, 2-col tablet, 1-col mobile)
- Recent activity list
- Quick action buttons
- Charts/analytics section

**Repair List**:
- Filter bar with search + status filters
- Grid of repair cards showing: ID, client, equipment, status, date
- Pagination
- Floating "Nueva Reparación" button

**Quote Form**:
- Multi-step with progress indicator
- Sections: Client info, Equipment details, Labor, Parts, Total
- Dynamic line items (add/remove rows)
- Preview panel (desktop sidebar, mobile bottom sheet)

**Accessibility**:
- ARIA labels on all interactive elements
- Keyboard navigation with visible focus states (ring-2 ring-offset-2)
- Minimum contrast ratio 4.5:1 for text
- Screen reader announcements for status changes
- Form validation with clear error messaging

## Animation (Minimal)
- Page transitions: Fade only (200ms)
- Dropdown menus: Slide-down (150ms)
- Modal entrance: Scale from 95% (200ms)
- NO scroll animations, parallax, or decorative motion