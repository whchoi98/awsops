---
sidebar_position: 1
title: Login Guide
description: AWSops dashboard login and authentication methods
---

# Login Guide

The AWSops dashboard uses Amazon Cognito-based authentication. You can log in with the email and password provided by your administrator.

## Login Procedure

### 1. Access the Dashboard

Open your browser and navigate to the dashboard URL:
```
https://your-domain.com/awsops/
```

### 2. Authentication Screen

When CloudFront Lambda@Edge detects an unauthenticated request, it automatically redirects to the Cognito login page.

### 3. Enter Credentials

- **Email**: The email address registered by your administrator
- **Password**: Your configured password

:::tip First Login
On your first login, you must change the temporary password to a new one. The password must meet these requirements:
- At least 8 characters
- Include uppercase, lowercase, numbers, and special characters
:::

### 4. Login Complete

Once authenticated, you will be redirected to the main dashboard page.

## Sign Out

Sign out using the button located at the top of the sidebar.

### Sign Out Location
1. Find the **AWSops** logo at the top of the left sidebar
2. Click the **sign out icon** (door icon) to the right of the logo

### Sign Out Behavior
- Clicking sends a `POST /api/auth` request to the server
- HttpOnly cookies are securely deleted server-side
- You are automatically redirected to the login page

:::info HttpOnly Cookies
For security, authentication tokens are stored in HttpOnly cookies. These cookies cannot be accessed via JavaScript, protecting against XSS attacks. This is why sign out uses server-side cookie deletion.
:::

## Session Management

### Session Duration
- Default session duration follows Cognito settings
- When the session expires, you are automatically redirected to the login page

### Multiple Devices
- You can log in from multiple devices with the same account
- Each device has independent session management

## Troubleshooting

### Cannot Log In

| Symptom | Solution |
|---------|----------|
| Password error | Request password reset |
| Account locked | Contact your administrator |
| Page won't load | Clear browser cache and retry |

### Still Logged In After Sign Out

1. Clear browser cookies
2. Test in incognito/private mode
3. Test in a different browser

## Next Steps

Once you've successfully logged in, check out these guides:

- [Navigation Guide](../getting-started/navigation) - Understanding the UI layout
- [AI Assistant Quick Start](../getting-started/ai-assistant) - Using AI features
