# Amelia Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every user document, PII record, config, memory, chat session, and message resides under `/users/{userId}` and can ONLY be read or written by the authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email is strictly isolated in `/users/{userId}/private/info` and never stored on `/users/{userId}` or shared docs.
3. **Master Gate**: Every subcollection (`memories`, `sessions`, `messages`, `config`) verifies parent ownership; `messages` verifies the parent session document exists (`exists(...)`) and belongs to `request.auth.uid`.
4. **Immutable Ownership & Temporal Integrity**: `ownerId` / `uid` and `createdAt` cannot be modified after creation. All `createdAt` (on create) and `updatedAt` (on create & update) MUST equal `request.time`.
5. **Bounded Arrays & Strings**: Every string has strict `.size()` bounds; `memorySuggestions` is capped at `.size() <= 2` and validated on element 0 if non-empty.
6. **Zero Shadow Fields**: `keys().hasAll(...)` + `keys().hasOnly(...)` on create, and `diff(existing()).affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: `request.auth == null` reading `/users/userA/sessions/s1`.
2. **Unverified Email Write**: `request.auth.uid == 'userA'`, `email_verified == false` creating a memory.
3. **Cross-User Spoofing**: `userB` attempting to read or write `/users/userA/memories/m1`.
4. **UID Forgery on Create**: `userA` writing `/users/userA/memories/m1` with `ownerId: 'userB'`.
5. **Shadow / Ghost Field Injection**: `userA` creating a memory with extra field `isAdmin: true`.
6. **Immutable `createdAt` Tampering**: `userA` updating a session and changing `createdAt`.
7. **Forged Client Timestamp**: `userA` creating a message with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time`.
8. **ID Poisoning**: Document ID > 128 chars or containing invalid characters (`../evil`).
9. **Denial-of-Wallet Large String**: `content` exceeding 12,000 chars on message or 400 chars on memory.
10. **Orphan Message Write**: Creating a message in `/users/userA/sessions/nonexistent/messages/m1` where parent session does not exist.
11. **Unbounded Array Abuse**: Setting `memorySuggestions` with 10 items (must reject > 2 items).
12. **Blanket List Scraping**: Listing `/users/userA/memories` without `resource.data.ownerId == request.auth.uid` (query must filter to owner).
