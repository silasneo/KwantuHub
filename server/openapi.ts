export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "KwantuHub API",
    version: "1.1.0",
    description:
      "Current KwantuHub marketplace API. The application uses tRPC over HTTP with JWT authentication in an httpOnly cookie. Query procedures are GET requests and mutations are POST requests under /api/trpc.",
    contact: { name: "KwantuHub Platform Team" },
  },
  servers: [{ url: "/", description: "Current KwantuHub deployment" }],
  tags: [
    {
      name: "Authentication",
      description: "JWT registration, login, profile, and logout",
    },
    {
      name: "Marketplace",
      description: "Public marketplace discovery and detail procedures",
    },
    {
      name: "Vendors",
      description: "Public vendor directory and storefront procedures",
    },
    { name: "Buyer", description: "Saved listings and buyer inquiries" },
    {
      name: "Vendor Portal",
      description: "Vendor profile, listing, and reply procedures",
    },
    {
      name: "Admin",
      description: "Administrator vendor moderation procedures",
    },
  ],
  components: {
    securitySchemes: {
      KwantuJwtCookie: {
        type: "apiKey",
        in: "cookie",
        name: "kwantu_jwt",
        description:
          "JWT issued by auth.login or auth.register; httpOnly, scoped to the KwantuHub application.",
      },
    },
    schemas: {
      TrpcQueryInput: {
        type: "object",
        description:
          "tRPC GET input wrapper. Encode the JSON value in the input query parameter.",
        properties: { json: { type: "object", additionalProperties: true } },
      },
      TrpcMutationInput: {
        type: "object",
        description: "tRPC POST input wrapper.",
        properties: { json: { type: "object", additionalProperties: true } },
      },
      TrpcResult: {
        type: "object",
        properties: {
          result: {
            type: "object",
            properties: {
              data: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      AuthCredentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      },
    },
  },
  paths: {
    "/api/trpc/auth.me": {
      get: {
        tags: ["Authentication"],
        summary: "Get the current JWT-authenticated user",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Current user or null",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
        },
      },
    },
    "/api/trpc/auth.login": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password and issue a JWT cookie",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "JWT cookie issued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/api/trpc/auth.register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a buyer or vendor account and issue a JWT cookie",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Account created and JWT cookie issued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "400": { description: "Email already registered or invalid input" },
        },
      },
    },
    "/api/trpc/auth.updateProfile": {
      post: {
        tags: ["Authentication"],
        summary: "Update the current user's profile name or avatar URL",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/auth.logout": {
      post: {
        tags: ["Authentication"],
        summary: "Clear the JWT session cookie",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: { "200": { description: "Logged out" } },
      },
    },
    "/api/trpc/categories.list": {
      get: {
        tags: ["Marketplace"],
        summary: "List active marketplace categories",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Category list",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
        },
      },
    },
    "/api/trpc/vendors.list": {
      get: {
        tags: ["Vendors"],
        summary: "List approved platform vendors with storefront previews",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Vendor directory",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
        },
      },
    },
    "/api/trpc/marketplace.search": {
      get: {
        tags: ["Marketplace"],
        summary: "Search and filter published listings",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Paginated marketplace listings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
        },
      },
    },
    "/api/trpc/marketplace.getListing": {
      get: {
        tags: ["Marketplace"],
        summary: "Get a public listing by slug and track a view",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Listing detail",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "404": { description: "Listing not found" },
        },
      },
    },
    "/api/trpc/marketplace.getRelated": {
      get: {
        tags: ["Marketplace"],
        summary: "Get related listings in the same category",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Related listings array",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
        },
      },
    },
    "/api/trpc/marketplace.getStorefront": {
      get: {
        tags: ["Vendors"],
        summary: "Get a public vendor storefront by slug",
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Vendor storefront and offerings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "404": { description: "Storefront not found" },
        },
      },
    },
    "/api/trpc/buyer.wishlist": {
      get: {
        tags: ["Buyer"],
        summary: "List the current buyer's saved listings",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Saved listings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/buyer.toggleWishlist": {
      post: {
        tags: ["Buyer"],
        summary: "Save or unsave a listing",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Saved state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/buyer.inquiries": {
      get: {
        tags: ["Buyer"],
        summary: "List the current buyer's inquiries and messages",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Buyer conversations",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/buyer.createInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Create a direct inquiry for a listing",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Inquiry created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/vendor.getProfile": {
      get: {
        tags: ["Vendor Portal"],
        summary: "Get the current vendor profile and storefront",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Vendor profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/vendor.saveProfile": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Create or update a vendor application and storefront",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Vendor profile saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/vendor.listings": {
      get: {
        tags: ["Vendor Portal"],
        summary: "List the current vendor's catalog",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Vendor catalog",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/vendor.saveListing": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Create or update a vendor listing",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Listing saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Approved vendor required" },
        },
      },
    },
    "/api/trpc/vendor.inquiries": {
      get: {
        tags: ["Vendor Portal"],
        summary: "List current vendor inquiries and messages",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Vendor inbox",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/vendor.replyInquiry": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Reply to a buyer inquiry",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Reply created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/admin.pendingVendors": {
      get: {
        tags: ["Admin"],
        summary: "List pending vendor applications",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": {
            description: "Pending vendors",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Admin role required" },
        },
      },
    },
    "/api/trpc/admin.decideVendor": {
      post: {
        tags: ["Admin"],
        summary: "Approve, reject, or suspend a vendor",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TrpcMutationInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Vendor decision saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrpcResult" },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "Admin role required" },
        },
      },
    },
  },
} as const;

