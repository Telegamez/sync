# Test Type Errors Assessment

**Date:** 2025-12-16
**Total Errors:** 214
**Affected Files:** 12

## Summary

The pre-push hook runs `tsc --noEmit` which fails due to type errors in test files. These errors prevent normal `git push` and require `--no-verify` to bypass.

## Error Breakdown by Type

| Error Code | Count | Description                                      |
| ---------- | ----- | ------------------------------------------------ |
| TS2322     | 183   | Type mismatch - mostly `vi.fn()` mock types      |
| TS2349     | 10    | Expression not callable - test context issues    |
| TS2339     | 8     | Property doesn't exist - `.mockImplementation`   |
| TS2353     | 4     | Object literal property issues                   |
| TS2741     | 2     | Missing required property (`transcriptSettings`) |
| TS2561     | 2     | Unknown property                                 |
| TS2345     | 2     | Argument type mismatch                           |
| TS7006     | 1     | Implicit `any` type                              |
| TS2769     | 1     | No overload matches                              |
| TS2551     | 1     | Property typo                                    |

## Affected Files

| File                                            | Approx Errors | Primary Issue                      |
| ----------------------------------------------- | ------------- | ---------------------------------- |
| `tests/unit/components/CreateRoomForm.test.tsx` | ~25           | Mock types                         |
| `tests/unit/components/RoomCard.test.tsx`       | ~20           | Mock types                         |
| `tests/unit/components/RoomLobby.test.tsx`      | ~40           | Mock types                         |
| `tests/unit/hooks/useRoomConnection.test.ts`    | ~30           | Mock types                         |
| `tests/unit/hooks/useSharedAI.test.ts`          | ~20           | Mock types                         |
| `tests/unit/hooks/useTurnManager.test.ts`       | ~15           | Mock types + `.mockImplementation` |
| `tests/unit/db/queries.test.ts`                 | ~30           | Mock types                         |
| `tests/unit/signaling/custom-server.test.ts`    | ~10           | Test context callable              |
| `tests/unit/types/room.test.ts`                 | ~2            | Missing `transcriptSettings`       |
| `tests/unit/audio/peer-visualization.test.ts`   | ~1            | Outdated option                    |
| `tests/unit/reliability/reconnection.test.ts`   | ~1            | Type inference                     |
| `tests/e2e/multi-peer.spec.ts`                  | ~4            | Outdated types                     |

## Detailed Fixes Required

### 1. Vitest Mock Type Issues (183 errors)

**Problem:** `vi.fn()` returns `Mock<Procedure | Constructable>` which doesn't match expected function signatures.

**Current (broken):**

```typescript
const onSubmit = vi.fn();
// Error: Type 'Mock<Procedure | Constructable>' is not assignable to type '(data: CreateRoomRequest) => void'
```

**Fix options:**

```typescript
// Option A: Generic type parameter
const onSubmit = vi.fn<(data: CreateRoomRequest) => void>();

// Option B: Type assertion
const onSubmit = vi.fn() as Mock<(data: CreateRoomRequest) => void>;

// Option C: Satisfies with implementation
const onSubmit = vi.fn().mockImplementation((data: CreateRoomRequest) => {});
```

### 2. Test Context Callable Issues (10 errors)

**Location:** `tests/unit/signaling/custom-server.test.ts`

**Problem:** Test context being called as a function incorrectly.

**Example error:**

```
error TS2349: This expression is not callable.
  Type 'TestContext' has no call signatures.
```

**Fix:** Review test structure and ensure proper Vitest `describe`/`it`/`test` patterns.

### 3. Missing `.mockImplementation` (8 errors)

**Location:** `tests/unit/hooks/useTurnManager.test.ts`

**Problem:** Calling `.mockImplementation` on functions that aren't mocks.

**Example error:**

```
error TS2339: Property 'mockImplementation' does not exist on type '...'
```

**Fix:** Ensure the function is properly created with `vi.fn()` before calling mock methods.

### 4. Missing `transcriptSettings` Property (2 errors)

**Location:** `tests/unit/types/room.test.ts`

**Problem:** The `Room` type now requires `transcriptSettings` but test objects don't include it.

**Fix:**

```typescript
const room: Room = {
  // ... existing properties
  transcriptSettings: {
    enabled: false,
    provider: "none",
    // ... other required fields
  },
};
```

### 5. Outdated Type Properties (4 errors)

**Location:** `tests/e2e/multi-peer.spec.ts`

**Problems:**

- `aiResponseLocking` doesn't exist on `RoomVoiceSettings`
- `peerId` doesn't exist on `RoomLeftPayload`
- `ai:audio` event doesn't exist in `SignalingEventHandlers`

**Fix:** Update tests to use current type definitions from source.

### 6. Outdated Options (1 error)

**Location:** `tests/unit/audio/peer-visualization.test.ts`

**Problem:** `useAnimationFrame` doesn't exist on `PeerVisualizerOptions`

**Fix:** Remove or update the option to match current interface.

## Recommended Fix Order

1. **Create shared mock utilities** - Define typed mock factories to reduce boilerplate
2. **Fix Room type tests** - Add `transcriptSettings` to test fixtures
3. **Fix e2e tests** - Update outdated type references
4. **Fix component tests** - Apply typed mocks
5. **Fix hook tests** - Apply typed mocks and fix `.mockImplementation` calls
6. **Fix signaling tests** - Review test context structure

## Workaround

Until fixed, use `--no-verify` flag:

```bash
git push --no-verify
```

## Estimated Effort

- **Quick fix (type assertions):** ~2-3 hours
- **Proper fix (typed mock utilities):** ~4-6 hours
