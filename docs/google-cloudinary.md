# Google login and Cloudinary avatars

The existing server-managed, revocable session remains the only application session. Google login is an additional identity provider, not a migration to Supabase Auth. Registration still accepts username, full name and a password of at least eight characters.

## Production settings

In Google Cloud Console / Google Auth Platform, create a Web Application OAuth client. Configure the consent screen for IdeaHub and the intended audience; while in testing, include the Google accounts that will test login. Use this exact authorized redirect URI:

```
https://ideahub-umber.vercel.app/api/auth/google/callback
```

The consent flow requests `openid profile email`. A Gemini API key cannot replace OAuth client credentials. Google login uses the verified `sub` as its stable identity key, never an email match. A password account and a Google account are separate unless a future explicit, authenticated linking flow is implemented.

Set these Vercel Production variables and redeploy:

| Variable | Source |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Application client ID |
| `GOOGLE_CLIENT_SECRET` | The matching OAuth client secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary product environment cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API credential key |
| `CLOUDINARY_API_SECRET` | Matching Cloudinary API secret |
| `APP_URL` | Optional; production defaults to `https://ideahub-umber.vercel.app` |

Enter secret values directly in the hosting provider, without committing them. No unsigned upload preset or browser-side API secret is needed. The app's `/api/auth/config` exposes only feature availability flags.

## User experience

- Users can choose a 2 MB JPG, PNG or WebP while registering. A local preview is shown; the file is uploaded only after account creation, using the new authenticated session. Choosing a photo is optional.
- If that upload fails, the account remains created and the user can retry the photo or continue and change it later. Retrying does not create another account.
- The account menu can replace the avatar. Comments and idea author profiles use the saved image, with initials if no image exists or it fails to load.
- Google login imports the Google name and photo. If Cloudinary is configured, the photo is copied into Cloudinary. Otherwise a validated Google-hosted picture remains available as a fallback. An avatar chosen manually is preserved on later Google logins.
- Google return destinations are restricted to the dashboard, creating an idea, or a specific discussion. Arbitrary external redirect destinations are rejected.

## Security and verification

The code flow uses a ten-minute HttpOnly/SameSite cookie, random state, PKCE S256 and nonce. State/verifier records are in a private, RLS-enabled table and consumed once. ID tokens are verified against Google's JWKS with RS256, issuer, audience, required expiry/issued-at/sub/nonce claims and nonce binding. ID/access/refresh tokens are not persisted; only an app session is issued.

Avatar writes require the app session and same-origin POST, have shared user/global rate limits, and validate bounded multipart data plus image magic bytes. SVG and arbitrary remote uploads are rejected. Server-generated Cloudinary SHA-256 signatures bind a fixed avatar public ID and 512 x 512 WebP transformation. The API secret never reaches the browser. Remote Google imports accept HTTPS `googleusercontent.com` picture hosts only after OIDC verification.

Automated PostgreSQL and mocked-provider tests cover callback state binding and replay, nonce mismatch, stable Google identities, password rejection for Google-only accounts, custom-avatar preservation, upload authorization, signatures, type/size validation and sanitized provider failures. Real Google sign-in and Cloudinary uploads require the credentials above and a user-led Google account selection.

References: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [Cloudinary signatures](https://cloudinary.com/documentation/authentication_signatures), [Cloudinary uploads](https://cloudinary.com/documentation/upload_images).
