# OCR Benchmark Fixtures

These fixtures are synthetic screenshots for local OCR benchmark runs. They do
not contain private user screenshots or production data.

Run the fixture/assertion validation path with:

```bash
pnpm ocr:bench
```

Run real Tesseract OCR only when local language data is already available:

```bash
pnpm ocr:bench:real
```

The benchmark writes reports to `.tmp/ocr-benchmark/results.json`. Generated
PNG files are temporary unless `--keep-generated` is passed.
