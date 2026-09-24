# Architecture Decision Records

This log records the significant, hard-to-reverse architecture decisions made on this
project, in the order they were made. Each ADR captures the context at decision time,
the decision, and what we gave up by making it — so a later reviewer (including future
us) can tell whether the reasoning still holds before overturning it.

Format: one file per decision, numbered sequentially, never renumbered or deleted.
A reversed decision gets a new ADR that supersedes the old one; the old one is left in
place with its status updated.

| #                                             | Decision                                                            | Status   |
| --------------------------------------------- | ------------------------------------------------------------------- | -------- |
| [0001](0001-api-mocking-strategy.md)          | API mocking strategy for UI tests                                   | Accepted |
| [0002](0002-pin-upstream-app-versions.md)     | Pin upstream app versions to a commit SHA                           | Accepted |
| [0003](0003-package-manager.md)               | Package manager for the test project                                | Accepted |
| [0004](0004-allure-report-publishing.md)      | Publish Allure reports to GitHub Pages                              | Accepted |
| [0005](0005-frontend-custom-docker-build.md)  | Custom Dockerfile and build-time API URL patch for the frontend     | Accepted |
| [0006](0006-backend-database-provider.md)     | Run the backend against its default SQLite provider, not SQL Server | Accepted |
