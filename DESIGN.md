# 글래스모피즘 & 일러스트 (Glassmorphism)

## Product Overview

**The Pitch:** A premium, futuristic authentication portal for AWSOps. It blends deep technical aesthetics with polished dark glassmorphism, signaling high-performance cloud infrastructure before the user even logs in.

**For:** Cloud engineers, DevOps specialists, and sysadmins who appreciate high-fidelity, distraction-free technical interfaces.

**Device:** desktop

**Design Direction:** High-tech dark mode featuring frosted dark glass, subtle neon glowing orbs (cyan and purple), and abstract network illustrations. 

**Inspired by:** Vercel Dashboard, Linear, AWS re:Invent motion graphics.

---

## Screens

- **Login Screen:** Primary entry point featuring credentials and SSO.
- **MFA Verification:** Secondary security layer for token input.
- **Password Recovery:** Account access restoration workflow.
- **System Initialization:** Transition state connecting auth to the main dashboard.

---

## Key Flows

**Authentication Flow:** Secure access to the AWSOps dashboard.

1. User is on **Login Screen** -> sees glowing cloud background and glass login card.
2. User enters credentials and clicks **Authenticate** (or selects an SSO provider) -> transitions to **MFA Verification**.
3. User enters 6-digit token -> clicks **Verify**.
4. Transitions to **System Initialization** -> loads dashboard.

---

<details>
<summary>Design System</summary>

## Color Palette

- **Primary:** `#00F0FF` - Neon cyan for primary buttons, active states, glows
- **Background:** `#0B0E14` - Deep space blue-black
- **Surface:** `rgba(16, 20, 28, 0.6)` - Dark translucent glass base
- **Text:** `#F8FAFC` - Main typography, inputs
- **Muted:** `#8B949E` - Labels, placeholders, secondary links
- **Accent:** `#8A2BE2` - Neon purple for secondary background glows
- **Border:** `rgba(255, 255, 255, 0.08)` - Subtle glass card edges

## Typography

Distinctive, technical, yet highly legible.

- **Headings:** `Space Grotesk`, 700, 32px
- **Body:** `JetBrains Mono`, 400, 15px (Inputs, code-like data)
- **Small text:** `Inter`, 400, 13px (Labels, hints)
- **Buttons:** `Space Grotesk`, 600, 15px

**Style notes:** 
- **Glassmorphism:** `backdrop-filter: blur(32px)` on all panels.
- **Lighting:** Use large, heavily blurred radial gradients (`400px` blur radius) in the background to simulate neon cyan and purple light bleeding into the scene.
- **Borders:** 1px solid top border on glass cards with a subtle white-to-transparent linear gradient to simulate edge lighting.

## Design Tokens

```css
:root {
  --color-primary: #00F0FF;
  --color-bg-base: #0B0E14;
  --color-glass: rgba(16, 20, 28, 0.6);
  --color-text-main: #F8FAFC;
  --color-text-muted: #8B949E;
  --color-glow-cyan: rgba(0, 240, 255, 0.15);
  --color-glow-purple: rgba(138, 43, 226, 0.15);
  --font-display: 'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-ui: 'Inter', sans-serif;
  --radius-card: 16px;
  --radius-input: 8px;
  --border-glass: 1px solid rgba(255, 255, 255, 0.08);
  --blur-glass: blur(32px);
}
```

</details>

---

<details>
<summary>Screen Specifications</summary>

### Login Screen

**Purpose:** Secure gateway to the AWSOps platform.

**Layout:** Centered glass card (`420px` width) positioned over a full-screen dynamic background. Abstract network nodes faintly visible behind the glass.

