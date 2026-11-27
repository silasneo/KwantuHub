#!/usr/bin/env bash
# Runs on the VM as root via AWS Systems Manager.
# Usage: deploy.sh <image> <git-sha>
set -euo pipefail

IMAGE="${1:?image required}"
REF="${2:?git sha required}"
ROOT=/opt/kwantuhub
RAW="https://raw.githubusercontent.com/silasneo/KwantuHub/${REF}"
ENV_PARAM="${KWANTUHUB_ENV_PARAM:-/kwantuhub/prod/env}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"

mkdir -p "$ROOT/deploy"
cd "$ROOT"

for file in docker-compose.yml garage.toml deploy/compose.prod.yml deploy/Caddyfile; do
  curl -fsSL "$RAW/$file" -o "$file.tmp"
  mv "$file.tmp" "$file"
done

umask 077
# The snap-packaged AWS CLI writes nothing when stdout is redirected to a file, so capture first.
env_value="$(aws ssm get-parameter --name "$ENV_PARAM" --with-decryption --query Parameter.Value --output text)"
printf '%s\n' "$env_value" > .env.tmp
unset env_value
if ! grep -q '^JWT_SECRET=' .env.tmp; then
  echo "Parameter $ENV_PARAM is empty or missing JWT_SECRET" >&2
  rm -f .env.tmp
  exit 1
fi
printf '\nKWANTUHUB_IMAGE=%s\n' "$IMAGE" >> .env.tmp
mv .env.tmp .env
umask 022

compose() { docker compose -p kwantuhub -f docker-compose.yml -f deploy/compose.prod.yml "$@"; }

docker pull --quiet "$IMAGE"
compose up -d --no-build mysql garage
compose --profile maintenance run --rm migrate
compose up -d --no-build --remove-orphans app worker caddy

state=""
for _ in $(seq 1 36); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q app)" 2>/dev/null || true)"
  [ "$state" = healthy ] && break
  sleep 5
done
if [ "$state" != healthy ]; then
  echo "App did not become healthy (state: ${state:-missing})" >&2
  compose logs --tail 80 app worker >&2
  exit 1
fi

curl -fsS http://127.0.0.1:3000/api/v1/health
echo
docker image prune -af --filter "until=168h" >/dev/null
echo "Deployed ${IMAGE}"
