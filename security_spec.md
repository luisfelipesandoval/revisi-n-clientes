# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Default Deny Catch-All**: Any path outside `/projects/{projectId}` and `/comments/{commentId}` is unconditionally denied (`allow read, write: if false;`).
2. **Admin Identity Invariant**: Admin privileges require `request.auth != null && request.auth.token.email_verified == true && request.auth.token.email == 'chat.gpt.sandoval@gmail.com'`. Unverified email tokens are strictly rejected.
3. **Project Isolation & Listing Invariant**:
   - Anyone with a valid `projectId` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) can read (`get`) that single project document.
   - Listing projects (`list`) is strictly restricted to the verified admin (`isAdmin()`). Non-admins cannot enumerate `/projects`.
4. **Project Creation & Deletion Invariant**: Only the verified admin can create or delete a project document.
5. **Project Tiered Update Invariant**:
   - **Tier 1 (Admin)**: May update editable project fields (`title`, `clientName`, `videoUrl`, `price`, `currency`, `showPrice`, `watermarkEnabled`, `watermarkText`, `status`, `whatsappNumber`, `updatedAt`) while preserving `createdAt` immutability and setting `updatedAt == request.time`.
   - **Tier 2 (Public Client with Link)**: May ONLY update the `status` field (`incoming().diff(existing()).affectedKeys().hasOnly(['status'])`) to one of `['En revisión', 'Cambios solicitados', 'Aprobado']`. No other field (`price`, `title`, `videoUrl`, `showPrice`, `watermarkEnabled`, etc.) can ever be modified by a non-admin.
6. **Comment Relational & Integrity Invariant**:
   - Creating a comment requires a valid `commentId`, strict key/type/size validation (`isValidComment`), `resolved == false`, `createdAt == request.time`, and that the referenced `/projects/$(incoming().projectId)` document exists (`exists(...)`).
   - Only the verified admin can update a comment (specifically toggling `resolved` while keeping `projectId`, `authorName`, `text`, `videoSecond`, and `createdAt` immutable) or delete a comment.

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)

1. **Payload 1 (Unverified Admin Email Spoof)**: Authenticated user with `email: 'chat.gpt.sandoval@gmail.com'` and `email_verified: false` attempts to `create` a project. -> `PERMISSION_DENIED`
2. **Payload 2 (Unauthorized Project Listing)**: Anonymous or non-admin authenticated user attempts `list` on `/projects`. -> `PERMISSION_DENIED`
3. **Payload 3 (Client Price Tampering)**: Client with link attempts `update` on `/projects/proj-1` changing `price: 0` alongside `status: 'Aprobado'`. -> `PERMISSION_DENIED`
4. **Payload 4 (Client Invalid Status Injection)**: Client attempts `update` on `/projects/proj-1` setting `status: 'Pagado'` (outside `['En revisión', 'Cambios solicitados', 'Aprobado']`). -> `PERMISSION_DENIED`
5. **Payload 5 (Shadow Field Injection on Project)**: Admin or client sends extra field `isAdminBypass: true` on `/projects/proj-1`. -> `PERMISSION_DENIED`
6. **Payload 6 (Resource Poisoning Oversized String)**: Client creates a comment with `text` of 5,000 characters (`> 1000` limit). -> `PERMISSION_DENIED`
7. **Payload 7 (Orphaned Comment Write)**: Client creates a comment referencing `projectId: 'non-existent-project-999'` where the parent project does not exist. -> `PERMISSION_DENIED`
8. **Payload 8 (Pre-Resolved Comment Injection)**: Client creates a comment with `resolved: true` on creation. -> `PERMISSION_DENIED`
9. **Payload 9 (Client Resolving/Editing Comment)**: Non-admin client attempts to update `resolved: true` or edit `text` on an existing comment `/comments/comm-1`. -> `PERMISSION_DENIED`
10. **Payload 10 (Client Deleting Project or Comment)**: Non-admin client attempts `delete` on `/projects/proj-1` or `/comments/comm-1`. -> `PERMISSION_DENIED`
11. **Payload 11 (Timestamp Forgery on Comment Create)**: Client attempts `create` on `/comments/comm-1` with a past or future forged `createdAt` timestamp not equal to `request.time`. -> `PERMISSION_DENIED`
12. **Payload 12 (ID Poisoning Attack)**: Client attempts to create a comment with malformed ID containing special characters or exceeding 128 chars. -> `PERMISSION_DENIED`
