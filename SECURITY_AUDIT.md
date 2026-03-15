# Security Audit (focused on private key / CLOB token / env leakage)

Date: 2026-03-14
Scope: `packages/server`, `packages/client`, runtime configuration

## Executive summary

No direct hardcoded stealer logic was found (no `eval`/`child_process` exfil scripts, no direct `.env` dump endpoint).

However, there are **realistic leak/abuse paths** that could still cause private loss or secret exposure if deployment is not locked down.

## Findings

### 1) Unauthenticated trading control API (High)

The BTC UI/API server exposes state-changing endpoints (`/trading/start`, `/trading/stop`, `/trading/kill`, `/mode`) without auth middleware in this file.

Impact:
- If this API is internet-accessible, an attacker can switch modes and trigger live behavior that uses your configured wallet/credentials.
- This is not direct key theft, but can cause **fund loss** and operational compromise.

### 2) Outbound webhook sink can leak sensitive runtime context (Medium)

`WEBHOOK_URL` is fully environment-controlled and outbound payloads are posted as JSON.

Impact:
- If `WEBHOOK_URL` is set to attacker-controlled endpoint, runtime details are exfiltrated.
- Current payloads appear operational (not raw secrets), but still contain trading internals and error strings.

### 3) Optional LLM integration sends market/runtime context to third party (Medium)

LLM signal code sends a prompt to Anthropic when `ANTHROPIC_API_KEY` exists.

Impact:
- Data leaves your infrastructure.
- Not a key leak by itself, but privacy-sensitive market/trade context egress.

### 4) Proxy environment variables can transparently route outbound traffic (Medium)

Proxy helper reads `HTTP(S)_PROXY`/`ALL_PROXY` and applies it globally/for WS.

Impact:
- If these env vars are set to untrusted proxy, outbound traffic can be observed/modified by proxy operator.
- This can expose metadata and possibly authenticated request contents depending on transport/security controls.

### 5) Front-end loads CDN script directly in BTC UI HTML (Supply-chain risk, Medium)

BTC legacy UI HTML references Chart.js via jsDelivr CDN.

Impact:
- If CDN/script integrity is compromised or MITM in dev environment, injected JS could read dashboard data and issue API actions from browser context.
- Prefer pinned local bundle or SRI + CSP.

### 6) Secret-bearing environment is intentionally used by trading modules (Expected but sensitive)

`PRIVATE_KEY` and CLOB creds are consumed in exchange/client paths.

Impact:
- Any upstream compromise of host/process gives direct access to these secrets.
- Expected for live trading, but should be treated as high-value hot wallet exposure.

## What was NOT found

- No direct code that serializes `process.env` and posts it out.
- No obvious key logging of full `PRIVATE_KEY`/CLOB secret values.
- No obvious backdoor commands (`curl`/`wget` + shell execution patterns) in repo source.

## Hardening checklist (recommended immediately)

1. Put authentication in front of **all** state-changing BTC/weather endpoints.
2. Bind internal bot APIs to private network only; expose public dashboard through authenticated reverse proxy.
3. Restrict egress destinations at network level (allowlist: polymarket/gamma/polygon + explicit webhooks if needed).
4. Disable proxy env vars in production unless explicitly required.
5. Replace CDN script with local dependency build (or enforce SRI + CSP nonce/hash).
6. Use dedicated low-balance wallet for `PRIVATE_KEY`; rotate CLOB credentials regularly.
7. Add secret scanning in CI (e.g., gitleaks/trufflehog) and dependency audit (`npm audit`).

## Notes

This report focuses on *practical* leak/abuse vectors including low-probability paths, not only explicit stealers.
