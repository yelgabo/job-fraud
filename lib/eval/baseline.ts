// The composer's measured agreement with the human labels, on the production path (with Jev
// judgments), against the fixture snapshotted 2026-10-26. lib/eval/labels.test.ts fails if a
// change scores below it. Raise it when a change improves the numbers; re-measure it with
// `npm run eval:labels` when labels are added or the fixture is re-snapshotted, in the same commit.
//
// Both misses are human-labelled high, so high recall is 0/2: Megacity (#4, residential mailing
// address the cached employer verdict does not record) and Thai Green Elephant (#18, an
// immigration broker handling the hiring, which no weighted signal covers yet).
export const BASELINE = { decided: 21, agree: 19, highAgree: 0, highOf: 2 }
