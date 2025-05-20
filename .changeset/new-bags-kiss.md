---
"playwright-prometheus-remote-write-reporter": patch
---

This file contains next updates:

fix issue with types output

### 💥 Breaking Changes

### 🚀 Features

add new metrics:

- `test_step_total_duration` - count of `test_step` duration across all time
- `test_annotation_count` - count of `test_step` annotations
- `test_step_duration`- duration for each `test_step`
- `test_step_error_count` - count of `test_step` that finished with status `error`
- `test_step_total_error` - count of `test_step` with any status (`error`, `passed`, `interrupted`, `timedOut`)
- `test_step` - information for each `test_step`

added `description` meta info for such metrics as experiment:

- `test_step_total_count`
- `test_step_total_duration`
- `test_annotation_count`
- `test_step_duration`
- `test_attachment_size`
- `test_step_error_count`
- `test_step_total_error`
- `test_step`
- `pw_stderr`
- `pw_stdout`
- `pw_config`
- `test_attachment_count`
- `test_attachment_size`

### 🐛 Fixes

- fix issue with wrong output file for package

### 🏡 Chore/Infra/Internal/Tests

- update `pnpm` version in github pipelines (`pr.yaml` and `release.yaml`)
- drop nodejs18 support in build stage(`pr.yaml`) due to end of maintenance nodejs official support
