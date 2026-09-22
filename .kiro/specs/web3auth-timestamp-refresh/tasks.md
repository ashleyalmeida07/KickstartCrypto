# Implementation Plan

## Overview
This plan implements a token freshness check and automatic refresh mechanism to resolve the Web3Auth timestamp validation bug. The fix ensures Google OAuth `id_token` is always less than 6 minutes old when connecting Web3Auth SFA.

---

## Phase 1: Bug Condition Exploration (BEFORE Fix)

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Stale Token Connection Failure
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that Web3Auth rejects stale tokens
  - **Scoped PBT Approach**: Scope property to concrete failing case - Google OAuth token older than 6 minutes used for Web3Auth connection
  - Test setup:
    - Mock Google OAuth sign-in flow to capture initial `id_token`
    - Inspect NextAuth JWT to verify current implementation does NOT store `refresh_token` or `idTokenIssuedAt`
    - Advance system time by 7 minutes (420 seconds) using mocked `Date.now()`
    - Attempt Web3Auth SFA connection with stale token
  - Test assertions (matching Expected Behavior Properties):
    - ASSERT NextAuth JWT lacks `refresh_token` field (confirms root cause)
    - ASSERT NextAuth JWT lacks `idTokenIssuedAt` field (confirms root cause)
    - ASSERT Web3Auth connection fails with "timesigned is more than 6m0s ago" error
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples:
    - Record exact error message from Web3Auth
    - Record missing JWT fields
    - Record token age at failure point
    - Take screenshot of console errors if applicable
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.2, 2.3, 2.4_

---

## Phase 2: Preservation Property Tests (BEFORE Fix)

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Fresh Token and Non-Google Auth Behaviors
  - **IMPORTANT**: Follow observation-first methodology
  
  ### Test 2.1: Fresh Token Preservation (Observe on UNFIXED code)
  - Observe: Sign in with Google OAuth, immediately attempt Web3Auth connection (within 1 minute)
  - Observe: Connection succeeds without any refresh API calls
  - Observe: No additional network requests to Google OAuth token endpoint
  - Write property-based test: FOR ALL token ages < 300 seconds (5 minutes), Web3Auth connection succeeds using existing token without refresh
  - Generate test cases with random token ages: 0s, 30s, 60s, 180s, 299s
  - Verify test passes on UNFIXED code
  
  ### Test 2.2: MetaMask/SIWE Auth Preservation (Observe on UNFIXED code)
  - Observe: Sign in with MetaMask/wallet using SIWE flow
  - Observe: Authentication completes successfully
  - Observe: No `id_token`, `refresh_token`, or Web3Auth SFA involvement
  - Observe: Wallet connection uses direct provider, not SFA
  - Write property-based test: FOR ALL MetaMask/SIWE authentication flows, system authenticates without any Google OAuth token logic
  - Generate test cases with different wallet addresses and signatures
  - Verify test passes on UNFIXED code
  
  ### Test 2.3: Session Management Preservation (Observe on UNFIXED code)
  - Observe: NextAuth session lifecycle (creation, validation, refresh, expiration at 30 days)
  - Observe: Session data structure and user properties
  - Observe: JWT callback execution timing and triggers
  - Write property-based test: FOR ALL session operations (getSession, useSession), behavior remains identical
  - Generate test cases with different session states and time progressions
  - Verify test passes on UNFIXED code
  
  ### Test 2.4: Non-Wallet API Preservation (Observe on UNFIXED code)
  - Observe: Make authenticated API requests that don't require wallet connection (e.g., user profile, campaign list)
  - Observe: Responses are successful with valid session
  - Observe: No token refresh logic is triggered
  - Write property-based test: FOR ALL authenticated non-wallet API requests, responses remain unchanged
  - Generate test cases with different API endpoints and request methods
  - Verify test passes on UNFIXED code
  
  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.2, 3.4_

---

## Phase 3: Implementation

