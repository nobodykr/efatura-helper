# Bookmarklet handoff and signed AT navigation

Status: accepted design for bookmarklet release `2026.08.25.6` (2026-08-25)

This document records why the Fiscalidade bookmarklet has one exceptional two-click source, what
failed before it, and which tests must pass before this flow is changed again.

## Product contract

- After the one guided start at `/perfil`, every ordinary source is one click: `/perfil` opens the
  named official tab, the bookmarklet reuses that tab's `window.opener`, sends the browser-only
  envelope, waits for the minimized intake receipt and marks the source complete.
- `atividade_integrada` (Atividade Exercida) is the only exception. The first click opens the AT's
  signed detail screen. The profile displays a prominent instruction. The user clicks the same
  bookmarklet once more on that signed screen; the read and handoff then complete automatically.
- There is no Save/Guardar action. No required control may be placed below the 13-source list.
- After `/perfil` acknowledges the minimized intake receipt, the profile-owned official tab closes
  automatically. A pending, rejected or failed read stays open so the user can log in or retry.
- Account values remain out of URLs and out of the website request. The complete envelope travels
  only through the nonce-bound `postMessage` channel. The separate mandatory market intake still
  receives only its allowlisted minimized payload.
- The extension is a separate product path. Do not change or build extension releases while
  stabilizing this bookmarklet flow.
- An arbitrary official tab that was not opened by `/perfil` is not a supported start. The loader
  must stop before reading, open `/perfil` and explain how to use Começar/Continuar atualização.
  It must never fall into an unacknowledgeable "A concluir..." attempt.

## Browser constraint

The AT link containing `targetScreen=ecraActividade` is signed. The server rejects a background
fetch of the detail screen; it has to be loaded as a top-level navigation. A bookmarklet is ordinary
JavaScript owned by the current document, so replacing that document terminates the bookmarklet.
It cannot automatically resume on the next page.

These properties cannot all be guaranteed by a bookmarklet at the same time:

1. one click across the signed top-level navigation;
2. one auxiliary tab;
3. strong cross-origin opener isolation on `/perfil`;
4. a browser-only `postMessage` envelope (no account data in a URL or server relay).

The accepted design preserves items 2-4, requires the profile-owned official tab and makes the
exceptional second click explicit. `/perfil` keeps `same-origin-allow-popups`; no header relaxation
is needed.

## Failed design: temporary blank-tab bridge

Release `2026.08.25.4` reserved an `about:blank` tab, navigated it to the signed AT screen, read its
same-origin DOM, then navigated that tab to `/perfil`. The local read and schema capture succeeded.
However, the cross-origin navigation back to the protected profile could sever the WindowProxy
communication relationship under the profile's opener policy. The official widget remained at
"A concluir..." and the profile remained at 0/13 because the envelope never reached `accepted`.

The old Chromium test incorrectly called this success after seeing the local shape. That is not a
handoff success. A source is successful only when both of these are true:

- the official-origin local row has `handoff.status === "accepted"`;
- `/perfil` has the same partition at complete status after the intake receipt.

Never restore the blank-tab bridge merely because its DOM read or schema assertion passes.

## Current state machine

### Ordinary source

1. `/perfil` opens the source in the named `fiscalidade-oficial` tab.
2. The bookmarklet verifies that named tab still has its profile opener and retains that WindowProxy.
3. `tool.js` reads the current official source and captures an allowlisted schema.
4. The official tab sends `hello`; the profile returns a nonce-bound `ready` response.
5. The official tab sends the envelope.
6. The profile persists it as pending, submits the minimized intake and waits for its receipt.
7. The profile replies `accepted`; the official local row records the accepted handoff.
8. The profile progress increases immediately after the receipt.
9. The named official tab closes after a short success delay; `/perfil` remains in view.

### Atividade Exercida

