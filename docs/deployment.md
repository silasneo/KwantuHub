# Production deployment (EC2 + AWS Systems Manager)

Pushing to `main` runs `.github/workflows/ci-cd.yml`:

1. **test**: `pnpm check` and `pnpm test` (also runs on every pull request).
2. **build**: builds the Docker image and pushes `ghcr.io/silasneo/kwantuhub:<sha>` and `:latest`.
3. **deploy** (GitHub environment `production`, `main` only): assumes `AWS_DEPLOY_ROLE_ARN` through GitHub OIDC and sends an SSM Run Command to `EC2_INSTANCE_ID`. The VM downloads `deploy/deploy.sh` at that commit and runs it.

`deploy/deploy.sh` fetches the compose files at the same commit, writes `/opt/kwantuhub/.env` from the SSM SecureString `/kwantuhub/prod/env`, pulls the image, runs database migrations, restarts `app`, `worker` and `caddy`, and fails the job if the app is not healthy.

## Infrastructure (eu-west-1)

| Resource | Value |
| --- | --- |
| Instance | `i-0daab10d0a0a607da` (Ubuntu, t3.small, 2 GB swap) |
| Elastic IP | `54.229.231.135` |
| Security group | `kwantuhub-web` (80/443 only, no SSH) |
| VM role | `kwantuhub-ec2` (SSM core + read `/kwantuhub/prod/*`) |
| Deploy role | `kwantuhub-gha-deploy` (trusts `repo:silasneo/KwantuHub:environment:production`) |

GitHub variables: `VITE_TURNSTILE_SITE_KEY` (repository); `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `EC2_INSTANCE_ID` (environment `production`).

The stack is `docker-compose.yml` plus `deploy/compose.prod.yml` (project `kwantuhub` in `/opt/kwantuhub`). Caddy terminates TLS for `kwantuhub.dreamhivellc.com` with Let's Encrypt; the DNS record must point at the Elastic IP.

## Common tasks

Change a secret or setting: update the parameter, then re-run the workflow (Actions → CI/CD → Run workflow):

```powershell
aws ssm put-parameter --name /kwantuhub/prod/env --type SecureString --overwrite --value file://prod.env
```

Open a shell on the VM (requires the Session Manager plugin):

```powershell
aws ssm start-session --target i-0daab10d0a0a607da
sudo -i; cd /opt/kwantuhub
docker compose -p kwantuhub -f docker-compose.yml -f deploy/compose.prod.yml ps
```

Roll back: re-run the workflow for an earlier commit, or on the VM run `bash deploy.sh ghcr.io/silasneo/kwantuhub:<old-sha> <old-sha>`.