// Keep the public contract synchronized with the current router surface.
Object.assign(openapiDocument.paths as any, {
  "/api/trpc/marketplace.megaMenu": {
    get: {
      tags: ["Marketplace"],
      summary: "Return the feature-flagged category mega-menu payload",
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Mega-menu enabled state and categories" },
      },
    },
  },
  "/api/trpc/admin.disputes": {
    get: {
      tags: ["Admin"],
      summary: "List buyer and vendor disputes for governance",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Dispute queue" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.updateDispute": {
    post: {
      tags: ["Admin"],
      summary: "Update dispute status and optional resolution",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Dispute updated" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/auth.changePassword": {
    post: {
      tags: ["Authentication"],
      summary: "Rotate the current user's password",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Password updated" },
        "400": {
          description: "Invalid current password or password policy failure",
        },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/api/trpc/marketplace.revealContact": {
    post: {
      tags: ["Marketplace"],
      summary:
        "Rate-limited reveal of vendor contact channels for a published listing",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Available contact channels" },
        "404": { description: "Listing not found" },
        "429": { description: "Reveal rate limit exceeded" },
      },
    },
  },
  "/api/trpc/vendor.analytics": {
    get: {
      tags: ["Vendor Portal"],
      summary:
        "Get vendor views, saves, reveals, inquiries, and listing totals",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Vendor engagement metrics" },
        "403": { description: "Vendor access required" },
      },
    },
  },
  "/api/trpc/vendor.reviews": {
    get: {
      tags: ["Vendor Portal"],
      summary: "List approved reviews for the current vendor",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Approved vendor reviews" },
        "403": { description: "Vendor access required" },
      },
    },
  },
  "/api/trpc/admin.categories": {
    get: {
      tags: ["Admin"],
      summary: "List all marketplace categories",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Category records" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.saveCategory": {
    post: {
      tags: ["Admin"],
      summary: "Create or update a marketplace category",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Category saved" },
        "400": { description: "Invalid category input" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.users": {
    get: {
      tags: ["Admin"],
      summary: "List user accounts for governance",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "User account list" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.updateUserStatus": {
    post: {
      tags: ["Admin"],
      summary: "Suspend or reactivate a user account",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "User status updated" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.listings": {
    get: {
      tags: ["Admin"],
      summary: "List marketplace listings for moderation",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Listing moderation queue" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.updateListingStatus": {
    post: {
      tags: ["Admin"],
      summary: "Update listing visibility or moderation status",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Listing status updated" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.moderation": {
    get: {
      tags: ["Admin"],
      summary: "List moderation audit records",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Moderation audit log" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.featureFlags": {
    get: {
      tags: ["Admin"],
      summary: "List platform feature flags",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Feature flag records" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.setFeatureFlag": {
    post: {
      tags: ["Admin"],
      summary: "Enable or disable a platform feature flag",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Feature flag updated" },
        "403": { description: "Admin role required" },
      },
    },
  },
});

// Swagger/OpenAPI requires the input parameter to be declared under components.
(openapiDocument.components as any).parameters = {
  TrpcInput: {
    name: "input",
    in: "query",
    required: false,
    description:
      "tRPC input wrapper: JSON.stringify({ json: { ...procedureInput } }).",
    schema: { type: "string" },
  },
};
