# Big Year

Full-screen yearly calendar that shows only all-day events from your Google Calendar. Built with Next.js (App Router), Tailwind CSS, and shadcn-style UI components.

## Quickstart

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in the project root with:

```
DATABASE_URL=your-postgresql-database-url
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-strong-random-string

GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

For local development, you can use a local PostgreSQL database or a free hosted option like [Neon](https://neon.tech) or [Supabase](https://supabase.com).

3. Configure your Google OAuth app:

   - App type: Web application
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Scopes: `openid email profile https://www.googleapis.com/auth/calendar.readonly`

4. Run the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with Google, and you'll see your all-day events plotted across the full-year view. Use the arrows or Today button to navigate the year.

## Production Setup (Vercel)

When deploying to Vercel, you need to configure both your Vercel environment variables and your Google OAuth credentials:

### 1. Set Vercel Environment Variables

In your Vercel project dashboard, go to **Settings** → **Environment Variables** and ensure you have:

- `NEXTAUTH_URL` = `https://big-year.vercel.app` (or your custom domain)
- `NEXTAUTH_SECRET` = a strong random string (generate with `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID` = your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` = your Google OAuth client secret
- `DATABASE_URL` = your PostgreSQL connection string (see `VERCEL_SETUP.md`)

**Important**: Make sure `NEXTAUTH_URL` matches your actual Vercel deployment URL exactly (including `https://`).

### 2. Configure Google OAuth for Production

In your [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Go to your OAuth 2.0 Client ID
2. Under **Authorized redirect URIs**, add:
   - `https://big-year.vercel.app/api/auth/callback/google` (or your custom domain)
3. Save the changes

**Note**: You can have multiple redirect URIs - one for local development (`http://localhost:3000/api/auth/callback/google`) and one for production.

### 3. Redeploy

After updating the environment variables and Google OAuth settings, trigger a new deployment in Vercel (or push a commit) to apply the changes.

## Removing "Unverified App" Warnings

To remove the Google "unverified app" warning screens, you need to configure your OAuth consent screen and optionally submit your app for verification:

### Step 1: Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent)
2. Select your OAuth 2.0 Client ID project
3. Fill out the **OAuth consent screen**:
   - **User Type**: Choose "External" (unless you have a Google Workspace)
   - **App name**: Big Year (or your preferred name)
   - **User support email**: gabe@valdivia.works (your email)
   - **Developer contact information**: gabe@valdivia.works
   - **App domain** (optional): big-year.vercel.app
   - **Authorized domains**: Add `vercel.app` (or your custom domain)
   - **Application home page**: `https://big-year.vercel.app`
   - **Privacy Policy link**: `https://big-year.vercel.app/privacy`
   - **Terms of Service link**: `https://big-year.vercel.app/terms`
4. Under **Scopes**, add:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Save and continue

### Step 2: Publish Your App (Recommended)

After configuring the consent screen:

1. Go to the **Publishing status** section
2. Click **Publish App**
3. Confirm the publishing

**Note**: Publishing makes your app available to all Google users. The "unverified app" warnings will be significantly reduced, though some users may still see a brief warning if you haven't completed full verification.

### Step 3: Full Verification (Optional)

For complete removal of warnings and a verified badge:

1. Go to [Google Cloud Console OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Click **Submit for verification**
3. Complete the verification form with:
   - Detailed explanation of why you need each scope
   - Video demonstration of your app
   - Privacy policy and terms of service (already created above)
4. Wait for Google's review (can take several weeks)

**Important**: The privacy policy and terms pages are already created at `/privacy` and `/terms`. Make sure your app is deployed so these URLs are accessible before submitting for verification.

## Notes

- Only all-day events are fetched: events with `start.date` (not `start.dateTime`) are included.
- Access tokens are automatically refreshed using the Google refresh token.
- The calendar auto-fills the entire viewport (full width and height).
