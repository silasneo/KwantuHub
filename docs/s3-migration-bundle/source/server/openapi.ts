import { REST_ALIAS_ROUTES, REST_OPERATION_REGISTRY, REST_QUERY_OPERATIONS } from "./apiV1Contract";

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
    {
      name: "Notifications",
      description: "Authenticated notification inbox, read state, and preferences",
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
    "/api/trpc/notifications.list": {
      get: {
        tags: ["Notifications"],
        summary: "List the current user's notifications",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": { description: "Notification inbox", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/notifications.unreadCount": {
      get: {
        tags: ["Notifications"],
        summary: "Get the current user's unread notification count",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": { description: "Unread count", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/notifications.markRead": {
      post: {
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Notification marked read", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Notification not found for current user" },
        },
      },
    },
    "/api/trpc/notifications.markAllRead": {
      post: {
        tags: ["Notifications"],
        summary: "Mark all current-user notifications as read",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Notifications marked read", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/notifications.getPreferences": {
      get: {
        tags: ["Notifications"],
        summary: "Get the current user's notification preferences",
        security: [{ KwantuJwtCookie: [] }],
        parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
        responses: {
          "200": { description: "Notification preferences", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/trpc/notifications.updatePreferences": {
      post: {
        tags: ["Notifications"],
        summary: "Update the current user's notification preferences",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Notification preferences updated", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "400": { description: "Invalid preference value" },
          "401": { description: "Authentication required" },
        },
      },
    },
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
    "/api/trpc/buyer.markInquiryRead": {
      post: {
        tags: ["Buyer"],
        summary: "Mark messages in the buyer's inquiry as read",
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
          "200": { description: "Messages marked read", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.replyInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Reply to the buyer's own open inquiry",
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
          "200": { description: "Reply created", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "400": { description: "Inquiry is resolved" },
          "401": { description: "Authentication required" },
          "404": { description: "Inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.closeInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Mark the buyer's own inquiry as resolved",
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
          "200": { description: "Inquiry resolved", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.reopenInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Reopen the buyer's resolved inquiry",
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
          "200": { description: "Inquiry reopened", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Resolved inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.archiveInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Archive the buyer's inquiry without deleting it",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Inquiry archived", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.unarchiveInquiry": {
      post: {
        tags: ["Buyer"],
        summary: "Restore the buyer's archived inquiry",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Inquiry unarchived", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Archived inquiry not found or not owned by buyer" },
        },
      },
    },
    "/api/trpc/buyer.reportConversation": {
      post: {
        tags: ["Buyer"],
        summary: "Report a buyer conversation for moderation",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: { "200": { description: "Report created" }, "401": { description: "Authentication required" }, "409": { description: "An open report already exists" } },
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
    "/api/trpc/vendor.markInquiryRead": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Mark messages in a vendor-owned inquiry as read",
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
          "200": { description: "Messages marked read", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Vendor profile required" },
          "404": { description: "Inquiry not found or not owned by vendor" },
        },
      },
    },
    "/api/trpc/vendor.closeInquiry": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Mark a vendor-owned inquiry as resolved",
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
          "200": { description: "Inquiry resolved", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Vendor profile required" },
          "404": { description: "Inquiry not found or not owned by vendor" },
        },
      },
    },
    "/api/trpc/vendor.reopenInquiry": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Reopen a vendor-owned resolved inquiry",
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
          "200": { description: "Inquiry reopened", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Vendor profile required" },
          "404": { description: "Resolved inquiry not found or not owned by vendor" },
        },
      },
    },
    "/api/trpc/vendor.archiveInquiry": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Archive a vendor-owned inquiry without deleting it",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Inquiry archived", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Vendor profile required" },
          "404": { description: "Inquiry not found or not owned by vendor" },
        },
      },
    },
    "/api/trpc/vendor.unarchiveInquiry": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Restore a vendor-owned archived inquiry",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: {
          "200": { description: "Inquiry unarchived", content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcResult" } } } },
          "401": { description: "Authentication required" },
          "403": { description: "Vendor profile required" },
          "404": { description: "Archived inquiry not found or not owned by vendor" },
        },
      },
    },
    "/api/trpc/vendor.reportConversation": {
      post: {
        tags: ["Vendor Portal"],
        summary: "Report a vendor conversation for moderation",
        security: [{ KwantuJwtCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
        responses: { "200": { description: "Report created" }, "401": { description: "Authentication required" }, "403": { description: "Vendor profile required" }, "409": { description: "An open report already exists" } },
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
        "Verified-buyer, Turnstile-protected, rate-limited reveal of vendor contact channels",
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
        "401": { description: "Authentication required" },
        "403": { description: "Verified email and phone required" },
        "404": { description: "Listing not found" },
        "429": { description: "Reveal rate limit exceeded" },
      },
    },
  },
  "/api/trpc/auth.contactStatus": {
    get: {
      tags: ["Auth"],
      summary: "Inspect verified email and phone status for the authenticated user",
      responses: {
        "200": { description: "Current verification status" },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/api/trpc/auth.requestEmailOtp": {
    post: {
      tags: ["Auth"],
      summary: "Request a 6-digit email ownership OTP challenge with Turnstile protection",
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Email OTP dispatched via SendPulse" },
        "400": { description: "Turnstile failure or missing email" },
        "401": { description: "Authentication required" },
        "429": { description: "Cooldown in effect" },
      },
    },
  },
  "/api/trpc/auth.verifyEmailOtp": {
    post: {
      tags: ["Auth"],
      summary: "Verify a 6-digit email ownership OTP challenge",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Email ownership verified" },
        "400": { description: "Invalid or expired OTP code" },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/api/trpc/auth.requestPhoneOtp": {
    post: {
      tags: ["Auth"],
      summary: "Request a phone ownership OTP challenge with Turnstile protection",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Phone verification started" },
        "400": { description: "Invalid phone number or Turnstile failure" },
        "401": { description: "Authentication required" },
        "412": { description: "Phone provider unconfigured" },
        "429": { description: "Cooldown in effect" },
      },
    },
  },
  "/api/trpc/auth.verifyPhoneOtp": {
    post: {
      tags: ["Auth"],
      summary: "Verify a phone ownership OTP challenge",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TrpcMutationInput" },
          },
        },
      },
      responses: {
        "200": { description: "Phone ownership verified" },
        "400": { description: "Invalid or expired OTP code" },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/api/trpc/vendor.analytics": {
    get: {
      tags: ["Vendor Portal"],
      summary:
        "Get filtered vendor discovery, inquiry, response, and resolution metrics",
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
  "/api/trpc/admin.analytics": {
    get: {
      tags: ["Admin"],
      summary: "Get privacy-safe filtered platform inquiry funnel metrics",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Aggregate discovery-to-resolution metrics" },
        "403": { description: "Admin role required" },
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
  "/api/trpc/admin.conversationReports": {
    get: {
      tags: ["Admin"],
      summary: "Search participant conversation reports",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Conversation moderation queue" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.conversationMessages": {
    get: {
      tags: ["Admin"],
      summary: "Inspect messages in a reported conversation",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Conversation messages with moderation state" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.updateConversationReport": {
    post: {
      tags: ["Admin"],
      summary: "Resolve, dismiss, or action a conversation report",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
      responses: {
        "200": { description: "Report resolved and audit record created" },
        "403": { description: "Admin role required" },
        "404": { description: "Report not found" },
      },
    },
  },
  "/api/trpc/admin.moderateMessage": {
    post: {
      tags: ["Admin"],
      summary: "Hide or restore a reported conversation message",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
      responses: {
        "200": { description: "Message moderation state updated" },
        "403": { description: "Admin role required" },
        "404": { description: "Message not found" },
      },
    },
  },
  "/api/trpc/admin.escalateAccount": {
    post: {
      tags: ["Admin"],
      summary: "Suspend or reinstate a buyer or vendor account",
      security: [{ KwantuJwtCookie: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrpcMutationInput" } } } },
      responses: {
        "200": { description: "Account escalation recorded" },
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
  "/api/trpc/admin.notificationDeliverySummary": {
    get: {
      tags: ["Admin"],
      summary: "Get aggregate notification delivery summary counts and channel breakdown",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Delivery summary" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.notificationDeliveries": {
    get: {
      tags: ["Admin"],
      summary: "List recent notification delivery attempts with optional status filter",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Delivery list" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.retryNotificationDelivery": {
    post: {
      tags: ["Admin"],
      summary: "Retry a failed, bounced, or complained notification delivery",
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
        "200": { description: "Delivery requeued" },
        "403": { description: "Admin role required" },
        "404": { description: "Delivery not found" },
      },
    },
  },
  "/api/trpc/admin.requeueNotificationOutbox": {
    post: {
      tags: ["Admin"],
      summary: "Requeue a failed or dead-letter outbox notification event",
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
        "200": { description: "Outbox event requeued" },
        "403": { description: "Admin role required" },
        "404": { description: "Outbox item not found" },
      },
    },
  },
  "/api/trpc/admin.releaseNotificationSuppression": {
    post: {
      tags: ["Admin"],
      summary: "Release an active recipient email suppression",
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
        "200": { description: "Suppression released" },
        "403": { description: "Admin role required" },
        "404": { description: "Suppression not found" },
      },
    },
  },
  "/api/trpc/admin.emailDeliveryPause": {
    get: {
      tags: ["Admin"],
      summary: "Get current transactional email delivery pause status",
      security: [{ KwantuJwtCookie: [] }],
      parameters: [{ $ref: "#/components/parameters/TrpcInput" }],
      responses: {
        "200": { description: "Pause status" },
        "403": { description: "Admin role required" },
      },
    },
  },
  "/api/trpc/admin.setEmailDeliveryPaused": {
    post: {
      tags: ["Admin"],
      summary: "Pause or resume platform transactional email delivery",
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
        "200": { description: "Pause status updated" },
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

// Versioned REST compatibility contract. Business rules remain implemented by
// the tRPC procedures; this route documents the stable external HTTP shape.
(openapiDocument.components as any).schemas.RestSuccessEnvelope = {
  type: "object",
  required: ["status", "timestamp", "data"],
  properties: {
    status: { type: "string", enum: ["success"] },
    timestamp: { type: "string", format: "date-time" },
    data: { description: "Procedure-specific response data" },
  },
};
(openapiDocument.components as any).schemas.RestErrorEnvelope = {
  type: "object",
  required: ["status", "timestamp", "error"],
  properties: {
    status: { type: "string", enum: ["error"] },
    timestamp: { type: "string", format: "date-time" },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
    },
  },
};
(openapiDocument.components as any).parameters.RestInput = {
  name: "input",
  in: "query",
  required: false,
  description: "JSON-encoded procedure input. Query parameters may also be supplied directly for GET operations.",
  schema: { type: "string" },
};

(openapiDocument.paths as any)["/api/v1/contract"] = {
  get: {
    tags: ["REST v1"],
    summary: "Discover the versioned REST procedure registry",
    responses: {
      "200": { description: "REST contract registry", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSuccessEnvelope" } } } },
    },
  },
};
(openapiDocument.paths as any)["/api/v1/{domain}/{procedure}"] = {
  parameters: [
    { name: "domain", in: "path", required: true, schema: { type: "string", enum: ["auth", "notifications", "categories", "vendors", "marketplace", "buyer", "vendor", "admin"] } },
    { name: "procedure", in: "path", required: true, schema: { type: "string", enum: Object.keys(REST_OPERATION_REGISTRY).map(key => key.split(".")[1]) } },
  ],
  get: {
    tags: ["REST v1"],
    summary: "Invoke a versioned REST query procedure",
    description: Object.entries(REST_QUERY_OPERATIONS).map(([key, value]) => `${key}: ${value}`).join("\\n"),
    parameters: [{ $ref: "#/components/parameters/RestInput" }],
    responses: {
      "200": { description: "Successful procedure response", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSuccessEnvelope" } } } },
      "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "401": { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "403": { description: "Insufficient role or ownership", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "404": { description: "Resource or procedure not found", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
    },
  },
  post: {
    tags: ["REST v1"],
    summary: "Invoke a versioned REST mutation procedure",
    requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
    responses: {
      "200": { description: "Successful procedure response", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSuccessEnvelope" } } } },
      "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "401": { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "403": { description: "Insufficient role or ownership", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "404": { description: "Resource or procedure not found", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
    },
  },
};

const restAliasGetPaths = new Set([
  "/api/v1/users/me",
  "/api/v1/users/contact-status",
  "/api/v1/storefronts/{slug}",
  "/api/v1/notifications",
  "/api/v1/notifications/unread-count",
  "/api/v1/preferences/notifications",
  "/api/v1/search",
  "/api/v1/wishlist",
  "/api/v1/inquiries",
  "/api/v1/messages",
  "/api/v1/reviews",
  "/api/v1/analytics/vendor",
  "/api/v1/analytics/admin",
  "/api/v1/verification/status",
  "/api/v1/moderation/reports",
]);
const restAliasPostPaths = new Set([
  "/api/v1/preferences/notifications",
  "/api/v1/wishlist",
  "/api/v1/inquiries",
  "/api/v1/reviews",
  "/api/v1/verification/session",
  "/api/v1/verification/evidence",
  "/api/v1/moderation/reports",
  "/api/v1/abuse/report",
]);
for (const [path, description] of Object.entries(REST_ALIAS_ROUTES)) {
  const methods: Record<string, unknown> = {};
  if (restAliasGetPaths.has(path)) {
    methods.get = {
      tags: ["REST v1"],
      summary: `REST alias for ${description}`,
      parameters: [{ $ref: "#/components/parameters/RestInput" }],
      responses: {
        "200": { description: "Successful alias response", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSuccessEnvelope" } } } },
        "401": { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      },
    };
  }
  if (restAliasPostPaths.has(path)) {
    methods.post = {
      tags: ["REST v1"],
      summary: `REST alias mutation for ${description}`,
      requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
      responses: {
        "200": { description: "Successful alias response", content: { "application/json": { schema: { $ref: "#/components/schemas/RestSuccessEnvelope" } } } },
        "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
        "401": { description: "Authentication required", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
        "403": { description: "Insufficient role or ownership", content: { "application/json": { schema: { $ref: "#/components/schemas/RestErrorEnvelope" } } } },
      },
    };
  }
  (openapiDocument.paths as any)[path] = methods;
}
