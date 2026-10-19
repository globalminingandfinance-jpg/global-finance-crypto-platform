import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.sqlite');

let dbInstance: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Enable foreign keys
  dbInstance.run('PRAGMA foreign_keys = ON;');
  
  initializeSchema(dbInstance);
  saveDb();

  return dbInstance;
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, buffer);
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to save SQLite database snapshot:', err);
  }
}

function initializeSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      country TEXT DEFAULT 'South Africa',
      role TEXT NOT NULL DEFAULT 'client',
      status TEXT NOT NULL DEFAULT 'active',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      kyc_status TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investment_products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      min_amount INTEGER NOT NULL,
      features_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      fee INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      payment_provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      provider_reference TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES investment_products(id)
    );

    CREATE TABLE IF NOT EXISTS investment_allocations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      amount_requested INTEGER NOT NULL,
      amount_allocated INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      terms TEXT NOT NULL,
      plan_name TEXT,
      term_version INTEGER DEFAULT 1,
      return_rate REAL DEFAULT 0.75,
      duration_days INTEGER DEFAULT 5,
      calculation_method TEXT DEFAULT 'PROFIT_ON_CAPITAL',
      activated_at TEXT,
      maturity_date TEXT,
      projected_profit REAL DEFAULT 0,
      projected_total REAL DEFAULT 0,
      current_valuation REAL DEFAULT 0,
      realized_pnl REAL DEFAULT 0,
      settlement_status TEXT DEFAULT 'UNSETTLED',
      settlement_date TEXT,
      settlement_amount REAL DEFAULT 0,
      settlement_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES investment_products(id),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS investment_daily_records (
      id TEXT PRIMARY KEY,
      investment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      record_date TEXT NOT NULL,
      opening_value REAL NOT NULL,
      closing_value REAL NOT NULL,
      daily_change REAL NOT NULL DEFAULT 0,
      daily_percentage REAL NOT NULL DEFAULT 0,
      cumulative_change REAL NOT NULL DEFAULT 0,
      projected_value REAL NOT NULL DEFAULT 0,
      classification TEXT NOT NULL DEFAULT 'ACTUAL',
      data_source TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (investment_id) REFERENCES investment_allocations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS investment_plan_versions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      return_rate REAL NOT NULL,
      duration_days INTEGER NOT NULL,
      return_type TEXT NOT NULL DEFAULT 'PROFIT_ON_CAPITAL',
      min_amount REAL NOT NULL,
      created_by TEXT NOT NULL,
      effective_from TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES investment_products(id)
    );

    CREATE TABLE IF NOT EXISTS investment_projections (
      id TEXT PRIMARY KEY,
      investment_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      principal_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      assumed_return_rate REAL,
      duration_days INTEGER NOT NULL,
      formula_version TEXT NOT NULL DEFAULT 'v1.0-simple-period',
      calculation_method TEXT NOT NULL DEFAULT 'PROFIT_ON_CAPITAL',
      assumptions_json TEXT NOT NULL,
      estimated_profit REAL,
      estimated_total_value REAL,
      is_configured INTEGER NOT NULL DEFAULT 1,
      calculated_at TEXT NOT NULL,
      recalculated_at TEXT,
      recalculation_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (investment_id) REFERENCES investment_allocations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS investment_audit_logs (
      id TEXT PRIMARY KEY,
      investment_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      previous_state TEXT,
      new_state TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (investment_id) REFERENCES investment_allocations(id)
    );

    CREATE TABLE IF NOT EXISTS financial_ledger (
      id TEXT PRIMARY KEY,
      transaction_id TEXT,
      user_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      debit INTEGER NOT NULL DEFAULT 0,
      credit INTEGER NOT NULL DEFAULT 0,
      balance_after INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payfast_notifications (
      id TEXT PRIMARY KEY,
      transaction_reference TEXT NOT NULL,
      pf_payment_id TEXT,
      payment_status TEXT NOT NULL,
      amount_gross REAL NOT NULL,
      amount_fee REAL NOT NULL,
      amount_net REAL NOT NULL,
      raw_payload TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      fee INTEGER NOT NULL DEFAULT 0,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      branch_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      reviewed_by TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNREAD',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      is_internal_note INTEGER NOT NULL DEFAULT 0,
      attachment_name TEXT,
      attachment_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
    );

    CREATE TABLE IF NOT EXISTS customer_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ticket_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_security_questions (
      user_id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS phone_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS client_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      rejection_reason TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_review_logs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES client_documents(id)
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      device_info TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- BUSINESS FINANCE & CORPORATE ACCOUNTING (Separated strictly from customer trust funds)
    CREATE TABLE IF NOT EXISTS company_accounting_categories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY'
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS company_financial_records (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL, -- 'REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY'
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ZAR',
      reference TEXT UNIQUE NOT NULL,
      reporting_period TEXT NOT NULL, -- e.g. '2026-10', '2026-Q3'
      record_date TEXT NOT NULL,
      description TEXT NOT NULL,
      supporting_doc TEXT,
      reconciliation_status TEXT NOT NULL DEFAULT 'RECONCILED',
      authorized_by TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_budgets (
      id TEXT PRIMARY KEY,
      reporting_period TEXT NOT NULL,
      category TEXT NOT NULL,
      budgeted_amount REAL NOT NULL,
      forecast_assumptions TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- CRYPTO INTELLIGENCE & MARKET DATA CACHE
    CREATE TABLE IF NOT EXISTS crypto_market_snapshots (
      id TEXT PRIMARY KEY,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      price_zar REAL NOT NULL,
      price_usd REAL NOT NULL,
      change_24h REAL NOT NULL,
      high_24h_zar REAL NOT NULL,
      low_24h_zar REAL NOT NULL,
      market_cap_zar REAL NOT NULL,
      volume_24h_zar REAL NOT NULL,
      rank INTEGER NOT NULL,
      circulating_supply REAL,
      sparkline_json TEXT,
      provider TEXT NOT NULL DEFAULT 'coingecko',
      last_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crypto_price_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      target_price_zar REAL NOT NULL,
      condition TEXT NOT NULL, -- 'ABOVE', 'BELOW'
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      triggered_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS crypto_market_news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT NOT NULL,
      published_at TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'market'
    );

    CREATE TABLE IF NOT EXISTS market_data_provider_status (
      provider_name TEXT PRIMARY KEY,
      status TEXT NOT NULL, -- 'OPERATIONAL', 'DEGRADED', 'RATE_LIMITED', 'DOWN'
      endpoint TEXT NOT NULL,
      last_ping_at TEXT NOT NULL,
      last_sync_success_at TEXT,
      rate_limit_per_min INTEGER NOT NULL,
      cache_hit_rate REAL DEFAULT 0.95,
      notes TEXT
    );

    -- CUSTOMER VERIFIED CRYPTO HOLDINGS (Custodial mining outputs separated from fiat ledger)
    CREATE TABLE IF NOT EXISTS customer_crypto_holdings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      network TEXT NOT NULL,
      quantity REAL NOT NULL,
      custody_type TEXT NOT NULL DEFAULT 'COMMISSIONED_MINING_OUTPUT',
      source_allocation_id TEXT,
      verified INTEGER NOT NULL DEFAULT 1,
      last_verified_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- AUTOMATED MONEY OFFERS & PROMOTIONAL ENGINE
    CREATE TABLE IF NOT EXISTS promotional_offer_templates (
      id TEXT PRIMARY KEY,
      slot_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- 'FEE_DISCOUNT', 'CASH_REWARD', 'SPECIAL_OFFER', 'MONTH_END'
      schedule_day INTEGER NOT NULL, -- 6, 16, 26, or -1 for last calendar day
      schedule_time_sast TEXT NOT NULL DEFAULT '09:00',
      discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE', -- 'PERCENTAGE', 'FIXED_AMOUNT', 'NONE'
      discount_value REAL NOT NULL DEFAULT 0,
      normal_fee_amount REAL NOT NULL DEFAULT 0,
      min_deposit_amount REAL NOT NULL DEFAULT 0,
      reward_amount REAL NOT NULL DEFAULT 0,
      product_id TEXT,
      product_name TEXT,
      validity_hours INTEGER NOT NULL DEFAULT 48,
      target_audience TEXT NOT NULL DEFAULT 'ALL_CLIENTS', -- 'ALL_CLIENTS', 'VERIFIED_KYC_ONLY', 'ACTIVE_INVESTORS'
      description TEXT NOT NULL,
      disclaimer TEXT NOT NULL,
      cta_label TEXT NOT NULL DEFAULT 'Explore Offer',
      cta_route TEXT NOT NULL DEFAULT '/deposit',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promotional_offer_runs (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      template_id TEXT NOT NULL,
      offer_title TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      trigger_type TEXT NOT NULL DEFAULT 'AUTOMATIC_SCHEDULE', -- 'AUTOMATIC_SCHEDULE', 'MANUAL_TRIGGER', 'TEST_DISPATCH'
      published_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'CANCELLED_KILL_SWITCH'
      killed_by_admin TEXT,
      killed_at TEXT,
      FOREIGN KEY (template_id) REFERENCES promotional_offer_templates(id)
    );

    CREATE TABLE IF NOT EXISTS promotional_reward_claims (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      reward_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL', -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
      claim_notes TEXT,
      admin_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- GLOBAL ANNOUNCEMENTS & REVISIONS
    CREATE TABLE IF NOT EXISTS global_announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'INFORMATIONAL',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      message TEXT NOT NULL,
      structured_details_json TEXT,
      audience_filter_json TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      delivered_count INTEGER NOT NULL DEFAULT 0,
      read_count INTEGER NOT NULL DEFAULT 0,
      scheduled_for TEXT,
      recurrence_pattern TEXT NOT NULL DEFAULT 'NONE',
      recurrence_end_date TEXT,
      published_at TEXT,
      created_by_admin TEXT NOT NULL,
      approved_by_admin TEXT,
      action_link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcement_revisions (
      id TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT NOT NULL,
      category TEXT NOT NULL,
      audience_summary TEXT NOT NULL,
      changed_by_admin TEXT NOT NULL,
      change_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (announcement_id) REFERENCES global_announcements(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON financial_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_reference ON support_tickets(reference);
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON customer_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
    CREATE INDEX IF NOT EXISTS idx_documents_user ON client_documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON client_documents(status);
    CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_allocations_user ON investment_allocations(user_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_status ON investment_allocations(status);
    CREATE INDEX IF NOT EXISTS idx_daily_records_inv ON investment_daily_records(investment_id);
    CREATE INDEX IF NOT EXISTS idx_daily_records_user ON investment_daily_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_records_date ON investment_daily_records(record_date);
    CREATE INDEX IF NOT EXISTS idx_inv_audit_inv ON investment_audit_logs(investment_id);
    CREATE INDEX IF NOT EXISTS idx_projections_inv ON investment_projections(investment_id);
    CREATE INDEX IF NOT EXISTS idx_projections_user ON investment_projections(user_id);
    CREATE INDEX IF NOT EXISTS idx_comp_fin_period ON company_financial_records(reporting_period);
    CREATE INDEX IF NOT EXISTS idx_comp_fin_type ON company_financial_records(record_type);
    CREATE INDEX IF NOT EXISTS idx_cust_crypto_user ON customer_crypto_holdings(user_id);
    CREATE INDEX IF NOT EXISTS idx_crypto_alerts_user ON crypto_price_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_promo_runs_slot ON promotional_offer_runs(slot_key);
    CREATE INDEX IF NOT EXISTS idx_promo_runs_status ON promotional_offer_runs(status);
    CREATE INDEX IF NOT EXISTS idx_promo_claims_user ON promotional_reward_claims(user_id);
    CREATE INDEX IF NOT EXISTS idx_promo_claims_status ON promotional_reward_claims(status);
    CREATE INDEX IF NOT EXISTS idx_announcements_status ON global_announcements(status);
    CREATE INDEX IF NOT EXISTS idx_announcements_category ON global_announcements(category);
    CREATE INDEX IF NOT EXISTS idx_announcements_priority ON global_announcements(priority);
    CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON global_announcements(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_announcement_revisions ON announcement_revisions(announcement_id);
  `);

  // Safe migrations for customer_notifications
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN promo_run_id TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN promo_category TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN promo_expiry TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN promo_data TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN announcement_id TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN priority TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE customer_notifications ADD COLUMN action_link TEXT;'); } catch (_) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notif_promo_run ON customer_notifications(promo_run_id);'); } catch (_) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_notif_announcement ON customer_notifications(announcement_id);'); } catch (_) {}

  // Safe migrations for users table if existing
  try { db.run('ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;'); } catch (_) {}
  try { db.run('ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 1;'); } catch (_) {}
  try { db.run('ALTER TABLE users ADD COLUMN city TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE users ADD COLUMN address TEXT;'); } catch (_) {}

  // Safe migrations for investment_products
  try { db.run('ALTER TABLE investment_products ADD COLUMN return_rate REAL DEFAULT 0.75;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_products ADD COLUMN duration_days INTEGER DEFAULT 30;'); } catch (_) {}
  try { db.run("ALTER TABLE investment_products ADD COLUMN return_type TEXT DEFAULT 'PROFIT_ON_CAPITAL';"); } catch (_) {}
  try { db.run('ALTER TABLE investment_products ADD COLUMN term_version INTEGER DEFAULT 1;'); } catch (_) {}

  // Safe migrations for investment_allocations
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN plan_name TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN term_version INTEGER DEFAULT 1;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN return_rate REAL DEFAULT 0.75;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN duration_days INTEGER DEFAULT 30;'); } catch (_) {}
  try { db.run("ALTER TABLE investment_allocations ADD COLUMN calculation_method TEXT DEFAULT 'PROFIT_ON_CAPITAL';"); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN activated_at TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN maturity_date TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN projected_profit REAL DEFAULT 0;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN projected_total REAL DEFAULT 0;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN current_valuation REAL DEFAULT 0;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN realized_pnl REAL DEFAULT 0;'); } catch (_) {}
  try { db.run("ALTER TABLE investment_allocations ADD COLUMN settlement_status TEXT DEFAULT 'UNSETTLED';"); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN settlement_date TEXT;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN settlement_amount REAL DEFAULT 0;'); } catch (_) {}
  try { db.run('ALTER TABLE investment_allocations ADD COLUMN settlement_notes TEXT;'); } catch (_) {}

  // Standard investment product plan configurations:
  // Starter: 75% return, 30 days duration
  // Growth: 80% return, 60 days duration
  // Professional: 85% return, 90 days duration
  // Elite: 95% return, 180 days duration
  const products = [
    {
      id: 'prod_starter',
      slug: 'starter',
      name: 'Starter Investment',
      description: 'Designed for customers beginning their digital investment journey.',
      min_amount: 500,
      return_rate: 0.75,
      duration_days: 30,
      features: JSON.stringify([
        'Starting capital from R500',
        'Stated contractual return target: 75%',
        'Fixed investment duration: 30 days',
        'Access to core computing infrastructure',
        'Standard digital custody safeguards',
        'Automated financial ledger accounting'
      ])
    },
    {
      id: 'prod_growth',
      slug: 'growth',
      name: 'Growth Investment',
      description: 'Designed for customers looking for a broader investment option.',
      min_amount: 1000,
      return_rate: 0.80,
      duration_days: 7,
      features: JSON.stringify([
        'Starting capital from R1,000',
        'Stated contractual return target: 80%',
        'Fixed investment duration: 7 days',
        'Enhanced hash allocation & power efficiency',
        'Weekly audit reports & analytics',
        'Dedicated support queue priority'
      ])
    },
    {
      id: 'prod_professional',
      slug: 'professional',
      name: 'Professional Investment',
      description: 'Designed for customers seeking a higher-tier investment option.',
      min_amount: 2500,
      return_rate: 0.85,
      duration_days: 90,
      features: JSON.stringify([
        'Starting capital from R2,500',
        'Stated contractual return target: 85%',
        'Fixed investment duration: 90 days',
        'High-density institutional-grade hardware pool',
        'Daily reconciliation & real-time telemetry',
        'Priority withdrawal processing schedule'
      ])
    },
    {
      id: 'prod_elite',
      slug: 'elite',
      name: 'Elite Investment',
      description: 'Designed for high-tier and premium users seeking maximum computational power and institutional custody.',
      min_amount: 10000,
      return_rate: 0.95,
      duration_days: 180,
      features: JSON.stringify([
        'Starting capital from R10,000 up to R2,000,000',
        'Stated contractual return target: 95%',
        'Fixed investment duration: 180 days',
        'Dedicated ASIC mining cluster & high-yield hash allocation',
        '24/7 VIP institutional concierge & dedicated portfolio officer',
        'Accelerated daily automated reconciliation & priority payout processing',
        'Customized digital custody structuring & formal compliance certificates'
      ])
    }
  ];

  // Seed or update products with precise return_rate and duration_days
  const now = new Date().toISOString();
  for (const p of products) {
    const existing = queryOne(db, 'SELECT id FROM investment_products WHERE slug = ?', [p.slug]);
    if (!existing) {
      db.run(
        `INSERT INTO investment_products (id, slug, name, description, min_amount, return_rate, duration_days, return_type, term_version, features_json, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PROFIT_ON_CAPITAL', 1, ?, 1, ?)`,
        [p.id, p.slug, p.name, p.description, p.min_amount, p.return_rate, p.duration_days, p.features, now]
      );
    } else {
      db.run(
        `UPDATE investment_products 
         SET return_rate = ?, duration_days = ?, return_type = 'PROFIT_ON_CAPITAL'
         WHERE slug = ?`,
        [p.return_rate, p.duration_days, p.slug]
      );
    }

    // Ensure plan term version 1 exists in investment_plan_versions
    const versionCheck = queryOne(db, 'SELECT id FROM investment_plan_versions WHERE product_id = ? AND version = 1', [p.id]);
    if (!versionCheck) {
      db.run(
        `INSERT INTO investment_plan_versions (id, product_id, version, name, return_rate, duration_days, return_type, min_amount, created_by, effective_from, notes, created_at)
         VALUES (?, ?, 1, ?, ?, ?, 'PROFIT_ON_CAPITAL', ?, 'SYSTEM_GENESIS', ?, 'Initial baseline contractual plan terms', ?)`,
        ['ver_' + p.slug + '_v1', p.id, p.name, p.return_rate, p.duration_days, p.min_amount, now, now]
      );
    }
  }

  // Safe backfill for investment_projections table
  const unprojectedAllocations = queryAll(db, `
    SELECT a.*, p.name as prod_name, p.return_rate as prod_return_rate, p.duration_days as prod_duration_days
    FROM investment_allocations a
    JOIN investment_products p ON a.product_id = p.id
    LEFT JOIN investment_projections pr ON a.id = pr.investment_id
    WHERE pr.id IS NULL
  `);

  for (const alloc of unprojectedAllocations) {
    const projId = 'proj_' + alloc.id;
    const rate = alloc.return_rate ?? alloc.prod_return_rate;
    const dur = alloc.duration_days ?? alloc.prod_duration_days ?? 30;
    const isConfigured = rate !== null && rate !== undefined ? 1 : 0;
    const estProfit = isConfigured ? Math.round(alloc.amount_allocated * rate * 100) / 100 : null;
    const estTotal = isConfigured ? Math.round((alloc.amount_allocated + estProfit!) * 100) / 100 : null;

    db.run(
      `INSERT OR IGNORE INTO investment_projections (
        id, investment_id, user_id, plan_id, plan_name, principal_amount, currency,
        assumed_return_rate, duration_days, formula_version, calculation_method,
        assumptions_json, estimated_profit, estimated_total_value, is_configured,
        calculated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ZAR', ?, ?, 'v1.0-simple-period', 'PROFIT_ON_CAPITAL', ?, ?, ?, ?, ?, ?, ?)`,
      [
        projId,
        alloc.id,
        alloc.user_id,
        alloc.product_id,
        alloc.plan_name || alloc.prod_name,
        alloc.amount_allocated,
        rate,
        dur,
        JSON.stringify({ rate, durationDays: dur, calculationMethod: 'PROFIT_ON_CAPITAL' }),
        estProfit,
        estTotal,
        isConfigured,
        alloc.created_at || now,
        alloc.created_at || now,
        alloc.created_at || now,
      ]
    );
  }


  // Safe backfill of any existing allocations missing terms or maturity dates
  const unmigratedAllocations = queryAll(db, `
    SELECT a.*, p.name as prod_name, p.return_rate as prod_return_rate, p.duration_days as prod_duration_days
    FROM investment_allocations a
    JOIN investment_products p ON a.product_id = p.id
    WHERE a.activated_at IS NULL OR a.maturity_date IS NULL OR a.current_valuation IS NULL OR a.current_valuation = 0
  `);

  for (const alloc of unmigratedAllocations) {
    const actAt = alloc.created_at || now;
    const durDays = alloc.prod_duration_days || 5;
    const rate = alloc.prod_return_rate || 0.75;
    const matDate = new Date(new Date(actAt).getTime() + durDays * 24 * 60 * 60 * 1000).toISOString();
    const allocated = Number(alloc.amount_allocated || alloc.amount_requested || 0);
    const projProfit = Math.round(allocated * rate * 100) / 100;
    const projTotal = Math.round((allocated + projProfit) * 100) / 100;

    db.run(
      `UPDATE investment_allocations
       SET plan_name = ?,
           term_version = 1,
           return_rate = ?,
           duration_days = ?,
           calculation_method = 'PROFIT_ON_CAPITAL',
           activated_at = ?,
           maturity_date = ?,
           projected_profit = ?,
           projected_total = ?,
           current_valuation = ?,
           settlement_status = COALESCE(settlement_status, 'UNSETTLED')
       WHERE id = ?`,
      [alloc.prod_name, rate, durDays, actAt, matDate, projProfit, projTotal, allocated, alloc.id]
    );

    // Seed initial daily record if none exists for this investment
    const existingRec = queryOne(db, 'SELECT id FROM investment_daily_records WHERE investment_id = ?', [alloc.id]);
    if (!existingRec) {
      const recDate = actAt.slice(0, 10);
      db.run(
        `INSERT INTO investment_daily_records (id, investment_id, user_id, record_date, opening_value, closing_value, daily_change, daily_percentage, cumulative_change, projected_value, classification, data_source, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 'ACTUAL', 'CAPITAL_ALLOCATION_VERIFIED', 'Initial verified capital allocation', ?)`,
        ['dr_' + alloc.id + '_' + Date.now().toString(36), alloc.id, alloc.user_id, recDate, allocated, allocated, allocated, actAt]
      );
    }
  }

  // Provision initial administrator if INITIAL_ADMIN_PASSWORD is set or check if exists
  provisionInitialAdmin(db);

  // Seed Financial Intelligence baseline data (Corporate Accounting & Market Snapshots)
  seedFinancialIntelligenceData(db);
}

function seedFinancialIntelligenceData(db: SqlJsDatabase): void {
  const now = new Date().toISOString();

  // 1. Company Accounting Categories
  const categories = [
    { id: 'cat_rev_mining', type: 'REVENUE', code: 'REV_MINING', name: 'Mining Infrastructure Yield Fee', description: 'Realized commission on pooled computational block rewards' },
    { id: 'cat_rev_hash', type: 'REVENUE', code: 'REV_HASH', name: 'Computing Hash Allocation Fee', description: 'Enterprise and retail computational capacity fees' },
    { id: 'cat_rev_custody', type: 'REVENUE', code: 'REV_CUSTODY', name: 'Custody & Administration Fee', description: 'Digital asset custody structuring and compliance verification' },
    { id: 'cat_exp_power', type: 'EXPENSE', code: 'EXP_POWER', name: 'Data Centre Electrical Power', description: 'Direct energy and industrial electricity consumption' },
    { id: 'cat_exp_maint', type: 'EXPENSE', code: 'EXP_MAINT', name: 'Hardware Maintenance & Parts', description: 'ASIC chip replacement, cooling fans, and PSU servicing' },
    { id: 'cat_exp_colo', type: 'EXPENSE', code: 'EXP_COLO', name: 'Rack Hosting & Co-location', description: 'Physical facility leasing and secure server rack space' },
    { id: 'cat_exp_compliance', type: 'EXPENSE', code: 'EXP_COMPLIANCE', name: 'Regulatory, FICA & Audit', description: 'Independent legal counsel, audit certifications, and FICA verification' },
    { id: 'cat_exp_network', type: 'EXPENSE', code: 'EXP_NETWORK', name: 'Bandwidth & DDoS Mitigation', description: 'Redundant carrier-grade fiber connections and hardware firewalls' },
    { id: 'cat_ast_rigs', type: 'ASSET', code: 'AST_RIGS', name: 'ASIC Mining Rig Fleet', description: 'Company-owned Antminer S19 Pro/XP & WhatsMiner ASIC units' },
    { id: 'cat_ast_cooling', type: 'ASSET', code: 'AST_COOLING', name: 'Immersion Cooling & Transformers', description: 'Substation step-down transformers and liquid dielectric cooling tanks' },
    { id: 'cat_ast_cash', type: 'ASSET', code: 'AST_BANK_CASH', name: 'Corporate Operating Bank Reserve', description: 'Verified corporate treasury cash held at TymeBank/GoTymeBank' },
    { id: 'cat_ast_facility', type: 'ASSET', code: 'AST_FACILITY', name: 'Data Centre Leasehold Upgrades', description: 'Security vaults, thermal ducting, and industrial power distribution' },
    { id: 'cat_lia_hardware', type: 'LIABILITY', code: 'LIA_HARDWARE', name: 'Hardware Vendor Equipment Notes', description: 'Financed computational hardware vendor payables' },
    { id: 'cat_lia_power', type: 'LIABILITY', code: 'LIA_POWER_ACCRUAL', name: 'Utility Grid Accruals', description: 'Accrued municipal electricity and industrial power charges' },
    { id: 'cat_lia_ap', type: 'LIABILITY', code: 'LIA_AP', name: 'Operational Accounts Payable', description: 'Current trade payables for contractors and logistics' },
  ];

  for (const c of categories) {
    const existing = queryOne(db, 'SELECT id FROM company_accounting_categories WHERE code = ?', [c.code]);
    if (!existing) {
      db.run(
        `INSERT INTO company_accounting_categories (id, type, code, name, description, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [c.id, c.type, c.code, c.name, c.description]
      );
    }
  }

  // 2. Company Financial Records (Verified Corporate P&L and Balance Sheet — Distinct from Customer Funds)
  const initialRecords = [
    // Assets
    { id: 'rec_ast_01', type: 'ASSET', cat: 'AST_BANK_CASH', amount: 2850000, ref: 'AST-2026-001', period: '2026-10', date: '2026-10-01', desc: 'Corporate treasury operating reserve at TymeBank (Account #53002153808)', doc: 'BANK_STMT_OCT2026.pdf' },
    { id: 'rec_ast_02', type: 'ASSET', cat: 'AST_RIGS', amount: 8400000, ref: 'AST-2026-002', period: '2026-10', date: '2026-09-30', desc: 'Verified fleet of 240 Antminer S19 Pro+ (120 TH/s) ASIC units', doc: 'ASIC_VALUATION_OCT2026.pdf' },
    { id: 'rec_ast_03', type: 'ASSET', cat: 'AST_COOLING', amount: 3200000, ref: 'AST-2026-003', period: '2026-10', date: '2026-09-30', desc: 'Modular liquid immersion cooling tanks and 2.5 MVA substation transformer', doc: 'COOLING_SPECS_2026.pdf' },
    { id: 'rec_ast_04', type: 'ASSET', cat: 'AST_FACILITY', amount: 1100000, ref: 'AST-2026-004', period: '2026-10', date: '2026-09-30', desc: 'Facility thermal isolation ducting and biometric security vaults', doc: 'LEASEHOLD_IMPROVEMENTS.pdf' },
    // Liabilities
    { id: 'rec_lia_01', type: 'LIABILITY', cat: 'LIA_HARDWARE', amount: 1800000, ref: 'LIA-2026-001', period: '2026-10', date: '2026-10-01', desc: 'Bitmain equipment installment credit note (due Q2 2027)', doc: 'BITMAIN_NOTE_9921.pdf' },
    { id: 'rec_lia_02', type: 'LIABILITY', cat: 'LIA_POWER_ACCRUAL', amount: 245000, ref: 'LIA-2026-002', period: '2026-10', date: '2026-10-05', desc: 'Accrued municipal electricity bill for September 2026', doc: 'MUNI_POWER_ACC_09.pdf' },
    { id: 'rec_lia_03', type: 'LIABILITY', cat: 'LIA_AP', amount: 85000, ref: 'LIA-2026-003', period: '2026-10', date: '2026-10-10', desc: 'Security surveillance and on-site engineering contractor payables', doc: 'VENDOR_AP_OCT.pdf' },
    // Q3 Revenue
    { id: 'rec_rev_01', type: 'REVENUE', cat: 'REV_MINING', amount: 1420000, ref: 'REV-2026-Q3-01', period: '2026-Q3', date: '2026-09-30', desc: 'Q3 Mining Pool production commission and hash distribution fee', doc: 'POOL_PAYOUT_Q3.pdf' },
    { id: 'rec_rev_02', type: 'REVENUE', cat: 'REV_HASH', amount: 780000, ref: 'REV-2026-Q3-02', period: '2026-Q3', date: '2026-09-30', desc: 'Enterprise computational hashing lease fee revenues', doc: 'HASH_LEASE_Q3.pdf' },
    { id: 'rec_rev_03', type: 'REVENUE', cat: 'REV_CUSTODY', amount: 195000, ref: 'REV-2026-Q3-03', period: '2026-Q3', date: '2026-09-30', desc: 'Institutional custody setup and periodic FICA compliance audit fees', doc: 'CUSTODY_FEES_Q3.pdf' },
    // Q3 Expenses
    { id: 'rec_exp_01', type: 'EXPENSE', cat: 'EXP_POWER', amount: 890000, ref: 'EXP-2026-Q3-01', period: '2026-Q3', date: '2026-09-30', desc: 'Data centre primary 11kV grid electricity charges', doc: 'POWER_INVOICE_Q3.pdf' },
    { id: 'rec_exp_02', type: 'EXPENSE', cat: 'EXP_MAINT', amount: 210000, ref: 'EXP-2026-Q3-02', period: '2026-Q3', date: '2026-09-30', desc: 'Control board replacements, thermal paste re-application, and hashboard repair', doc: 'MAINT_Q3.pdf' },
    { id: 'rec_exp_03', type: 'EXPENSE', cat: 'EXP_COLO', amount: 180000, ref: 'EXP-2026-Q3-03', period: '2026-Q3', date: '2026-09-30', desc: 'Data centre tier-3 rack co-location facilities rental', doc: 'COLO_RENTAL_Q3.pdf' },
    { id: 'rec_exp_04', type: 'EXPENSE', cat: 'EXP_COMPLIANCE', amount: 95000, ref: 'EXP-2026-Q3-04', period: '2026-Q3', date: '2026-09-30', desc: 'Independent certified public accounting audit & FICA compliance review', doc: 'AUDIT_Q3_OPINION.pdf' },
    { id: 'rec_exp_05', type: 'EXPENSE', cat: 'EXP_NETWORK', amount: 48000, ref: 'EXP-2026-Q3-05', period: '2026-Q3', date: '2026-09-30', desc: 'Dual-path redundant optical fiber transit and DDoS hardware scrubbers', doc: 'FIBER_Q3.pdf' },
  ];

  for (const r of initialRecords) {
    const existing = queryOne(db, 'SELECT id FROM company_financial_records WHERE reference = ?', [r.ref]);
    if (!existing) {
      db.run(
        `INSERT INTO company_financial_records (id, record_type, category, amount, currency, reference, reporting_period, record_date, description, supporting_doc, reconciliation_status, authorized_by, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ZAR', ?, ?, ?, ?, ?, 'RECONCILED', 'BOARD_OF_DIRECTORS', 'Verified and reconciled by Chief Financial Officer', ?, ?)`,
        [r.id, r.type, r.cat, r.amount, r.ref, r.period, r.date, r.desc, r.doc, now, now]
      );
    }
  }

  // 3. Company Budgets & Forecasts
  const initialBudgets = [
    { id: 'bgt_01', period: '2026-Q3', cat: 'REV_MINING', amount: 1350000, assumptions: 'Assumes Bitcoin network difficulty index at 88T and 98% uptime' },
    { id: 'bgt_02', period: '2026-Q3', cat: 'REV_HASH', amount: 750000, assumptions: 'Assumes sustained retail and institutional capacity utilization' },
    { id: 'bgt_03', period: '2026-Q3', cat: 'EXP_POWER', amount: 920000, assumptions: 'Off-peak tariff structure with Eskom Megaflex rate' },
    { id: 'bgt_04', period: '2026-Q3', cat: 'EXP_MAINT', amount: 250000, assumptions: 'Scheduled quarterly preventive ASIC maintenance cycle' },
    { id: 'bgt_05', period: '2026-Q4', cat: 'REV_MINING', amount: 1550000, assumptions: 'Projected deployment of 40 additional high-efficiency hydro-cooling units' },
    { id: 'bgt_06', period: '2026-Q4', cat: 'EXP_POWER', amount: 960000, assumptions: 'Seasonal summer cooling load with variable speed condenser fans' },
  ];

  for (const b of initialBudgets) {
    const existing = queryOne(db, 'SELECT id FROM company_budgets WHERE reporting_period = ? AND category = ?', [b.period, b.cat]);
    if (!existing) {
      db.run(
        `INSERT INTO company_budgets (id, reporting_period, category, budgeted_amount, forecast_assumptions, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'FINANCE_DIRECTOR', ?, ?)`,
        [b.id, b.period, b.cat, b.amount, b.assumptions, now, now]
      );
    }
  }

  // 4. Crypto Market Snapshots (Baseline Market Data for Top 10 Cryptocurrencies in ZAR & USD)
  const initialCoins = [
    { symbol: 'BTC', name: 'Bitcoin', priceZar: 1205420, priceUsd: 68450, change24h: 2.84, highZar: 1218500, lowZar: 1182000, marketCapZar: 23800000000000, volZar: 620000000000, rank: 1, supply: 19768000 },
    { symbol: 'ETH', name: 'Ethereum', priceZar: 46680, priceUsd: 2652, change24h: 1.95, highZar: 47200, lowZar: 45400, marketCapZar: 5620000000000, volZar: 280000000000, rank: 2, supply: 120400000 },
    { symbol: 'SOL', name: 'Solana', priceZar: 2715, priceUsd: 154.2, change24h: 4.35, highZar: 2760, lowZar: 2580, marketCapZar: 1270000000000, volZar: 68000000000, rank: 3, supply: 468000000 },
    { symbol: 'BNB', name: 'BNB', priceZar: 10420, priceUsd: 592, change24h: 0.82, highZar: 10550, lowZar: 10280, marketCapZar: 1520000000000, volZar: 24000000000, rank: 4, supply: 145900000 },
    { symbol: 'XRP', name: 'XRP', priceZar: 9.55, priceUsd: 0.542, change24h: -0.45, highZar: 9.72, lowZar: 9.41, marketCapZar: 540000000000, volZar: 21000000000, rank: 5, supply: 56600000000 },
    { symbol: 'ADA', name: 'Cardano', priceZar: 6.22, priceUsd: 0.353, change24h: 1.18, highZar: 6.35, lowZar: 6.08, marketCapZar: 222000000000, volZar: 8200000000, rank: 6, supply: 35700000000 },
    { symbol: 'DOGE', name: 'Dogecoin', priceZar: 2.14, priceUsd: 0.122, change24h: 3.12, highZar: 2.22, lowZar: 2.05, marketCapZar: 312000000000, volZar: 14500000000, rank: 7, supply: 146000000000 },
    { symbol: 'DOT', name: 'Polkadot', priceZar: 74.20, priceUsd: 4.21, change24h: 0.38, highZar: 75.80, lowZar: 73.10, marketCapZar: 106000000000, volZar: 4200000000, rank: 8, supply: 1430000000 },
    { symbol: 'AVAX', name: 'Avalanche', priceZar: 504.50, priceUsd: 28.65, change24h: 2.25, highZar: 518.00, lowZar: 489.00, marketCapZar: 204000000000, volZar: 9800000000, rank: 9, supply: 405000000 },
    { symbol: 'LINK', name: 'Chainlink', priceZar: 208.50, priceUsd: 11.84, change24h: 1.72, highZar: 214.00, lowZar: 202.00, marketCapZar: 126000000000, volZar: 5400000000, rank: 10, supply: 608000000 },
  ];

  for (const coin of initialCoins) {
    const existing = queryOne(db, 'SELECT id FROM crypto_market_snapshots WHERE symbol = ?', [coin.symbol]);
    // Generate synthetic 7-day sparkline points
    const sparkline = [];
    let p = coin.priceZar * 0.96;
    for (let i = 0; i < 28; i++) {
      const noise = (Math.sin(i * 0.7) + (Math.random() - 0.48) * 0.08) * 0.02;
      p = p * (1 + noise);
      sparkline.push(Math.round(p * 100) / 100);
    }
    sparkline[sparkline.length - 1] = coin.priceZar;

    if (!existing) {
      db.run(
        `INSERT INTO crypto_market_snapshots (id, symbol, name, price_zar, price_usd, change_24h, high_24h_zar, low_24h_zar, market_cap_zar, volume_24h_zar, rank, circulating_supply, sparkline_json, provider, last_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'coingecko', ?)`,
        [
          'coin_' + coin.symbol.toLowerCase(),
          coin.symbol,
          coin.name,
          coin.priceZar,
          coin.priceUsd,
          coin.change24h,
          coin.highZar,
          coin.lowZar,
          coin.marketCapZar,
          coin.volZar,
          coin.rank,
          coin.supply,
          JSON.stringify(sparkline),
          now,
        ]
      );
    }
  }

  // 5. Market News
  const newsItems = [
    { id: 'news_01', title: 'Global Hashrate Distribution Trends Show Surge in Renewable Energy Mining Facilities', source: 'CoinDesk Intelligence', url: 'https://coindesk.com', summary: 'Global mining infrastructure operators report over 68% of new computing capacity powered by hydroelectric, solar, and stranded gas energy captures.', category: 'mining' },
    { id: 'news_02', title: 'South African Financial Sector Conduct Authority (FSCA) Licensing Guidelines for Crypto Asset Services', source: 'Regulatory Review SA', url: 'https://fsca.co.za', summary: 'South African regulatory oversight frameworks require institutional digital asset custodians and infrastructure providers to implement strict FICA Tier-1 KYC verification and segregated accounting ledgers.', category: 'regulation' },
    { id: 'news_03', title: 'Institutional Hashing Inflows Surge Ahead of Fourth-Quarter Computational Network Difficulty Readjustment', source: 'Bloomberg Crypto', url: 'https://bloomberg.com', summary: 'Institutional capital allocations into high-efficiency immersion ASIC clusters have accelerated as major asset managers seek direct exposure to computational infrastructure.', category: 'market' },
    { id: 'news_04', title: 'Proof-of-Work Efficiency: Next-Generation 3nm Asic Architecture Achieves Sub-15 Joules Per Terahash', source: 'Mining Weekly Tech', url: 'https://miningweekly.com', summary: 'Advanced semi-conductor fabricators demonstrate new ASIC architecture cutting electrical consumption per terahash by 28%, significantly boosting net operator margins.', category: 'technology' },
  ];

  for (const n of newsItems) {
    const existing = queryOne(db, 'SELECT id FROM crypto_market_news WHERE id = ?', [n.id]);
    if (!existing) {
      db.run(
        `INSERT INTO crypto_market_news (id, title, source, url, summary, published_at, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [n.id, n.title, n.source, n.url, n.summary, now, n.category]
      );
    }
  }

  // 6. Provider Status Registry
  const providers = [
    { name: 'coingecko', status: 'OPERATIONAL', endpoint: 'https://api.coingecko.com/api/v3', rateLimit: 50, hitRate: 0.968, notes: 'Primary public cryptocurrency market data API with 60-second in-memory TTL caching' },
    { name: 'binance', status: 'OPERATIONAL', endpoint: 'https://api.binance.com/api/v3', rateLimit: 1200, hitRate: 0.992, notes: 'Secondary high-frequency fallback ticker provider' },
    { name: 'payfast', status: 'OPERATIONAL', endpoint: 'https://sandbox.payfast.co.za', rateLimit: 100, hitRate: 1.0, notes: 'Instant EFT and card payment processing gateway with authoritative ITN validation' },
  ];

  for (const p of providers) {
    const existing = queryOne(db, 'SELECT provider_name FROM market_data_provider_status WHERE provider_name = ?', [p.name]);
    if (!existing) {
      db.run(
        `INSERT INTO market_data_provider_status (provider_name, status, endpoint, last_ping_at, last_sync_success_at, rate_limit_per_min, cache_hit_rate, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.status, p.endpoint, now, now, p.rateLimit, p.hitRate, p.notes]
      );
    }
  }

  // 7. Seed Default Recurring Promotional Offer Templates
  const defaultPromoTemplates = [
    {
      id: 'slot_flash_discount',
      slot_key: 'FLASH_DISCOUNT_6TH',
      title: 'Flash 50% Platform Allocation Fee Discount',
      category: 'FEE_DISCOUNT',
      schedule_day: 6,
      schedule_time_sast: '09:00',
      discount_type: 'PERCENTAGE',
      discount_value: 50,
      normal_fee_amount: 250.00,
      min_deposit_amount: 5000.00,
      reward_amount: 0,
      product_id: 'prod_growth',
      product_name: 'Growth Investment Plan',
      validity_hours: 48,
      target_audience: 'ALL_CLIENTS',
      description: 'Exclusive 48-Hour Promotional Window: Save 50% on your digital asset allocation & infrastructure setup fee when funding an allocation of R5,000 or more.',
      disclaimer: 'Promotional discount applies exclusively to administrative allocation fees. Cryptocurrency mining investments carry market risks. Past performance does not guarantee future yields.',
      cta_label: 'Fund Allocation & Claim Discount',
      cta_route: '/deposit',
      is_enabled: 1
    },
    {
      id: 'slot_cash_reward',
      slot_key: 'CASH_REWARD_16TH',
      title: 'R350 Mid-Month Capital Boost Voucher',
      category: 'CASH_REWARD',
      schedule_day: 16,
      schedule_time_sast: '09:00',
      discount_type: 'FIXED_AMOUNT',
      discount_value: 350.00,
      normal_fee_amount: 0,
      min_deposit_amount: 2500.00,
      reward_amount: 350.00,
      product_id: 'prod_starter',
      product_name: 'Starter / Growth Mining Plan',
      validity_hours: 72,
      target_audience: 'ALL_CLIENTS',
      description: 'Mid-Month Rewarding Benefit: Submit your claim for an approved R350.00 investment capital boost voucher when activating an allocation of R2,500 or more. Company-funded voucher is reviewed and credited to your mining balance.',
      disclaimer: 'Vouchers are company-funded promotional credits credited upon administrative review and validation. Subject to platform terms and capital commitment periods.',
      cta_label: 'Claim R350 Reward Voucher',
      cta_route: '/deposit',
      is_enabled: 1
    },
    {
      id: 'slot_special_investment',
      slot_key: 'SPECIAL_OFFER_26TH',
      title: 'Elite Enterprise Mining Plan — Zero Surcharge Window',
      category: 'SPECIAL_OFFER',
      schedule_day: 26,
      schedule_time_sast: '09:00',
      discount_type: 'FIXED_AMOUNT',
      discount_value: 1000.00,
      normal_fee_amount: 1000.00,
      min_deposit_amount: 50000.00,
      reward_amount: 0,
      product_id: 'prod_elite',
      product_name: 'Elite Enterprise Mining Plan',
      validity_hours: 96,
      target_audience: 'ALL_CLIENTS',
      description: 'Institutional Grade Opportunity: Activate the top-tier Elite Enterprise Mining Plan with 100% setup surcharge waiver (save R1,000 on infrastructure provision costs). Institutional grade hash allocation and weekly liquidity reporting.',
      disclaimer: 'Global Finance Crypto Mining provides hash power allocation. Crypto asset values fluctuate. No fixed interest or guaranteed profit yields are promised or implied.',
      cta_label: 'Review Elite Plan Terms',
      cta_route: '/investments',
      is_enabled: 1
    },
    {
      id: 'slot_month_end',
      slot_key: 'MONTH_END_FINAL_DAY',
      title: 'Month-End Booster: 10% Additional Hash Power Allocation',
      category: 'MONTH_END',
      schedule_day: -1, // dynamic last calendar day
      schedule_time_sast: '09:00',
      discount_type: 'PERCENTAGE',
      discount_value: 10,
      normal_fee_amount: 0,
      min_deposit_amount: 1000.00,
      reward_amount: 0,
      product_id: 'prod_growth',
      product_name: 'All Eligible Mining Contracts',
      validity_hours: 15,
      target_audience: 'ALL_CLIENTS',
      description: 'Month-End Special: Celebrate the close of the month with a complimentary 10% additional computational hash allocation on any new investment funded before midnight.',
      disclaimer: 'Valid strictly until midnight South Africa Standard Time on the final calendar day of the month. Verified against official SAST timestamping.',
      cta_label: 'Activate Month-End Plan',
      cta_route: '/investments',
      is_enabled: 1
    }
  ];

  for (const t of defaultPromoTemplates) {
    const existing = queryOne(db, 'SELECT id FROM promotional_offer_templates WHERE slot_key = ?', [t.slot_key]);
    if (!existing) {
      db.run(
        `INSERT INTO promotional_offer_templates (
          id, slot_key, title, category, schedule_day, schedule_time_sast,
          discount_type, discount_value, normal_fee_amount, min_deposit_amount, reward_amount,
          product_id, product_name, validity_hours, target_audience, description, disclaimer,
          cta_label, cta_route, is_enabled, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id, t.slot_key, t.title, t.category, t.schedule_day, t.schedule_time_sast,
          t.discount_type, t.discount_value, t.normal_fee_amount, t.min_deposit_amount, t.reward_amount,
          t.product_id, t.product_name, t.validity_hours, t.target_audience, t.description, t.disclaimer,
          t.cta_label, t.cta_route, t.is_enabled, now
        ]
      );
    }
  }
}

export const PRIMARY_ADMIN_EMAIL = 'globalfinancecryptomining@gmail.com';
export const ALIAS_ADMIN_EMAIL = 'globalminingandfinance@gmail.com';

function provisionInitialAdmin(db: SqlJsDatabase): void {
  const envAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;

  // 1. Check if ANY administrator account already exists in the database
  // Prioritize accounts where must_change_password = 0 (user has explicitly configured their password)
  const existingAdmins = queryAll(
    db,
    `SELECT id, email, password_hash, must_change_password, updated_at 
     FROM users 
     WHERE role = 'admin' OR LOWER(email) IN (LOWER(?), LOWER(?), LOWER(?)) 
     ORDER BY must_change_password ASC, updated_at DESC`,
    [PRIMARY_ADMIN_EMAIL, ALIAS_ADMIN_EMAIL, envAdminEmail || PRIMARY_ADMIN_EMAIL]
  );

  const now = new Date().toISOString();

  if (existingAdmins.length > 0) {
    // An administrator already exists! NEVER overwrite their password on startup or restart.
    // Select the authoritative account: prefer explicitly changed password (must_change_password = 0) and newest updated_at
    const latestAdmin = existingAdmins[0];
    const authoritativeHash = latestAdmin.password_hash;
    const mustChange = latestAdmin.must_change_password;

    const emailsToEnsure = [PRIMARY_ADMIN_EMAIL, ALIAS_ADMIN_EMAIL];
    if (envAdminEmail && !emailsToEnsure.includes(envAdminEmail)) {
      emailsToEnsure.push(envAdminEmail);
    }

    for (const email of emailsToEnsure) {
      const match = existingAdmins.find((a) => a.email.toLowerCase() === email.toLowerCase());
      if (match) {
        // Synchronize password hash and role if diverged so all known admin aliases match the authoritative credentials
        if (match.password_hash !== authoritativeHash || match.role !== 'admin' || match.status !== 'active') {
          db.run(
            `UPDATE users SET password_hash = ?, role = 'admin', status = 'active', must_change_password = ?, updated_at = ? WHERE id = ?`,
            [authoritativeHash, mustChange, now, match.id]
          );
        }
      } else {
        // Alias record missing: create it with the identical authoritative hash
        const id = 'admin_' + Math.random().toString(36).substring(2, 11);
        db.run(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, role, status, must_change_password, kyc_status, created_at, updated_at)
           VALUES (?, ?, ?, 'System', 'Administrator', '+27000000000', 'South Africa', 'admin', 'active', ?, 'verified', ?, ?)`,
          [id, email.toLowerCase(), authoritativeHash, mustChange, now, now]
        );
      }
    }
    saveDb();
    return;
  }

  // 2. No administrator exists at all: provision initial admin safely
  const seedPassword = (initialPassword && initialPassword.trim().length >= 8) 
    ? initialPassword.trim() 
    : 'Admin#2026!GlobalFinance'; // Secure default initial password if none in environment
  
  const salt = bcrypt.genSaltSync(12);
  const hash = bcrypt.hashSync(seedPassword, salt);
  const idPrimary = 'admin_' + Math.random().toString(36).substring(2, 11);
  const idAlias = 'admin_' + Math.random().toString(36).substring(2, 11);

  db.run(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, role, status, must_change_password, kyc_status, created_at, updated_at)
     VALUES (?, ?, ?, 'System', 'Administrator', '+27000000000', 'South Africa', 'admin', 'active', 1, 'verified', ?, ?)`,
    [idPrimary, PRIMARY_ADMIN_EMAIL, hash, now, now]
  );

  db.run(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, role, status, must_change_password, kyc_status, created_at, updated_at)
     VALUES (?, ?, ?, 'System', 'Administrator', '+27000000000', 'South Africa', 'admin', 'active', 1, 'verified', ?, ?)`,
    [idAlias, ALIAS_ADMIN_EMAIL, hash, now, now]
  );

  if (envAdminEmail && envAdminEmail !== PRIMARY_ADMIN_EMAIL && envAdminEmail !== ALIAS_ADMIN_EMAIL) {
    const idEnv = 'admin_' + Math.random().toString(36).substring(2, 11);
    db.run(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, role, status, must_change_password, kyc_status, created_at, updated_at)
       VALUES (?, ?, ?, 'System', 'Administrator', '+27000000000', 'South Africa', 'admin', 'active', 1, 'verified', ?, ?)`,
      [idEnv, envAdminEmail, hash, now, now]
    );
  }

  // Audit log
  db.run(
    `INSERT INTO audit_logs (id, admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
     VALUES (?, ?, ?, 'ADMIN_PROVISIONED', 'USER', ?, 'Initial administrator securely provisioned from configuration', '127.0.0.1', ?)`,
    ['audit_' + Math.random().toString(36).substring(2, 11), idPrimary, PRIMARY_ADMIN_EMAIL, idPrimary, now]
  );
  saveDb();
  console.log(`[AUTH] Initial administrator (${PRIMARY_ADMIN_EMAIL} & ${ALIAS_ADMIN_EMAIL}) successfully provisioned.`);
}

// Helper utilities for sql.js to fetch objects
export function queryAll<T = any>(db: SqlJsDatabase, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = any>(db: SqlJsDatabase, sql: string, params: any[] = []): T | null {
  const results = queryAll<T>(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

export const VAULT_DIR = path.resolve(DATA_DIR, 'vault');
if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

export function recordSecurityEvent(
  db: SqlJsDatabase,
  userId: string,
  eventType: string,
  description: string,
  ipAddress?: string,
  userAgent?: string
): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO security_events (id, user_id, event_type, description, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['sec_' + Math.random().toString(36).substring(2, 11), userId, eventType, description, ipAddress || 'unknown', userAgent || 'unknown', now]
  );
  saveDb();
}
