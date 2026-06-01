---
name: Project tab / form editors
description: Two separate admin editors for project tabs, and the custom-field entityType contract they must honor
---

# Two parallel project-tab editors

There are TWO distinct admin editors that place fields into project tabs. They are
independent components and a bug fixed in one is NOT automatically fixed in the other:

- **Project Form Layout** — `client/src/components/settings/ProjectFormLayoutSection.tsx`.
  Its `AddItemPicker` already has a search box + Fields/Custom Fields/Blocks tabs.
- **Custom Tabs** ("Create custom tabs for project details") —
  `client/src/components/settings/CustomTabsSection.tsx`. Separate feature, separate
  field picker (`showFieldPicker` dialog). When a user says "project tabs" they usually
  mean THIS one.

# Custom-field entityType contract for project tabs

Any picker that lets admins add custom fields to a project tab must offer custom fields
where `entityType` is `'project'` OR `'intake'` (default missing → `'project'`).

**Why:** the actual project-view renderer `CustomTabRenderer` in
`client/src/pages/ProjectDetails.tsx` already filters to project+intake. If a picker
only offers `'project'`, intake-carry custom fields render fine but can never be added —
that surfaces as "I don't see the full list of custom fields."

**How to apply:** keep picker field filters in sync with the renderer's filter. Custom
fields are keyed as `customField:<id>` with `type: 'custom'`; the renderer parses that
exact prefix in getFieldValue / getFieldLabel / handleSave — do not change the key shape.
