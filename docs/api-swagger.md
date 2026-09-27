# KwantuHub API Documentation

KwantuHub exposes its current tRPC-over-HTTP API using a JWT cookie session.

- **Interactive Swagger UI:** `/api-docs`
- **Raw OpenAPI 3.0 JSON:** `/openapi.json`
- **Transport:** `/api/trpc/{procedure}`
- **Authentication:** `kwantu_jwt` httpOnly cookie issued by `auth.login` or `auth.register`

## tRPC request format

Queries use GET with a JSON input wrapper:

```text
/api/trpc/marketplace.search?input={"json":{"q":"Ankara","page":1}}
```

Mutations use POST with the same wrapper in the request body:

```json
{
  "json": {
    "email": "buyer@example.com",
    "password": "a-secure-password"
  }
}
```

The OpenAPI document lists the implemented authentication, marketplace, vendor, buyer, and administrator procedures, including required JWT security for protected operations.
