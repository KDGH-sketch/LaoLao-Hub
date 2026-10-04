# Icons

LaoLao uses **one icon family**: Lucide outline icons, inlined in `js/shared/ui.js` (`icon(name)`). There is no icon font and no second library, and emoji are not used as interface icons. Emoji remain only in content and celebration messages (for example "🎉 Great stroke work").

## Rules

1. **Create icons with `icon("name")`.** Every icon gets the class `ic`: outline, current text colour, the standard stroke, and the default size. An icon can never render unstyled or huge.
2. **Sizes come only from these tokens** (`:root` in `css/app.css`):

| Token | Size | Use |
|---|---|---|
| `--ic-2xs` | 12px | Tiny badge (lock badge on locked content) |
| `--ic-xs` | 14px | Chips, pills, theme switch, lock marks in menus |
| `--ic-sm` | 16px | Inline with small text, `.btn.sm`, table row actions, step circles, search field |
| `--ic-md` | 18px | **Default.** Buttons, icon-only buttons, headings, notices |
| `--ic-lg` | 20px | Sidebar navigation, feature tiles (inside a 40px tile), audio buttons in videos |
| `--ic-xl` | 22px | Mobile bottom tab bar |
| `--ic-display` | 28px | Locked/empty-state circle, video thumbnail play |
| `--ic-hero` | 32px | The main round listen button |

   Stroke: `--ic-stroke` (1.9), or `--ic-stroke-sm` (2.1) at 14px and below so small icons stay legible. Gap between icon and text: `--ic-gap` (8px).
3. **A new context picks a token**, for example `.my-card .ic{width:var(--ic-lg);height:var(--ic-lg)}`. Never write a pixel size for an icon.
4. **Icon size is not the tap target.** Icon-only controls (`.ib`, or `.btn.sm.icon-only`) are at least `--hit` (36px), and `--hit-touch` (44px) on touch screens. The icon itself keeps its size.
5. **Icon-only buttons need a name:** `aria-label` (and usually `title`). Use them only for widely known actions: close, back, play, delete, copy, edit, more. Otherwise use icon + text, or text only.
6. **Decorative icons are hidden from screen readers** (`aria-hidden="true"`, set by `icon()`). The meaning must be in the text next to them.
7. **Learner vs admin:** the learner app uses icons for navigation, playback, status and feature recognition. Admin may add table actions, filters and editing controls, using the same family and tokens.
8. **Locked/empty states** use the shared panel: a 28px icon in a 56px circle (`.lockp`; `lockedScreen()` in the admin).
