/**
 * Migra dados do banco Replit (DATABASE_URL) para o banco externo (EXTERNAL_DATABASE_URL).
 * Roda uma única vez. Seguro: usa ON CONFLICT DO NOTHING para não duplicar.
 */
import pg from "pg";

const { Pool } = pg;

const srcUrl = process.env.DATABASE_URL;
const dstUrl = process.env.EXTERNAL_DATABASE_URL;

if (!srcUrl || !dstUrl) {
  console.error("Precisa de DATABASE_URL e EXTERNAL_DATABASE_URL configurados.");
  process.exit(1);
}

if (srcUrl === dstUrl) {
  console.log("Origem e destino são o mesmo banco. Nada a migrar.");
  process.exit(0);
}

const src = new Pool({ connectionString: srcUrl });
const dst = new Pool({ connectionString: dstUrl });

async function run() {
  console.log("Conectando aos bancos...");

  // ── Users ────────────────────────────────────────────────────────────────────
  const { rows: users } = await src.query("SELECT * FROM users ORDER BY id");
  console.log(`Migrando ${users.length} usuário(s)...`);

  for (const u of users) {
    await dst.query(`
      INSERT INTO users (
        id, name, phone, referral_code, referred_by_id,
        plays_remaining, free_plays_total_used, has_paid, paid_plays_used,
        referral_unlocked, cidade, estado, foto_base64, ip_address,
        bloqueado, ultimo_login, saldo, pirate_pos, last_pirate_move,
        ranking_points, ranking_social_link, online_minutes_today,
        last_online_date, warnings, warning_message, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
      ) ON CONFLICT (id) DO NOTHING
    `, [
      u.id, u.name, u.phone, u.referral_code, u.referred_by_id,
      u.plays_remaining, u.free_plays_total_used, u.has_paid, u.paid_plays_used,
      u.referral_unlocked, u.cidade, u.estado, u.foto_base64, u.ip_address,
      u.bloqueado, u.ultimo_login, u.saldo, u.pirate_pos, u.last_pirate_move,
      u.ranking_points, u.ranking_social_link, u.online_minutes_today,
      u.last_online_date, u.warnings, u.warning_message, u.created_at
    ]);
    console.log(`  ✓ ${u.name} (id=${u.id})`);
  }

  // Sincroniza a sequence do id para evitar conflito em novos cadastros
  if (users.length > 0) {
    const maxId = Math.max(...users.map(u => u.id));
    await dst.query(`SELECT setval('users_id_seq', $1, true)`, [maxId]);
    console.log(`  Sequence users_id_seq ajustada para ${maxId}`);
  }

  // ── Payments ─────────────────────────────────────────────────────────────────
  const { rows: payments } = await src.query("SELECT * FROM payments ORDER BY id");
  console.log(`\nMigrando ${payments.length} pagamento(s)...`);

  for (const p of payments) {
    await dst.query(`
      INSERT INTO payments (id, user_id, plays, amount_cents, tx_id, mp_payment_id, status, created_at, confirmed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, [p.id, p.user_id, p.plays, p.amount_cents, p.tx_id, p.mp_payment_id, p.status, p.created_at, p.confirmed_at]);
    console.log(`  ✓ ${p.tx_id} (${p.status})`);
  }

  if (payments.length > 0) {
    const maxId = Math.max(...payments.map(p => p.id));
    await dst.query(`SELECT setval('payments_id_seq', $1, true)`, [maxId]);
    console.log(`  Sequence payments_id_seq ajustada para ${maxId}`);
  }

  // ── Settings ─────────────────────────────────────────────────────────────────
  const { rows: settings } = await src.query("SELECT * FROM settings ORDER BY key");
  console.log(`\nMigrando ${settings.length} configuração(ões)...`);

  for (const s of settings) {
    await dst.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `, [s.key, s.value, s.updated_at]);
  }
  console.log(`  ✓ ${settings.length} settings sincronizadas`);

  console.log("\n✅ Migração concluída com sucesso!");
  await src.end();
  await dst.end();
}

run().catch(err => {
  console.error("Erro na migração:", err);
  process.exit(1);
});