1. `/perfil` opens the integrated hub in its named official tab.
2. The bookmarklet reuses the profile opener and discovers the AT-signed `ecraActividade` link.
3. It sends `fiscalidade-signed-navigation-v3`, which contains only the partition id and request id.
   It contains no account value, schema or signed URL.
4. The profile stores the short-lived `fiscalidade-signed-navigation-v1` UI state, renders the large
   continuation panel and acknowledges it.
5. The official hub navigates itself to the signed AT screen. Its bookmarklet execution ends.
6. The user clicks the same bookmarklet once more on the signed screen.
7. The ordinary read/handoff state machine runs. Receipt acceptance clears the continuation state
   and moves the profile to the next completed-source count.

If the profile cannot acknowledge step 4, the official tab still navigates after a short timeout.
The on-page widget explains the second click before navigation, so Access/login latency cannot trap
the user on the hub.

## Regression requirements

`test-bookmarklet-browser.js` must execute the actual dragged bookmarklet in Chromium while serving
the real `perfil.html` and the production `Cross-Origin-Opener-Policy`. It must prove:

- `/perfil` owns and opens the named official tab used by the test;
- e-Fatura reaches `handoff.status === "accepted"` in one click;
- `/perfil` stores e-Fatura as complete;
- the successful profile-owned e-Fatura tab closes only after that accepted receipt;
- the first integrated click navigates the official tab to the signed screen;
- `/perfil` shows `#signed-continuation` with both "same bookmarklet again" and "no Guardar" copy;
- the second click reaches accepted;
- `/perfil` clears the continuation state and displays `1 de 13 fontes reunidas`;
- the successful integrated tab closes, while an unowned/stopped tab remains open.

`test-profiling.js` separately pins schema capture, stale `schema_required` rereads and both phases of
the integrated flow. It also pins the activity-expenses reader against a portal shell that mentions
`loginForm`/`acesso.gov.pt` despite containing authenticated data, and distinguishes that from an
actual login form. `test-profile-partitions.js` pins the top-level continuation design. A local DOM
read, a `done` row without accepted handoff, or a pending profile row is never sufficient evidence.

## Activity-expenses session detection

`/app/dashboard-regime-simplificado` is server-rendered. Its authenticated document can still carry
login-related script or shell text, so a bare substring search for `loginForm` or `acesso.gov.pt` is
not proof that the session expired. Release `2026.08.25.5` performed that check before looking for
the expense content and could reject a valid page.

The reader now uses this order:

1. clone the already-visible official DOM and remove `#efh-panel` so the widget cannot match itself;
2. decode the document as HTML, discard script/style text and parse authenticated expense content;
3. only if the visible content is absent, fetch the same-origin page and parse valid content first;
4. classify session expiry only when the response URL is on `acesso.gov.pt` or the returned document
   contains an actual login form whose id/name/action identifies it as such.

Unknown HTML still cannot invent expense values. Real login failures remain visible and retryable.

## Investigation checklist

When a user reports "A concluir..." with no progress:

1. Check `window.__FISCALIDADE_HANDOFF_DIAGNOSTICS__` on the official tab and profile tab. Do not ask
   for or log the account envelope.
2. Check whether the official row's handoff is `pending`, `error` or `accepted`.
3. Check whether the profile row is pending intake or complete; distinguish browser handoff failure
   from isolated intake failure.
4. Confirm the dragged favorite pins the current `tool.js` and `profile-contract.js` SRI. An old
   bookmarklet cannot load changed bytes by design.
5. Reproduce in the full Chromium test with the real profile listener. Do not substitute a dummy
   profile page that never performs the ready/envelope/accepted protocol.

## Rejected alternatives

- Relaxing the profile's opener security solely to preserve a one-click bridge.
- Sending the complete account envelope through a fragment, query string, form POST or relay server.
- Opening two auxiliary tabs from one user gesture; popup policies make this unreliable and the UX
  is worse than one clearly explained second click.
- Treating extension persistence across navigation as proof that the bookmarklet can do the same.