- [ ] 3. Implement Web3Auth token refresh mechanism

  - [ ] 3.1 Capture token metadata in NextAuth JWT callback
    - File: `src/app/api/auth/[...nextauth]/route.ts`
    - Function: `jwt` callback in `authOptions.callbacks`
    - Changes:
      - Store `account.refresh_token` in NextAuth JWT: `token.refreshToken = account.refresh_token`
      - Decode `account.id_token` JWT to extract `iat` (issued-at) claim
      - Store issued-at timestamp: `token.idTokenIssuedAt = decodedToken.iat`
      - Keep existing `token.idToken = account.id_token` logic
      - Ensure metadata is only captured on initial sign-in (when `account` exists)
    - _Bug_Condition: isBugCondition(input) where input.idToken is from Google OAuth AND (currentTime - idTokenIssuedAt) > 360 seconds_
    - _Expected_Behavior: System captures refresh_token and idTokenIssuedAt on sign-in to enable freshness checking_
    - _Preservation: NextAuth JWT structure for non-Google providers remains unchanged_
    - _Requirements: 2.1, 2.2_

  - [ ] 3.2 Implement token freshness check
    - File: `src/app/api/auth/[...nextauth]/route.ts`
    - Function: `jwt` callback in `authOptions.callbacks`
    - Changes:
      - Calculate token age: `const tokenAge = (Date.now() / 1000) - token.idTokenIssuedAt`
      - Check if refresh needed: `const needsRefresh = tokenAge > 300` (5-minute threshold for buffer)
      - Only check for Google provider: `if (token.provider === 'google' && token.idToken && needsRefresh)`
      - Skip check if no `idTokenIssuedAt` or `refreshToken` available
    - _Bug_Condition: Token age > 360 seconds triggers bug; 300-second threshold provides safety buffer_
    - _Expected_Behavior: System correctly identifies stale tokens before Web3Auth connection attempt_
    - _Preservation: Fresh tokens (< 300s) skip refresh logic entirely_
    - _Requirements: 2.2, 3.4_

  - [ ] 3.3 Implement Google OAuth token refresh logic
    - File: `src/app/api/auth/[...nextauth]/route.ts`
    - Function: New async function `refreshGoogleAccessToken(refreshToken: string)`
    - Changes:
      - Create POST request to Google's token endpoint: `https://oauth2.googleapis.com/token`
      - Request body: `{ refresh_token, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }`
      - Parse response to extract new `id_token`: `const { id_token } = await response.json()`
      - Decode new `id_token` to get fresh `iat` timestamp
      - Return object: `{ idToken: id_token, issuedAt: decodedToken.iat }`
      - Add error handling for network failures, 401 unauthorized, invalid tokens
      - Log refresh attempts and failures for debugging
    - _Bug_Condition: Without refresh mechanism, stale tokens cannot be renewed_
    - _Expected_Behavior: System obtains fresh id_token using refresh_token when needed_
    - _Preservation: Refresh only occurs for stale Google tokens; other auth methods unaffected_
    - _Requirements: 2.3_

  - [ ] 3.4 Integrate token refresh into JWT callback
    - File: `src/app/api/auth/[...nextauth]/route.ts`
    - Function: `jwt` callback in `authOptions.callbacks`
    - Changes:
      - Call refresh function when `needsRefresh` is true: `const refreshed = await refreshGoogleAccessToken(token.refreshToken)`
      - Update JWT with fresh token: `token.idToken = refreshed.idToken`
      - Update issued-at timestamp: `token.idTokenIssuedAt = refreshed.issuedAt`
      - Handle refresh failures gracefully:
        - If refresh fails (expired refresh token, network error), clear stale token: `token.idToken = null`
        - Log error for debugging: `console.error('Token refresh failed:', error)`
        - Consider setting error flag: `token.refreshError = true`
      - Ensure token is returned from callback with updates
    - _Bug_Condition: Integration ensures stale tokens are refreshed before Web3Auth connection_
    - _Expected_Behavior: NextAuth JWT always contains fresh id_token (< 300s old) when Google authenticated_
    - _Preservation: Callback continues to handle all other NextAuth operations unchanged_
    - _Requirements: 2.3, 2.4_

  - [ ] 3.5 Update session callback to expose token metadata
    - File: `src/app/api/auth/[...nextauth]/route.ts`
    - Function: `session` callback in `authOptions.callbacks`
    - Changes:
      - Pass refreshed `idToken` to session: `session.user.idToken = token.idToken`
      - Pass `idTokenIssuedAt` to session for client-side checks: `session.user.idTokenIssuedAt = token.idTokenIssuedAt`
      - Pass refresh error flag if present: `session.user.refreshError = token.refreshError`
      - Ensure existing session data (user email, name, etc.) remains unchanged
    - _Bug_Condition: Client-side code needs token metadata to validate freshness_
    - _Expected_Behavior: Session exposes fresh token and metadata to client_
    - _Preservation: Existing session properties remain unchanged_
    - _Requirements: 2.4_

  - [ ] 3.6 Add token age validation in useAuth hook
    - File: `src/lib/useAuth.ts` (or equivalent hook file)
    - Function: useEffect that calls `connectSFA`
    - Changes:
      - Before calling `connectSFA`, check token freshness:
        ```typescript
        const tokenAge = session?.user?.idTokenIssuedAt 
          ? (Date.now() / 1000) - session.user.idTokenIssuedAt 
          : Infinity;
        const isTokenFresh = tokenAge < 300; // 5-minute threshold
        ```
      - Only proceed with connection if token is fresh: `if (isTokenFresh && session?.user?.idToken)`
      - If token is stale, trigger session refresh: `await update()` (from useSession hook)
      - Add retry logic after session refresh completes
      - Skip all checks for non-Google auth methods (MetaMask/SIWE)
    - _Bug_Condition: Without client-side validation, stale tokens reach Web3Auth_
    - _Expected_Behavior: Client validates token freshness and triggers refresh if needed_
    - _Preservation: Fresh tokens connect immediately; MetaMask auth unaffected_
    - _Requirements: 2.2, 3.4_

  - [ ] 3.7 Add user feedback for token refresh
    - File: `src/lib/useAuth.ts` (or equivalent hook file)
    - Changes:
      - Add loading state: `const [isRefreshingToken, setIsRefreshingToken] = useState(false)`
      - Show loading indicator when refresh is triggered: `setIsRefreshingToken(true)` before `update()`
      - Clear loading state after refresh completes: `setIsRefreshingToken(false)`
      - Display error message if `session?.user?.refreshError` is true:
        - Show toast notification: "Session refresh failed. Please sign in again."
        - Provide re-authentication button/link
      - Display success message (optional): "Wallet connection ready" after successful refresh
    - _Bug_Condition: Users need visibility into token refresh process_
    - _Expected_Behavior: User sees feedback during refresh and clear error messages on failure_
    - _Preservation: No UI changes for fresh token or non-Google auth flows_
    - _Requirements: 2.4_

  - [ ] 3.8 Add comprehensive error handling
    - Files: `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/useAuth.ts`
    - Changes:
      - Handle network failures during refresh (timeout, offline, 500 errors):
        - Retry with exponential backoff (max 3 attempts)
        - If all retries fail, clear token and prompt re-auth
      - Handle expired refresh token (401 from Google):
        - Clear both `idToken` and `refreshToken` from JWT
        - Set session to require re-authentication
        - Show user message: "Your session has expired. Please sign in again."
      - Handle invalid/malformed tokens:
        - Log validation errors
        - Clear invalid tokens from session
        - Prevent Web3Auth connection attempt
      - Handle concurrent refresh requests:
        - Implement mutex/lock to prevent multiple simultaneous refreshes
        - Queue subsequent requests until first refresh completes
      - Add comprehensive logging:
        - Log refresh attempts with timestamps
        - Log success/failure outcomes
        - Include sanitized error details (no sensitive tokens)
    - _Bug_Condition: Robust error handling prevents edge case failures_
    - _Expected_Behavior: System gracefully handles all refresh failure scenarios_
    - _Preservation: Error handling does not interfere with successful flows_
    - _Requirements: 2.4_

  - [ ] 3.9 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Fresh Token After Refresh
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Test execution:
      - Sign in with Google OAuth (system now captures `refresh_token` and `idTokenIssuedAt`)
      - Advance time by 7 minutes (420 seconds)
      - Trigger NextAuth session access (should automatically refresh token)
      - Verify NextAuth JWT now contains fresh `idToken` with age < 300 seconds
      - Attempt Web3Auth SFA connection with refreshed token
    - **EXPECTED OUTCOME**: Test PASSES
      - ASSERT NextAuth JWT contains `refresh_token` field (root cause fixed)
      - ASSERT NextAuth JWT contains `idTokenIssuedAt` field (root cause fixed)
      - ASSERT Token was automatically refreshed (age reset to < 300s)
      - ASSERT Web3Auth connection succeeds without timestamp error (bug fixed)
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ] 3.10 Verify preservation tests still pass
    - **Property 2: Preservation** - Unchanged Behaviors
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run all preservation property tests from Phase 2:
      - Test 2.1: Fresh Token Preservation
      - Test 2.2: MetaMask/SIWE Auth Preservation
      - Test 2.3: Session Management Preservation
      - Test 2.4: Non-Wallet API Preservation
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
    - Verify behaviors:
      - Fresh Google tokens (< 5 min) connect immediately without refresh API calls
      - MetaMask/SIWE authentication works identically without any token logic
      - NextAuth session lifecycle operates unchanged
      - Non-wallet API requests work identically
    - If any test fails, investigate regression before proceeding
    - _Requirements: 3.2, 3.4_

