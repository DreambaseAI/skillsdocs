"use client";

/**
 * The account affordance, in both headers: the `Masthead` on directory pages
 * and the `SiteHeader` on the book shell.
 *
 * Signed out it is a person glyph opening a two-item menu — GitHub and Google,
 * the only ways in; there is no password surface anywhere. Signed in the same
 * slot holds the reader's avatar and the menu becomes identity plus sign-out.
 *
 * The trigger renders identically on the server, during hydration and while
 * the session request is in flight (`isPending`): the glyph, disabled. Only a
 * resolved session may swap in the avatar — an optimistic avatar would flash
 * wrong for signed-out readers, which is most of them.
 */

import {
  Github01Icon,
  GoogleIcon,
  LibraryIcon,
  Logout01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useState } from "react";
import { announce } from "@/components/chrome/live-regions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { capture } from "@/lib/analytics";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { paths } from "@/lib/site";

export interface AccountButtonProps {
  className?: string;
}

type Provider = "github" | "google";

const PROVIDERS: { id: Provider; label: string; icon: typeof GoogleIcon }[] = [
  { id: "github", label: "Continue with GitHub", icon: Github01Icon },
  { id: "google", label: "Continue with Google", icon: GoogleIcon },
];

export function AccountButton({ className }: AccountButtonProps) {
  const { data: session, isPending } = useSession();
  // Between the click and the provider redirect the tab looks idle; the
  // disabled menu is the only sign the click landed.
  const [redirecting, setRedirecting] = useState(false);

  const start = useCallback(async (provider: Provider) => {
    setRedirecting(true);
    capture("sign_in_started", { provider });
    const { error } = await signIn.social({
      provider,
      // Back to the page the reader was on, never a dedicated post-login page.
      callbackURL: window.location.pathname + window.location.search,
    });
    // Success navigates away; reaching this line with an error means we stayed.
    if (error) {
      setRedirecting(false);
      announce("Sign-in failed. Please try again.", "assertive");
    }
  }, []);

  const end = useCallback(async () => {
    await signOut();
    capture("signed_out");
    announce("Signed out");
  }, []);

  const user = session?.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending || redirecting}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            aria-label={user ? `Account: ${user.name || user.email}` : "Sign in"}
          />
        }
      >
        {user ? (
          <Avatar size="sm">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback>
              {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <HugeiconsIcon
            icon={UserCircleIcon}
            data-icon="inline-start"
            aria-hidden
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          {user ? (
            <>
              <DropdownMenuLabel>
                <span className="text-foreground block truncate font-medium">
                  {user.name || "Reader"}
                </span>
                <span className="block truncate">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLinkItem href={paths.library()}>
                <HugeiconsIcon icon={LibraryIcon} aria-hidden />
                My library
              </DropdownMenuLinkItem>
              <DropdownMenuItem onClick={end}>
                <HugeiconsIcon icon={Logout01Icon} aria-hidden />
                Sign out
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuLabel>Sign in</DropdownMenuLabel>
              {PROVIDERS.map(({ id, label, icon }) => (
                <DropdownMenuItem key={id} onClick={() => start(id)}>
                  <HugeiconsIcon icon={icon} aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
