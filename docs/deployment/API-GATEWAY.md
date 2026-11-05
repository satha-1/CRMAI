# API Gateway (Kong)

Kong is the single entry point for the API. Clients call Kong, and Kong forwards each request to the right service using the path.

```text
Browser / mobile --> Kong (localhost:8080) --> auth-service (only reachable inside Docker)
```

Kong runs in DB-less mode. All routes live in [`gateway/kong.yml`](../../gateway/kong.yml), so they are reviewed in git like any other code. Kong needs no database of its own.

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Runs Kong and the services |
| `gateway/kong.yml` | Services, routes, and plugins |
| `services/auth/` | First service (FastAPI). It only has a health endpoint so far |

## Run it

Start Docker Desktop, then run this from the repository root:

```bash
docker compose up -d --build --wait
```

Check that a request passes through Kong:

```bash
curl -i http://localhost:8080/api/v1/auth/health
```

Expected: `200 OK`, the body `{"status":"ok","service":"auth"}`, and the headers `Via: 1.1 kong/3.9.1` and `X-Request-ID`.

## Connect the frontend

The frontend uses its mock API by default. To use Kong, set `VITE_USE_MOCK=false` in `frontend/.env`. Vite then proxies `/api` to Kong on port 8080.

Only `/api/v1/auth/health` exists behind Kong so far, so every other page fails until its service is built.

## Add a new service

The example below adds a `crm` service for `/api/v1/customers`.

1. Copy `services/auth` to `services/crm`, and serve the routes under their full path, such as `/api/v1/customers`.
2. Add the service to `docker-compose.yml`. Do not publish a port, because clients must go through Kong:

   ```yaml
   crm-service:
     build: ./services/crm
     restart: unless-stopped
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
   ```

4. Apply the change:

   ```bash
   docker compose up -d --build --wait
   docker compose restart kong
   ```

## Common commands

| Task | Command |
| --- | --- |
| Check the Kong config | `docker compose run --rm --no-deps kong kong config parse /kong/kong.yml` |
| Apply a `kong.yml` change | `docker compose restart kong` |
| Follow the logs | `docker compose logs -f kong auth-service` |
| Stop everything | `docker compose down` |

## Reading errors

| Response | Meaning |
| --- | --- |
| `404` with `no Route matched with those values` | No route in `kong.yml` matches this path |
| `404` with `{"detail":"Not Found"}` | Kong found the service, but the service has no such endpoint |
| `502` or `503` | Kong matched the route, but the service is down. Run `docker compose ps` |

## Not set up yet

CORS, gateway rate limiting, and TLS are not configured. Kong only accepts connections from this machine (`127.0.0.1`), so change that binding only when you add TLS for a hosted environment.