---

## Phase 4: Comprehensive Testing

- [ ] 4. Write and run unit tests
  - File: Create `src/app/api/auth/__tests__/token-refresh.test.ts`
  - Test cases:
    - Test `jwt` callback with Google OAuth account captures `refresh_token` and `idTokenIssuedAt`
    - Test `jwt` callback with MetaMask account does NOT trigger token refresh logic
    - Test token age calculation with various timestamps (0s, 300s, 360s, 3600s)
    - Test `refreshGoogleAccessToken` function with mocked Google API responses:
      - Success: returns new `id_token` and `iat`
      - 401 Unauthorized: throws error with clear message
      - 500 Server Error: throws error and retries
      - Network timeout: throws error after timeout
    - Test `useAuth` hook with fresh token (< 5 min): connects immediately without refresh
    - Test `useAuth` hook with stale token (> 6 min): triggers refresh before connection
    - Test refresh failure handling: clears tokens and shows error to user
    - Test concurrent refresh requests: only one refresh executes, others wait
  - All tests should pass after implementation
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2, 3.4_

- [ ] 5. Write and run property-based tests
  - File: Create `src/app/api/auth/__tests__/token-refresh.property.test.ts`
  - Use fast-check or similar PBT library
  - Test properties:
    - **Property**: FOR ALL token ages in range [0, 7200] seconds, IF age > 300 THEN refresh is triggered ELSE no refresh
    - **Property**: FOR ALL valid Google OAuth responses with `refresh_token`, token metadata is correctly extracted and stored
    - **Property**: FOR ALL session states (authenticated/unauthenticated, Google/MetaMask), Web3Auth logic only runs for authenticated Google sessions with `idToken`
    - **Property**: FOR ALL time progressions (random sequences of session accesses over time), token remains fresh (< 300s) after automatic refreshes
    - **Property**: FOR ALL auth method sequences (Google → MetaMask, MetaMask → Google, Google → Google), state transitions work correctly without data leakage
  - Generate 100+ test cases per property
  - Document any counterexamples found
  - All properties should hold after implementation
  - _Requirements: 2.2, 2.3, 3.4_

