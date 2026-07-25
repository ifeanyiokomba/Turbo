#!/bin/bash
# API-level functional test of core financial flows
set +e
cd /home/z/my-project
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f "next dev" 2>/dev/null; sleep 2; rm -f dev.log
./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$CODE" = "200" ] && break; sleep 1
done
echo "Server: HTTP $CODE"

BASE=http://localhost:3000
JAR=/tmp/tp_cookies.txt
rm -f $JAR

echo "=== Register test user ==="
REG=$(curl -s -c $JAR -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d '{"firstName":"Test","lastName":"User","username":"user7751","email":"user7751@turbopay.ng","phone":"8084987751","country":"NG","password":"Welcome@1234"}')
echo "$REG" | head -c 200; echo
BAL_BEFORE=$(echo "$REG" | grep -o '"balanceKobo":[0-9]*' | head -1)
echo "Wallet before fund: $BAL_BEFORE"

echo "=== Fund wallet (demo ₦10,000) ==="
FUND=$(curl -s -b $JAR -X POST $BASE/api/wallet/fund -H "Content-Type: application/json" -d '{"amountKobo":1000000,"method":"demo"}')
echo "$FUND" | head -c 250; echo
BAL_AFTER_FUND=$(echo "$FUND" | grep -o '"newBalance":[0-9]*' | head -1)
echo "Balance after fund: $BAL_AFTER_FUND"

echo "=== Set transaction PIN ==="
PINRES=$(curl -s -b $JAR -X POST $BASE/api/settings/pin -H "Content-Type: application/json" -d '{"pin":"7391"}')
echo "$PINRES" | head -c 150; echo

echo "=== Buy airtime (MTN ₦500) ==="
AIR=$(curl -s -b $JAR -X POST $BASE/api/airtime -H "Content-Type: application/json" -d '{"network":"MTN","phone":"08012345678","amountKobo":50000,"pin":"7391"}')
echo "$AIR" | head -c 250; echo
BAL_AFTER_AIR=$(echo "$AIR" | grep -o '"newBalance":[0-9]*' | head -1)
echo "Balance after airtime: $BAL_AFTER_AIR"

echo "=== Pay bill (electricity ₦2,000) ==="
BILL=$(curl -s -b $JAR -X POST $BASE/api/bills -H "Content-Type: application/json" -d '{"category":"ELECTRICITY","billerCode":"EKEDC","billerName":"Eko Electric","customerRef":"1234567890","amountKobo":200000,"pin":"7391"}')
echo "$BILL" | head -c 300; echo

echo "=== Create virtual card ==="
CARD=$(curl -s -b $JAR -X POST $BASE/api/cards -H "Content-Type: application/json" -d '{"cardholder":"TEST USER"}')
echo "$CARD" | head -c 250; echo
CARD_ID=$(echo "$CARD" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "=== Fund card ₦5,000 ==="
if [ -n "$CARD_ID" ]; then
  CFUND=$(curl -s -b $JAR -X POST $BASE/api/cards/$CARD_ID/fund -H "Content-Type: application/json" -d '{"amountKobo":500000,"pin":"7391"}')
  echo "$CFUND" | head -c 250; echo
fi

echo "=== Savings deposit ==="
SAV=$(curl -s -b $JAR -X POST $BASE/api/savings -H "Content-Type: application/json" -d '{"productId":"first","amountKobo":100000,"type":"DEPOSIT","pin":"7391"}')
echo "$SAV" | head -c 200; echo

echo "=== KYC upgrade (NIN) ==="
KYC=$(curl -s -b $JAR -X POST $BASE/api/kyc -H "Content-Type: application/json" -d '{"tier":2,"nin":"12345678901"}')
echo "$KYC" | head -c 200; echo

echo "=== AI Support ==="
AI=$(curl -s -b $JAR -X POST $BASE/api/ai-support -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"How do I fund my wallet?"}]}')
echo "$AI" | head -c 300; echo

echo "=== Dashboard ==="
DASH=$(curl -s -b $JAR $BASE/api/dashboard)
echo "$DASH" | grep -o '"balanceKobo":[0-9]*' | head -1

echo "=== DONE ==="
kill -9 $DEV_PID 2>/dev/null
