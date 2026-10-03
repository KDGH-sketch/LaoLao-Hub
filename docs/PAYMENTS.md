# Selling plans with Lao mobile banking

Research notes and the recommended design for letting learners buy a plan with BCEL One and other Lao banking apps.
Researched October 2026. Fees and terms change: confirm them with the provider before signing.

## How learners in Laos pay online

| Option | Who can pay | What the business needs | Cost (published) | Automatic? |
|---|---|---|---|---|
| **LAO QR / BCEL OnePay QR, checked by hand** | Anyone with a Lao banking app (LAO QR works across 14 LAPNet member banks) | A bank account and its merchant QR | Bank's usual merchant fee | No: an admin checks each transfer |
| **PhaJay payment gateway** (Lao aggregator) | BCEL, JDB, LDB, Indochina Bank, ST Bank, M-Money X; also cards, Alipay, WeChat Pay | KYC with PhaJay, a settlement bank account | Not published: ask PhaJay | **Yes**: payment link + webhook |
| **BCEL Online Payment Gateway** (direct) | BCEL OnePay QR, Visa, Mastercard, JCB, UnionPay, Amex, Alipay, WeChat Pay | Registered legal entity in Laos, business + tax licence, ID, BCEL LAK/USD account | QR from 1.5%, cards from 3%, US$45/month; paid out next business day (T+1) | Yes, but integration goes through BCEL's team (CyberSource / NTT Data platform) |

Notes:
- **LAO QR** is the national standard (Bank of the Lao PDR, launched 2020, run by LAPNet). One LAO QR code can be paid from any member bank's app.
- PhaJay's documentation notes that **a BCEL QR is not a LAO QR**: a BCEL code is paid with the BCEL One app. PhaJay therefore creates a QR for the bank the learner chooses, or one payment page offering all banks.
- PhaJay offers a sandbox, payment links (a hosted page where the learner picks a bank), bank-specific QR codes with app deep links, and webhooks. The method for checking webhook signatures and the fees are given to merchants after sign-up; they are not public.

## Recommendation

1. **Start now, with no contract: manual LAO QR.** On the Account page, the learner sees the plans with prices in LAK and the business's LAO QR (or BCEL OnePay QR). They pay in their banking app and upload the transfer slip. An admin sees a **Payment requests** list and approves with one click, which runs the existing "Assign plan". This needs no third party and works with every Lao bank.
2. **Then automate with PhaJay.** Once KYC is done, "Buy" opens PhaJay's payment page. The learner pays with BCEL One, JDB, LDB and others, and access is granted automatically within seconds.
3. **Later, optionally, BCEL directly**, if volume makes the lower QR fee worth the monthly fee and the integration work.

## Design for automatic payments (step 2)

Nothing secret is in the browser: the PhaJay key and the Supabase service key live only in Supabase Edge Functions.

```
Learner (Account → Buy "Premium 1 year")
  │  1. POST /functions/v1/create-payment  { planId }        (signed in; the price is read from the plans table, never from the browser)
  ▼
Edge Function create-payment
  │  2. insert orders/{orderId} { uid, planId, amount, currency:"LAK", status:"pending" }
  │  3. POST https://payment-gateway.phajay.co/v1/api/link/payment-link
  │       { orderNo: orderId, amount, description: "LaoLao – Premium 1 year", tag1: uid, tag2: planId }
  │     ← { redirectURL }
  ▼
Learner pays on PhaJay's page with BCEL One / JDB / LDB / …
  │
  ▼
PhaJay → POST /functions/v1/payment-webhook  { orderNo, transactionId, txnAmount, paymentMethod, status, … }
Edge Function payment-webhook
  4. verify the signature (key and method from PhaJay)
  5. load orders/{orderNo}; stop if already paid (webhooks can repeat); check txnAmount == amount and status == success
  6. with the service key: write subscriptions/{id} { source:"payment", reference: transactionId, … },
     update access/{uid} { planId, tier, status:"active", expiresAt: extended by the plan's duration }, set the order to paid
  ▼
Learner returns to the Success URL → the app shows "Payment received" and reloads their access
```

The existing data model already separates **access** from **payment**, so the security policies, bundles and the learner app need no changes. Only an `orders` table and the two Edge Functions are new.

## What the business needs to decide or provide

- Prices in LAK for each plan (USD optional), and a refund policy.
- For step 1: the business's LAO QR or BCEL OnePay merchant QR image, and who approves payments.
- For step 2: PhaJay portal account and KYC, a settlement bank account, the Success / Cancel URLs, and the webhook URL (the Edge Function).
- For step 3: business licence, tax licence and a BCEL account (BCEL card centre: +856 21 211012 ext. 3, cardcenter@bcel.com.la).

## Sources

- BCEL Online Payment Gateway: https://www.bcel.com.la/bcel/product-review.html?prd=e-banking&id=online-payment&lang=en
- BCEL OnePay: https://www.bcel.com.la/bcel/product-review.html?prd=e-banking&id=OnePay&lang=en
- PhaJay documentation: https://payment-doc.lailaolab.com/v1 (payment link, generate QR, sandbox, webhook signature)
- PhaJay portal: https://portal.phajay.co
- LAO QR / LAPNet: https://www.globenewswire.com/news-release/2024/12/25/3001834/0/en/Lao-QR-Merchants-Now-Accept-Payments-by-UnionPay-Powered-Wallets-UnionPay-International-and-LAPNet-Launch-Payment-Linkage.html
- Cross-border LAO QR with Vietnam: https://vietnamnews.vn/economy/1690482/seven-banks-allow-customers-to-pay-by-qr-codes-in-laos.html
