# Web3Auth Timestamp Refresh Bugfix Design

## Overview

The bug occurs when users attempt to connect their Web3Auth SFA wallet using a stale Google OAuth `id_token` stored in the NextAuth JWT. Web3Auth enforces a strict 6-minute timestamp validation, rejecting tokens with "timesigned is more than 6m0s ago" errors. The current implementation captures the `id_token` once at sign-in and reuses it indefinitely, causing failures for returning users.

The fix implements a token freshness check before Web3Auth connection and refreshes the Google OAuth token when needed. This ensures the `id_token` is always less than 6 minutes old when passed to Web3Auth, while preserving existing behavior for fresh tokens and non-Google authentication methods (MetaMask/SIWE).

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a Google OAuth `id_token` stored in NextAuth JWT is more than 6 minutes old and is used to connect Web3Auth SFA
- **Property (P)**: The desired behavior - Web3Auth SFA connection succeeds because the `id_token` is fresh (less than 6 minutes old)
- **Preservation**: Existing authentication flows (fresh tokens, MetaMask/SIWE, session management) that must remain unchanged
- **id_token**: The JWT issued by Google OAuth containing user identity claims and a timestamp (`iat` - issued at)
- **refresh_token**: OAuth token used to obtain a new `id_token` without requiring user re-authentication
- **NextAuth JWT**: The session token managed by NextAuth that stores user data including the `id_token`
- **Web3Auth SFA**: Single Factor Auth service that creates a wallet from a social login token with strict timestamp validation
- **connectSFA**: Function in `src/lib/web3auth-sfa.ts` that initiates Web3Auth connection using an `id_token`
- **authOptions**: NextAuth configuration in `src/app/api/auth/[...nextauth]/route.ts` that defines providers and JWT callbacks

## Bug Details

### Bug Condition

The bug manifests when a user with a valid NextAuth session attempts to connect their Web3Auth wallet, but the stored Google OAuth `id_token` is stale. The `connectSFA` function in `src/lib/web3auth-sfa.ts` receives the expired token and Web3Auth's timestamp validation rejects it, preventing wallet connection.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { idToken: string, tokenIssuedAt: number, currentTime: number }
  OUTPUT: boolean
  
  RETURN input.idToken IS NOT NULL
         AND input.idToken IS from Google OAuth provider
         AND (input.currentTime - input.tokenIssuedAt) > 360 seconds
         AND user attempts Web3Auth SFA connection
