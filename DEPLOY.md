# Deployment Guide

## System Requirements

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| OS | Ubuntu 20.04+, Windows Server 2019+, macOS | Ubuntu 22.04 LTS |
| CPU | 1 core | 2+ cores |
| RAM | 512 MB | 1 GB+ |
| Disk | 1 GB | 2 GB+ |
| Docker | 20.10+ | Latest |
| Docker Compose | v2.0+ | Latest |

### Network Requirements

- Port 1040 (or your chosen port) open for HTTP traffic
- Port 443 if using HTTPS with reverse proxy
- Outbound internet access for pulling Docker images

---

## GitHub Repository Setup

### Step 1: Configure Repository Permissions

1. Open your repository on GitHub
2. Go to **Settings** → **Actions** → **General**
3. Scroll to "Workflow permissions"
4. Select **Read and write permissions**
5. Check **Allow GitHub Actions to create and approve pull requests**
6. Click **Save**

### Step 2: Verify Packages Access

1. Go to **Settings** → **Actions** → **General**
2. Ensure "Workflow permissions" allows package publishing
3. For private repos: verify your GitHub plan supports Packages

### Step 3: Create Your First Release

```bash
# Ensure all changes are committed
git add .
git commit -m "Prepare for release"
git push origin main

# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

### Step 4: Monitor Build

1. Go to the **Actions** tab in your repository
2. Watch the "Release" workflow progress
3. Once complete:
   - Docker image available in **Packages** (right sidebar)
   - Windows/Android builds in **Releases**

---

## Deployment Options

### Option A: Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/radiolla.git
cd radiolla

# Start the application
docker compose up -d

# View logs
docker compose logs -f

# Stop the application
docker compose down
```

### Option B: Pre-built Image from GitHub

```bash
# Pull the latest image
docker pull ghcr.io/YOUR_USERNAME/radiolla:latest

# Run the container
docker run -d \
  --name radiolla \
  --restart unless-stopped \
  -p 1040:80 \
  ghcr.io/YOUR_USERNAME/radiolla:latest
```

### Option C: Build Locally

```bash
# Build the image
docker build -t radiolla .

# Run the container
docker run -d --name radiolla -p 1040:80 radiolla
```

---

## CI/CD Pipeline

### Continuous Integration (CI)

Triggered on every push and pull request to `main`:

- TypeScript type checking
- Web build verification
- Artifacts uploaded for review

### Continuous Deployment (CD)

Triggered when you push a version tag (`v*`):

| Build | Output | Location |
|-------|--------|----------|
| Docker | Container image | GitHub Packages (ghcr.io) |
| Windows | Installer (.exe) | GitHub Releases |
| Android | APK | GitHub Releases |

---

## Server Configuration

### Basic Setup (Linux)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in, then:
docker compose up -d
```

### Reverse Proxy with nginx

```nginx
server {
    listen 80;
    server_name radiolla.yourdomain.com;

    location / {
        proxy_pass http://localhost:1040;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### HTTPS with Certbot

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d radiolla.yourdomain.com
```

---

## Updating

### Update via Docker Compose

```bash
cd radiolla
git pull
docker compose pull
docker compose up -d
```

### Update via Direct Image

```bash
docker pull ghcr.io/YOUR_USERNAME/radiolla:latest
docker stop radiolla
docker rm radiolla
docker run -d --name radiolla --restart unless-stopped -p 1040:80 ghcr.io/YOUR_USERNAME/radiolla:latest
```

---

## Release Checklist

- [ ] Update `version` in `package.json`
- [ ] Update `version` in `app.json`
- [ ] Commit changes: `git commit -am "Bump version to x.x.x"`
- [ ] Create tag: `git tag vx.x.x`
- [ ] Push: `git push origin main --tags`
- [ ] Monitor Actions tab for build completion
- [ ] Verify release artifacts
- [ ] Deploy to production server
