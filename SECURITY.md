# Security Policy

## Supported Versions

Security fixes are generally provided for the latest published release.

If you believe an older version is affected, please report it anyway and include
the exact version(s) tested.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately. Do **not** open a public
issue or discussion for security-sensitive reports.

### Preferred Reporting Channel

Send your report to: **ibjessup+deno-sprout@gmail.com**

If this repository provides a private vulnerability reporting mechanism, use
that channel instead.

### What to Include

Please include as much of the following as possible:

- affected package version
- Deno version
- operating system and architecture
- a clear description of the issue
- reproduction steps or a minimal proof of concept
- expected impact
- any suggested mitigation or fix, if known

If the issue depends on a particular configuration or data, include a minimal
example that reproduces the behavior safely.

## Response Process

We aim to:

- acknowledge receipt within **48 hours**
- provide an initial triage update within **7 days**
- keep reporters informed of fix status when possible
- coordinate public disclosure after a fix or mitigation is available

## Scope

### In Scope

Please report vulnerabilities in this library's code and packaging, including
for example:

- unsafe code patterns or memory-safety issues
- invalid resource lifecycle management
- insecure temporary-file or configuration handling introduced by this library
- dependency or packaging issues that create a security impact

### Out of Scope

The following are usually not handled as vulnerabilities in this repository:

- vulnerabilities in third-party dependencies (report to their maintainers)
- vulnerabilities in downstream applications using this library
- misuse of the library that leads to security issues
- feature requests or hardening suggestions without a demonstrable security
  impact

## Disclosure

Please allow time for investigation and remediation before public disclosure.

We follow a coordinated disclosure process and will credit reporters if they
would like to be acknowledged.
