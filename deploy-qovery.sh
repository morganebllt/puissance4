#!/usr/bin/env bash
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
API="https://api.qovery.com"
TOKEN="${QOVERY_API_TOKEN:-}"
ORG_ID="141c07c8-0dd9-4623-983b-3fdd61867255"
GIT_URL="https://github.com/morganebllt/puissance4"
GIT_BRANCH="claude/connect-four-game-9UVbS"
APP_NAME="puissance4"
PROJECT_NAME="puissance4"
ENV_NAME="production"

# ─── Check token ──────────────────────────────────────────────────────────────
if [[ -z "$TOKEN" ]]; then
  echo "Usage: QOVERY_API_TOKEN=qov_... bash deploy-qovery.sh"
  exit 1
fi

H="Authorization: Token $TOKEN"

q() { curl -sf -H "$H" -H "Content-Type: application/json" "$@"; }

echo "🔍 Recherche du cluster..."
CLUSTER_ID=$(q "$API/organization/$ORG_ID/cluster" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['results']; print(r[0]['id'])")
CLUSTER_NAME=$(q "$API/organization/$ORG_ID/cluster" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['results']; print(r[0]['name'])")
echo "  ✓ Cluster : $CLUSTER_NAME ($CLUSTER_ID)"

echo "📁 Création du projet..."
PROJECT=$(q -X POST "$API/organization/$ORG_ID/project" \
  -d "{\"name\":\"$PROJECT_NAME\",\"description\":\"Puissance 4 multijoueur\"}")
PROJECT_ID=$(echo "$PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  ✓ Projet : $PROJECT_NAME ($PROJECT_ID)"

echo "🌍 Création de l'environnement..."
ENV=$(q -X POST "$API/project/$PROJECT_ID/environment" \
  -d "{\"name\":\"$ENV_NAME\",\"mode\":\"DEVELOPMENT\",\"cluster\":\"$CLUSTER_ID\"}")
ENV_ID=$(echo "$ENV" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  ✓ Environnement : $ENV_NAME ($ENV_ID)"

echo "🚀 Création de l'application..."
APP=$(q -X POST "$API/environment/$ENV_ID/application" -d "{
  \"name\": \"$APP_NAME\",
  \"git_repository\": {
    \"url\": \"$GIT_URL\",
    \"branch\": \"$GIT_BRANCH\",
    \"root_path\": \"/\",
    \"provider\": \"GITHUB\"
  },
  \"build_mode\": \"DOCKER\",
  \"dockerfile_path\": \"Dockerfile\",
  \"cpu\": 500,
  \"memory\": 512,
  \"min_running_instances\": 1,
  \"max_running_instances\": 1,
  \"ports\": [{
    \"internal_port\": 3000,
    \"external_port\": 443,
    \"protocol\": \"HTTP\",
    \"publicly_accessible\": true,
    \"name\": \"http\"
  }],
  \"healthchecks\": {
    \"liveness_probe\": {
      \"type\": {\"tcp\": {\"port\": 3000}},
      \"initial_delay_seconds\": 30,
      \"period_seconds\": 10,
      \"timeout_seconds\": 5,
      \"success_threshold\": 1,
      \"failure_threshold\": 3
    }
  },
  \"auto_deploy\": true
}")
APP_ID=$(echo "$APP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  ✓ Application créée ($APP_ID)"

echo "⚙️  Variable NODE_ENV..."
q -X POST "$API/application/$APP_ID/environmentVariable" \
  -d '{"key":"NODE_ENV","value":"production"}' > /dev/null

echo "▶️  Déploiement en cours..."
q -X POST "$API/environment/$ENV_ID/deploy" -d '{}' > /dev/null

echo ""
echo "✅ Déploiement lancé !"
echo ""
echo "🔗 Console : https://console.qovery.com/organization/$ORG_ID/project/$PROJECT_ID/environment/$ENV_ID"
echo ""
echo "📋 Surveille les logs avec :"
echo "   qovery context set  # choisis $PROJECT_NAME > $ENV_NAME > $APP_NAME"
echo "   qovery status --watch"
echo "   qovery log --application $APP_NAME"