- [ ] 6. Write and run integration tests
  - File: Create `src/app/api/auth/__tests__/token-refresh.integration.test.ts`
  - Use Playwright or similar end-to-end testing framework
  - Test scenarios:
    - **Scenario 1**: Google sign-in → immediate wallet connection (< 1 minute)
      - ASSERT: Connection succeeds without refresh API call
      - ASSERT: Network monitor shows no request to Google token endpoint
    - **Scenario 2**: Google sign-in → wait 7 minutes → trigger wallet connection
      - ASSERT: Refresh API call is made automatically
      - ASSERT: Connection succeeds with fresh token
      - ASSERT: No error messages shown to user
    - **Scenario 3**: Google sign-in → close browser → return after 10 minutes with valid session
      - ASSERT: Session is still valid (< 30 days)
      - ASSERT: Automatic wallet connection attempt triggers refresh
      - ASSERT: Connection succeeds silently in background
    - **Scenario 4**: Google sign-in → wait 31 days (simulate refresh token expiry)
      - ASSERT: Session expires and requires re-authentication
      - ASSERT: User is redirected to sign-in page
      - ASSERT: Clear error message shown
    - **Scenario 5**: Google sign-in → disconnect network → trigger wallet connection after 7 minutes
      - ASSERT: Refresh fails with network error
      - ASSERT: User sees error message: "Unable to refresh session. Please check your connection."
      - ASSERT: Retry button is available
    - **Scenario 6**: Open two tabs → Google sign-in in tab 1 → wait 7 minutes → attempt wallet connection in both tabs simultaneously
      - ASSERT: Only one refresh request is made (mutex prevents duplicates)
      - ASSERT: Both tabs successfully connect after refresh completes
  - All scenarios should pass after implementation
  - _Requirements: 2.2, 2.3, 2.4, 3.2, 3.4_

