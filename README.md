# Global Finance Crypto Mining — Production Platform

A full-stack financial technology and digital investment platform engineered for **GLOBAL FINANCE CRYPTO MINING**. Features persistent relational database storage (SQLite / SQL), double-entry financial ledger accounting, official **PayFast** payment gateway integration, direct electronic bank transfer reconciliation, separate administrator dashboard, client portal, and auditable transaction receipts.

---

## 1. Core Architecture

- **Frontend**: React 19 SPA, Tailwind CSS v4, Lucide Icons, responsive mobile drawer & desktop layouts.
- **Backend**: Node.js & Express (`server.ts`), modular routes, rate limiting, and Bcrypt password encryption.
- **Database & Ledger**: Relational SQLite database with atomic double-entry journal (`financial_ledger`), foreign key constraints, and transactional persistence.
- **Payment Provider**: Official **PayFast (Pty) Ltd** integration (`https://developers.payfast.co.za/`) with server-side MD5 signature calculation and Instant Transaction Notification (ITN) webhook verification.
- **Authentication**: Segregated Client and Administrator authentication with JWT and secure cookies.

---

## 2. Investment Products & Permitted Amounts

All amounts and product minimums are validated authoritatively on the backend. Client-supplied prices are strictly rejected.

| Plan | Minimum Capital | Permitted Denominations | Computational Hardware Tier |
|---|---|---|---|
| **Starter Investment** | R500 | R500, R1,000, R2,500, R5,000 | Core Infrastructure & Standard Custody |
| **Growth Investment** | R1,000 | R1,000, R2,500, R5,000 | Enhanced Efficiency & Power Allocation |
| **Professional Investment** | R2,500 | R2,500, R5,000 | Institutional Density Pool & Priority Support |

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` and configure your environment:

```bash
# Server Runtime
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
JWT_SECRET=your-secure-random-jwt-key

# PayFast Gateway Configuration
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
PAYFAST_PASSPHRASE=
PAYFAST_ENVIRONMENT=test   # Set to 'live' for production

# Administrator Provisioning
INITIAL_ADMIN_EMAIL=globalfinancecryptomining@gmail.com
INITIAL_ADMIN_PASSWORD=your-secure-initial-password
INITIAL_ADMIN_PROVISIONING_SECRET=your-secret-provisioning-token

# Email Notifications (Optional)
EMAIL_PROVIDER=disabled
EMAIL_API_KEY=
```

---

## 4. PayFast Integration & Testing

1. **Test Mode (Sandbox)**:
   - Configured with official sandbox merchant ID `10000100` and key `46f0cd694581a`.
   - Process URL: `https://sandbox.payfast.co.za/eng/process`
   - ITN validation: `https://sandbox.payfast.co.za/eng/query/validate`
2. **Live Production**:
   - Set `PAYFAST_ENVIRONMENT=live`
   - Supply live `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and optional `PAYFAST_PASSPHRASE`.
   - Ensure your deployment runs over HTTPS.
3. **Idempotency**:
   - Repeated ITN notifications from PayFast are safely ignored once a transaction is marked `SUCCESS`, preventing double credits.

---

## 5. Bank Transfer Workflow & Reconciliation

1. Customer selects **Direct Bank Transfer** during checkout.
2. The server creates a pending transaction and generates a unique reference (e.g., `GF-20261014-XXXXXXXX`).
3. Business banking details displayed:
   - **Account Name**: `[BAHOLO CONSULTING]`
   - **Bank**: `[TymeBank/GoTymeBank]`
   - **Account Number**: `[53002153808]`
   - **Branch Code**: `[678910]`
4. **CRITICAL REQUIREMENT**: The transfer must be executed directly inside the user's official banking mobile application. Customers must input their unique transaction reference into the transfer description / beneficiary reference field.
5. An authorized administrator logs into the **Admin Portal** (`/admin-login`), navigates to **Transactions & Reconcile**, verifies the bank statement, and clicks **Reconcile**.
6. The server atomically marks the transaction `SUCCESS`, credits the ledger, and allocates the investment position.

---

## 6. Administrator Access

- **Login URL**: `/admin-login`
- **Designated Email**: `globalfinancecryptomining@gmail.com`
- **Security**:
  - Client accounts cannot access administrator routes.
  - Initial administrator password must be supplied in `.env` or via `/api/admin/provision` with `INITIAL_ADMIN_PROVISIONING_SECRET`.
  - Password change is required on first login.
  - Every administrative action is logged in `audit_logs`.

---

## 7. Running the Automated Test Suite

Run the built-in automated test suite:

```bash
npm test
```

This verifies:
- Database initialization and product seeds
- Password hashing & duplicate rejection
- Role-based access control & admin separation
- Investment amount validation
- PayFast MD5 signature calculation and validation
- Authoritative financial ledger calculations & idempotency
- Bank transfer reconciliation workflow
- Audit trail recording

---

## 8. Build & Deployment

```bash
# Build the application
npm run build

# Start the full-stack server
npm start
```
