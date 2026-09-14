# NexaAI

**Akash Jadhav — Managing Director, NexaAI**

# NexaAI v2 setup

## 1. Supabase
Create a Supabase project. Run `schema.sql` in SQL Editor.

Enable Email/password authentication. Supabase supports email/password and Google OAuth. For Google, configure a Google OAuth client and add the Supabase callback URL in Google Cloud.

## 2. Environment
Copy `.env.example` to `.env` and fill:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (server only; NEVER expose it)
- OPENAI_API_KEY (server only)
- ADMIN_EMAIL

Then set the first admin manually in Supabase:
update public.profiles set is_admin=true where email='YOUR_ADMIN_EMAIL';

## 3. Install/run
npm install
npm start
Open http://localhost:3000

The browser asks for the Supabase URL and publishable/anon key once and stores them locally. For production, replace that with build-time public configuration.

## 4. Plans
Free default: 100 messages/month.
Pro default: 5,000 messages/month.
Change limits with FREE_MONTHLY_MESSAGES and PRO_MONTHLY_MESSAGES.

This version includes the plan field and secure server-side usage enforcement. Payment processing is intentionally not faked: connect Stripe or another payment provider before automatically granting Pro after payment.
