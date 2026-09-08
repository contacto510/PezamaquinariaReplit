---
name: Object storage bucket config
description: How to initialize @replit/object-storage Client in this project
---
`new Client()` from @replit/object-storage fails with "A bucket name is needed" because `REPLIT_BUCKET_ID` is not set in this repl. Always pass `new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })`.

**Why:** the default constructor expects `REPLIT_BUCKET_ID`, which this project never exports; only `DEFAULT_OBJECT_STORAGE_BUCKET_ID` exists as a secret.

**How to apply:** any new server code that touches object storage. Repair photos are stored under `public/repairs/...` and served via `GET /public/repairs/:filename` (relative URLs in DB); `uploadFromBytes` does not accept a `contentType` option in the installed version — content type is inferred from extension when serving.
