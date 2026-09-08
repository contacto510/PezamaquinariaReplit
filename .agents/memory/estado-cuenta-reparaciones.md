---
name: Estado de cuenta y reparaciones duplicadas
description: User double-captures repairs as rental reports; estado de cuenta uses R-XX folios only
---
The user captures each repair twice: in the Repairs panel (folio R-XX) and as a rental report with obra "REPARACION" (folio REP-XX, same amount).

**Why:** Combining both sources in the Estado de Cuenta Resumido double-counted repair charges. User confirmed (Aug 2026) that repairs must come **only from the Repairs panel (R-XX)**.

**How to apply:** The Estado de Cuenta Resumido excludes reports whose nombreObra (accent-insensitive) starts with "REPARACION" and includes repairs via /api/clients/:id/repairs. Keep this rule in any future statement/report feature that merges reports and repairs.

For repair rows, the PERÍODO column must show the repair's received date through delivery date. If no delivery date exists yet, show the received date through “En proceso”; do not repeat the equipment name in this column.

**Why:** The user confirmed this represents the actual repair period and avoids duplicating the equipment description already shown under OBRA.

**How to apply:** Format both dates as Mexican business dates without timezone shifting. This rule applies to summarized account statements that include R-XX repairs.
