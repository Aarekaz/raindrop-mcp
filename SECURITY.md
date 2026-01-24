# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please open a private security advisory on GitHub or contact the maintainers directly.

**Email:** anuragdhungana5@gmail.com

## Security Best Practices

### Configuration Security

- **Never commit** `claude-desktop-config.json` to version control
- **Never commit** `.env`, `.env.local`, or other files containing access tokens
- Use environment variables for production deployments
- Rotate access tokens periodically
- Use different tokens for development and production
- Store sensitive configuration files outside the project directory when possible

### OAuth Security

This project implements OAuth 2.0 with PKCE for secure authentication:

- **State parameters** are validated for CSRF protection
- **Tokens stored** in httpOnly cookies (not URL parameters)
- **Redirect URIs** validated against allowlist
- **PKCE flow** prevents authorization code interception
- **Session IDs** never exposed in URLs or logs
- **Token encryption** using AES-256-GCM for storage
- **Automatic token refresh** with secure storage updates

### Known Security Fixes

| Date | ID | Description | Impact |
|------|----|-----------|----|
| **2026-01-24** | BUG-0001 | Removed hardcoded API token from config files | Critical - Prevented credential exposure in version control |
| **2026-01-24** | BUG-0002 | Fixed OAuth state timing issues preventing redirect URI retrieval | High - Improved OAuth flow security and reliability |
| **2026-01-24** | BUG-0003 | Fixed OAuth state retrieval in Express routes | High - Prevented authorization flow failures |
| **2026-01-24** | - | Prevented session ID exposure in URLs via httpOnly cookies | Medium - Enhanced XSS protection |

### API Token Management

If you believe your Raindrop.io API token has been exposed:

1. **Revoke the token immediately** at https://app.raindrop.io/settings/integrations
2. **Generate a new token** from the same page
3. **Update local configuration** files with the new token
4. **Review git history** to ensure the token was not committed
   - If found in git history: Consider the repository compromised
   - Create a new repository or use tools like BFG Repo-Cleaner
5. **Consider using environment variables** instead of config files for better security

### Production Deployment Security

#### Required Security Measures

1. **Use HTTPS Only**
   - Vercel and Cloudflare provide automatic HTTPS
   - Never expose MCP endpoints over plain HTTP in production

2. **Set API Key Protection**
   ```env
   API_KEY=your_secure_random_key_here
   ```
   - Generate with: `openssl rand -base64 32`
   - Require this key for all HTTP requests

3. **Restrict CORS Origins**
   ```env
   CORS_ORIGIN=https://your-frontend.com
   ```
   - Never use `*` in production
   - Specify exact allowed origins

4. **Use OAuth for Multi-User Apps**
   - Don't share API tokens between users
   - Implement proper token scoping
   - Use encrypted token storage

5. **Enable Rate Limiting**
   - Implement request throttling
   - Use Vercel/Cloudflare rate limiting features
   - Monitor for suspicious activity

#### Optional Security Enhancements

1. **IP Allowlisting** - Restrict access to known IP ranges
2. **Request Signing** - Implement HMAC signatures for requests
3. **Audit Logging** - Log all authentication attempts and API calls
4. **Token Rotation** - Implement automatic token rotation policies
5. **Monitoring** - Set up alerts for unusual patterns

## Security Checklist for Contributors

Before committing changes, ensure:

- [ ] No API tokens or secrets in code
- [ ] Sensitive files are in `.gitignore`
- [ ] Environment variables used for production configs
- [ ] OAuth flows follow security best practices
- [ ] Session management uses httpOnly cookies
- [ ] Input validation on all user-provided data
- [ ] No hardcoded credentials in documentation or examples
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up to date and free of known vulnerabilities

## Vulnerability Disclosure Timeline

We follow a responsible disclosure timeline:

1. **Day 0**: Vulnerability reported privately
2. **Day 1-7**: Maintainers assess and acknowledge the report
3. **Day 8-30**: Develop and test fix
4. **Day 31**: Release patched version
5. **Day 31+**: Public disclosure after users have time to update

## Security Features

### Transport Security

- **STDIO**: Local process communication (no network exposure)
- **HTTP/SSE**: TLS 1.2+ required for production
- **Vercel**: Automatic HTTPS with Let's Encrypt
- **Cloudflare Workers**: Global edge network with DDoS protection

### Authentication Methods

1. **OAuth 2.0 with PKCE** (Most Secure)
   - No token sharing between users
   - Automatic token refresh
   - Encrypted storage
   - CSRF protection

2. **Direct Token per Request** (Moderate Security)
   - User provides their own token
   - No server-side storage
   - Suitable for trusted clients

3. **Environment Token** (Development Only)
   - Single shared token
   - No multi-user support
   - Not recommended for production

### Data Protection

- **Encryption at Rest**: AES-256-GCM for stored tokens
- **Encryption in Transit**: HTTPS/TLS 1.2+
- **Token Scoping**: Per-user token isolation
- **Session Security**: HttpOnly, Secure, SameSite cookies

## Dependencies

We regularly update dependencies to address security vulnerabilities:

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Fix vulnerabilities automatically
npm audit fix
```

## Security Updates

To stay informed about security updates:

1. **Watch** this repository on GitHub
2. **Subscribe** to security advisories
3. **Check** the [Releases](https://github.com/Aarekaz/raindrop-mcp/releases) page regularly
4. **Enable** Dependabot alerts in your fork

## Additional Resources

- [OAuth 2.0 Security Best Practices](https://tools.ietf.org/html/rfc8252)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Model Context Protocol Security](https://modelcontextprotocol.io/docs/security)
- [Raindrop.io API Documentation](https://developer.raindrop.io)

## Contact

For security-related questions or concerns:

- **GitHub**: [@Aarekaz](https://github.com/Aarekaz)
- **Email**: anuragdhungana5@gmail.com
- **Security Advisories**: Use GitHub's private security reporting feature

---

**Last Updated**: 2026-01-24
