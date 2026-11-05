# API Gateway and Auth Setup

Kong is the single entry point for the API. Clients call Kong, and Kong forwards each request to the right service using the path.

```text
Browser / mobile --> Kong (localhost:8080) --> auth-service --> PostgreSQL
                                               (only reachable inside Docker)
```

Kong runs in DB-less mode. All routes live in [`gateway/kong.yml`](../../gateway/kong.yml), so they are reviewed in git like any other code.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Runs Kong, the services, and PostgreSQL |
| `gateway/kong.yml` | Services, routes, and plugins |
| `gateway/start.sh` | Inserts the public key into the Kong config at startup |
| `scripts/setup-dev.sh` | Creates your local JWT keys and database password |
| `services/auth-service/` | Login, tokens, and the current user |

## Run it

Start Docker Desktop, then run these from the repository root. You only need the first command once. It uses `sh` and `openssl`, so on Windows run it in Git Bash.

```bash
sh scripts/setup-dev.sh
```

```bash
docker compose up -d --build --wait
```

Each person gets their own keys and password. They stay in `secrets/` and `.env`, which git ignores. Never commit them.

Check that a request passes through Kong:

```bash
curl -i http://localhost:8080/api/v1/auth/health
```

Expected: `200 OK`, the body `{"status":"ok","service":"auth"}`, and the headers `Via: 1.1 kong/3.9.1` and `X-Request-ID`.

## Try the auth routes

Create a company and its first admin. Use your own values.

```bash
curl -X POST http://localhost:8080/api/v1/auth/signup -H 'Content-Type: application/json' -d '{"company_name":"Acme","full_name":"Your Name","email":"you@acme.example","password":"choose-a-long-password"}'
```

Copy `access_token` from the response, then call a protected route:

```bash
curl http://localhost:8080/api/v1/auth/me -H 'Authorization: Bearer PASTE_ACCESS_TOKEN_HERE'
```

| Route | Token needed | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/signup` | No | Create a company and its first admin |
| `POST /api/v1/auth/login` | No | Get an access token and a refresh token |
| `POST /api/v1/auth/refresh` | No | Swap a refresh token for a new pair |
| `POST /api/v1/auth/logout` | Yes | End the session |
| `GET /api/v1/auth/me` | Yes | Get the user, permissions, and companies |
| `GET /api/v1/auth/health` | No | Check the service and database |

## How tokens are checked

1. `auth-service` signs access tokens with the private key. Only this container has that key.
2. Kong checks the signature with the public key, and rejects missing or forged tokens before they reach a service.
3. The service checks the token again, including expiry. An expired token returns `AUTH_EXPIRED`, and the frontend then refreshes it automatically.

Any route under `/api/v1/auth` needs a token unless it is listed in `auth-public-routes` in `gateway/kong.yml`.

## Run the tests

The tests use a separate `crmai_test` database, which they drop and recreate on each run.

```bash
docker compose run --rm --build auth-service-test
```

## Connect the frontend

The frontend uses its mock API by default. To use Kong, set `VITE_USE_MOCK=false` in `frontend/.env`. Vite then proxies `/api` to Kong on port 8080.

Sign up, login, reload, and sign out work. Other pages show errors until their services exist, because routes such as `/notifications` and `/organizations/current` return 404.

The folder path must not contain a backslash. Node cannot load Vite from a path such as `Software Project\/CRMAI`, so `npm run dev` fails there with `ERR_INVALID_MODULE_SPECIFIER`.

## Add a new service

The example below adds a `crm` service for `/api/v1/customers`. First read the open questions in [ADR-011](../adr/ADR-011-microservices-kong-gateway.md).

1. Create `services/crm`, and serve the routes under their full path, such as `/api/v1/customers`.
2. Add the service to `docker-compose.yml`. Do not publish a port, because clients must go through Kong. Give it `jwt_public_key` only, never the private key:

   ```yaml
   crm-service:
     build: ./services/crm
     restart: unless-stopped
     secrets:
       - jwt_public_key
   ```

3. Add it to `services:` in `gateway/kong.yml`:

   ```yaml
   - name: crm-service
     url: http://crm-service:8000
     routes:
       - name: customer-routes
         paths:
           - ~/api/v1/customers(/|$)
         strip_path: false
         plugins:
           - name: jwt
             config:
               uri_param_names: []
               claims_to_verify: []
   ```

4. In the service, verify every token, including expiry, the same way as `app/core/security.py`. Kong does not check expiry.
5. Apply the change:

   ```bash
   docker compose up -d --build --wait
   ```

   ```bash
   docker compose restart kong
   ```

## Common commands

| Task | Command |
| --- | --- |
| Apply a `kong.yml` change | `docker compose restart kong` |
| Follow the logs | `docker compose logs -f kong auth-service` |
| Stop everything and keep the data | `docker compose down` |
| Stop everything and delete the database | `docker compose down -v` |

## Reading errors

| Response | Meaning |
| --- | --- |
| `404` with `no Route matched with those values` | No route in `kong.yml` matches this path |
| `404` with `error.code` of `NOT_FOUND` | Kong found the service, but the service has no such endpoint |
| `401` with a top-level `message` | Kong rejected the token before it reached a service |
| `401` with `error.code` | The service rejected the token or login |
| `503` with `name resolution failed` | The service was just recreated. Wait a few seconds and try again |
| `502` or `503` | Kong matched the route, but the service is down. Run `docker compose ps` |

## Not set up yet

CORS, security headers, TLS, gateway rate limiting, and JSON request logs are not configured. Kong only accepts connections from this machine (`127.0.0.1`), so change that binding only when you add TLS for a hosted environment.

Login failures are limited to 10 per email per 15 minutes, in memory. The count resets when the service restarts, and it would not work with more than one replica.