END FUNCTION
```

### Examples

- **Example 1**: User signs in with Google at 10:00 AM (token issued). User returns at 10:07 AM and navigates to dashboard → Web3Auth connection fails with "timesigned is more than 6m0s ago"
- **Example 2**: User signs in with Google at 2:00 PM (token issued). User closes browser, returns at 2:10 PM with session still valid → Automatic Web3Auth connection attempt fails silently in useEffect
- **Example 3**: User signs in with Google at 9:00 AM (token issued). User leaves tab open, returns at 11:00 AM → Any page requiring wallet connection fails because token is hours old
- **Edge Case**: User signs in with Google and immediately connects wallet (within 6 minutes) → Should continue to work without any token refresh

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Initial Google OAuth sign-in flow must continue to capture and store the `id_token` in NextAuth JWT
- Fresh tokens (less than 6 minutes old) must continue to work without unnecessary refresh requests
- MetaMask/wallet (SIWE) authentication must continue to work without requiring any `id_token` or Web3Auth interaction
- NextAuth session management (30-day max age) must remain unchanged
- Other NextAuth callbacks and session data must remain unaffected

**Scope:**
All inputs that do NOT involve connecting Web3Auth with a stale Google `id_token` should be completely unaffected by this fix. This includes:
- All MetaMask/SIWE authentication flows
- Google OAuth initial sign-in (first 6 minutes)
- Session validation and user data retrieval
- Non-wallet-related authenticated API requests

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing Token Expiration Tracking**: The NextAuth JWT callback captures `account.id_token` on sign-in but does not store the token's issued-at timestamp (`iat`). Without this metadata, the application cannot determine if the token is stale before attempting Web3Auth connection.

2. **No Token Refresh Mechanism**: NextAuth's Google provider receives a `refresh_token` from Google OAuth but never stores or uses it. When the `id_token` becomes stale, there is no mechanism to obtain a fresh token without forcing user re-authentication.

3. **Missing Pre-Connection Validation**: The `useAuth` hook's useEffect automatically attempts Web3Auth connection whenever `idToken` is present, without checking token age. This causes silent failures for returning users with stale tokens.

4. **Lack of Refresh Token Storage**: Google's OAuth response includes `account.refresh_token`, but it is not captured in the NextAuth JWT callback, making token refresh impossible even if freshness checking were implemented.

## Correctness Properties

Property 1: Bug Condition - Stale Token Refresh

_For any_ Google OAuth authenticated user where the stored `id_token` issued-at timestamp is more than 6 minutes old, the fixed system SHALL refresh the Google OAuth token to obtain a fresh `id_token` before attempting Web3Auth SFA connection, ensuring the connection succeeds without timestamp validation errors.

**Validates: Requirements 2.2, 2.3, 2.4**

Property 2: Preservation - Fresh Token Behavior

_For any_ Google OAuth authenticated user where the stored `id_token` is less than 6 minutes old, the fixed system SHALL use the existing token without performing any refresh request, preserving the current direct-connection behavior.

**Validates: Requirements 3.4**

Property 3: Preservation - Non-Google Auth Methods

_For any_ user authenticating with MetaMask/wallet (SIWE), the fixed system SHALL continue to authenticate and operate without requiring any `id_token`, refresh token, or Web3Auth SFA connection, preserving the existing SIWE authentication flow completely unchanged.

**Validates: Requirements 3.2**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, the following changes are needed:

**File**: `src/app/api/auth/[...nextauth]/route.ts`

**Function**: `jwt` callback in `authOptions.callbacks`

**Specific Changes**:

1. **Capture Token Metadata**: Store `refresh_token` and `id_token` issued-at timestamp alongside the token
   - Extract `iat` (issued-at) from decoded `id_token` JWT payload
   - Store `account.refresh_token` in NextAuth JWT token
   - Store decoded `iat` as `token.idTokenIssuedAt`

2. **Implement Token Freshness Check**: Add logic to check if stored `id_token` is older than 5 minutes
   - Compare current time with `token.idTokenIssuedAt`
   - Use 5-minute threshold (300 seconds) to provide buffer before Web3Auth's 6-minute limit

3. **Implement Token Refresh Logic**: Add function to refresh Google OAuth token using refresh token
   - Create new API endpoint `/api/auth/refresh-google-token` or inline refresh logic
   - Use Google's OAuth token endpoint: `https://oauth2.googleapis.com/token`
   - Send POST request with `refresh_token`, `client_id`, `client_secret`, `grant_type=refresh_token`
   - Extract new `id_token` from response
   - Update `token.idToken` and `token.idTokenIssuedAt` in JWT

4. **Update Session Callback**: Ensure refreshed token is propagated to session
   - Pass updated `token.idToken` to `session.user.idToken`
   - Pass `token.idTokenIssuedAt` to `session.user.idTokenIssuedAt` for client-side checking

5. **Add Error Handling**: Handle refresh failures gracefully
   - If refresh fails (invalid refresh token, expired refresh token, network error), clear stale tokens
   - Log refresh failures for debugging
   - Consider triggering re-authentication flow if refresh fails repeatedly

**File**: `src/lib/useAuth.ts`

**Function**: useEffect that calls `connectSFA`

**Specific Changes**:

1. **Add Token Age Check Before Connection**: Validate token freshness before attempting Web3Auth connection
   - Check if `session?.user?.idTokenIssuedAt` exists
   - Calculate age: `(Date.now() / 1000) - idTokenIssuedAt`
   - Only proceed with `connectSFA` if age < 300 seconds (5 minutes)

2. **Trigger Session Refresh for Stale Tokens**: Force NextAuth to run JWT callback to refresh token
   - If token is stale, call `update()` from `useSession()` to trigger JWT callback
   - Wait for session update to complete before retrying connection
   - Add retry logic with exponential backoff if refresh fails

