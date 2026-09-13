# Signal range repair

The user chose to preserve the 35 to 45 point address-risk contribution on September 12, 2026. Align the advertised tool range, new-response validation and deep-judge input validation at integer weights from -30 to +45. Keep each other rubric range, historical records, overall fraudScore and risk-band behavior unchanged. Remove the temporary instruction hold.

Validate accepted 35 and 45 responses, request schema and prompt, both numeric bounds, fractional rejection and historical reads. Run existing local tests and type checking. Do not invoke scoring services, apply verdicts, query production or rescore data.

## Evidence

The new request-schema tests first failed on the old maximum of 30. The full local Vitest suite passed 76 tests across 13 files after implementation. A TypeScript test assertion initially accessed input_schema on a union containing other tool kinds; the assertion now checks the enclosing request object. Its five focused scoring tests and the final type check passed. Independent review inspected the diff and actual consumers and found no P1/P2 introduced by this change. No live scoring, database mutation or rescore ran.

Historical SignalsSchema remains permissive for stored records; new scoring responses and judge:apply use the bounded ScoringSignalsSchema. The deterministic impersonation signal weight of 35 remains valid.

## Separate existing observation

In scripts/judge-apply.ts, job.update can succeed before the employer update fails. The catch then counts the verdict as skipped although its job score was saved. This pre-existing write-atomicity issue is outside the instruction and signal-range repair; it was found through source review without executing database writes.
