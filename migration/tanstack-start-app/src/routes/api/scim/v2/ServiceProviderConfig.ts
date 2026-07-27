import { createFileRoute } from "@tanstack/react-router";

/** Native /api/scim/v2/ServiceProviderConfig — static SCIM capabilities doc. */
export const Route = createFileRoute("/api/scim/v2/ServiceProviderConfig")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
          patch: { supported: true },
          bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
          filter: { supported: true, maxResults: 200 },
          changePassword: { supported: false },
          sort: { supported: false },
          etag: { supported: false },
          authenticationSchemes: [
            { type: "oauthbearertoken", name: "OAuth Bearer Token", description: "SCIM API key issued in LifemarkAI workspace settings" },
          ],
        }),
    },
  },
});
