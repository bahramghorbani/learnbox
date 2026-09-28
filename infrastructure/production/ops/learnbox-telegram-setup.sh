#!/usr/bin/env bash
# LearnBox — secure Telegram bot setup (LB-B02 monitoring, LB-B04/LB-B08 support).
#
# Run this in your own Terminal. It asks for each bot token with HIDDEN input, verifies the bot,
# discovers your chat id automatically, sends a test message, and stores the values in the
# Production env file over SSH.
#
# The token is never printed, never written to shell history, never committed, and never sent to
# the chat. Only the non-secret bot id and chat id are shown.
set -uo pipefail

SSH_HOST="${LEARNBOX_SSH_HOST:-learnbox-prod}"
ENV_PATH="/home/ubuntu/learnbox/app/.env"
API="https://api.telegram.org"

c_ok()   { printf '\033[32m%s\033[0m\n' "$1"; }
c_bad()  { printf '\033[31m%s\033[0m\n' "$1"; }
c_info() { printf '\033[36m%s\033[0m\n' "$1"; }
# Telegram usernames are case-insensitive; normalise before comparing.
lower()  { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

need() { command -v "$1" >/dev/null 2>&1 || { c_bad "Missing required tool: $1"; exit 1; }; }
need curl; need python3; need ssh

json() { python3 -c 'import json,sys;
try:
    d=json.load(sys.stdin)
except Exception:
    print(""); sys.exit(0)
import functools
p=sys.argv[1].split(".")
cur=d
for k in p:
    if cur is None: break
    if k.isdigit():
        cur = cur[int(k)] if isinstance(cur,list) and len(cur)>int(k) else None
    else:
        cur = cur.get(k) if isinstance(cur,dict) else None
print("" if cur is None else cur)' "$1"; }

setup_bot() {
  local channel="$1" username="$2" test_message="$3" token_key="$4" chat_key="$5"

  echo ""
  c_info "──────────────────────────────────────────────"
  c_info " $channel bot: @$username"
  c_info "──────────────────────────────────────────────"
  echo "Before continuing, open @$username in Telegram, press Start, and send it any message."
  read -r -p "Press Enter once you have sent a message to @$username... " _

  local token=""
  for attempt in 1 2 3; do
    # -s hides typing; the value stays in this process only.
    read -r -s -p "Paste the Bot Token for @$username (hidden, then Enter): " token
    echo ""
    [ -n "$token" ] || { c_bad "Empty input."; continue; }

    local me bot_user bot_id
    me="$(curl -sS --max-time 20 "$API/bot$token/getMe")"
    if [ "$(printf '%s' "$me" | json ok)" != "True" ]; then
      c_bad "Telegram rejected that token (attempt $attempt/3). Check you copied the whole token."
      token=""
      continue
    fi
    bot_user="$(printf '%s' "$me" | json result.username)"
    bot_id="$(printf '%s' "$me" | json result.id)"
    c_ok "Verified bot: @$bot_user (id $bot_id)"

    # Telegram usernames are case-insensitive: getMe may answer "Learnboxmonitoringbot"
    # for the bot we call "@learnboxmonitoringbot". Compare case-insensitively so a correct
    # token is never rejected, while a genuinely different bot is still caught.
    if [ "$(lower "$bot_user")" != "$(lower "$username")" ]; then
      c_bad "That token belongs to @$bot_user but this step expects @$username."
      c_bad "Refusing to continue so the two bots cannot be cross-wired."
      token=""
      continue
    fi
    break
  done
  [ -n "$token" ] || { c_bad "Could not verify @$username. Skipping."; return 1; }

  # --- automatic chat id discovery -------------------------------------------------
  local hook updates chat_id chat_type
  hook="$(curl -sS --max-time 20 "$API/bot$token/getWebhookInfo" | json result.url)"
  if [ -n "$hook" ]; then
    c_bad "A webhook is configured for @$username ($hook)."
    c_bad "Not removing it. Send a message to the bot and re-run, or clear the webhook yourself."
    return 1
  fi

  chat_id=""
  for attempt in 1 2 3 4 5; do
    updates="$(curl -sS --max-time 20 "$API/bot$token/getUpdates?limit=50&timeout=0")"
    chat_id="$(printf '%s' "$updates" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for u in reversed(d.get("result",[])):
    m = u.get("message") or u.get("edited_message") or u.get("channel_post")
    if m and m.get("chat",{}).get("id") is not None:
        print(m["chat"]["id"]); break
')"
    [ -n "$chat_id" ] && break
    c_info "No message seen yet (attempt $attempt/5). Send a message to @$username now..."
    sleep 6
  done

  if [ -z "$chat_id" ]; then
    c_bad "Automatic chat id discovery failed for @$username after 5 attempts."
    c_bad "Most likely no message reached the bot. Send 'hello' to @$username and re-run."
    return 1
  fi
  c_ok "Discovered chat id automatically: $chat_id"

  # --- verify delivery -------------------------------------------------------------
  local send
  send="$(curl -sS --max-time 20 -X POST "$API/bot$token/sendMessage" \
      --data-urlencode "chat_id=$chat_id" \
      --data-urlencode "text=$test_message")"
  if [ "$(printf '%s' "$send" | json ok)" != "True" ]; then
    c_bad "Test message to @$username failed."
    return 1
  fi
  c_ok "Test message delivered to @$username."

  # --- persist to production env (backup first, never echoed) ----------------------
  # The values travel over the encrypted SSH channel on stdin, never as command-line
  # arguments, so they cannot appear in the remote process list or in any shell history.
  ssh "$SSH_HOST" "cp -n $ENV_PATH $ENV_PATH.bak-pre-telegram-\$(date +%Y%m%d) 2>/dev/null || true"

  ssh "$SSH_HOST" 'cat > /tmp/lb_env_set.sh' <<'REMOTE'
set -euo pipefail
ENV_PATH=/home/ubuntu/learnbox/app/.env
IFS= read -r TK
IFS= read -r CK
IFS= read -r TOKEN_VALUE
IFS= read -r CHAT_VALUE
[ -n "$TK" ] && [ -n "$CK" ] && [ -n "$TOKEN_VALUE" ] && [ -n "$CHAT_VALUE" ] || exit 2
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
grep -v -E "^(${TK}|${CK})=" "$ENV_PATH" > "$tmp" || true
printf '%s=%s\n' "$TK" "$TOKEN_VALUE" >> "$tmp"
printf '%s=%s\n' "$CK" "$CHAT_VALUE"  >> "$tmp"
install -m 600 "$tmp" "$ENV_PATH"
REMOTE

  if printf '%s\n%s\n%s\n%s\n' "$token_key" "$chat_key" "$token" "$chat_id" \
      | ssh "$SSH_HOST" 'bash /tmp/lb_env_set.sh; rc=$?; rm -f /tmp/lb_env_set.sh; exit $rc'; then
    c_ok "Stored $token_key and $chat_key in the Production env file (mode 600)."
  else
    c_bad "Failed to store values on the server."
    unset token
    return 1
  fi
  unset token
  return 0
}

echo "LearnBox Telegram setup — tokens are entered hidden and never shown or logged."
mon_rc=0; sup_rc=0
setup_bot "MONITORING" "learnboxmonitoringbot" \
  "LearnBox Monitoring — test alert received successfully." \
  "LEARNBOX_MONITORING_TELEGRAM_BOT_TOKEN" "LEARNBOX_MONITORING_TELEGRAM_CHAT_ID" || mon_rc=1

setup_bot "SUPPORT" "learnboxsupportbot" \
  "LearnBox Support — support channel connection verified." \
  "LEARNBOX_SUPPORT_TELEGRAM_BOT_TOKEN" "LEARNBOX_SUPPORT_TELEGRAM_CHAT_ID" || sup_rc=1

echo ""
c_info "──────────── RESULT ────────────"
[ $mon_rc -eq 0 ] && c_ok "monitoring: configured and verified" || c_bad "monitoring: NOT configured"
[ $sup_rc -eq 0 ] && c_ok "support:    configured and verified" || c_bad "support:    NOT configured"
echo ""
echo "Tell Hermes when this finishes. Hermes will read only the non-secret bot/chat ids to continue."
