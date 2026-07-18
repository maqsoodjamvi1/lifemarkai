import { NextResponse } from "next/server";

/** GET /api/scim/v2/ServiceProviderConfig */
export async function GET() {
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "SCIM API key issued in LifemarkAI workspace settings",
      },
    ],
  });
}
