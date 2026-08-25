# Bookmarklet handoff and signed AT navigation

Status: accepted design for bookmarklet release `2026.08.25.5` (2026-08-25)

This document records why the Fiscalidade bookmarklet has one exceptional two-click source, what
failed before it, and which tests must pass before this flow is changed again.

## Product contract

- Every ordinary source is one click: the bookmarklet reads the current official page, opens or
  reuses `/perfil`, sends the browser-only envelope, waits for the minimized intake receipt and
  marks the source complete.
- `atividade_integrada` (Atividade Exercida) is the only exception. The first click opens the AT's
  signed detail screen. The profile displays a prominent instruction. The user clicks the same
  bookmarklet once more on that signed screen; the read and handoff then complete automatically.
- There is no Save/Guardar action. No required control may be placed below the 13-source list.
- Account values remain out of URLs and out of the website request. The complete envelope travels
  only through the nonce-bound `postMessage` channel. The separate mandatory market intake still
  receives only its allowlisted minimized payload.
- The extension is a separate product path. Do not change or build extension releases while
  stabilizing this bookmarklet flow.

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

The accepted design preserves items 2-4 and makes the exceptional second click explicit.

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

1. The bookmarklet opens `/perfil` directly inside the user click and retains its WindowProxy.
2. `tool.js` reads the current official source and captures an allowlisted schema.
3. The official tab sends `hello`; the profile returns a nonce-bound `ready` response.
4. The official tab sends the envelope.
5. The profile persists it as pending, submits the minimized intake and waits for its receipt.
6. The profile replies `accepted`; the official local row records the accepted handoff.
7. The profile progress increases immediately after the receipt.

### Atividade Exercida

1. The bookmarklet opens `/perfil` directly.
2. The integrated hub discovers the AT-signed `ecraActividade` link.
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

- e-Fatura reaches `handoff.status === "accepted"` in one click;
- `/perfil` stores e-Fatura as complete;
- the first integrated click navigates the official tab to the signed screen;
- `/perfil` shows `#signed-continuation` with both "same bookmarklet again" and "no Guardar" copy;
- the second click reaches accepted;
- `/perfil` clears the continuation state and displays `1 de 13 fontes reunidas`.

`test-profiling.js` separately pins schema capture, stale `schema_required` rereads and both phases of
the integrated flow. `test-profile-partitions.js` pins the top-level continuation design. A local DOM
read, a `done` row without accepted handoff, or a pending profile row is never sufficient evidence.

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

