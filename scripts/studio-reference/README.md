# Studio reference values

`tests/fixtures/studio-reference.json` holds outputs recorded from the original
Spectrum Studio color code, so the ported engine can be checked against it.

To re-record, copy these Studio files from
`spectrum-design-data/docs/spectrum-studio/src/features/color-system/` into a
scratch folder together with `record.ts` and `model.ts` (a type-only stub):
`colorMath.ts`, `outputSettings.ts`, `outputSerialization.ts`, `outputContrast.ts`,
`scaleGeneration.ts`, `scaleInterpolation.ts`, `paletteValue.ts`,
`dynamicGeneration.ts`, `polarity.ts`, `surfaceGeneration.ts`.

Then run `npx tsx <scratch>/record.ts tests/fixtures/studio-reference.json`.
