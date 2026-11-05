# Deploy to Amazon Lightsail

This runs the frontend, Kong, the services, and PostgreSQL on one Lightsail server with Docker Compose.

```text
Internet --> Caddy (ports 80, 443) --> frontend files
                                   --> /api --> Kong --> auth-service --> PostgreSQL
```

Only Caddy is reachable from the internet. It handles HTTPS and serves the built frontend.

## Cost

Check the price on the create-instance page before you confirm. A free offer is limited in time and depends on your account, and a paid plan costs money after it ends. **A stopped instance is still billed**, so see [Stop paying](#stop-paying).

Choose the **1 GB plan with a public IPv4 address**. In testing, the running stack used about 230 MB and the frontend build fit in 512 MB. PostgreSQL runs in a container because the managed database is a separate paid product.

## 1. Create the server

1. In the [Lightsail console](https://lightsail.aws.amazon.com/), choose **Create instance**.
2. Choose **Linux/Unix**, then **OS Only**, then **Ubuntu 24.04 LTS**.
3. Under the SSH key, choose **Download default key**. Move it to `~/.ssh/crmai-lightsail.pem`.
4. Choose the 1 GB plan, name it `crmai`, and create it.
5. Open the instance. Under **Networking**, attach a **static IP**, so the address does not change when the server restarts.
6. Under **IPv4 Firewall**, keep port 22 and port 80, and add **HTTPS (443)**. For port 22, turn on **Restrict to IP address** and enter your own IP address.

On your laptop, protect the key:

```bash
chmod 600 ~/.ssh/crmai-lightsail.pem
```

## 2. Prepare the server

Connect, using your static IP in place of `YOUR_IP`:

```bash
ssh -i ~/.ssh/crmai-lightsail.pem ubuntu@YOUR_IP
```

Add 1 GB of swap as a safety margin for builds:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker ubuntu
```

Type `exit`, then connect again so the Docker permission applies.

## 3. Copy the code

The repository is private, so copy it from your laptop. This puts no GitHub credentials on the server. Run this from the repository root on your **laptop**:

```bash
git fetch origin && git archive --format=tar origin/dev | ssh -i ~/.ssh/crmai-lightsail.pem ubuntu@YOUR_IP 'mkdir -p crmai && tar -x -C crmai'
```

## 4. Configure it

On the **server**:

```bash
cd ~/crmai && sh scripts/setup-dev.sh
```

This creates JWT keys and a database password that only this server has. Now add the site address. Without a domain, `sslip.io` gives you a free hostname for your IP address, and Caddy gets an HTTPS certificate for it automatically.

```bash
echo 'SITE_ADDRESS=YOUR_IP.sslip.io' >> .env
```

```bash
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> .env
```

If you own a domain, point its A record at the static IP and use that domain as `SITE_ADDRESS`.

**Which frontend mode?** The default uses the real backend, where only sign up, login, and sign out work, because other pages have no services yet. For a demo where every page works with fake data kept in the browser, also run this:

```bash
echo 'VITE_USE_MOCK=true' >> .env
```

## 5. Start it

```bash
docker compose up -d --build --wait
```

The first build takes a few minutes. Then check it:

```bash
docker compose ps
```

```bash
curl https://YOUR_IP.sslip.io/api/v1/auth/health
```

Expected: `{"status":"ok","service":"auth"}`. Open `https://YOUR_IP.sslip.io` in a browser and create a workspace.

**Do not run `scripts/seed-dev-users.py` on this server.** Its password is public.

## Update to a new version

Run the command from step 3 on your laptop, then this on the server:

```bash
cd ~/crmai && docker compose up -d --build --wait
```

Your `.env`, keys, and database are kept. Migrations run automatically when `auth-service` starts. Files deleted from git stay on the server until you remove them.

## Back up the database

Run this on your laptop. It saves a copy of the database to your laptop:

```bash
ssh -i ~/.ssh/crmai-lightsail.pem ubuntu@YOUR_IP 'cd ~/crmai && docker compose exec -T postgres pg_dump -U crmai crmai' > crmai-backup.sql
```

Do not commit the file, because it contains user data. Back up before updates.

## When something goes wrong

| Problem | What to do |
| --- | --- |
| A service is not running | `docker compose ps`, then `docker compose logs --tail 50 SERVICE_NAME` |
| Browser shows a certificate error | Run `docker compose logs web`. Check that port 80 and port 443 are open and `SITE_ADDRESS` matches your IP. If `sslip.io` hits a certificate limit, use your own domain |
| `Set SITE_ADDRESS in .env` | Repeat step 4 |
| `ssh` times out | Your IP address changed. Update the port 22 rule in the Lightsail firewall |
| The server runs out of memory | `free -h` and `docker stats --no-stream`. Move to a larger plan through a snapshot |

## Stop paying

Stopping is not enough. In the Lightsail console, delete the instance, then delete the static IP, because an unattached static IP can also be billed. Delete any snapshots too. Back up the database first, because deleting the instance deletes the data.
