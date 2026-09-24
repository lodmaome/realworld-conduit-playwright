# 0006: Run the backend against its default SQLite provider, not SQL Server

- Status: Accepted
- Date: 2026-09-18

## Context

The original plan (see the mocking/pinning discussion preceding these ADRs) was to
run the ASP.NET Core backend against SQL Server in docker-compose, specifically to
avoid SQLite's single-writer lock once many Playwright workers hit the API in
parallel. The backend's own `docker-compose.yml` seems to support this — it declares
`ASPNETCORE_Conduit_DatabaseProvider` and `ASPNETCORE_Conduit_ConnectionString`
environment variables.

Reading `src/Conduit/Program.cs` at the pinned commit
(`a397d1197b22edeffa4d2563fa5f4f7f11d0b254`) shows this isn't actually wired up:

```csharp
// read database configuration (database provider + database connection) from environment variables
//Environment.GetEnvironmentVariable(DEFAULT_DATABASE_PROVIDER)
//Environment.GetEnvironmentVariable(DEFAULT_DATABASE_CONNECTION_STRING)
var defaultDatabaseConnectionString = "Filename=realworld.db";
var defaultDatabaseProvider = "sqlite";
```

The environment-variable reads are commented out; `connectionString` and
`databaseProvider` are hardcoded to the SQLite defaults regardless of what's set in
the environment. Whatever the repo's own `docker-compose.yml` implies, the pinned
commit can only run against SQLite today.

## Decision

Accept SQLite as the pinned commit actually runs it. Set no database environment
variables in our `docker-compose.yml` (see [0002](0002-pin-upstream-app-versions.md)).
Rely entirely on factory-based test data isolation — unique users, emails, and
article slugs per test, already planned regardless of DB engine (see the
test-interdependence pitfall) — for parallel-safety, rather than DB-engine-level
write concurrency. Do not patch the backend's C# startup wiring to re-enable
env-based provider switching.

## Consequences

**Positive**

- Consistent with [0002](0002-pin-upstream-app-versions.md)'s intent of running the
  real, unmodified backend — no source patch needed here, unlike the frontend
  ([0005](0005-frontend-custom-docker-build.md)).
- One fewer service: no SQL Server container, no SA password secret to generate and
  manage, meaningfully simpler `docker-compose.yml`.
- An ephemeral, container-local SQLite file that resets with the container's
  lifecycle is actually a clean, fully-isolated environment per CI run — arguably
  better for this use case than a persistent shared server database that would need
  its own reset/seed step between runs.

**Negative**

- Writes serialize under SQLite's single-writer lock, a real performance ceiling on
  how many Playwright workers can usefully hammer the API in parallel. This hasn't
  been measured yet; if it becomes an actual bottleneck (not just a theoretical one),
  revisit — e.g. bump to a future commit if upstream finishes the DB-provider wiring,
  contribute that fix upstream ourselves, or reconsider the backend choice.

## Alternatives considered

- **Patch `Program.cs` ourselves** to re-enable env-based provider switching, then run
  SQL Server — rejected for v1. Unlike the frontend's one-line string patch, this is a
  change to the backend's DI/startup wiring in a compiled language we don't maintain —
  meaningfully closer to forking the app than adapting it. The correctness need
  (test isolation) is already met by factories regardless of DB engine; this would
  only buy write throughput we haven't shown we need yet.
