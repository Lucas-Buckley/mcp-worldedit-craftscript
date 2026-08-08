export interface Identity {
  username: string;
  admin: boolean;
}

export class IdentityError extends Error {}

export function requireUsernameScope(identity: Identity | null, username: string): void {
  if (!identity) {
    throw new IdentityError(
      "Not verified. Call request_login_code with your Minecraft username, read the code whispered to you in-game, then call verify_login_code."
    );
  }
  if (identity.admin) return;
  if (identity.username.toLowerCase() !== username.toLowerCase()) {
    throw new IdentityError(`Your verified identity is "${identity.username}", not "${username}".`);
  }
}

export function requireAdmin(identity: Identity | null): void {
  if (!identity?.admin) {
    throw new IdentityError(
      "This action requires a server-op account. Verify with request_login_code / verify_login_code using an op's username."
    );
  }
}
