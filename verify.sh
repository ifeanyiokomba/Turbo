#!/bin/bash
# Turbopay verification — IIFE-wrapped evals
set +e
cd /home/z/my-project
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f "next dev" 2>/dev/null; sleep 2; rm -f dev.log
./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$CODE" = "200" ] && { echo "Server ready after ${i}s"; break; }
  sleep 1
done
[ "$CODE" != "200" ] && { echo "SERVER FAILED"; tail -20 dev.log; exit 1; }

agent-browser close 2>/dev/null; sleep 1
agent-browser open http://localhost:3000/ 2>&1 | tail -1; sleep 5

ev() { agent-browser eval "$1" 2>&1 | tail -1; }
setval() { ev "(()=>{const e=document.getElementById('$1');if(!e)return 'NO_EL';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(e,'$2');e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()"; }
clicktext() { ev "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='$1');if(b){b.click();return 'clicked'}return 'nf'})()"; }
clickcontains() { ev "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('$1'));if(b){b.click();return 'clicked'}return 'nf'})()"; }
mainHeading() { ev "(()=>{const h=document.querySelector('main h1, main h2');return h?h.textContent.trim().slice(0,60):'none'})()"; }
errCount() { agent-browser errors 2>&1 | grep -ciE "error|exception" || echo 0; }

echo "=== Step 1: Landing ==="
ev "(()=>{return document.querySelectorAll('h1,h2,h3').length+' headings'})()"

echo "=== Step 2: Open auth ==="
clickcontains "Get Started"; sleep 2

echo "=== Step 3: Login as admin ==="
setval "identifier" "admin@turbopay.ng"
setval "pwd" "Admin@1234"
ev "(()=>{const b=Array.from(document.querySelectorAll('button[type=submit]')).find(x=>x.textContent.includes('Sign in'));if(b){b.click();return 'clicked'}return 'nf'})()"
sleep 5
echo "After login: $(mainHeading) | errors=$(errCount)"

echo "=== Step 4: Navigate all views ==="
VIEWS=("Wallet" "Transfer" "Airtime & Data" "Pay Bills" "Virtual Cards" "Savings" "Investments" "KYC & Limits" "Beneficiaries" "Rewards" "Security" "Settings" "Help & Support" "Transactions" "Home")
for v in "${VIEWS[@]}"; do
  clicktext "$v"; sleep 3
  echo "[$v] heading='$(mainHeading)' errors=$(errCount)"
done

echo "=== Step 5: Fund wallet ==="
clicktext "Wallet"; sleep 3
clickcontains "Fund wallet"; sleep 2
ev "(()=>{const i=document.querySelector('input[type=number]');if(!i)return 'noinput';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'5000');i.dispatchEvent(new Event('input',{bubbles:true}));return 'set'})()"
sleep 1
clickcontains "Fund"; sleep 1
clickcontains "Confirm"; sleep 1
clickcontains "Add money"; sleep 1
sleep 3
echo "After fund: errors=$(errCount)"

echo "=== Step 6: Airtime purchase ==="
clicktext "Airtime & Data"; sleep 3
# click MTN network button
ev "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('MTN'));if(b){b.click();return 'mtn'}return 'nf'})()"
sleep 1
ev "(()=>{const i=document.querySelector('input[type=tel], input[placeholder*=hone]');if(!i)return 'nophone';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'08012345678');i.dispatchEvent(new Event('input',{bubbles:true}));return 'set'})()"
sleep 1
# enter amount
ev "(()=>{const ins=Array.from(document.querySelectorAll('input')).filter(i=>i.type==='number'||i.type==='text');const i=ins.find(x=>x.placeholder&&/amount|mount/i.test(x.placeholder))||ins[0];if(!i)return 'noamt';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'500');i.dispatchEvent(new Event('input',{bubbles:true}));return 'set'})()"
sleep 1
clickcontains "Buy airtime"; sleep 2
# PIN dialog — enter 1234
ev "(()=>{const i=document.querySelector('input[inputmode=numeric]');if(!i)return 'nopin';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'1234');i.dispatchEvent(new Event('input',{bubbles:true}));return 'set'})()"
sleep 3
echo "After airtime: errors=$(errCount) heading=$(mainHeading)"

echo "=== Step 7: AI Support ==="
clicktext "Home"; sleep 2
ev "(()=>{const b=document.querySelector('button.fixed');if(b){b.click();return 'opened'}return 'nofixed'})()"
sleep 3
ev "(()=>{return document.body.textContent.includes('Turbopay Assistant')||document.body.textContent.includes('assistant')?'ai-open':'no-ai'})()"

echo "=== Step 8: Admin ==="
clicktext "Admin Console"; sleep 4
echo "Admin: heading=$(mainHeading) errors=$(errCount)"

echo "=== Screenshots ==="
agent-browser set viewport 1440 900 2>&1 | tail -1; sleep 1
agent-browser screenshot --full /home/z/my-project/download/final-check.png 2>&1 | tail -1
agent-browser set viewport 390 844 2>&1 | tail -1; sleep 1
agent-browser screenshot --full /home/z/my-project/download/mobile-check.png 2>&1 | tail -1

echo "=== DONE ==="
kill -9 $DEV_PID 2>/dev/null
