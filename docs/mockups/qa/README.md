# Welcome mockup QA

Checks `../welcome-landing.html` in headless Chromium.

- `layout.mjs`: 20 device sizes (280px to 3840px, phones, foldables, tablets, landscape) in Day and Night. Fails on horizontal scroll, clipped text, off-screen elements, touch targets under 24px, console errors. Reports targets under 44px, text under 12px and layout shift.
- `func.mjs`: theme, language, sign-in card, funnels, journey tabs and keyboard, mobile menu, reduced motion, 200% text zoom, 320px reflow, and an axe-core WCAG 2.2 AA audit.

```sh
npm install
npx playwright install chromium   # or point lib.mjs at an installed Chromium
NODE_PATH=$(npm root -g) npm run layout
NODE_PATH=$(npm root -g) npm run func
```

Fonts are served from the npm packages so text metrics match production (the sandbox cannot reach Google Fonts).
Only Chromium was available. Firefox and Safari were not tested.
