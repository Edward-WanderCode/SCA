# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. **Email:** Send details to security@sca-platform.local
2. **Include:**
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Initial Response:** Within 48 hours
- **Status Updates:** Every 5 business days
- **Resolution Timeline:** 
  - Critical: 7 days
  - High: 14 days
  - Medium: 30 days
  - Low: 60 days

### Disclosure Policy

- We follow coordinated disclosure
- We will work with you to understand and fix the issue
- We will publicly acknowledge your contribution (if desired)
- We will not take legal action against security researchers who follow this policy

## Security Best Practices

### For Developers

1. **Never commit secrets**
   - Use `.env` files (gitignored)
   - Use environment variables
   - Use secret management tools

2. **Validate all inputs**
   - Use Pydantic validators
   - Sanitize file paths
   - Validate URLs and domains

3. **Use parameterized queries**
   - Always use SQLAlchemy ORM
   - Never concatenate user input into SQL

4. **Implement rate limiting**
   - Protect authentication endpoints
   - Limit API requests per user
   - Use Redis for rate limit storage

5. **Keep dependencies updated**
   - Run `safety check` regularly
   - Monitor Dependabot alerts
   - Update critical vulnerabilities immediately

### For Operators

1. **Use strong secrets**
   - JWT_SECRET_KEY: min 32 characters
   - Generate with: `openssl rand -hex 32`
   - Rotate secrets regularly

2. **Enable HTTPS**
   - Use TLS certificates (Let's Encrypt)
   - Redirect HTTP to HTTPS
   - Set HSTS headers

3. **Restrict CORS**
   - Only allow specific origins
   - Never use wildcard (*) in production
   - Review CORS_ORIGINS regularly

4. **Monitor logs**
   - Watch for authentication failures
   - Alert on unusual patterns
   - Review security logs weekly

5. **Regular backups**
   - Daily database backups
   - Test restore procedures
   - Encrypt backup files

## Known Security Considerations

### Current Implementation (v1.0.x)

⚠️ **No Authentication** - API is completely open
⚠️ **CORS Wide Open** - Accepts requests from any origin
⚠️ **No Rate Limiting** - Vulnerable to DoS attacks
⚠️ **No Input Validation** - Risk of injection attacks

### After Phase 1 Upgrade (v2.0.0)

✅ **JWT Authentication** - Role-based access control
✅ **Restricted CORS** - Origin whitelist only
✅ **Rate Limiting** - 5 req/min on auth, 100 req/min global
✅ **Input Validation** - Pydantic validators on all inputs
✅ **Security Headers** - X-Frame-Options, CSP, etc.

## Security Checklist

### Before Production Deployment

- [ ] Change all default passwords
- [ ] Generate strong JWT secret (min 32 chars)
- [ ] Configure CORS for production origins only
- [ ] Enable HTTPS with valid certificates
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerting
- [ ] Enable security headers
- [ ] Run security scan (OWASP ZAP)
- [ ] Run dependency scan (`safety check`)
- [ ] Review and restrict database permissions
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Document incident response plan
- [ ] Test rollback procedures

## Security Tools

### Scanning

```bash
# Dependency vulnerabilities
pip install safety
safety check

# Secret scanning
pip install detect-secrets
detect-secrets scan

# SAST scanning (use our own platform!)
# Upload codebase to SCA Platform

# Container scanning
docker run --rm -v $(pwd):/src aquasec/trivy:latest fs /src

# Web application scanning
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:8000
```

### Pre-commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Setup hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

Create `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

## Contact

For security concerns, contact: security@sca-platform.local

---

*Last Updated: 2026-07-31*