**Key Elements:**
- **Background Ambient Glow:** Fixed absolute position, `800px` radial gradients in cyan (top left) and purple (bottom right), heavily blurred (`blur-3xl`).
- **Glass Login Panel:** `padding: 48px`, `border-radius: 16px`, `backdrop-filter: blur(32px)`.
- **Email/Password Inputs:** `height: 48px`, `background: rgba(0,0,0,0.3)`, `border: 1px solid rgba(255,255,255,0.1)`. Focus state glows with cyan border and subtle cyan box shadow.
- **Submit Button:** `height: 48px`, `background: var(--color-primary)`, `color: #000`, full width, uppercase, `letter-spacing: 1px`.
- **Remember Me:** Custom checkbox, 16x16px, cyan checkmark when active.
- **Divider:** "OR CONTINUE WITH" text in `Inter` 13px, muted color, flanked by subtle 1px horizontal lines (`rgba(255, 255, 255, 0.08)`).
- **SSO & Social Login Buttons:** A grid layout of secondary buttons for GitHub, Google, Okta, and Keycloak. Styled as frosted glass (`background: rgba(255, 255, 255, 0.05)`, `border: var(--border-glass)`) featuring brand icons.

**States:**
- **Empty:** Inputs show muted placeholders ("admin@awsops.internal").
- **Loading:** Button text changes to "AUTHENTICATING..." with a CSS pulsing opacity.
- **Error:** Inputs shake horizontally, borders turn red (`#FF3366`), generic "Invalid credentials" message appears in red Mono font below inputs.

**Components:**
- **Input Field:** 48px height, `JetBrains Mono` 15px text, muted label above.
- **Primary CTA:** 48px height, solid cyan, black text.
- **SSO Button:** 40px height, glass styling, brand icon + centered text.

**Interactions:**
- **Focus Input:** Border transitions to `#00F0FF`, `box-shadow: 0 0 8px rgba(0,240,255,0.2)`.
- **Hover CTA:** Brightness increases, slight upward translation (`transform: translateY(-1px)`).
- **Hover SSO Button:** Background opacity increases to `rgba(255, 255, 255, 0.1)`, subtle white border glow.

### MFA Verification

**Purpose:** Secondary authentication step enforcing security.

**Layout:** Replaces the Login card entirely. Same background.

**Key Elements:**
- **Security Icon:** Glowing cyan lock icon, 48x48px, top center.
- **Instruction Text:** "Enter 6-digit authenticator token."
- **Token Input:** 6 distinct boxes for single-digit entry, 48x48px each, spaced `8px` apart. Monospace font, 24px size.
- **Verify Button:** Same styling as login submit.
- **Cancel Link:** "Return to login" muted text link, bottom centered.

**Interactions:**
- **Auto-advance:** Focus shifts to next input box automatically as digits are typed.
- **Hover Link:** Text color transitions to `#F8FAFC`.

### Password Recovery

**Purpose:** Self-service credential reset.

**Layout:** Same centered glass card framework.

**Key Elements:**
- **Title:** "System Access Recovery"
- **Email Input:** Single input field.
- **Action Buttons:** Side-by-side layout. "Send Link" (Cyan primary), "Cancel" (Ghost button, white text).

**States:**
- **Success:** Card content swaps to a green checkmark and "Recovery protocol initiated. Check your inbox."

### System Initialization

**Purpose:** Mask dashboard loading times with a high-tech transition.

**Layout:** Full screen, no cards. Centered elements.

**Key Elements:**
- **Spinner:** Custom SVG circular progress ring, glowing cyan, rotating.
- **Status Text:** `JetBrains Mono`, rapidly updating sequence ("Establishing secure tunnel...", "Fetching IAM roles...", "Mounting volumes...").
- **Terminal Mock:** A faded, small terminal window in the bottom left showing simulated rapid log output (`opacity: 0.3`).

</details>

---

<details>
<summary>Build Guide</summary>

**Stack:** HTML + Tailwind CSS v3

**Build Order:**
1. **Login Screen** - Establishes the complex background lighting, glass CSS techniques, core form controls, and SSO layout.
2. **MFA Verification** - Reuses the card component, introduces complex input interactions (auto-focusing segmented inputs).
3. **Password Recovery** - Reuses existing components for a quick win.
4. **System Initialization** - Implements the SVG animations and terminal styling to round out the experience.

</details>