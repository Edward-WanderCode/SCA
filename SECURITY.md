# Security Policy

🇻🇳 [Phiên bản tiếng Việt](SECURITY.vi.md)

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | ✅ Active support  |

## Reporting a Vulnerability

If you discover a security vulnerability in SCA, please **DO NOT** create a public Issue.

### How to Report

1. **Email**: Send details to the maintainer via their GitHub profile
2. **GitHub Security Advisory**: Use the "Security" tab on the repository to create a private advisory

### Information to Provide

- Vulnerability description
- Steps to reproduce
- Severity level (Critical / High / Medium / Low)
- Affected versions
- Suggested fix (if available)

### Response Timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 7 days
- **Patch release**: depending on severity

## Current Security Measures

- Input sanitization on all API endpoints
- Command injection prevention when calling scan engines
- SQLite WAL mode to prevent database locks
- Automatic temporary file cleanup
- Environment variables for sensitive configuration
