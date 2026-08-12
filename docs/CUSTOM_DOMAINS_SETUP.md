# Custom domains — what works, and what each key turns on

LifemarkAI has three separate custom-domain capabilities. They are independent:
one can work while the others are dark, which is what makes "does the domain
feature work?" a question with three answers.

| Capability | Needs | Status without the keys |
|---|---|---|
| Connect a domain you already own | `NETLIFY_AUTH_TOKEN` | Cannot attach — now returns a clear error instead of a false success |
| One-click DNS (pick your registrar, log in, records written for you) | `ENTRI_APPLICATION_ID`, `ENTRI_SECRET` | Falls back to showing manual DNS records — still works, just more steps |
| Buy a domain without leaving the editor | one registrar's keys (below) | Search returns "not configured"; the buy button has nothing behind it |

## 1. Connect an existing domain

The only required key is `NETLIFY_AUTH_TOKEN`, because Netlify is what serves
published projects (site name: `lifemark-<first 12 chars of project id>`).

What happens when a user adds a domain:

1. The hostname is attached to the project's Netlify site — **creating that site
   if the project has never been published**, which is the normal order people
   do this in.
2. DNS records are shown, generated from `lib/domains/hosting.ts`.
3. On verify, the domain must both resolve to the hosting target *and* carry the
   `_lifemark-verify` TXT token before it is marked verified.

If `NETLIFY_AUTH_TOKEN` is missing the attach now fails loudly and the domain is
not saved. That is deliberate: a saved-but-unattached domain shows the user a
configured domain the host has never heard of, and they wait forever for a
certificate that cannot arrive.

## 2. Entri — one-click DNS

Entri is not a registrar. It detects the user's DNS provider, asks them to log
in, and writes the records for them. It is the difference between "copy these
four records into your registrar" and "click connect". Lovable uses it, and it
is the single biggest UX gap when it is off.

```
ENTRI_APPLICATION_ID=...
ENTRI_SECRET=...
```

Credentials stay server-side. The client only ever receives a short-lived token
minted from them (`getEntriAuthToken`, `https://api.goentri.com/token`).

When unset, `entriConnect` returns `mode: "manual"` with the same DNS records —
so the flow degrades to manual setup rather than breaking.

## 3. Buying a domain in-product

Any one of three registrars. Pick with `DOMAIN_REGISTRAR`, or leave it unset and
the first configured one wins.

```
# Name.com  (test host: https://api.dev.name.com)
NAMECOM_USERNAME=...
NAMECOM_API_TOKEN=...
NAMECOM_API_HOST=https://api.name.com      # optional

# Cloudflare Registrar — sells at cost, no markup
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# Ionos
IONOS_API_KEY=...
```

Note this one is a money flow, not just an integration: you are reselling
domains, so registration fees, renewals and refunds land on you separately from
AI credits. Worth deciding the pricing story before switching it on.

## Optional

```
DOMAIN_VERIFY_SALT=...     # salts the per-domain TXT token; defaults to a
                           # constant, so set it in production
PLATFORM_APEX_IPS=...      # only if you move off Netlify to your own edge
PLATFORM_APP_DOMAIN=...
```

## One rule worth keeping

`lib/domains/hosting.ts` is the only module that should know where projects are
served. Both the records shown to users and the records checked at verification
come from it.

This was not true before. `entri.ts` computed its own records pointing apex
domains at `76.76.21.21` — a **Vercel** address — and subdomains at
`lifemarkai.app`, while `server-fns/domains.ts` independently emitted Netlify's
real values. The product gave two different answers to "what DNS do I need?"
depending on which button you pressed, one of them pointed at a host that had
never heard of the project, and verification compared against a third thing. No
test caught it and no error surfaced; domains simply never went live.

If you add a hosting target, add it there — not in a caller.
