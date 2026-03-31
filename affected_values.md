# affected_values

This file lists the metadata values now used by the Validation page meta-box and how they are populated per extraction page type.

## Shared behavior (all pages of one PDF record)
- The meta-box is shared at record level and displayed identically on every page of the same extracted PDF.
- If one of these fields is edited in Validation, the edited value is propagated to all pages of that record:
  - Academic Year
  - Level
  - Specialization
  - Title
- On save, these values are written to every page result as:
  - annee = Academic Year
  - anneeEtude = Level
  - section = Specialization
  - title = Title

## Source priority used to initialize values
Initialization now follows this strict rule:
1. If there is at least one cover or first_cover page: values are taken only from cover pages.
2. If there is no cover page: values are taken from multiple_students first, then single_student, then other page types.

Within the selected source group(s), first non-empty values are used.

## Field values by case

### Case: cover or first_cover page
- Academic Year: first non-empty from
  - result.annee
  - result.year
  - result.student.year
- Level: first non-empty from
  - result.anneeEtude
  - result.level
- Specialization: first non-empty from
  - result.section
  - result.option
  - result.sectionCode
- Title: first non-empty from
  - result.title
  - result.student.section
  - result.section
  - result.option
  - result.sectionCode

### Case: multiple_students page
- Academic Year: first non-empty from
  - result.annee
  - result.year
  - result.student.year
- Level: first non-empty from
  - result.anneeEtude
  - result.level
- Specialization: first non-empty from
  - result.section
  - result.option
  - result.sectionCode
- Title: first non-empty from
  - result.title
  - result.student.section
  - result.section
  - result.option
  - result.sectionCode

### Case: single_student page
- Academic Year: first non-empty from
  - result.annee
  - result.year
  - result.student.year
- Level: first non-empty from
  - result.anneeEtude
  - result.level
- Specialization: first non-empty from
  - result.section
  - result.option
  - result.sectionCode
- Title: first non-empty from
  - result.title
  - result.student.section
  - result.section
  - result.option
  - result.sectionCode

### Case: no value found
- UI shows N/A for empty fields.
- During editing, N/A is treated as empty.
