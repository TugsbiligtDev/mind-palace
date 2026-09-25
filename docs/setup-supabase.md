# Setting up Supabase (sign-in + database)

About 10 minutes, done once. Until it's done the site still works, with progress saved in the browser only.

## 1. Create the project

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub.
2. **New project**. Name: `mind-palace`. Database password: press **Generate a password** and save it
   in your password manager (you won't need it day to day). Region: the one closest to you. Plan: **Free**.
3. Wait about a minute while it sets up.

## 2. Create the tables

1. In the left sidebar open **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from this project, copy **all** of it, paste it in and press **Run**.
   You should see *Success. No rows returned*.
3. **Table Editor** now shows a `profiles` table. It fills up as people sign in.

## 3. Make the sign-in email send a code

Supabase's standard sign-in email contains a link. Mind Palace asks for a **code** instead.

1. Go to **Authentication → Emails** (it may be under *Notifications → Email*) and open the **Magic Link** template.
2. Replace its message with:

   ```html
   <h2>Your Mind Palace code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>If you didn't ask for it, you can ignore this email.</p>
   ```
3. Do the same for the **Confirm signup** template (first-time sign-ins use that one). **Save** both.

## 4. Send Claude two values

1. Click **Connect** at the top of the project page (or **Project Settings → API Keys**).
2. Copy the **Project URL** (like `https://abcdefgh.supabase.co`) and the **publishable key**
   (starts with `sb_publishable_`).
3. Paste both to Claude. They're safe to share: they're meant to be public, and the database's rules
   decide what anyone can see. **Never share the `secret` key.**

Claude puts them in `.env.local` on your laptop (never uploaded to GitHub).

## 5. Tell Vercel the same two values

Vercel → your project → **Settings → Environment Variables**. Add, for all environments:

- `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key

Then **Deployments → ⋯ → Redeploy**.

## 6. Keep it just for friends (after they've signed in)

Anyone who finds the site could create an account. Once you and your friends have all signed in once:
**Authentication → Sign In / Providers → Email** → turn off **Allow new users to sign up** → Save.
Turn it back on whenever someone new wants to join.

---

## Good to know

- **Free-plan pause:** after about a week with no visits, Supabase pauses the project. Open the Supabase
  dashboard and press **Restore**. Nothing is lost.
- **Email limit:** the built-in sender only sends a few emails an hour. That's plenty for a few friends; if
  someone gets no code, wait a bit and try again.
- **See the data:** **Table Editor → profiles** shows everyone's name, XP, streak and cases solved. The SQL
  Editor works on it too, e.g. `select detective_name, xp from profiles order by xp desc;`
