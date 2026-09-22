# Bugfix Requirements Document

## Introduction

Users cannot connect their wallets via Web3Auth Single Factor Auth (SFA) because the Google OAuth `id_token` stored in the NextAuth session becomes stale. Web3Auth's timestamp validation requires tokens to be less than 6 minutes old, but the current implementation captures the `id_token` once at sign-in and reuses it indefinitely across sessions, causing "timesigned is more than 6m0s ago" errors.

This bug affects all users attempting to authenticate with Google OAuth after their initial sign-in session, preventing wallet connection and blocking access to blockchain functionality.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user signs in with Google OAuth THEN the system captures the `id_token` once and stores it in the NextAuth JWT token

1.2 WHEN a user returns to the application after the initial sign-in (session still valid) THEN the system attempts to connect Web3Auth SFA using the stale `id_token` from the stored JWT

1.3 WHEN the stored `id_token` timestamp is more than 6 minutes old THEN Web3Auth SFA connection fails with error "timesigned is more than 6m0s ago"

1.4 WHEN Web3Auth SFA connection fails due to expired timestamp THEN the user cannot connect their wallet or access blockchain features

### Expected Behavior (Correct)

2.1 WHEN a user signs in with Google OAuth THEN the system SHALL capture the initial `id_token` with its expiration timestamp

2.2 WHEN a user returns to the application and the `id_token` is more than 6 minutes old THEN the system SHALL refresh the Google OAuth token to obtain a fresh `id_token` before attempting Web3Auth SFA connection

2.3 WHEN the system has a fresh `id_token` (less than 6 minutes old) THEN Web3Auth SFA connection SHALL succeed without timestamp validation errors

2.4 WHEN Web3Auth SFA connection succeeds THEN the user SHALL be able to connect their wallet and access all blockchain functionality

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user signs in with Google OAuth for the first time THEN the system SHALL CONTINUE TO capture and store the `id_token` in the NextAuth JWT

3.2 WHEN a user signs in with MetaMask/wallet (SIWE) THEN the system SHALL CONTINUE TO authenticate without requiring any `id_token` or Web3Auth SFA connection

3.3 WHEN a user's NextAuth session is valid THEN the system SHALL CONTINUE TO maintain the session without forcing re-authentication

3.4 WHEN the `id_token` is fresh (less than 6 minutes old) THEN the system SHALL CONTINUE TO use the existing token without unnecessary refresh requests
