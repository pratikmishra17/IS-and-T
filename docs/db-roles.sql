-- Limited database users for the IS&T app. Run once, as the superuser (postgres), in pgAdmin's
-- Query Tool connected to the isandt database. Pick your own passwords for the two lines marked.
--
-- Why: the app used to connect as postgres, a superuser that can do anything on the server (read
-- files, create users, drop any database). If the app were ever tricked into running SQL, all of
-- that would be exposed. Now:
--   isandt_owner  owns the tables; only migrations (Flyway, at startup) use it
--   isandt_app    what the running app uses: read and write rows, nothing else

CREATE ROLE isandt_owner LOGIN PASSWORD 'choose-an-owner-password';   -- ← change
CREATE ROLE isandt_app   LOGIN PASSWORD 'choose-an-app-password';     -- ← change

-- The owner owns the schema and everything already in it (tables, the sequences behind ids,
-- and Flyway's history table).
ALTER SCHEMA public OWNER TO isandt_owner;
DO $$
DECLARE obj record;
BEGIN
    FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO isandt_owner', obj.tablename);
    END LOOP;
    FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO isandt_owner', obj.sequencename);
    END LOOP;
END $$;

-- The app: connect, and read/write rows in existing tables...
GRANT CONNECT ON DATABASE isandt TO isandt_app;
GRANT USAGE ON SCHEMA public TO isandt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO isandt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO isandt_app;

-- ...and in every table future migrations create (they run as isandt_owner).
ALTER DEFAULT PRIVILEGES FOR ROLE isandt_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO isandt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE isandt_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO isandt_app;

-- Then, in Eclipse (Boot Dashboard → Open Config → Environment), set:
--   DB_USERNAME=isandt_app              DB_PASSWORD=<the app password>
--   DB_MIGRATION_USERNAME=isandt_owner  DB_MIGRATION_PASSWORD=<the owner password>
-- and restart. The app no longer needs the postgres password at all.
