"use client";

/**
 * Better Auth browser client. `baseURL` is omitted on purpose — the client
 * calls `/api/auth/*` on whatever origin served the page, which is correct in
 * dev, previews, and production alike.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