3. **Add User Feedback**: Show loading states and error messages for token refresh
   - Display toast notification if token refresh is in progress
   - Show error message if refresh fails and connection cannot proceed
   - Provide option to re-authenticate if refresh is not possible

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis regarding missing token refresh and expiration tracking.

**Test Plan**: Write tests that simulate Google OAuth sign-in, manually advance time by 7 minutes (using mocked Date.now() or test utilities), then attempt Web3Auth connection. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Stale Token Connection Test**: Sign in with Google, advance time 7 minutes, attempt Web3Auth connection → Should fail with "timesigned is more than 6m0s ago" (will fail on unfixed code)
2. **Missing Refresh Token Test**: Inspect NextAuth JWT after Google sign-in → Should show `refresh_token` is not stored (will confirm root cause)
3. **Missing IAT Test**: Inspect NextAuth JWT after Google sign-in → Should show `id_token` issued-at timestamp is not stored (will confirm root cause)
4. **Fresh Token Test**: Sign in with Google, immediately attempt Web3Auth connection → Should succeed (will pass on unfixed code, establishes baseline)

**Expected Counterexamples**:
- Web3Auth rejects tokens with timestamp errors after 6 minutes
- NextAuth JWT does not contain `refresh_token` or `idTokenIssuedAt` fields
- No token refresh occurs automatically when token becomes stale
- Possible causes: missing metadata capture, no refresh implementation, no freshness validation

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (stale Google OAuth token), the fixed function produces the expected behavior (successful Web3Auth connection via token refresh).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := attemptWeb3AuthConnection_fixed(input)
  ASSERT result.connectionSucceeded = TRUE
  ASSERT result.error IS NULL
  ASSERT result.idToken IS fresh (age < 360 seconds)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (fresh tokens, non-Google auth), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT attemptWeb3AuthConnection_original(input) = attemptWeb3AuthConnection_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (different auth methods, token ages, session states)
- It catches edge cases that manual unit tests might miss (boundary conditions around 6-minute threshold)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for fresh tokens and MetaMask auth, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Fresh Token Preservation**: Generate random token ages between 0-5 minutes, verify Web3Auth connection succeeds without any refresh API calls on both unfixed and fixed code
2. **MetaMask Auth Preservation**: Sign in with MetaMask/SIWE, verify authentication flow works identically without any token refresh logic triggered
3. **Session Management Preservation**: Verify NextAuth session lifecycle (creation, validation, expiration) remains unchanged for both Google and MetaMask auth
4. **Non-Wallet API Preservation**: Make authenticated API requests that don't require wallet connection, verify responses are identical

### Unit Tests

- Test `jwt` callback with Google OAuth account including `refresh_token` and verify metadata is stored
- Test token age calculation logic with various timestamps (0 seconds, 300 seconds, 360 seconds, 1 hour)
- Test token refresh API call with mocked Google OAuth endpoint responses (success, 401, 500, network error)
- Test `useAuth` useEffect logic with fresh token (should connect immediately without refresh)
- Test `useAuth` useEffect logic with stale token (should trigger refresh then connect)
- Test refresh failure handling (should clear stale token and show error)
- Test MetaMask sign-in flow end-to-end (should not trigger any token refresh logic)

### Property-Based Tests

- Generate random Google OAuth responses with varying token ages and verify correct refresh decisions (refresh if > 5min, skip if < 5min)
- Generate random session states (authenticated/unauthenticated, various providers, with/without wallet) and verify Web3Auth connection logic only runs for Google + authenticated + has idToken
- Generate random time progressions and verify token remains fresh after automatic refreshes
- Generate random auth method sequences (Google → MetaMask, MetaMask → Google) and verify state transitions work correctly

### Integration Tests

- Test full Google OAuth sign-in → immediate wallet connection flow (should work without refresh)
- Test full Google OAuth sign-in → wait 7 minutes → trigger wallet connection flow (should auto-refresh token and connect)
- Test Google sign-in → close browser → return after 10 minutes → automatic wallet connection attempt (should refresh and connect silently)
- Test refresh token expiration scenario (simulate 30-day refresh token expiry, verify graceful re-authentication prompt)
- Test network failure during refresh (verify error handling and user feedback)
- Test concurrent refresh requests (multiple tabs attempting connection simultaneously with stale token)