---

## Phase 5: Validation Checkpoint

- [ ] 7. Final validation and documentation
  - [ ] 7.1 Run all tests (unit, property-based, integration) and ensure 100% pass rate
  - [ ] 7.2 Manually test Google OAuth → immediate wallet connection flow (should work without changes)
  - [ ] 7.3 Manually test Google OAuth → wait 10 minutes → wallet connection flow (should auto-refresh)
  - [ ] 7.4 Manually test MetaMask/SIWE authentication flow (should work unchanged)
  - [ ] 7.5 Review code for security issues:
    - Ensure `refresh_token` is never logged or exposed to client
    - Verify `client_secret` is only used server-side
    - Check that token refresh endpoint is properly secured
    - Validate that error messages don't leak sensitive information
  - [ ] 7.6 Update documentation:
    - Add inline code comments explaining token refresh logic
    - Document the 5-minute threshold choice (buffer before Web3Auth's 6-minute limit)
    - Document error scenarios and user-facing messages
    - Add architecture diagram showing token lifecycle
  - [ ] 7.7 Create pull request with detailed description:
    - Link to bug ticket/issue
    - Explain root cause analysis
    - Describe implementation approach
    - List all modified files
    - Include test results and coverage report
    - Add before/after screenshots if applicable
  - _Requirements: All (2.1, 2.2, 2.3, 2.4, 3.2, 3.4)_

---

## Notes

### Testing Approach Summary
1. **Exploration Phase (Task 1)**: Confirms bug exists on unfixed code by demonstrating Web3Auth rejection of stale tokens
2. **Preservation Phase (Task 2)**: Establishes baseline behavior to preserve for fresh tokens and non-Google auth
3. **Implementation Phase (Tasks 3.1-3.8)**: Implements token metadata capture, freshness checking, and automatic refresh
4. **Verification Phase (Tasks 3.9-3.10)**: Confirms bug is fixed AND preserved behaviors remain unchanged
5. **Comprehensive Testing (Tasks 4-6)**: Adds unit, property-based, and integration tests for robustness
6. **Validation Phase (Task 7)**: Final manual testing, security review, and documentation

### Key Implementation Constraints
- Use 5-minute threshold (300 seconds) for token refresh to provide safety buffer before Web3Auth's 6-minute limit
- Implement mutex/locking for concurrent refresh requests (multiple tabs/windows)
- Never log or expose `refresh_token` or `client_secret` to client
- Gracefully handle all error scenarios (network failures, expired refresh tokens, invalid tokens)
- Preserve all existing behavior for fresh tokens (< 5 min) and non-Google auth methods

### Success Criteria
- Bug condition exploration test passes (stale tokens are automatically refreshed)
- All preservation tests pass (no regressions in existing flows)
- All unit, property-based, and integration tests pass
- Manual testing confirms both immediate and delayed wallet connection scenarios work
- Code review confirms no security issues or sensitive data exposure
- Documentation is complete and clear
