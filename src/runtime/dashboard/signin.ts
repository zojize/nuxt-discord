function page(heading: string, action: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${heading} · Nuxt Discord</title>
  <style>
    :root { color-scheme: light dark; font: 100%/1.5 system-ui, sans-serif; --bg: #f8fafc; --panel: #fff; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --action: #007a47; --on-action: #fff; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0f172a; --panel: #172033; --text: #f1f5f9; --muted: #cbd5e1; --line: #39465b; --action: #62e5a0; --on-action: #092518; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 1rem; color: var(--text); background: var(--bg); }
    main { width: min(100%, 28rem); padding: clamp(1.25rem, 5vw, 2rem); border: 1px solid var(--line); border-radius: .75rem; background: var(--panel); }
    .brand { margin: 0; color: var(--muted); font-size: .875rem; font-weight: 650; }
    h1 { margin: .75rem 0 1.5rem; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.2; letter-spacing: -.03em; }
    form { margin: 0; }
    .action { display: inline-flex; align-items: center; min-height: 2.75rem; padding: .55rem 1rem; border: 1px solid transparent; border-radius: .4rem; background: var(--action); color: var(--on-action); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
    .action:hover { text-decoration: underline; text-underline-offset: .15em; }
    .action:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; outline-color: var(--text); }
  </style>
</head>
<body>
  <main>
    <p class="brand">nuxt-discord</p>
    <h1>${heading}</h1>
    ${action}
  </main>
</body>
</html>`
}

export function renderSignInPage(): string {
  return page('Sign in to the dashboard', '<a class="action" href="/__discord-auth/login">Sign in with Discord</a>')
}

export function renderAccessDeniedPage(): string {
  return page('This account doesn’t have dashboard access', '<form method="post" action="/__discord-auth/logout"><button class="action" type="submit">Use another Discord account</button></form>')
}
