# factories

Test data builders that hit the real API to create isolated users, articles, and
comments per test. Every factory call must produce globally-unique identifiers
(faker-generated usernames, emails, slugs) so tests stay safe to run fully parallel.
Never assume a shared seeded user or fixed article slug exists — that's the single
most common way public RealWorld test suites break under parallelization.
