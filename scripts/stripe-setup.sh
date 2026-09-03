#!/usr/bin/env bash
# Wandful — Stripe billing setup. Run once after `stripe login`
# (or with STRIPE_SECRET_KEY exported). Creates the Pro product and both
# prices, and prints the payment links to put on the pricing page.
set -euo pipefail
command -v stripe >/dev/null || { echo "install: brew install stripe/stripe-cli/stripe"; exit 1; }

stripe products create \
  --name "Wandful Pro" \
  --description "Hosted AI inference for Wandful — no API key, no setup. Unlimited spells on every tier." \
  > /tmp/wf-product.json

PRODUCT=$(cat /tmp/wf-product.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

stripe prices create --product "$PRODUCT" \
  --unit-amount 400 --currency usd --recurring 'interval=month' \
  --nickname "Pro monthly" > /tmp/wf-price-m.json
stripe prices create --product "$PRODUCT" \
  --unit-amount 3900 --currency usd --recurring 'interval=year' \
  --nickname "Wandful Pro (yearly)" > /tmp/wf-price-y.json

echo "product: $PRODUCT"
echo "monthly:  $(cat /tmp/wf-price-m.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
echo "yearly:   $(cat /tmp/wf-price-y.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
echo
stripe payment_links create --line-items "0[price]=$(cat /tmp/wf-price-m.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')" \
  > /tmp/wf-link-m.json 2>/dev/null && echo "monthly link: $(cat /tmp/wf-link-m.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')"
stripe payment_links create --line-items "0[price]=$(cat /tmp/wf-price-y.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')" \
  > /tmp/wf-link-y.json 2>/dev/null && echo "yearly link:  $(cat /tmp/wf-link-y.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"])')"
