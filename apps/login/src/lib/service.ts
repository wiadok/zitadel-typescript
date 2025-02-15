import { createClientFor } from "@zitadel/client";
import { createServerTransport } from "@zitadel/client/node";
import { IdentityProviderService } from "@zitadel/proto/zitadel/idp/v2/idp_service_pb";
import { OIDCService } from "@zitadel/proto/zitadel/oidc/v2/oidc_service_pb";
import { OrganizationService } from "@zitadel/proto/zitadel/org/v2/org_service_pb";
import { SessionService } from "@zitadel/proto/zitadel/session/v2/session_service_pb";
import { SettingsService } from "@zitadel/proto/zitadel/settings/v2/settings_service_pb";
import { UserService } from "@zitadel/proto/zitadel/user/v2/user_service_pb";
import { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import { systemAPIToken } from "./api";

type ServiceClass =
  | typeof IdentityProviderService
  | typeof UserService
  | typeof OrganizationService
  | typeof SessionService
  | typeof OIDCService
  | typeof SettingsService;

export async function createServiceForHost<T extends ServiceClass>(
  service: T,
  serviceUrl: string,
  serviceRegion: string,
) {
  let token;

  // if we are running in a multitenancy context, use the system user token
  if (
    process.env[serviceRegion + "_AUDIENCE"] &&
    process.env[serviceRegion + "_SYSTEM_USER_ID"] &&
    process.env[serviceRegion + "_SYSTEM_USER_PRIVATE_KEY"]
  ) {
    token = await systemAPIToken({ serviceRegion });
  } else if (process.env.ZITADEL_SERVICE_USER_TOKEN) {
    token = process.env.ZITADEL_SERVICE_USER_TOKEN;
  }

  if (!serviceUrl) {
    throw new Error("No instance url found");
  }

  if (!token) {
    throw new Error("No token found");
  }

  const transport = createServerTransport(token, {
    baseUrl: serviceUrl,
  });

  return createClientFor<T>(service)(transport);
}

/**
 * Extracts the service url and region from the headers if used in a multitenant context (x-zitadel-forward-host, x-zitade-region header)
 * or falls back to the ZITADEL_API_URL for a self hosting deployment
 * or falls back to the host header for a self hosting deployment using custom domains
 * @param headers
 * @returns the service url and region from the headers
 * @throws if the service url could not be determined
 *
 */
export function getServiceUrlFromHeaders(headers: ReadonlyHeaders): {
  serviceUrl: string;
  serviceRegion: string;
} {
  let instanceUrl;

  const forwardedHost = headers.get("x-zitadel-forward-host");
  // use the forwarded host if available (multitenant), otherwise fall back to the host of the deployment itself
  if (forwardedHost) {
    instanceUrl = forwardedHost;
    instanceUrl = instanceUrl.startsWith("https://")
      ? instanceUrl
      : `https://${instanceUrl}`;
  } else if (process.env.ZITADEL_API_URL) {
    instanceUrl = process.env.ZITADEL_API_URL;
  } else {
    const host = headers.get("host");

    if (host) {
      const [hostname, port] = host.split(":");
      if (hostname !== "localhost") {
        instanceUrl = host.startsWith("https://") ? host : `https://${host}`;
      }
    }
  }

  if (!instanceUrl) {
    throw new Error("Service URL could not be determined");
  }

  return {
    serviceUrl: instanceUrl,
    serviceRegion: headers.get("x-zitadel-region") || "",
  };
}
