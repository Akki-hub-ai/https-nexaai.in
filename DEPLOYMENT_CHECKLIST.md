# NexaAI Deployment Checklist

Owner/Managing Director: Akash Jadhav

1. Create a private GitHub repository and upload this project.
2. Create a Supabase project and run schema.sql in SQL Editor.
3. Configure Email and Google authentication in Supabase.
4. Create an OpenAI API key.
5. Create a Render Web Service from the GitHub repository.
6. Add these Render environment variables:
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   OPENAI_API_KEY
   OPENAI_MODEL=gpt-5.6-luna
   FREE_MONTHLY_MESSAGES=100
   PRO_MONTHLY_MESSAGES=5000
   ADMIN_EMAIL=<your admin email>
7. Deploy and test the generated onrender.com URL.
8. Add a custom domain after the service is working.

Never commit .env, OpenAI keys, or the Supabase service-role key.
