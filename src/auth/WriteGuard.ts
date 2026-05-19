import type { AccessLevel, AuthContext, CredentialMode } from "../types.js";
import { XrayAuthError } from "../types.js";

/**
 * Enforces credential mode access control at tool dispatch time.
 *
 * Three modes:
 * - `strict` (default): All operations require user credentials
 * - `shared-reads`: Read operations use shared credentials; writes require user credentials
 * - `fully-shared`: All operations use shared credentials
 */
export class WriteGuard {
  constructor(private readonly mode: CredentialMode) {}

  /**
   * Checks whether the requested access level is permitted.
   * Throws XrayAuthError with actionable hints if access is denied.
   */
  checkAccess(accessLevel: AccessLevel, userAuth: AuthContext | null): void {
    switch (this.mode) {
      case "fully-shared":
        // All operations allowed with shared credentials
        return;

      case "shared-reads":
        // Reads use shared creds, writes require user credentials
        if (accessLevel === "read") return;
        if (!userAuth) {
          throw new XrayAuthError(
            "ERR:AUTH_WRITE_DENIED Write operations require user credentials in shared-reads mode\n-> Provide X-Xray-Client-Id and X-Xray-Client-Secret headers"
          );
        }
        return;

      default:
        // "strict": all operations require user credentials
        if (!userAuth) {
          throw new XrayAuthError(
            `ERR:AUTH_REQUIRED ${accessLevel === "write" ? "Write" : "Read"} operations require user credentials in strict mode\n-> Provide XRAY_CLIENT_ID and XRAY_CLIENT_SECRET`
          );
        }
        return;
    }
  }
}
