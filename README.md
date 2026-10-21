# EliteInfotec CRM
1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` in the SQL Editor.
2. Authentication > Users: add your own user. Then Authentication > Sign In / Providers: turn OFF "Allow new users to sign up".
3. `cp .env.example .env.local` and fill in the project URL and the **anon** key (never the service_role key).
4. `npm install && npm run dev`
`npm test` runs the CSV import checks; `npm run build` typechecks and builds.
